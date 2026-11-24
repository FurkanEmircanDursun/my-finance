import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Info, X } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useTheme } from './useTheme'
import { useNativeTheme } from './useNativeTheme'
import { usePrivacy } from './usePrivacy'
import {
  hideSplashScreen,
  initNativeShell,
  onAppBackground,
} from '../platform/native'
import { hapticTap } from '../platform/haptics'
import { LockScreen } from './LockScreen'
import { Onboarding } from './Onboarding'
import { SplashScreen } from './SplashScreen'
import { WorkspaceRail, WorkspaceToolbar, BottomNav } from './WorkspaceChrome'
import { SheetProvider, useSheets } from './sheets'
import { FeedbackProvider } from '../ui/Feedback'
import { useCloudServices } from './useCloudServices'
import { ANALYTICS_UPDATED, trackScreen } from '../platform/analytics'
import { parseRoute, navigateTo, goBack, type ViewId, type AppRoute } from './navigation'
import { ExploreProvider, useExplore } from './ExploreContext'
import { UpdateGate } from './UpdateGate'
import { initializeDiagnostics, recordDiagnostic } from '../platform/diagnostics'
import { Button, Field, Skeleton, TextInput } from '../ui/primitives'
import { CockpitSkeleton } from '../ui/motion'
import { useReminderSync } from './useReminderSync'
import { consumePendingReminder, REMINDER_OPEN } from '../platform/reminders'
import { Brand } from '../ui/Brand'
import { firebaseErrorMessage } from '../firebase/errors'

const OverviewView = lazy(() =>
  import('../views/OverviewView').then((m) => ({ default: m.OverviewView })),
)
const SpendingView = lazy(() =>
  import('../views/SpendingView').then((m) => ({ default: m.SpendingView })),
)
const FutureView = lazy(() =>
  import('../views/FutureView').then((m) => ({ default: m.FutureView })),
)
const CardsView = lazy(() => import('../views/CardsView').then((m) => ({ default: m.CardsView })))
const CardDetailView = lazy(() => import('../views/CardDetailView').then((m) => ({ default: m.CardDetailView })))
const AssetsView = lazy(() => import('../views/AssetsView').then((m) => ({ default: m.AssetsView })))
const AnalysisView = lazy(() => import('../views/AnalysisView').then((m) => ({ default: m.AnalysisView })))
const TransactionsView = lazy(() => import('../views/TransactionsSheet').then((m) => ({ default: m.TransactionsView })))
const StatementView = lazy(() => import('../views/StatementView').then((m) => ({ default: m.StatementView })))
const SettingsPage = lazy(() => import('./SettingsSheet').then((m) => ({ default: m.SettingsPage })))
const AccountSignInForm = lazy(() => import('./AccountSheet').then((m) => ({ default: m.AccountSignInForm })))
const PrivacyPolicyLink = lazy(() => import('./AccountSheet').then((m) => ({ default: m.PrivacyPolicyLink })))

function readHash(): AppRoute {
  return parseRoute(window.location.hash)
}

export default function App() {
  const { state, authReady, authUser, sync, syncNow, sessionBusy, sessionError, dataEpoch } = useStore()

  useTheme(state.settings.theme)
  useNativeTheme(state.settings.theme)
  useReminderSync()
  useCloudServices()
  useEffect(() => initializeDiagnostics(), [])

  useEffect(() => {
    let active = true
    let cleanup: (() => void) | undefined
    initNativeShell().then((fn) => {
      if (active) cleanup = fn
      else fn()
    })
    return () => {
      active = false
      cleanup?.()
    }
  }, [])

  useEffect(() => {
    if (authReady) void hideSplashScreen()
  }, [authReady])

  return (
    <>
      <SplashScreen ready={authReady} />
      <UpdateGate>
        {!authReady || !authUser || !state.hydrated || sessionBusy ? (
          <WorkspaceAccess key={dataEpoch} />
        ) : (
          <Locked key={dataEpoch}>
            <ExploreProvider key={dataEpoch}>
              <FeedbackProvider>
                <SheetProvider>
                  <Introduced>
                    {sessionError && (
                      <p role="alert" className="mx-5 mt-4 rounded-[var(--radius)] border border-warning/30 bg-warning-soft p-4 text-body text-warning">
                        {sessionError}
                      </p>
                    )}
                    {(sync.status === 'offline' || sync.status === 'error') && (
                      <aside className="workspace-sync-notice" aria-live="polite">
                        <p>
                          {sync.error || 'Bağlantı kesildi.'}{' '}
                          {sync.pending > 0 && 'Bekleyen değişiklikler kaydedilene kadar Mizan’ı açık tut.'}
                        </p>
                        <Button size="sm" onClick={syncNow}>
                          Yeniden eşitle
                        </Button>
                      </aside>
                    )}
                    <Shell />
                  </Introduced>
                </SheetProvider>
              </FeedbackProvider>
            </ExploreProvider>
          </Locked>
        )}
      </UpdateGate>
    </>
  )
}

