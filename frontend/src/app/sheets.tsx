import {
  createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react'
import { ImportSheet } from './ImportSheet'
import { SyncGate } from './SyncDecision'
import { useStore } from '../store/AppStore'
import { categoryLabel, type CategoryId } from '../domain/categories'

/**
 * Everything that is not one of the three tabs is a sheet, and every sheet in
 * the app is opened through here.
 *
 * Views ask for a destination ("show me this category's rows") instead of
 * carrying their own modal state and their own copy of the list-building logic.
 * That is what lets a category row, a merchant row, a subscription and an
 * insight all lead to the same place without any of them knowing about it.
 *
 * Every sheet except the importer is lazily loaded and only mounted once it has
 * been opened. Hesap ve senkron is the one that matters: it is the module that
 * pulls in Firebase's auth code, and importing it eagerly would put a large
 * chunk of cloud code in front of the first paint for everyone, including the
 * majority who never sign in.
 */

const SettingsSheet = lazy(() => import('./SettingsSheet').then((m) => ({ default: m.SettingsSheet })))
const AccountSheet = lazy(() => import('./AccountSheet').then((m) => ({ default: m.AccountSheet })))
const IncomeSheet = lazy(() => import('./IncomeSheet').then((m) => ({ default: m.IncomeSheet })))
const ArchiveSheet = lazy(() => import('./ArchiveSheet').then((m) => ({ default: m.ArchiveSheet })))
const BudgetSheet = lazy(() => import('./BudgetSheet').then((m) => ({ default: m.BudgetSheet })))
const TransactionsSheet = lazy(() =>
  import('../views/TransactionsSheet').then((m) => ({ default: m.TransactionsSheet })),
)

export interface TransactionQuery {
  category?: CategoryId
  merchant?: string
  title?: string
  /** Read the whole account rather than the selected period. */
  overall?: boolean
}

interface SheetApi {
  openImport: () => void
  openSettings: () => void
  openAccount: () => void
  openIncome: () => void
  openBudgets: () => void
  openArchive: () => void
  openTransactions: (query?: TransactionQuery) => void
}

const SheetContext = createContext<SheetApi | null>(null)

export function useSheets(): SheetApi {
  const value = useContext(SheetContext)
  if (!value) throw new Error('useSheets must be used inside <SheetProvider>')
  return value
}

export function SheetProvider({ children }: { children: ReactNode }) {
  const { state, visible } = useStore()
  const [importOpen, setImportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [budgetsOpen, setBudgetsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [txQuery, setTxQuery] = useState<TransactionQuery | null>(null)

  const openImport = useCallback(() => setImportOpen(true), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const openAccount = useCallback(() => setAccountOpen(true), [])
  const openIncome = useCallback(() => setIncomeOpen(true), [])
  const openBudgets = useCallback(() => setBudgetsOpen(true), [])
  const openArchive = useCallback(() => setArchiveOpen(true), [])
  const openTransactions = useCallback((query?: TransactionQuery) => setTxQuery(query ?? {}), [])

  const api = useMemo<SheetApi>(
    () => ({ openImport, openSettings, openAccount, openIncome, openBudgets, openArchive, openTransactions }),
    [openImport, openSettings, openAccount, openIncome, openBudgets, openArchive, openTransactions],
  )

  const source = txQuery?.overall ? state.transactions : visible
  const rows = useMemo(() => {
    if (!txQuery) return []
    return source.filter(
      (tx) =>
        (!txQuery.category || tx.category === txQuery.category) &&
        (!txQuery.merchant || tx.merchant === txQuery.merchant),
    )
  }, [source, txQuery])

  const title = txQuery?.title ?? (txQuery?.category ? categoryLabel(txQuery.category) : 'İşlemler')

  return (
    <SheetContext.Provider value={api}>
      {children}

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />

      {/* Not lazy and not behind a sheet: it must be able to appear on its own,
          wherever the person is, the moment sync needs an answer. It carries no
          Firebase code — that stays in the account sheet's chunk. */}
      <SyncGate />

      <Suspense fallback={null}>
        {settingsOpen && <SettingsSheet open onClose={() => setSettingsOpen(false)} />}
        {accountOpen && <AccountSheet open onClose={() => setAccountOpen(false)} />}
        {incomeOpen && <IncomeSheet open onClose={() => setIncomeOpen(false)} />}
        {budgetsOpen && <BudgetSheet open onClose={() => setBudgetsOpen(false)} />}
        {archiveOpen && (
          <ArchiveSheet
            open
            onClose={() => setArchiveOpen(false)}
            onShowPeriod={() => {
              setArchiveOpen(false)
              window.location.hash = '/overview'
            }}
          />
        )}
        {txQuery !== null && (
          <TransactionsSheet open onClose={() => setTxQuery(null)} title={title} transactions={rows} />
        )}
      </Suspense>
    </SheetContext.Provider>
  )
}
