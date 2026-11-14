import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode,
} from 'react'
import { dbGet, dbSet } from './db'
import { initialState, reducer, STATE_VERSION, toSnapshot, type Action, type AppState } from './state'
import { migratePersisted, type Persisted } from './migrate'
import {
  applyFilters, availableMonths, availableStatementMonths, billedMonthOf,
  buildStatementMonthIndex, coverageDaysByMonth, periodMonthOf,
} from './selectors'
import { analyzeMemo, type AnalysisContext } from '../analytics/engine'
import { cloudAvailable } from '../firebase/available'
import type { AuthUser } from '../firebase/auth'
import type { SyncEngine } from '../sync/engine'
import { initialSyncState, type SyncState } from '../sync/status'
import type { Analysis } from '../analytics/types'
import type { Transaction } from '../domain/types'

const PERSIST_KEY = 'state'

export type { SyncState, SyncStatus } from '../sync/status'

interface StoreValue {
  state: AppState
  dispatch: (action: Action) => void
  /** Transactions after the global filter bar. */
  visible: Transaction[]
  /** Analysis of the filtered set — what every view renders. */
  analysis: Analysis
  /** Analysis of everything imported, for "vs. all periods" comparisons. */
  overall: Analysis
  /** Whether this build has cloud sync set up at all. */
  cloudAvailable: boolean
  /** Signed-in Firebase user, or null when running fully local (the default). */
  authUser: AuthUser | null
  /** False until Firebase has said whether a session exists, so the screen never flashes "signed out". */
  authReady: boolean
  /** A recoverable sign-in startup or redirect error, shown beside the account action. */
  authError: string | null
  retryAuth: () => void
  /** Where cloud sync stands; meaningful only while signed in. */
  sync: SyncState
  /** Sends everything now and retries whatever failed. */
  syncNow: () => void
  /** The answer to "this device holds another account's data". */
  resolveSync: (choice: 'merge' | 'replace') => void
  /** Stops syncing, deletes this account's cloud copy, and (optionally) the account itself. */
  eraseCloud: (options: { deleteAccount: boolean }) => Promise<void>
  /** Re-reads the Firebase user after an action that upgrades it in place (see `refreshAuthUser`). */
  refreshAuthUser: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

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

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, initialState)
  const engineRef = useRef<SyncEngine | null>(null)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(!cloudAvailable)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authEpoch, setAuthEpoch] = useState(0)
  const [sync, setSync] = useState<SyncState>(initialSyncState)
  // Bumped to start the sync engine afresh, e.g. after a failed erase stopped it.
  const [engineEpoch, setEngineEpoch] = useState(0)

  /**
   * The newest state, *including actions dispatched a moment ago*.
   *
   * React applies a dispatch on its next render; code that runs in between — the
   * sync engine, which reads the state and writes back a change in the same
   * breath — would otherwise read a state that does not yet contain the change it
   * has just made, and take its own update for somebody else's edit. So the
   * reducer is also run here, eagerly, on every dispatch. It is pure, so the two
   * runs agree.
   */
  const stateRef = useRef(state)
  const dispatch = useCallback((action: Action) => {
    stateRef.current = reducer(stateRef.current, action)
    rawDispatch(action)
  }, [])

  // ── Load once ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    dbGet<unknown>(PERSIST_KEY).then((stored) => {
      if (cancelled) return

      // A schema bump migrates what is stored; it never discards it. Only a
      // snapshot too old (or too foreign) to read is refused, and that case
      // starts empty rather than half-loaded.
      const migrated = migratePersisted(stored)
      if (!migrated) {
        dispatch({ type: 'hydrate', payload: {} })
        return
      }

      const { state: data, notes } = migrated
      dispatch({
        type: 'hydrate',
        payload: {
          transactions: data.transactions ?? [],
          statements: data.statements ?? [],
          rules: data.rules ?? [],
          profile: { ...initialState.profile, ...data.profile },
          settings: { ...initialState.settings, ...data.settings },
          notices: notes,
        },
      })
    })
    return () => {
      cancelled = true
    }
  }, [dispatch])

  // Persist durable changes as soon as React commits them. Waiting for a debounce
  // let a quick Undo followed by reload restore the older, already-saved record:
  // browsers can abort IndexedDB work first started during pagehide.
  useEffect(() => {
    if (!state.hydrated) return
    void dbSet(PERSIST_KEY, toPersisted(state))
  }, [state.hydrated, state.transactions, state.statements, state.rules, state.profile, state.settings])

  // Best-effort lifecycle flush also covers a dispatch before its React effect.
  // Normal saves above do not depend on this callback completing during unload.
  useEffect(() => {
    const flush = () => {
      const current = stateRef.current
      if (!current.hydrated) return
      void dbSet(PERSIST_KEY, toPersisted(current))
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

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

    // Wait for the first recorded month before selecting a landing period.
    if (periods.length === 0) return
    defaultedPeriod.current = true

    // Calendar analysis opens on the newest recorded month, including manual
    // rent or salary. A one-month dataset still names its actual month.
    const landing = periods[0]
    dispatch({ type: 'setFilters', filters: { month: landing } })
  }, [state.hydrated, state.settings.periodGrouping, state.statements, state.transactions, state.filters.month, dispatch])

  // ── Who is signed in ────────────────────────────────────────────────────────
  // Waits for the local IndexedDB load to finish first, so nothing from the cloud
  // can land on `initialState` and be clobbered by the real local hydrate a
  // moment later.
  //
  // The whole Firebase SDK is dynamically imported rather than statically
  // at the top of the file: a static import would put it in the eagerly
  // loaded entry chunk for every visitor, including the far more common one
  // who never touches cloud sync (it once added ~140 kB gzipped to the first
  // load before this was changed to a dynamic import).
  useEffect(() => {
    if (!state.hydrated || !cloudAvailable) return
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    setAuthReady(false)
    setAuthError(null)

    import('../firebase/auth').then(async ({ onAuthChange, completeRedirectSignIn, authErrorMessage }) => {
      if (cancelled) return
      // Subscribe first: a redirect failure must not hide a valid saved
      // session or leave the account area loading forever.
      unsubscribe = onAuthChange((user) => {
        if (cancelled) return
        setAuthUser(user)
        setAuthReady(true)
      }, (error) => {
        if (cancelled) return
        setAuthError(authErrorMessage(error))
        setAuthReady(true)
      })
      try {
        await completeRedirectSignIn()
      } catch (error) {
        if (!cancelled) setAuthError(authErrorMessage(error))
      }
    }).catch(() => {
      if (cancelled) return
      setAuthError('Hesap servisi açılamadı. Bağlantını kontrol edip yeniden dene; kayıtların bu cihazda duruyor.')
      setAuthReady(true)
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [state.hydrated, authEpoch])

  // ── Cloud sync, while signed in ─────────────────────────────────────────────
  const uid = authUser?.uid ?? null
  useEffect(() => {
    if (!state.hydrated || !uid) {
      setSync(initialSyncState)
      return
    }

    let cancelled = false
    let engine: SyncEngine | null = null
    setSync(initialSyncState)

    void (async () => {
      const [{ SyncEngine: Engine }, { indexedDbStorage }] = await Promise.all([
        import('../sync/engine'),
        import('../sync/storage'),
      ])

      // The real cloud, or — in development only, and only when asked — one that
      // lives in the page, so the interface can be built with nothing reachable.
      const transport =
        import.meta.env.DEV && import.meta.env.VITE_SYNC_TRANSPORT === 'memory'
          ? (await import('../sync/devTransport')).devTransport()
          : (await import('../sync/firestoreTransport')).firestoreTransport
      if (cancelled) return

      engine = new Engine({
        uid,
        transport,
        storage: indexedDbStorage,
        getSnapshot: () => toSnapshot(stateRef.current),
        apply: (change) => dispatch({ type: 'remote', change }),
        replaceLocal: () => dispatch({ type: 'clearData' }),
        hasLocalData: () => stateRef.current.transactions.length > 0 || stateRef.current.statements.length > 0 || (stateRef.current.profile.cards?.length ?? 0) > 0 || (stateRef.current.profile.archivedCards?.length ?? 0) > 0,
        onState: setSync,
      })
      engineRef.current = engine
      await engine.start()
    })().catch((error: unknown) => {
      if (cancelled) return
      setSync({ ...initialSyncState, status: 'error', error: error instanceof Error ? error.message : 'Senkronizasyon başlatılamadı.' })
    })

    return () => {
      cancelled = true
      engine?.stop()
      if (engineRef.current === engine) engineRef.current = null
    }
  }, [state.hydrated, uid, dispatch, engineEpoch])

  // Whatever the engine syncs, it is told about the moment it changes.
  useEffect(() => {
    engineRef.current?.notify()
  }, [
    state.transactions, state.statements, state.rules, state.profile,
    state.settings.theme, state.settings.periodGrouping,
  ])

  /**
   * Linking a credential onto an already-signed-in anonymous user (register
   * or Google, from an anonymous session) does not fire `onAuthChange` — see
   * the comment on `getCurrentAuthUser` — so the caller (the account sheet)
   * calls this right after such an action resolves to pick up the
   * now-permanent account instead of still showing "anonymous".
   */
  const refreshAuthUser = useCallback(() => {
    import('../firebase/auth').then(({ getCurrentAuthUser }) => {
      setAuthUser(getCurrentAuthUser())
      setAuthError(null)
    })
  }, [])

  const retryAuth = useCallback(() => setAuthEpoch((n) => n + 1), [])

  const syncNow = useCallback(() => engineRef.current?.syncNow(), [])
  const resolveSync = useCallback((choice: 'merge' | 'replace') => engineRef.current?.resolve(choice), [])

  const eraseCloud = useCallback(
    async ({ deleteAccount }: { deleteAccount: boolean }) => {
      if (!uid) return
      // Stop first: a running engine would put back everything just deleted.
      engineRef.current?.stop()
      engineRef.current = null
      setSync(initialSyncState)

      try {
        const [{ wipeCloudData }, auth, storage] = await Promise.all([
          import('../sync/cloudAdmin'),
          import('../firebase/auth'),
          import('../sync/storage'),
        ])
        await wipeCloudData(uid)
        // The ledger described a cloud that no longer exists.
        await storage.indexedDbStorage.saveLedger(uid, {})

        if (deleteAccount) await auth.deleteCurrentAccount()
        else await auth.signOutSession()
      } catch (error) {
        // Still signed in, so sync must carry on: otherwise one dropped
        // connection would quietly end it until the next reload. Whatever the
        // wipe did get through is simply sent again.
        setEngineEpoch((n) => n + 1)
        throw error
      }
    },
    [uid],
  )

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

    // Instalment plans advance one step per statement whichever way the periods
    // are grouped, so the billed month is always the statement's.
    const statementMonths = buildStatementMonthIndex(state.statements)
    const billedKey = [...statementMonths].sort().map(([id, m]) => `${id}:${m}`).join(',')
    const billed = (tx: Transaction) => billedMonthOf(tx, statementMonths)

    if (grouping !== 'statement') {
      return {
        coverageDaysOf: (month) => coverage.get(month),
        billedMonthOf: billed,
        key: `calendar|${coverageKey}|${billedKey}`,
      }
    }

    const namedMonths = new Set(statementMonths.values())
    return {
      monthOfTx: (tx) => periodMonthOf(tx, 'statement', statementMonths),
      // A month no statement is named after exists only because of manual
      // entries, so its picture of the month is incomplete by definition.
      isPartialMonth: (month) => !namedMonths.has(month),
      coverageDaysOf: (month) => coverage.get(month),
      billedMonthOf: billed,
      key: `statement|${coverageKey}|${billedKey}`,
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
    () => ({
      state, dispatch, visible, analysis, overall, cloudAvailable, authUser, authReady, authError, retryAuth, sync,
      syncNow, resolveSync, eraseCloud, refreshAuthUser,
    }),
    [state, dispatch, visible, analysis, overall, authUser, authReady, authError, retryAuth, sync, syncNow, resolveSync, eraseCloud, refreshAuthUser],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <AppStoreProvider>')
  return value
}
