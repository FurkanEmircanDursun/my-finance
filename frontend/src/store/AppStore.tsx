import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode,
} from 'react'
import { dbFinancialGenerationIsCurrent, dbReadFinancialState, dbResetFinancialState, dbWriteFinancialValue, DeviceDataChangedError } from './db'
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
import { hasFinancialData } from '../sync/model'
import { leaveSession } from './sessionBoundary'
import { announceDeviceDataChange, watchDeviceDataChange } from './deviceDataSignal'
import { UserFacingError } from '../core/errors'
import { firebaseErrorMessage } from '../firebase/errors'

const PERSIST_KEY = 'state'
const DEVICE_SAVE_ERROR = 'Son değişiklikler bu cihazda kaydedilemedi. Kayıtların bu oturumda duruyor; JSON yedeği alıp yeniden dene.'

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
  logout: (options?: { clearLocal?: boolean }) => Promise<void>
  clearLocalData: (options?: { clearLock?: boolean }) => Promise<void>
  sessionBusy: boolean
  sessionError: string | null
  /** Remount financial drafts and Undo when their account/data identity changes. */
  dataEpoch: number
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
  const authUserRef = useRef<AuthUser | null>(null)
  const sessionEpoch = useRef(0)
  const sessionPaused = useRef(false)
  const operationRunning = useRef(false)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [sessionOperationError, setSessionError] = useState<string | null>(null)
  const [deviceSaveError, setDeviceSaveError] = useState<string | null>(null)
  const sessionError = [sessionOperationError, deviceSaveError].filter(Boolean).join(' ') || null
  const persistAttempt = useRef(0)
  const [dataEpoch, setDataEpoch] = useState(0)

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
    if (action.type === 'clearData' || action.type === 'reset' || (action.type === 'restore' && action.mode === 'replace')) setDataEpoch(n => n + 1)
    stateRef.current = reducer(stateRef.current, action)
    rawDispatch(action)
  }, [])

  // ── Load once ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    dbReadFinancialState<unknown>().then((stored) => {
      if (cancelled) return

      // A schema bump migrates what is stored; it never discards it. Only a
      // snapshot too old (or too foreign) to read is refused. It remains on
      // disk; an empty replacement must never overwrite unreadable records.
      const migrated = migratePersisted(stored)
      if (!migrated) {
        if (stored !== undefined && stored !== null) {
          setSessionError('Cihaz kayıtları bu sürümde okunamıyor. Verilerin korunuyor; güncel sürümle yeniden dene.')
          return
        }
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
    }).catch(() => {
      if (!cancelled) setSessionError('Cihaz kayıtları okunamadı. Diğer Mizan sekmelerini kapatıp yeniden yükle. Verilerin üzerine yazılmadı.')
    })
    return () => {
      cancelled = true
    }
  }, [dispatch])

  // Persist durable changes as soon as React commits them. Waiting for a debounce
  // let a quick Undo followed by reload restore the older, already-saved record:
  // browsers can abort IndexedDB work first started during pagehide.
  const persistSnapshot = useCallback((snapshot: AppState) => {
    const attempt = ++persistAttempt.current
    void dbWriteFinancialValue(PERSIST_KEY, toPersisted(snapshot)).then(saved => {
      if (attempt === persistAttempt.current) setDeviceSaveError(saved ? null : DEVICE_SAVE_ERROR)
    }).catch(error => {
      if (error instanceof DeviceDataChangedError) announceDeviceDataChange()
      else if (attempt === persistAttempt.current) setDeviceSaveError(DEVICE_SAVE_ERROR)
    })
  }, [])
  useEffect(() => {
    if (!state.hydrated || sessionPaused.current) return
    persistSnapshot(state)
  }, [state.hydrated, state.transactions, state.statements, state.rules, state.profile, state.settings])

  // Best-effort lifecycle flush also covers a dispatch before its React effect.
  // Normal saves above do not depend on this callback completing during unload.
  useEffect(() => {
    const flush = () => {
      const current = stateRef.current
      if (!current.hydrated || sessionPaused.current) return
      persistSnapshot(current)
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

  // Other tabs share the durable copy, but not React memory or Undo callbacks.
  // The generation guard blocks stale writes even before this signal arrives.
  useEffect(() => {
    let checking = false
    let disposed = false
    const unwatch = watchDeviceDataChange(() => {
      if (checking || disposed || operationRunning.current || !stateRef.current.hydrated) return
      checking = true
      void (async () => {
        if ((await dbFinancialGenerationIsCurrent() && !sessionPaused.current) || disposed) return
        operationRunning.current = true
        sessionPaused.current = true
        sessionEpoch.current++
        setSessionBusy(true)
        const engine = engineRef.current
        engineRef.current = null
        setSync(initialSyncState)
        let refreshed = false
        try {
          await engine?.stopAndDrain()
          if (cloudAvailable) {
            const auth = await import('../firebase/auth')
            const current = auth.getCurrentAuthUser()
            await auth.signOutSession(current?.uid)
            await (await import('../firebase/db')).clearFirebaseDeviceCache()
          }
          const stored = await dbReadFinancialState<unknown>()
          const migrated = migratePersisted(stored)
          if (stored !== undefined && stored !== null && !migrated) throw new UserFacingError('Cihaz kayıtları bu sürümde okunamıyor. Verilerin korunuyor; güncel sürümle yeniden dene.')
          const data = migrated?.state
          dispatch({ type: 'hydrate', payload: {
            ...stateRef.current, transactions: data?.transactions ?? [], statements: data?.statements ?? [], rules: data?.rules ?? [],
            profile: { ...initialState.profile, ...data?.profile }, settings: { ...initialState.settings, ...data?.settings },
            filters: initialState.filters, lastImport: [], notices: migrated?.notes ?? [],
          } })
          setDataEpoch(n => n + 1)
          setSessionError(null)
          refreshed = true
        } catch (error) {
          // The durable generation already changed. Never expose the previous
          // account's rows again even if SDK cache cleanup needs a retry.
          dispatch({ type: 'clearData' })
          setSessionError(firebaseErrorMessage(error, 'session'))
        } finally {
          operationRunning.current = false
          sessionPaused.current = !refreshed
          // Keep a failed stale tab inert until focus/reload retries. Reopening
          // its engine here could fetch the old account back into a cleared UI.
          setSessionBusy(!refreshed)
          if (refreshed) setEngineEpoch(n => n + 1)
        }
      })().catch(() => {
        if (!disposed) setSessionError('Cihaz verileri kontrol edilemedi. Sayfayı yenileyip yeniden dene; kayıtların üzerine yazılmadı.')
      }).finally(() => { checking = false })
    })
    return () => { disposed = true; unwatch() }
  }, [dispatch])

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
        if (authUserRef.current?.uid !== user?.uid) {
          if (authUserRef.current) setDataEpoch(n => n + 1)
          sessionEpoch.current++
          engineRef.current?.stop()
          engineRef.current = null
          setSync(initialSyncState)
        }
        authUserRef.current = user
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
    if (!state.hydrated || !uid || sessionPaused.current) {
      setSync(initialSyncState)
      return
    }

    let cancelled = false
    const generation = sessionEpoch.current
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
      if (cancelled || generation !== sessionEpoch.current || sessionPaused.current) return

      engine = new Engine({
        uid,
        transport,
        storage: indexedDbStorage,
        getSnapshot: () => toSnapshot(stateRef.current),
        apply: (change) => { if (!cancelled && generation === sessionEpoch.current && !sessionPaused.current) dispatch({ type: 'remote', change }) },
        replaceLocal: () => { if (!cancelled && generation === sessionEpoch.current && !sessionPaused.current) dispatch({ type: 'clearData' }) },
        hasLocalData: () => hasFinancialData(toSnapshot(stateRef.current)),
        onState: (next) => { if (!cancelled && generation === sessionEpoch.current && !sessionPaused.current) setSync(next) },
      })
      engineRef.current = engine
      await engine.start()
    })().catch((error: unknown) => {
      if (cancelled || generation !== sessionEpoch.current || sessionPaused.current) return
      setSync({ ...initialSyncState, status: 'error', error: firebaseErrorMessage(error, 'sync') })
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
      const user = getCurrentAuthUser()
      if (authUserRef.current?.uid !== user?.uid) {
        if (authUserRef.current) setDataEpoch(n => n + 1)
        sessionEpoch.current++
        engineRef.current?.stop()
        engineRef.current = null
      }
      authUserRef.current = user
      setAuthUser(user)
      setAuthError(null)
    })
  }, [])

  const retryAuth = useCallback(() => setAuthEpoch((n) => n + 1), [])

  const leaveAccount = useCallback(async (clearLocal: boolean, clearLock = false) => {
    if (operationRunning.current) throw new UserFacingError('Bir hesap işlemi devam ediyor. Tamamlanmasını bekle.')
    operationRunning.current = true
    setSessionBusy(true)
    setSessionError(null)
    try {
      const auth = cloudAvailable ? await import('../firebase/auth') : null
      const expectedUid = auth?.getCurrentAuthUser()?.uid ?? null
      await leaveSession({
        suspend: async (checkpoint) => {
          sessionPaused.current = true
          sessionEpoch.current++
          const engine = engineRef.current
          engineRef.current = null
          setSync(initialSyncState)
          engine?.stop()
          if (checkpoint && !await dbWriteFinancialValue(PERSIST_KEY, toPersisted(stateRef.current))) {
            throw new UserFacingError('Cihaz kayıtları saklanamadı. Çıkış yapılmadı; yeniden dene veya önce yedek al.')
          }
          await engine?.stopAndDrain(checkpoint)
        },
        signOut: async () => {
          if (expectedUid) await auth!.signOutSession(expectedUid)
          else if (auth?.getCurrentAuthUser()) throw new UserFacingError('Hesap değişti. Lütfen işlemi yeniden başlat.')
          else await auth?.signOutSession()
          await (await import('../platform/sharedPdf')).discardSharedPdfs()
        },
        clearDevice: async () => {
          if (cloudAvailable) await (await import('../firebase/db')).clearFirebaseDeviceCache()
          const cleared = reducer(stateRef.current, { type: 'reset' })
          if (clearLock) cleared.settings = { ...cleared.settings, lockPinHash: null, lockPinSalt: null }
          // The old account ledger must disappear in the SAME durable commit
          // as its local rows, otherwise the next login would upload deletions.
          await dbResetFinancialState(toPersisted(cleared))
          dispatch({ type: 'hydrate', payload: cleared })
          announceDeviceDataChange()
        },
        resume: () => {
          sessionPaused.current = false
          setEngineEpoch(n => n + 1)
        },
      }, clearLocal)
    } catch (error) {
      setSessionError(firebaseErrorMessage(error, 'session'))
      if (error instanceof DeviceDataChangedError) announceDeviceDataChange()
      throw error
    } finally {
      operationRunning.current = false
      setSessionBusy(false)
    }
  }, [dispatch])
  const logout = useCallback((options: { clearLocal?: boolean } = {}) => leaveAccount(options.clearLocal === true), [leaveAccount])
  const clearLocalData = useCallback((options: { clearLock?: boolean } = {}) => leaveAccount(true, options.clearLock === true), [leaveAccount])

  const syncNow = useCallback(() => engineRef.current?.syncNow(), [])
  const resolveSync = useCallback((choice: 'merge' | 'replace') => engineRef.current?.resolve(choice), [])

  const eraseCloud = useCallback(
    async ({ deleteAccount }: { deleteAccount: boolean }) => {
      if (!uid) throw new UserFacingError('Hesap işlemi için önce giriş yap.')
      if (operationRunning.current) throw new UserFacingError('Bir hesap işlemi devam ediyor. Tamamlanmasını bekle.')
      operationRunning.current = true
      setSessionBusy(true)
      setSessionError(null)
      sessionPaused.current = true
      sessionEpoch.current++
      // Stop first: a running engine would put back everything just deleted.
      const engine = engineRef.current
      engine?.stop()
      engineRef.current = null
      setSync(initialSyncState)

      try {
        await engine?.stopAndDrain()
        const [{ wipeCloudData }, auth, storage] = await Promise.all([
          import('../sync/cloudAdmin'),
          import('../firebase/auth'),
          import('../sync/storage'),
        ])
        if (auth.getCurrentAuthUser()?.uid !== uid) throw new UserFacingError('Hesap değişti. Lütfen işlemi yeniden başlat.')
        await (await import('../platform/sharedPdf')).discardSharedPdfs()
        await wipeCloudData(uid)
        // The ledger described a cloud that no longer exists.
        await storage.indexedDbStorage.saveLedger(uid, {})

        if (deleteAccount) await auth.deleteCurrentAccount(uid)
        else await auth.signOutSession(uid)
      } catch (error) {
        // Still signed in, so sync must carry on: otherwise one dropped
        // connection would quietly end it until the next reload. Whatever the
        // wipe did get through is simply sent again.
        setSessionError(firebaseErrorMessage(error, 'session'))
        throw error
      } finally {
        sessionPaused.current = false
        operationRunning.current = false
        setSessionBusy(false)
        setEngineEpoch((n) => n + 1)
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
      syncNow, resolveSync, eraseCloud, refreshAuthUser, logout, clearLocalData, sessionBusy, sessionError, dataEpoch,
    }),
    [state, dispatch, visible, analysis, overall, authUser, authReady, authError, retryAuth, sync, syncNow, resolveSync, eraseCloud, refreshAuthUser, logout, clearLocalData, sessionBusy, sessionError, dataEpoch],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <AppStoreProvider>')
  return value
}
