import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Info, Plus, X } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/AppStore";
import { useTheme } from "./useTheme";
import { useNativeTheme } from "./useNativeTheme";
import { usePrivacy } from "./usePrivacy";
import {
  hideSplashScreen,
  initNativeShell,
  onAppBackground,
} from "../platform/native";
import { hapticTap } from "../platform/haptics";
import { LockScreen } from "./LockScreen";
import { Onboarding } from "./Onboarding";
import { WorkspaceRail, WorkspaceToolbar } from "./WorkspaceChrome";
import { SheetProvider, useSheets } from "./sheets";
import { FeedbackProvider } from '../ui/Feedback'
import { useCloudServices } from './useCloudServices'
import { SyncGate } from './SyncDecision'
import { ANALYTICS_UPDATED, trackScreen } from '../platform/analytics'
import { NAV, resolveView, parseRoute, navigateTo, goBack, type ViewId, type AppRoute } from "./navigation";
import { ExploreProvider, useExplore } from './ExploreContext'
import { UpdateGate } from './UpdateGate'
import { initializeDiagnostics, recordDiagnostic } from '../platform/diagnostics'
import { Skeleton } from "../ui/primitives";
import { useReminderSync } from './useReminderSync'
import { consumePendingReminder, REMINDER_OPEN } from '../platform/reminders'

/**
 * The dashboard views pull in the charting library; the first run does not.
 * Splitting them here keeps a first visit — which is only ever a drop target —
 * from downloading roughly 100 kB gzipped of charts it will not draw.
 */
const OverviewView = lazy(() =>
  import("../views/OverviewView").then((m) => ({ default: m.OverviewView })),
);
const SpendingView = lazy(() =>
  import("../views/SpendingView").then((m) => ({ default: m.SpendingView })),
);
const FutureView = lazy(() =>
  import("../views/FutureView").then((m) => ({ default: m.FutureView })),
);

const CardsView = lazy(() => import('../views/CardsView').then(m => ({ default: m.CardsView })))
const CardDetailView = lazy(() => import('../views/CardDetailView').then(m => ({ default: m.CardDetailView })))
const AssetsView = lazy(() => import('../views/AssetsView').then(m => ({ default: m.AssetsView })))
const AnalysisView = lazy(() => import('../views/AnalysisView').then(m => ({ default: m.AnalysisView })))
const SettingsPage = lazy(() => import('./SettingsSheet').then(m => ({ default: m.SettingsPage })))
function readHash(): AppRoute { return parseRoute(window.location.hash) }

export default function App() {
  const { state, sessionBusy, sessionError, dataEpoch } = useStore();

  useTheme(state.settings.theme);
  useNativeTheme(state.settings.theme);
  useReminderSync();
  useCloudServices();
  useEffect(() => initializeDiagnostics(), []);

  // Back-button wiring for the Android shell; resolves to a no-op on web.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initNativeShell().then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, []);

  // The splash screen stays up until local data has actually loaded, so it
  // never hands off to a bare skeleton.
  useEffect(() => {
    if (state.hydrated) void hideSplashScreen();
  }, [state.hydrated]);

  if (!state.hydrated || sessionBusy) return <div aria-live="polite"><div className="px-6 pt-8 text-body text-muted"><p role={sessionError ? 'alert' : 'status'}>{sessionError || (sessionBusy ? 'Oturum işlemi tamamlanıyor…' : 'Kayıtların yükleniyor…')}</p>{sessionError && <button type="button" className="quiet-button mt-4" onClick={() => window.location.reload()}>Yeniden yükle</button>}</div><BootSkeleton /></div>;

  return (
    <UpdateGate><Locked>
      <Introduced>
        <ExploreProvider key={dataEpoch}>
        <FeedbackProvider><SheetProvider>
          {sessionError && <p role="alert" className="mx-5 mt-4 rounded-lg bg-warning-soft p-4 text-body text-warning">{sessionError}</p>}
          <Shell />
        </SheetProvider></FeedbackProvider>
        </ExploreProvider>
      </Introduced>
    </Locked></UpdateGate>
  );
}

/* ── Intro ───────────────────────────────────────────────────────────────── */

/**
 * The intro runs before the shell rather than inside it, so the first thing
 * anyone sees is the pitch rather than an empty dashboard. It sits *after* the
 * lock: a PIN protects the app, and that includes not showing the intro to
 * someone who cannot get in.
 */
