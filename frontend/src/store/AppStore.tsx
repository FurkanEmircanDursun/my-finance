import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode,
} from 'react'
import { dbClaimLegacyState, dbReadFinancialState, dbReadFinancialValue, dbResetFinancialState, DeviceDataChangedError } from './db'
import { initialState, reducer, toSnapshot, type Action, type AppState } from './state'
import { migratePersisted } from './migrate'
import { prepareLegacyState } from './legacyCloudMigration'
import {
  applyFilters, availableMonths, availableStatementMonths, billedMonthOf,
  buildStatementMonthIndex, coverageDaysByMonth, periodMonthOf,
} from './selectors'
import { analyzeMemo, type AnalysisContext } from '../analytics/engine'
import { cloudAvailable } from '../firebase/available'
import type { AuthUser } from '../firebase/auth'
import type { SyncEngine } from '../sync/engine'
import type { Ledger } from '../sync/model'
import { initialSyncState, type SyncState } from '../sync/status'
import type { Analysis } from '../analytics/types'
import type { Transaction } from '../domain/types'
import { UserFacingError } from '../core/errors'
import { verifyPin } from '../core/pin'
import { firebaseErrorMessage } from '../firebase/errors'
import { clearReminderSession } from '../platform/reminders'
import { discardSharedPdfs } from '../platform/sharedPdf'
import { disconnectCloudPush } from '../platform/push'
import { setAnalyticsConsent } from '../platform/analytics'
import { setDiagnosticsConsent } from '../platform/diagnostics'
import { clearMerchantCache } from '../core/text'
import { isAndroid } from '../platform'
import type { createScopedFirestoreTransport } from '../sync/firestoreTransport'

export type { SyncState, SyncStatus } from '../sync/status'

interface StoreValue {
  state: AppState
  getCurrentState: () => AppState
  dispatch: (action: Action) => void
  visible: Transaction[]
  analysis: Analysis
  overall: Analysis
  cloudAvailable: boolean
  authUser: AuthUser | null
  authReady: boolean
  authError: string | null
  retryAuth: () => void
  sync: SyncState
  syncNow: () => void
  legacyMigration: { pinRequired: boolean } | null
  migrateLegacy: (choice: 'import' | 'later', pin?: string) => Promise<void>
  eraseCloud: (options: { deleteAccount: boolean }) => Promise<void>
  logout: () => Promise<void>
  sessionBusy: boolean
  sessionError: string | null
  dataEpoch: number
  loadedPeriods: ReadonlySet<string>
  historyReady: boolean
  requestPeriod: (period: string) => void
  ensureHistory: () => Promise<AppState>
  refreshAuthUser: () => void
}

const StoreContext = createContext<StoreValue | null>(null)
const pendingError = 'Buluta kaydedilmeyi bekleyen deÄŸiÅŸikliklerin var. BaÄŸlantÄ±n geldiÄŸinde eÅŸitleyip tekrar dene.'

