import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Plus, Settings2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../store/AppStore'
import { useTheme } from './useTheme'
import { useNativeTheme } from './useNativeTheme'
import { hideSplashScreen, initNativeShell, onAppBackground } from '../platform/native'
import { LockScreen } from './LockScreen'
import { PeriodButton } from './PeriodPicker'
import { FirstRun } from './ImportSheet'
import { SheetProvider, useSheets } from './sheets'
import { NAV, resolveView, type ViewId } from './navigation'
import { Skeleton } from '../ui/primitives'
import { statementSpansMonths } from '../domain/types'

/**
 * The dashboard views pull in the charting library; the first run does not.
 * Splitting them here keeps a first visit — which is only ever a drop target —
 * from downloading roughly 100 kB gzipped of charts it will not draw.
 */
const OverviewView = lazy(() => import('../views/OverviewView').then((m) => ({ default: m.OverviewView })))
const SpendingView = lazy(() => import('../views/SpendingView').then((m) => ({ default: m.SpendingView })))
const FutureView = lazy(() => import('../views/FutureView').then((m) => ({ default: m.FutureView })))

function readHash(): ViewId {
  return resolveView(window.location.hash.replace(/^#\/?/, ''))
}

export default function App() {
  const { state } = useStore()

  useTheme(state.settings.theme)
  useNativeTheme(state.settings.theme)

  // Back-button wiring for the Android shell; resolves to a no-op on web.
  useEffect(() => {
    let cleanup: (() => void) | undefined
    initNativeShell().then((fn) => {
      cleanup = fn
    })
    return () => cleanup?.()
  }, [])

  // The splash screen stays up until local data has actually loaded, so it
  // never hands off to a bare skeleton.
  useEffect(() => {
    if (state.hydrated) void hideSplashScreen()
  }, [state.hydrated])

  if (!state.hydrated) return <BootSkeleton />

  return (
    <Locked>
      <SheetProvider>
        <Shell />
      </SheetProvider>
    </Locked>
  )
}

/* ── Lock ────────────────────────────────────────────────────────────────── */

function Locked({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useStore()
  const pinSet = Boolean(state.settings.lockPinHash && state.settings.lockPinSalt)
  const [unlocked, setUnlocked] = useState(!pinSet)

  // Re-arms the lock when Android backgrounds the app — the same expectation as
  // a phone's own lock screen. Only wired up while a PIN actually exists.
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
      onForgotPin={() => {
        // Clear the lock before wiping, not after: 'reset' preserves whatever
        // settings exist at the moment it runs, and a forgotten PIN must not
        // survive its own recovery.
        dispatch({ type: 'setSettings', settings: { lockPinHash: null, lockPinSalt: null } })
        dispatch({ type: 'reset' })
        setUnlocked(true)
      }}
    />
  )
}

/* ── Shell ───────────────────────────────────────────────────────────────── */

function Shell() {
  const { state, dispatch } = useStore()
  const { openImport, openSettings } = useSheets()
  const [view, setViewState] = useState<ViewId>(readHash)

  // Hash routing keeps the browser's back button and page reloads working
  // without pulling in a router dependency. On Android the same history also
  // carries the hardware back button (see `initNativeShell`).
  useEffect(() => {
    const onHashChange = () => setViewState(readHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  /*
   * A card statement runs roughly "27th to 26th", so it usually straddles two
   * calendar months. The old build stopped the person on a modal to ask which
   * grouping they wanted before they had seen a single number.
   *
   * An app that can work the answer out does not ask the question: a statement
   * that spans months is grouped by its own period, which is the reading that
   * keeps one statement's charges together. The choice is still in Ayarlar →
   * Gelişmiş for anyone who disagrees, and the overview says which one is in
   * force rather than leaving it silent.
   */
  useEffect(() => {
    if (state.settings.periodGrouping !== null) return
    if (!state.statements.some(statementSpansMonths)) return
    dispatch({ type: 'setSettings', settings: { periodGrouping: 'statement' } })
  }, [state.settings.periodGrouping, state.statements, dispatch])

  const setView = useCallback((next: string) => {
    const resolved = resolveView(next)
    window.location.hash = `/${resolved}`
    setViewState(resolved)
  }, [])

  // Dropping a statement anywhere on the app opens the importer, so the file
  // never has to be carried to a particular screen first.
  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) openImport()
    }
    window.addEventListener('dragenter', onDragEnter)
    return () => window.removeEventListener('dragenter', onDragEnter)
  }, [openImport])

  const hasData = state.transactions.length > 0

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-app items-center gap-2 px-4">
          {hasData ? <PeriodButton /> : <span className="text-title font-semibold text-ink">My Finance</span>}

          <div className="flex-1" />

          <button
            type="button"
            onClick={openSettings}
            aria-label="Ayarlar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-muted transition-colors duration-200 hover:bg-hover hover:text-ink"
          >
            <Settings2 size={18} />
          </button>

          {hasData && (
            <button
              type="button"
              onClick={openImport}
              className="inline-flex h-11 items-center gap-2 rounded-[var(--radius)] bg-accent px-4 text-body font-semibold text-white transition-colors duration-200 hover:bg-accent-hover"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Ekstre</span>
            </button>
          )}
        </div>

        {/* Tabs live at the top on a pointer device and at the bottom, within
            thumb reach, on a phone. */}
        {hasData && (
          <nav className="mx-auto hidden w-full max-w-app px-3 sm:block">
            <div className="flex items-center gap-1">
              {NAV.map((item) => (
                <TopTab key={item.id} item={item} active={view === item.id} onSelect={setView} />
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-app flex-1 px-4 pb-28 pt-6 sm:pb-12">
        {!hasData ? (
          <FirstRun />
        ) : (
          <Suspense key={view} fallback={<ViewSkeleton />}>
            <div className="fade-in">
              {view === 'overview' && <OverviewView onNavigate={setView} />}
              {view === 'spending' && <SpendingView />}
              {view === 'future' && <FutureView />}
            </div>
          </Suspense>
        )}
      </main>

      {hasData && <BottomNav view={view} onSelect={setView} />}
    </div>
  )
}

/* ── Navigation chrome ───────────────────────────────────────────────────── */

function TopTab({
  item,
  active,
  onSelect,
}: {
  item: (typeof NAV)[number]
  active: boolean
  onSelect: (id: ViewId) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'relative flex h-11 shrink-0 items-center px-3 text-body font-semibold transition-colors duration-200',
        active ? 'text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {item.label}
      {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
    </button>
  )
}

function BottomNav({ view, onSelect }: { view: ViewId; onSelect: (id: ViewId) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <div className="mx-auto flex w-full max-w-app">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'flex h-16 flex-1 flex-col items-center justify-center gap-1 transition-colors duration-200',
                active ? 'text-accent' : 'text-muted',
              )}
            >
              <Icon size={20} />
              <span className="text-label font-semibold">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/* ── Loading ─────────────────────────────────────────────────────────────── */

function BootSkeleton() {
  return (
    <div className="mx-auto w-full max-w-app space-y-4 p-6">
      <Skeleton className="h-12 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
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
  )
}
