import {
  createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode,
} from 'react'
import { dbGet, dbSet } from './db'
import { initialState, reducer, STATE_VERSION, type Action, type AppState } from './state'
import {
  applyFilters, availableMonths, availableStatementMonths,
  buildStatementMonthIndex, coverageDaysByMonth, periodMonthOf,
} from './selectors'
import { analyzeMemo, type AnalysisContext } from '../analytics/engine'
import { monthOf } from '../core/date'
import type { AuthUser } from '../firebase/auth'
import type { SyncSnapshot } from '../firebase/sync'
import type { Analysis } from '../analytics/types'
import type { Transaction } from '../domain/types'

const PERSIST_KEY = 'state'
const PERSIST_DEBOUNCE_MS = 400
const CLOUD_PUSH_DEBOUNCE_MS = 1500

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

interface StoreValue {
  state: AppState
  dispatch: (action: Action) => void
  /** Transactions after the global filter bar. */
  visible: Transaction[]
  /** Analysis of the filtered set — what every view renders. */
  analysis: Analysis
  /** Analysis of everything imported, for "vs. all periods" comparisons. */
  overall: Analysis
  /** Signed-in Firebase user, or null when running fully local (the default). */
  authUser: AuthUser | null
  syncStatus: SyncStatus
  /** Pushes the current state to Firestore immediately, bypassing the debounce. */
  syncNow: () => void
  /** Re-reads the Firebase user after an action that upgrades it in place (see `refreshAuthUser`). */
  refreshAuthUser: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

/** Fields worth writing to disk; derived state is recomputed on load. */
type Persisted = Pick<AppState, 'version' | 'transactions' | 'statements' | 'rules' | 'profile' | 'settings'>

function toPersisted(state: AppState): Persisted {
  return {
    version: STATE_VERSION,
    transactions: state.transactions,
    statements: state.statements,
    rules: state.rules,
    profile: state.profile,
    settings: state.settings,
  }
}

function toSyncSnapshot(state: AppState): SyncSnapshot {
  return {
    transactions: state.transactions,
    statements: state.statements,
    rules: state.rules,
    profile: state.profile,
    settings: state.settings,
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const saveTimer = useRef<number | null>(null)
  const cloudTimer = useRef<number | null>(null)
  const stateRef = useRef(state)
  const lastUidRef = useRef<string | null>(null)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')

  useEffect(() => {
    stateRef.current = state
  }, [state])

  // ── Load once ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    dbGet<Persisted>(PERSIST_KEY).then((stored) => {
      if (cancelled) return
      if (!stored || stored.version !== STATE_VERSION) {
        // A schema bump discards the old snapshot rather than half-reading it;
        // statements can always be re-imported from the original files.
        dispatch({ type: 'hydrate', payload: {} })
        return
      }
      dispatch({
        type: 'hydrate',
        payload: {
          transactions: stored.transactions ?? [],
          statements: stored.statements ?? [],
          rules: stored.rules ?? [],
          profile: { ...initialState.profile, ...stored.profile },
          settings: { ...initialState.settings, ...stored.settings },
        },
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // ── Save, debounced ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.hydrated) return
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void dbSet(PERSIST_KEY, toPersisted(state))
    }, PERSIST_DEBOUNCE_MS)

    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    }
  }, [state])

  // ── Open on the newest period ───────────────────────────────────────────────
  // "Tüm dönemler" as a landing state makes the headline a sum across however
  // many statements happen to be loaded, which answers no question anyone
  // asks. The newest period does, and every other one is a chip away. Filters
  // are never persisted, so this runs on each load without overriding a choice
  // the reader made — the ref only stops it fighting later re-renders.
  const defaultedPeriod = useRef(false)
  useEffect(() => {
    if (!state.hydrated || defaultedPeriod.current) return
    if (state.filters.month !== 'all') return

    const periods =
      state.settings.periodGrouping === 'statement'
        ? availableStatementMonths(state.statements)
        : availableMonths(state.transactions)

    defaultedPeriod.current = true
    if (periods.length <= 1) return

    // Prefer the newest month a statement actually reached. The current month
    // usually holds only the salary and rent entered by hand — this month's
    // statement has not arrived yet — and opening on it would show a thin
    // slice of the picture rather than the last month there is a full one for.
    const withStatements = new Set(
      state.transactions.filter((tx) => tx.source === 'statement').map((tx) => monthOf(tx.date)),
    )
    const landing = periods.find((month) => withStatements.has(month)) ?? periods[0]
    dispatch({ type: 'setFilters', filters: { month: landing } })
  }, [state.hydrated, state.settings.periodGrouping, state.statements, state.transactions, state.filters.month])

  // ── Cloud auth, opt-in ──────────────────────────────────────────────────────
  // Waits for the local IndexedDB load to finish first: subscribing earlier
  // risks a pull+merge landing on `initialState` and dispatching a "hydrate"
  // that the *real* local hydrate then clobbers a moment later, discarding
  // whatever the merge pulled down. `state.hydrated` flips exactly once, so
  // this subscribes exactly once, strictly after local data is in memory.
  //
  // The whole Firebase SDK is dynamically imported here rather than statically
  // at the top of the file: a static import would put it in the eagerly
  // loaded entry chunk for every visitor, including the far more common one
  // who never touches cloud sync (it once added ~140 kB gzipped to the first
  // load before this was changed to a dynamic import).
  useEffect(() => {
    if (!state.hydrated) return
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    import('../firebase/config').then(({ isFirebaseConfigured }) => {
      if (cancelled || !isFirebaseConfigured()) return
      import('../firebase/auth').then(({ onAuthChange }) => {
        if (cancelled) return
        unsubscribe = onAuthChange((user) => {
          setAuthUser(user)
          if (!user) {
            lastUidRef.current = null
            return
          }
          // `onAuthStateChanged` also re-fires on token refresh with the same
          // user; only a genuine sign-in/sign-out/account-switch should
          // trigger a re-pull.
          if (lastUidRef.current === user.uid) return
          lastUidRef.current = user.uid

          setSyncStatus('syncing')
          import('../firebase/sync').then(({ pullSnapshot, mergeSnapshots }) =>
            pullSnapshot(user.uid)
              .then((cloud) => {
                if (cloud) {
                  const merged = mergeSnapshots(toSyncSnapshot(stateRef.current), cloud)
                  dispatch({ type: 'hydrate', payload: merged })
                }
                setSyncStatus('synced')
              })
              .catch((err) => {
                console.error('Cloud sync (pull) failed', err)
                setSyncStatus('error')
              }),
          )
        })
      })
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [state.hydrated])

  // ── Cloud push, debounced ────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.hydrated || !authUser) return
    if (cloudTimer.current !== null) window.clearTimeout(cloudTimer.current)

    const uid = authUser.uid
    const snapshot = toSyncSnapshot(state)
    cloudTimer.current = window.setTimeout(() => {
      setSyncStatus('syncing')
      import('../firebase/sync').then(({ pushSnapshot }) =>
        pushSnapshot(uid, snapshot)
          .then(() => setSyncStatus('synced'))
          .catch((err) => {
            console.error('Cloud sync (push) failed', err)
            setSyncStatus('error')
          }),
      )
    }, CLOUD_PUSH_DEBOUNCE_MS)

    return () => {
      if (cloudTimer.current !== null) window.clearTimeout(cloudTimer.current)
    }
  }, [state, authUser])

  /**
   * Linking a credential onto an already-signed-in anonymous user (register
   * or Google, from an anonymous session) does not fire `onAuthChange` — see
   * the comment on `getCurrentAuthUser` — so the caller (Ayarlar's account
   * form) calls this right after such an action resolves to pick up the
   * now-permanent account instead of still showing "anonymous".
   */
  const refreshAuthUser = () => {
    import('../firebase/auth').then(({ getCurrentAuthUser }) => setAuthUser(getCurrentAuthUser()))
  }

  const syncNow = () => {
    if (!authUser) return
    if (cloudTimer.current !== null) window.clearTimeout(cloudTimer.current)
    setSyncStatus('syncing')
    const uid = authUser.uid
    const snapshot = toSyncSnapshot(stateRef.current)
    import('../firebase/sync').then(({ pushSnapshot }) =>
      pushSnapshot(uid, snapshot)
        .then(() => setSyncStatus('synced'))
        .catch((err) => {
          console.error('Cloud sync (manual push) failed', err)
          setSyncStatus('error')
        }),
    )
  }

  const visible = useMemo(
    () =>
      applyFilters(state.transactions, state.filters, {
        periodGrouping: state.settings.periodGrouping,
        statements: state.statements,
      }),
    [state.transactions, state.filters, state.settings.periodGrouping, state.statements],
  )

  /**
   * Under statement grouping the analysis has to bucket months exactly the way
   * the filter chips do, or the chips say "Ağustos" while the charts, the
   * month-over-month trend and the savings goal underneath still count
   * calendar months.
   */
  const analysisContext = useMemo<AnalysisContext>(() => {
    const grouping = state.settings.periodGrouping
    const coverage = coverageDaysByMonth(state.statements, grouping)
    const coverageKey = [...coverage].sort().map(([m, d]) => `${m}:${d}`).join(',')

    if (grouping !== 'statement') {
      return { coverageDaysOf: (month) => coverage.get(month), key: `calendar|${coverageKey}` }
    }

    const statementMonths = buildStatementMonthIndex(state.statements)
    const namedMonths = new Set(statementMonths.values())
    return {
      monthOfTx: (tx) => periodMonthOf(tx, 'statement', statementMonths),
      // A month no statement is named after exists only because of manual
      // entries, so its picture of the month is incomplete by definition.
      isPartialMonth: (month) => !namedMonths.has(month),
      coverageDaysOf: (month) => coverage.get(month),
      key: `statement|${coverageKey}`,
    }
  }, [state.settings.periodGrouping, state.statements])

  const analysis = useMemo(
    () => analyzeMemo(visible, state.profile, analysisContext),
    [visible, state.profile, analysisContext],
  )
  const overall = useMemo(
    () => analyzeMemo(state.transactions, state.profile, analysisContext),
    [state.transactions, state.profile, analysisContext],
  )

  const value = useMemo<StoreValue>(
    () => ({ state, dispatch, visible, analysis, overall, authUser, syncStatus, syncNow, refreshAuthUser }),
    [state, visible, analysis, overall, authUser, syncStatus],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <AppStoreProvider>')
  return value
}