function WorkspaceAccess() {
  const {
    authReady,
    authUser,
    authError,
    retryAuth,
    cloudAvailable,
    sync,
    syncNow,
    logout,
    legacyMigration,
    migrateLegacy,
    sessionBusy,
    sessionError,
  } = useStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const retry = sync.status === 'offline' || sync.status === 'error' || !!sessionError

  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await operation()
    } catch (failure) {
      setError(firebaseErrorMessage(failure, 'session'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="workspace-access">
      <section className="workspace-access__panel">
        <Brand size={40} subtitle="Ayın dengesi, senin elinde" animated />
        <h1>{authUser ? 'Hesabın hazırlanıyor' : 'Mizan’a giriş yap'}</h1>
        {(error || sessionError || authError) && (
          <p role="alert" className="rounded-[var(--radius)] bg-negative-soft px-3.5 py-2.5 text-label font-medium text-negative">
            {error || sessionError || authError}
          </p>
        )}
        {sessionBusy || !authReady ? (
          <div className="space-y-3" role="status">
            <p className="text-body text-muted">Oturum kontrol ediliyor…</p>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-3/4" />
          </div>
        ) : !cloudAvailable ? (
          <p role="alert" className="text-body text-muted">
            Bu dağıtımda Firebase bağlantısı yapılandırılmamış.
          </p>
        ) : !authUser ? (
          <>
            {authError && <Button onClick={retryAuth}>Bağlantıyı yeniden dene</Button>}
            <Suspense fallback={<Skeleton className="h-28 w-full" />}>
              <AccountSignInForm upgrading={false} />
              <PrivacyPolicyLink />
            </Suspense>
          </>
        ) : legacyMigration ? (
          <>
            <p className="text-body text-muted">
              Bu cihazda eski Mizan kayıtları var. Bunları açık hesabına aktarabilir veya daha sonra aktarabilirsin.
            </p>
            {legacyMigration.pinRequired && (
              <Field label="Eski uygulama PIN’i">
                <TextInput
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                />
              </Field>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={busy || (legacyMigration.pinRequired && pin.length !== 4)}
                onClick={() => void run(() => migrateLegacy('import', pin))}
              >
                Bu hesaba aktar
              </Button>
              <Button disabled={busy} onClick={() => void run(() => migrateLegacy('later'))}>
                Daha sonra
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p role={retry ? 'alert' : 'status'} className="text-body text-muted">
              {sync.error ||
                (sync.status === 'offline'
                  ? 'Hesabını açmak için internet bağlantısı gerekiyor.'
                  : 'Hesabındaki kayıtlar güvenli biçimde yükleniyor…')}
            </p>
            {!retry && <Skeleton className="h-2 w-full rounded-full" />}
            {retry && <Button onClick={syncNow}>Yeniden dene</Button>}
          </div>
        )}
        {!sessionBusy && authUser && (
          <Button variant="ghost" disabled={busy} onClick={() => void run(logout)}>
            Çıkış yap
          </Button>
        )}
      </section>
    </main>
  )
}

function Introduced({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useStore()
  if (state.settings.onboardingSeen) return <>{children}</>

  return (
    <Onboarding
      onDone={() =>
        dispatch({ type: 'setSettings', settings: { onboardingSeen: true } })
      }
    />
  )
}

function Locked({ children }: { children: React.ReactNode }) {
  const { state, logout, sessionError } = useStore()
  const pinSet = Boolean(state.settings.lockPinHash && state.settings.lockPinSalt)
  const [unlocked, setUnlocked] = useState(!pinSet)

  useEffect(() => {
    if (!pinSet) return
    let cleanup: (() => void) | undefined
    onAppBackground(() => setUnlocked(false)).then((fn) => {
      cleanup = fn
    })
    return () => cleanup?.()
  }, [pinSet])

  if (!pinSet || unlocked) return <>{children}</>

  return (
    <LockScreen
      hash={state.settings.lockPinHash!}
      salt={state.settings.lockPinSalt!}
      onUnlock={() => setUnlocked(true)}
      resetError={sessionError}
      onForgotPin={logout}
    />
  )
}

function Shell() {
  const { stopExplore } = useExplore()
  const { state, dispatch, authUser, loadedPeriods, historyReady, requestPeriod, sync, syncNow } = useStore()
  const { openImport, openEntry, openCards, openCardDetail } = useSheets()
  const [route, setRoute] = useState<AppRoute>(readHash)
  const view = route.view
  const period =
    view === 'assets'
      ? null
      : view === 'overview' || view === 'transactions'
        ? state.filters.month
        : view === 'statement' && route.statementId
          ? `statement:${route.statementId}`
          : 'all'
  const periodReady = !period || historyReady || loadedPeriods.has(period)

  useEffect(() => {
    if (period && !periodReady) requestPeriod(period)
  }, [period, periodReady, requestPeriod])

  const renderStartedAt = useMemo(() => Date.now(), [view, route.cardId, route.statementId])
  const lastFocusedRoute = useRef(window.location.hash)
  const [privateMode, togglePrivate] = usePrivacy()

  useEffect(() => {
    const screen =
      view === 'future'
        ? 'plan'
        : view === 'card-detail' || view === 'statement'
          ? 'cards'
          : view === 'transactions'
            ? 'spending'
            : view
    const report = () => trackScreen(screen)
    report()
    window.addEventListener(ANALYTICS_UPDATED, report)
    return () => window.removeEventListener(ANALYTICS_UPDATED, report)
  }, [view])

  useEffect(() => {
    const openReminder = () => {
      const reminder = consumePendingReminder(authUser?.uid)
      if (!reminder) return
      reminder.cardId ? openCardDetail(reminder.cardId) : openCards()
    }
    window.addEventListener(REMINDER_OPEN, openReminder)
    openReminder()
    return () => window.removeEventListener(REMINDER_OPEN, openReminder)
  }, [authUser?.uid, openCards, openCardDetail])

  useEffect(() => {
    const onHashChange = () => setRoute(readHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (state.settings.periodGrouping !== 'calendar') {
      dispatch({
        type: 'setSettings',
        settings: { periodGrouping: 'calendar' },
      })
    }
  }, [state.settings.periodGrouping, dispatch])

  const setView = useCallback(
    (next: ViewId) => {
      if (next !== 'overview') stopExplore()
      if (next !== view) hapticTap()
      navigateTo(next)
    },
    [view, stopExplore],
  )

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) openImport()
    }
    window.addEventListener('dragenter', onDragEnter)
    return () => window.removeEventListener('dragenter', onDragEnter)
  }, [openImport])

  useEffect(() => {
    if (lastFocusedRoute.current === window.location.hash) return
    lastFocusedRoute.current = window.location.hash
    window.scrollTo(0, 0)
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [view, route.cardId, route.statementId])

  return (
    <div className="finance-app">
      <a
        className="workspace-skip"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        İçeriğe geç
      </a>
      <WorkspaceRail view={view} onSelect={setView} />
      <div className="workspace-body">
        <WorkspaceToolbar
          view={view}
          privateMode={privateMode}
          onTogglePrivate={togglePrivate}
        />
        {state.notices.length > 0 && (
          <div className="mx-auto w-full max-w-app px-4 pt-4">
            <div
              className="flex gap-3 rounded-[var(--radius-lg)] border border-accent-border bg-accent-soft px-4 py-3.5"
              role="status"
            >
              <Info size={16} className="mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-body font-semibold text-accent-text">
                  Veri yapısı güncellendi
                </p>
                {state.notices.map((note) => (
                  <p key={note} className="text-label leading-relaxed text-accent-text">
                    {note}
                  </p>
                ))}
              </div>
              <button
                type="button"
                onClick={() => dispatch({ type: 'dismissNotices' })}
                aria-label="Kapat"
                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-accent-text hover:bg-accent/15"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <main id="main-content" tabIndex={-1} className="workspace-content">
          {!periodReady ? (
            sync.status === 'error' || sync.status === 'offline' ? (
              <div className="workspace-sync-notice" role="status">
                <p>Dönem kayıtları yüklenemedi.</p>
                <Button size="sm" onClick={syncNow}>
                  Yeniden dene
                </Button>
              </div>
            ) : (
              <CockpitSkeleton />
            )
          ) : (
            <Suspense key={view} fallback={<CockpitSkeleton />}>
              <div className="fade-in">
                <ScreenPaintMeasurement startedAt={renderStartedAt} />
                {view === 'overview' && (
                  <OverviewView onNavigate={setView} privateMode={privateMode} />
                )}
                {view === 'transactions' && <TransactionsView />}
                {view === 'spending' && <SpendingView />}
                {view === 'analysis' && <AnalysisView onNavigate={setView} />}
                {view === 'future' && <FutureView />}
                {view === 'cards' && <CardsView onOpenCard={openCardDetail} />}
                {view === 'card-detail' && route.cardId && (
                  <CardDetailView
                    key={route.cardId}
                    cardId={route.cardId}
                    onBack={() => goBack('cards')}
                  />
                )}
                {view === 'statement' && route.statementId && (
                  <StatementView
                    key={route.statementId}
                    statementId={route.statementId}
                    onBack={() => goBack('cards')}
                  />
                )}
                {view === 'assets' && <AssetsView />}
                {view === 'settings' && <SettingsPage onClose={() => goBack()} />}
              </div>
            </Suspense>
          )}
        </main>
        <BottomNav view={view} onSelect={setView} onAdd={openEntry} />
      </div>
    </div>
  )
}

function ScreenPaintMeasurement({ startedAt }: { startedAt: number }) {
  useEffect(() => {
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() =>
        recordDiagnostic('screen_render', Date.now() - startedAt),
      )
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [startedAt])
  return null
}
