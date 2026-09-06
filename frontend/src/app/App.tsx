import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Moon, Plus, Settings2, Sun } from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../store/AppStore'
import { useTheme } from './useTheme'
import { FilterBar } from './FilterBar'
import { PeriodModePrompt } from './PeriodModePrompt'
import { OnboardingWizard } from './OnboardingWizard'
import { isViewId, NAV, PRIMARY_NAV, type ViewId } from './navigation'
import { Skeleton } from '../ui/primitives'
import { monthLabel } from '../core/date'
import { ImportView } from '../views/ImportView'

/**
 * The dashboard views pull in the charting library; the import screen does not.
 * Splitting them here keeps a first visit — which always lands on import — from
 * downloading roughly 100 kB gzipped of charts it will not draw.
 */
const OverviewView = lazy(() => import('../views/OverviewView').then((m) => ({ default: m.OverviewView })))
const LedgerView = lazy(() => import('../views/LedgerView').then((m) => ({ default: m.LedgerView })))
const SpendingView = lazy(() => import('../views/SpendingView').then((m) => ({ default: m.SpendingView })))
const RecurringView = lazy(() => import('../views/RecurringView').then((m) => ({ default: m.RecurringView })))
const CommitmentsView = lazy(() => import('../views/CommitmentsView').then((m) => ({ default: m.CommitmentsView })))
const TransactionsView = lazy(() => import('../views/TransactionsView').then((m) => ({ default: m.TransactionsView })))
const InsightsView = lazy(() => import('../views/InsightsView').then((m) => ({ default: m.InsightsView })))
const SettingsView = lazy(() => import('../views/SettingsView').then((m) => ({ default: m.SettingsView })))

function readHash(): ViewId {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return isViewId(raw) ? raw : 'overview'
}

export default function App() {
  const { state, dispatch, visible, analysis, overall } = useStore()
  const [view, setViewState] = useState<ViewId>(readHash)

  useTheme(state.settings.theme)

  // Hash routing keeps the browser's back button and page reloads working
  // without pulling in a router dependency.
  useEffect(() => {
    const onHashChange = () => setViewState(readHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const setView = useCallback((next: ViewId) => {
    window.location.hash = `/${next}`
    setViewState(next)
  }, [])

  const hasData = state.transactions.length > 0
  const periodLabel =
    state.filters.month === 'all' ? 'Tüm dönemler' : monthLabel(state.filters.month)
  // Gelir–Gider works before any statement exists — entering a salary and a
  // rent is a perfectly good first step — so it is reachable with no data, the
  // same way Ayarlar is.
  const worksEmpty = view === 'settings' || view === 'ledger'
  const effectiveView: ViewId = !hasData && !worksEmpty ? 'import' : view

  const cycleTheme = () => {
    const order = ['system', 'light', 'dark'] as const
    const next = order[(order.indexOf(state.settings.theme) + 1) % order.length]
    dispatch({ type: 'setSettings', settings: { theme: next } })
  }

  if (!state.hydrated) {
    return (
      <div className="mx-auto w-full max-w-app space-y-3 p-6">
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-3 sm:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <OnboardingWizard />
      <PeriodModePrompt />

      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-app items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setView('overview')}
            className="flex items-center gap-2.5 text-left"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded border border-line bg-raised text-[13px] font-semibold text-ink">
              ₺
            </span>
            <span className="hidden text-[13px] font-semibold tracking-tight text-ink sm:inline">
              My Finance
            </span>
          </button>

          <div className="flex-1" />

          <button
            type="button"
            onClick={cycleTheme}
            aria-label={`Tema: ${state.settings.theme}`}
            title={`Tema: ${state.settings.theme === 'system' ? 'sistem' : state.settings.theme === 'light' ? 'açık' : 'koyu'}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-muted hover:bg-hover hover:text-ink"
          >
            {state.settings.theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          <button
            type="button"
            onClick={() => setView('settings')}
            aria-label="Ayarlar"
            className={clsx(
              'inline-flex h-8 w-8 items-center justify-center rounded hover:bg-hover hover:text-ink',
              effectiveView === 'settings' ? 'text-ink' : 'text-muted',
            )}
          >
            <Settings2 size={15} />
          </button>

          <button
            type="button"
            onClick={() => setView('import')}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-accent px-3 text-2xs font-medium text-white hover:bg-accent-hover"
          >
            <Plus size={13} />
            Ekstre
          </button>
        </div>

        {hasData && (
          <nav className="mx-auto w-full max-w-app px-2">
            <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
              {PRIMARY_NAV.map((item) => {
                const Icon = item.icon
                const active = effectiveView === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-2.5 text-2xs font-medium transition-colors',
                      active ? 'text-ink' : 'text-muted hover:text-ink',
                    )}
                  >
                    <Icon size={13} />
                    {item.label}
                    {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
                  </button>
                )
              })}
            </div>
          </nav>
        )}

        {/* Recurring and commitments/goal always read the whole account (see the
            `overall` comment below), so a period chip there would look
            selected while quietly doing nothing — hiding the bar is more
            honest than a filter that does not filter. */}
        {hasData && !['import', 'settings', 'recurring', 'commitments', 'ledger'].includes(effectiveView) && (
          <div className="mx-auto w-full max-w-app">
            <FilterBar />
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-app flex-1 px-4 py-4">
        <Suspense key={effectiveView} fallback={<ViewSkeleton />}>
          <div className="fade-in">
          {effectiveView === 'overview' && (
              <OverviewView
                analysis={analysis}
                overall={overall}
                profile={state.profile}
                periodLabel={periodLabel}
                onNavigate={setView}
              />
            )}
          {effectiveView === 'ledger' && <LedgerView />}
          {effectiveView === 'spending' && <SpendingView analysis={analysis} profile={state.profile} />}
          {/* Recurring and commitments/goal are whole-history concepts — a
              period filter would otherwise starve recurring detection of the
              occurrences it needs and make the goal chart reflect one month
              of saving instead of the real trajectory, so both always read
              `overall` rather than the filtered `analysis`. */}
          {effectiveView === 'recurring' && <RecurringView analysis={overall} />}
          {effectiveView === 'commitments' && (
            <CommitmentsView analysis={overall} profile={state.profile} />
          )}
          {effectiveView === 'transactions' && <TransactionsView transactions={visible} />}
          {effectiveView === 'insights' && (
            <InsightsView analysis={analysis} overall={overall} onNavigate={setView} />
          )}
          {effectiveView === 'import' && <ImportView onDone={() => setView('overview')} />}
            {effectiveView === 'settings' && <SettingsView />}
          </div>
        </Suspense>
      </main>

      <footer className="mx-auto w-full max-w-app px-4 py-6">
        <p className="border-t border-line pt-4 text-center text-2xs text-faint">
          Tüm veriler yalnızca bu tarayıcıda işlenir ve saklanır · {NAV.length} bölüm ·{' '}
          {state.transactions.length} işlem
        </p>
      </footer>
    </div>
  )
}

function ViewSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