async function clearAccountSession(cleanPush = true) {
  const { clearFirebaseDeviceCache } = await import('../firebase/db')
  await Promise.all([
    setAnalyticsConsent(false), setDiagnosticsConsent(false),
    discardSharedPdfs(), clearReminderSession(),
    cleanPush ? disconnectCloudPush() : undefined,
    clearFirebaseDeviceCache(),
  ])
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  const engineRef = useRef<SyncEngine | null>(null)
  const scopeRef = useRef<ReturnType<typeof createScopedFirestoreTransport> | null>(null)
  const fullHistory = useRef(false)
  const historyWaiters = useRef(new Set<(error?: Error) => void>())
  const authUserRef = useRef<AuthUser | null>(null)
  const sessionEpoch = useRef(0)
  const cleanupPending = useRef<Promise<void> | null>(null)
  const operationRunning = useRef(false)
  const skipMigrationFor = useRef<string | null>(null)
  const allowMigrationFor = useRef<string | null>(null)
  const defaultedPeriod = useRef(false)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(!cloudAvailable)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authEpoch, setAuthEpoch] = useState(0)
  const [engineEpoch, setEngineEpoch] = useState(0)
  const [sync, setSync] = useState<SyncState>(initialSyncState)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [legacyMigration, setLegacyMigration] = useState<StoreValue['legacyMigration']>(null)
  const [dataEpoch, setDataEpoch] = useState(0)
  const [loadedPeriods, setLoadedPeriods] = useState<ReadonlySet<string>>(() => new Set())
  const [historyReady, setHistoryReady] = useState(false)

  const requestPeriod = useCallback((period: string) => scopeRef.current?.requestPeriod(period), [])
  const ensureHistory = useCallback(() => {
    if (fullHistory.current) return Promise.resolve(stateRef.current)
    if (!scopeRef.current || !navigator.onLine) return Promise.reject(new UserFacingError('Ekstre geçmişini kontrol etmek için internet bağlantısı gerekiyor.'))
    return new Promise<AppState>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout)
        historyWaiters.current.delete(finish)
        if (error) reject(error)
        else resolve(stateRef.current)
      }
      const timeout = setTimeout(() => finish(new UserFacingError('Ekstre geçmişi yüklenemedi. Bağlantıyı kontrol edip yeniden dene.')), 15_000)
      historyWaiters.current.add(finish)
      requestPeriod('all')
      engineRef.current?.syncNow()
    })
  }, [requestPeriod])

  const apply = useCallback((action: Action) => {
    stateRef.current = reducer(stateRef.current, action)
    rawDispatch(action)
  }, [])

  const renderedEpoch = sessionEpoch.current
  const dispatch = useCallback((action: Action) => {
    if (renderedEpoch !== sessionEpoch.current || !stateRef.current.hydrated || !authUserRef.current || operationRunning.current) return
    if (action.type === 'setFilters' && action.filters.month !== undefined) defaultedPeriod.current = true
    if (action.type === 'clearData' || action.type === 'reset' || (action.type === 'restore' && action.mode === 'replace')) {
      setDataEpoch(n => n + 1)
    }
    const previous = stateRef.current
    apply(action)
    const next = stateRef.current
    if (next.transactions !== previous.transactions || next.statements !== previous.statements ||
        next.rules !== previous.rules || next.profile !== previous.profile || next.settings !== previous.settings) {
      engineRef.current?.notify()
    }
  }, [apply, renderedEpoch])

  const acceptAuthUser = useCallback((next: AuthUser | null) => {
    const previous = authUserRef.current
    const changed = previous?.uid !== next?.uid
    const android = isAndroid()
    if (changed) {
      clearMerchantCache()
      sessionEpoch.current++
      engineRef.current?.stop()
      engineRef.current = null
      defaultedPeriod.current = false
      skipMigrationFor.current = null
      allowMigrationFor.current = null
      apply({ type: 'resetSession' })
      setDataEpoch(n => n + 1)
      setSync(initialSyncState)
      setLegacyMigration(null)
      setSessionError(null)
    }
    if ((changed && (previous || android)) || (android && !next && !cleanupPending.current)) {
      // Explicit sign-out already attempted to unregister the signed-in installation.
      const cleanPush = !operationRunning.current
      const pending = (cleanupPending.current ?? Promise.resolve()).catch(() => {}).then(async () => {
        if (changed && previous) await clearAccountSession(cleanPush)
        if (android) {
          const { prepareFirebaseDeviceCache } = await import('../firebase/db')
          await prepareFirebaseDeviceCache(next?.uid ?? null)
        }
      })
      cleanupPending.current = pending
      void pending.then(() => {
        if (cleanupPending.current === pending) cleanupPending.current = null
      }, (error: unknown) => {
        if (cleanupPending.current === pending) setSessionError(firebaseErrorMessage(error, 'session'))
      })
    }
    authUserRef.current = next
    setAuthUser(next)
    setAuthReady(true)
  }, [apply])

  useEffect(() => {
    if (!cloudAvailable) return
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    setAuthReady(false)
    setAuthError(null)
    void import('../firebase/auth').then(async ({ onAuthChange, completeRedirectSignIn, authErrorMessage }) => {
      if (cancelled) return
      unsubscribe = onAuthChange(user => {
        if (!cancelled) acceptAuthUser(user)
      }, error => {
        if (cancelled) return
        acceptAuthUser(null)
        setAuthError(authErrorMessage(error))
      })
      try {
        await completeRedirectSignIn()
      } catch (error) {
        if (!cancelled) setAuthError(authErrorMessage(error))
      }
    }).catch(() => {
      if (cancelled) return
      acceptAuthUser(null)
      setAuthError('Hesap servisi aÃ§Ä±lamadÄ±. BaÄŸlantÄ±nÄ± kontrol edip yeniden dene.')
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [acceptAuthUser, authEpoch])

  const uid = authUser?.uid ?? null
  useEffect(() => {
    if (!uid || operationRunning.current) return
    const generation = sessionEpoch.current
    let cancelled = false
    let retiring = false
    let engine: SyncEngine | null = null
    let startupTimer: ReturnType<typeof setTimeout> | undefined
    const current = () => !cancelled && sessionEpoch.current === generation && !operationRunning.current
    setSync(initialSyncState)
    setLoadedPeriods(new Set())
    setHistoryReady(false)
    apply({ type: 'resetSession' })

    void (async () => {
      await cleanupPending.current
      if (!current()) return
      const stored = skipMigrationFor.current === uid ? undefined : await dbReadFinancialState<unknown>()
      if (!current()) return
      const owner = stored == null ? null : await dbReadFinancialValue<string>('sync:owner')
      if (!current()) return
      const migrated = stored == null || (owner && owner !== uid) ? null : migratePersisted(stored)
      if (stored != null && (!owner || owner === uid) && !migrated) {
        throw new UserFacingError('Eski cihaz kayÄ±tlarÄ± bu sÃ¼rÃ¼mde okunamÄ±yor. KayÄ±tlarÄ±n korunuyor.')
      }
      if (migrated && allowMigrationFor.current !== uid) {
        const { lockPinHash, lockPinSalt } = migrated.state.settings ?? {}
        const pinRequired = Boolean(lockPinHash && lockPinSalt)
        if (!owner || pinRequired) {
          setLegacyMigration({ pinRequired })
          return
        }
      }
      const ledger = migrated ? await dbReadFinancialValue<Ledger>(`sync:ledger:${uid}`) : undefined

      const [{ SyncEngine: Engine }, { memoryStorage }] = await Promise.all([
        import('../sync/engine'), import('../sync/storage'),
      ])
      const transport = import.meta.env.DEV && import.meta.env.VITE_SYNC_TRANSPORT === 'memory'
        ? (await import('../sync/devTransport')).devTransport()
        : await import('../sync/firestoreTransport').then(({ firestoreTransport, createScopedFirestoreTransport }) =>
          migrated ? firestoreTransport : createScopedFirestoreTransport())
      if (!current()) return
      if ('requestPeriod' in transport) scopeRef.current = transport as ReturnType<typeof createScopedFirestoreTransport>

      engine = new Engine({
        uid,
        transport,
        storage: memoryStorage({ owner: uid, ledgers: { [uid]: ledger ?? {} } }),
        debounceMs: 0,
        getSnapshot: () => toSnapshot(stateRef.current),
        apply: change => { if (current()) apply({ type: 'remote', change }) },
        replaceLocal: () => { if (current()) apply({ type: 'clearData' }) },
        hasLocalData: () => true,
        onAccessDenied: error => {
          if (!current()) return
          acceptAuthUser(null)
          setAuthError(firebaseErrorMessage(error, 'session'))
          void import('../firebase/auth').then(auth => {
            if (auth.getCurrentAuthUser()?.uid === uid) return auth.signOutSession(uid)
          }).catch(() => {})
        },
        prepareInitial: migrated ? (snapshot, baseline) => {
          const seed = prepareLegacyState(migrated, baseline, snapshot.docs)
          // Keep the route behind the sync gate until Firestore confirms the upload.
          apply({ type: 'resetSession' })
          apply({ type: 'seedSession', payload: seed.state })
          return seed.pendingDeletions
        } : undefined,
        onSnapshotApplied: snapshot => {
          if (!current() || snapshot.fromCache) return
          if (snapshot.full || snapshot.periods?.includes('all')) {
            if (!fullHistory.current) {
              fullHistory.current = true
              setHistoryReady(true)
              for (const finish of historyWaiters.current) finish()
            }
          } else if (snapshot.periods?.length) {
            const periods = snapshot.periods
            setLoadedPeriods(previous => new Set([...previous, ...periods]))
            if (!stateRef.current.hydrated && stateRef.current.filters.month === 'all') {
              const month = availableMonths(stateRef.current.transactions).find(value => periods.includes(value)) ?? periods[0]
              defaultedPeriod.current = true
              apply({ type: 'setFilters', filters: { month } })
            }
          }
        },
        onState: next => {
          if (!current()) return
          setSync(next)
          if (next.status === 'offline' || next.status === 'error') {
            for (const finish of historyWaiters.current) finish(new UserFacingError('Ekstre geçmişi yüklenemedi. Bağlantıyı kontrol edip yeniden dene.'))
          }
          if (next.status !== 'synced' || next.lastSyncedAt === null || stateRef.current.hydrated || retiring) return
          clearTimeout(startupTimer)
          if (!migrated) {
            apply({ type: 'hydrate', payload: {} })
            return
          }
          retiring = true
          void dbResetFinancialState().catch((error: unknown) => {
            if (!(error instanceof DeviceDataChangedError)) throw error
            // A concurrent tab may already have retired the same snapshot.
            return dbReadFinancialState<unknown>().then(state => {
              if (state != null) throw error
            })
          }).then(() => {
            if (current()) apply({ type: 'hydrate', payload: {} })
          }).catch(error => {
            if (current()) setSessionError(firebaseErrorMessage(error, 'session'))
          })
        },
      })
      engineRef.current = engine
      startupTimer = setTimeout(() => {
        if (!current() || stateRef.current.hydrated) return
        setSync(previous => previous.status === 'connecting'
          ? { ...previous, status: 'error', error: 'Kayıtlar beklenenden uzun sürede yükleniyor. Bağlantını kontrol et veya yeniden dene.' }
          : previous)
      }, 15_000)
      await engine.start()
    })().catch(error => {
      if (current()) setSync({ ...initialSyncState, status: 'error', error: firebaseErrorMessage(error, 'sync') })
    })

    return () => {
      cancelled = true
      scopeRef.current = null
      fullHistory.current = false
      for (const finish of historyWaiters.current) finish(new UserFacingError('Oturum değişti. İşlemi yeniden başlat.'))
      clearTimeout(startupTimer)
      engine?.stop()
      if (engineRef.current === engine) engineRef.current = null
    }
  }, [uid, engineEpoch, apply, acceptAuthUser])

  useEffect(() => {
    if (!state.hydrated || defaultedPeriod.current || state.filters.month !== 'all') return
    const periods = state.settings.periodGrouping === 'statement'
      ? availableStatementMonths(state.statements)
      : availableMonths(state.transactions)
    if (!periods.length) return
    defaultedPeriod.current = true
    dispatch({ type: 'setFilters', filters: { month: periods[0] } })
  }, [state.hydrated, state.settings.periodGrouping, state.statements, state.transactions, state.filters.month, dispatch])

  useEffect(() => {
    const warnIfPending = (event: BeforeUnloadEvent) => {
      if (!engineRef.current?.hasUnsavedChanges()) return
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', warnIfPending)
    return () => window.removeEventListener('beforeunload', warnIfPending)
  }, [])

  const refreshAuthUser = useCallback(() => {
    void import('../firebase/auth').then(({ getCurrentAuthUser }) => {
      acceptAuthUser(getCurrentAuthUser())
      setAuthError(null)
    })
  }, [acceptAuthUser])
  const retryAuth = useCallback(() => setAuthEpoch(n => n + 1), [])
  const syncNow = useCallback(() => {
    if (engineRef.current && (stateRef.current.hydrated || !sessionError)) {
      engineRef.current.syncNow()
      return
    }
    if (!stateRef.current.hydrated) {
      if (cleanupPending.current) {
        const pending = cleanupPending.current.catch(async () => {
          await clearAccountSession()
          const { prepareFirebaseDeviceCache } = await import('../firebase/db')
          await prepareFirebaseDeviceCache(authUserRef.current?.uid ?? null)
        })
        cleanupPending.current = pending
        void pending.then(() => {
          if (cleanupPending.current === pending) cleanupPending.current = null
        }, () => {})
      }
      setSessionError(null)
      setEngineEpoch(n => n + 1)
    }
  }, [sessionError])

  const migrateLegacy = useCallback(async (choice: 'import' | 'later', pin?: string) => {
    if (!uid || authUserRef.current?.uid !== uid || !legacyMigration) return
    const generation = sessionEpoch.current
    if (choice === 'import') {
      if (legacyMigration.pinRequired) {
        const stored = migratePersisted(await dbReadFinancialState<unknown>())?.state.settings
        if (!stored?.lockPinHash || !stored.lockPinSalt || !pin || !await verifyPin(pin, stored.lockPinSalt, stored.lockPinHash)) {
          throw new UserFacingError('Eski uygulama PINâ€™i yanlÄ±ÅŸ.')
        }
      }
      if (generation !== sessionEpoch.current || !await dbClaimLegacyState(uid)) {
        throw new UserFacingError('Cihaz kayÄ±tlarÄ±nÄ±n hesabÄ± deÄŸiÅŸti. Yeniden yÃ¼kleyip tekrar dene.')
      }
      allowMigrationFor.current = uid
    } else skipMigrationFor.current = uid
    if (generation !== sessionEpoch.current) return
    setLegacyMigration(null)
    setEngineEpoch(n => n + 1)
  }, [uid, legacyMigration])

  const exit = useCallback(async (action: 'logout' | 'erase' | 'delete') => {
    const uid = authUserRef.current?.uid
    if (!uid || operationRunning.current) return
    if (engineRef.current?.hasUnsavedChanges()) {
      engineRef.current.syncNow()
      const error = new UserFacingError(pendingError)
      setSessionError(error.message)
      throw error
    }
    operationRunning.current = true
    setSessionBusy(true)
    setSessionError(null)
    const engine = engineRef.current
    engineRef.current = null
    engine?.stop()
    const generation = ++sessionEpoch.current
    try {
      const auth = await import('../firebase/auth')
      if (generation !== sessionEpoch.current || auth.getCurrentAuthUser()?.uid !== uid) {
        throw new UserFacingError('Hesap deÄŸiÅŸti. LÃ¼tfen iÅŸlemi yeniden baÅŸlat.')
      }
      if (action !== 'logout') {
        const { wipeCloudData } = await import('../sync/cloudAdmin')
        await wipeCloudData(uid)
      }
      if (action === 'delete') await auth.deleteCurrentAccount(uid)
      else await auth.signOutSession(uid)
      acceptAuthUser(auth.getCurrentAuthUser())
      await cleanupPending.current
    } catch (error) {
      setSessionError(firebaseErrorMessage(error, 'session'))
      throw error
    } finally {
      operationRunning.current = false
      setSessionBusy(false)
      setEngineEpoch(n => n + 1)
    }
  }, [acceptAuthUser])

  const logout = useCallback(() => exit('logout'), [exit])
  const eraseCloud = useCallback(({ deleteAccount }: { deleteAccount: boolean }) => exit(deleteAccount ? 'delete' : 'erase'), [exit])


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
    () => historyReady ? analyzeMemo(state.transactions, state.profile, analysisContext) : analysis,
    [historyReady, analysis, state.transactions, state.profile, analysisContext],
  )

  const getCurrentState = useCallback(() => stateRef.current, [])
  const value = useMemo<StoreValue>(
    () => ({
      state, getCurrentState, dispatch, visible, analysis, overall, cloudAvailable, authUser, authReady, authError, retryAuth, sync,
      syncNow, legacyMigration, migrateLegacy, eraseCloud, refreshAuthUser, logout, sessionBusy, sessionError, dataEpoch,
      loadedPeriods, historyReady, requestPeriod, ensureHistory,
    }),
    [state, getCurrentState, dispatch, visible, analysis, overall, authUser, authReady, authError, retryAuth, sync, syncNow, legacyMigration, migrateLegacy, eraseCloud, refreshAuthUser, logout, sessionBusy, sessionError, dataEpoch, loadedPeriods, historyReady, requestPeriod, ensureHistory],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <AppStoreProvider>')
  return value
}