function Introduced({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useStore();
  if (state.settings.onboardingSeen) return <>{children}</>;

  return (<>
    <Onboarding
      onDone={() =>
        dispatch({ type: "setSettings", settings: { onboardingSeen: true } })
      }
    />
    <SyncGate />
  </>);
}

/* ── Lock ────────────────────────────────────────────────────────────────── */

function Locked({ children }: { children: React.ReactNode }) {
  const { state, clearLocalData, sessionError } = useStore();
  const pinSet = Boolean(
    state.settings.lockPinHash && state.settings.lockPinSalt,
  );
  const [unlocked, setUnlocked] = useState(!pinSet);

  // Re-arms the lock when Android backgrounds the app — the same expectation as
  // a phone's own lock screen. Only wired up while a PIN actually exists.
  useEffect(() => {
    if (!pinSet) return;
    let cleanup: (() => void) | undefined;
    onAppBackground(() => setUnlocked(false)).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [pinSet]);

  if (!pinSet || unlocked) return <>{children}</>;

  return (
    <LockScreen
      hash={state.settings.lockPinHash!}
      salt={state.settings.lockPinSalt!}
      onUnlock={() => setUnlocked(true)}
      resetError={sessionError}
      onForgotPin={async () => {
        await clearLocalData({ clearLock: true });
        setUnlocked(true);
      }}
    />
  );
}

/* ── Shell ───────────────────────────────────────────────────────────────── */

function Shell() {
  const { stopExplore } = useExplore()
  const { state, dispatch } = useStore();
  const { openImport, openEntry, openCards, openCardDetail } = useSheets();
  const [route, setRoute] = useState<AppRoute>(readHash);
  const view = route.view;
  const renderStartedAt = useMemo(() => Date.now(), [view, route.cardId]);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [privateMode, togglePrivate] = usePrivacy();
  useEffect(() => {
    const report = () => trackScreen(view === 'future' ? 'plan' : view === 'card-detail' ? 'cards' : view)
    report()
    window.addEventListener(ANALYTICS_UPDATED, report)
    return () => window.removeEventListener(ANALYTICS_UPDATED, report)
  }, [view])

  useEffect(() => {
    const openReminder = () => {
      const reminder = consumePendingReminder()
      if (!reminder) return
      // Opening the card list preserves context and lets the person review the
      // dates before choosing their statement file. This runs only after PIN.
      reminder.cardId ? openCardDetail(reminder.cardId) : openCards()
    }
    window.addEventListener(REMINDER_OPEN, openReminder)
    openReminder()
    return () => window.removeEventListener(REMINDER_OPEN, openReminder)
  }, [openCards, openCardDetail]);

  // Hash routing keeps the browser's back button and page reloads working
  // without pulling in a router dependency. On Android the same history also
  // carries the hardware back button (see `initNativeShell`).
  useEffect(() => {
    const onHashChange = () => setRoute(readHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // The household dashboard uses calendar months; statement reconciliation
  // remains attached to complete documents in the archive.
  useEffect(() => {
    if (state.settings.periodGrouping !== "calendar") {
      dispatch({
        type: "setSettings",
        settings: { periodGrouping: "calendar" },
      });
    }
  }, [state.settings.periodGrouping, dispatch]);

  const setView = useCallback(
    (next: string) => {
      const resolved = resolveView(next);
      if (resolved !== 'overview') stopExplore();
      setDirection(
        NAV.findIndex((n) => n.id === resolved) >=
          NAV.findIndex((n) => n.id === view)
          ? "right"
          : "left",
      );
      if (resolved !== view) hapticTap();
      navigateTo(resolved);
      setRoute(readHash());
    },
    [view, stopExplore],
  );

  // Dropping a statement anywhere on the app opens the importer, so the file
  // never has to be carried to a particular screen first.
  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) openImport();
    };
    window.addEventListener("dragenter", onDragEnter);
    return () => window.removeEventListener("dragenter", onDragEnter);
  }, [openImport]);

  const swipe = useTabSwipe(view, setView);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [view, route.cardId]);

  return (
    <div className="finance-app">
      <WorkspaceRail view={view} onSelect={setView} />
      <div className="workspace-body">
        <WorkspaceToolbar view={view} privateMode={privateMode} onTogglePrivate={togglePrivate} />
        {state.notices.length > 0 && (
          <div className="mx-auto w-full max-w-app px-4 pt-4">
            <div
              className="flex gap-3 rounded-[var(--radius-lg)] bg-accent-soft px-4 py-3"
              role="status"
            >
              <Info size={16} className="mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-body font-semibold text-accent-text">
                  Veri yapısı güncellendi
                </p>
                {state.notices.map((note) => (
                  <p
                    key={note}
                    className="text-label leading-relaxed text-accent-text"
                  >
                    {note}
                  </p>
                ))}
              </div>
              <button
                type="button"
                onClick={() => dispatch({ type: "dismissNotices" })}
                aria-label="Kapat"
                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded text-accent-text hover:brightness-90"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <main
          id="main-content"
          tabIndex={-1}
          className="workspace-content"
          style={{
            paddingBottom:
              "calc(var(--tabbar-height) + var(--safe-bottom) + 24px)",
          }}
          onPointerDown={swipe.onPointerDown}
          onPointerUp={swipe.onPointerUp}
          onPointerCancel={swipe.onPointerCancel}
        >
          <Suspense key={view} fallback={<ViewSkeleton />}>
            <div
              className={
                direction === "right" ? "slide-from-right" : "slide-from-left"
              }
            >
              <ScreenPaintMeasurement startedAt={renderStartedAt} />
              {view === "overview" && <OverviewView onNavigate={setView} />}
              {view === "spending" && <SpendingView />}
              {view === 'analysis' && <AnalysisView onNavigate={setView} />}
              {view === "future" && <FutureView />}
              {view === 'cards' && <CardsView onOpenCard={openCardDetail} />}
              {view === 'card-detail' && route.cardId && <CardDetailView cardId={route.cardId} onBack={() => goBack('cards')} />}
              {view === 'assets' && <AssetsView />}
              {view === 'settings' && <SettingsPage onClose={() => goBack()} />}
            </div>
          </Suspense>
        </main>

        {/* Present from the very first launch, with or without data: the bar is
          the app's shape, not a reward for importing something. */}
        <BottomNav
          view={view}
          onSelect={setView}
          onImport={openEntry}
        />
      </div>
    </div>
  );
}

/** Runs only after the selected lazy view commits; no route or record identity leaves the page. */
function ScreenPaintMeasurement({ startedAt }: { startedAt: number }) {
  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => recordDiagnostic('screen_render', Date.now() - startedAt));
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [startedAt]);
  return null;
}

/* ── Swipe between tabs ──────────────────────────────────────────────────── */

/** Far enough to be a swipe rather than a wobble during a vertical scroll. */
const SWIPE_DISTANCE = 64;

/**
 * Horizontal swipe moves between the three tabs, the way it does in every app
 * with a tab bar. It costs nothing to discover and saves a reach to the bottom
 * of the screen for the most common move there is.
 *
 * Touch only. A mouse drag across a chart is not a navigation request, and
 * `pointerType` is the only reliable way to tell those apart. The gesture is
 * also refused when it started inside something that scrolls sideways of its
 * own accord — a wide table's own horizontal scroll wins over the tab strip.
 */
function useTabSwipe(view: ViewId, setView: (id: ViewId) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch") return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "[data-no-swipe], .overflow-x-auto, .recharts-wrapper, input, textarea, select",
      )
    )
      return;
    start.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onPointerCancel = useCallback(() => {
    start.current = null;
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const from = start.current;
      start.current = null;
      if (!from) return;

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      // A swipe that is mostly vertical is a scroll that drifted.
      if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5)
        return;

      const index = NAV.findIndex((n) => n.id === view);
      if (index < 0) return;
      const next = NAV[dx < 0 ? index + 1 : index - 1];
      if (next) setView(next.id);
    },
    [view, setView],
  );

  return { onPointerDown, onPointerUp, onPointerCancel };
}

/* ── Navigation chrome ───────────────────────────────────────────────────── */

/**
 * The phone's whole navigation, in one bar: the three tabs, the one action
 * that creates data, and the one door out to settings.
 *
 * Import sits in the middle as a raised button rather than in the header,
 * because it is the only thing in the app that adds anything — every other
 * screen reads what it produced. Putting it here also means the first run and
 * the hundredth look the same: the bar is present with no data at all, so the
 * app never appears to be a different, smaller thing before its first import.
 */
function BottomNav({
  view,
  onSelect,
  onImport,
}: {
  view: ViewId;
  onSelect: (id: ViewId) => void;
  onImport: () => void;
}) {
  const [first, second, third, fourth] = NAV;

  return (
    <nav
      aria-label="Mobil gezinme"
      className="mizan-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-app items-stretch">
        <TabButton
          item={first}
          active={view === first.id}
          onSelect={onSelect}
        />
        <TabButton
          item={second}
          active={view === second.id}
          onSelect={onSelect}
        />

        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => {
              hapticTap();
              onImport();
            }}
            aria-label="Kayıt ekle"
            className={clsx(
              "inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-inverse",
              "shadow-[var(--shadow-overlay)] transition-transform duration-200 active:scale-95",
            )}
          >
            <Plus size={22} />
          </button>
        </div>

        <TabButton
          item={third}
          active={view === third.id}
          onSelect={onSelect}
        />

        <TabButton item={fourth} active={view === fourth.id} onSelect={onSelect} />
      </div>
    </nav>
  );
}

function TabButton({
  item,
  active,
  onSelect,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  onSelect: (id: ViewId) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex h-[var(--tabbar-height)] flex-1 flex-col items-center justify-center gap-1",
        "transition-colors duration-200",
        active ? "text-accent" : "text-muted",
      )}
    >
      {/* The icon lifts a little when its tab is the live one — the cheapest
          way to say "you are here" without a second colour. */}
      <Icon
        size={20}
        className={clsx(
          "transition-transform duration-200",
          active && "-translate-y-0.5",
        )}
      />
      <span className="text-label font-semibold">{item.label}</span>
    </button>
  );
}

/* ── Loading ─────────────────────────────────────────────────────────────── */

function BootSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-app space-y-4 p-6"
      style={{ paddingTop: "calc(var(--safe-top) + 24px)" }}
    >
      <Skeleton className="h-12 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function ViewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}
