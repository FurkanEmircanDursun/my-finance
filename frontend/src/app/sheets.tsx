import { useExplore } from './ExploreContext'
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ImportSheet } from './ImportSheet'
import { SyncGate } from './SyncDecision'
import { useStore } from '../store/AppStore'
import { categoryLabel, type CategoryId } from '../domain/categories'
import type { TxKind } from '../domain/types'
import { EntrySheet } from './EntrySheet'

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

const SettingsSheet = lazy(() =>
  import('./SettingsSheet').then((m) => ({ default: m.SettingsSheet })),
)
const AccountSheet = lazy(() =>
  import('./AccountSheet').then((m) => ({ default: m.AccountSheet })),
)
const StatementSheet = lazy(() =>
  import('./StatementSheet').then((m) => ({ default: m.StatementSheet })),
)
const RewardsSheet = lazy(() =>
  import('./RewardsSheet').then((m) => ({ default: m.RewardsSheet })),
)
const IncomeSheet = lazy(() =>
  import('./IncomeSheet').then((m) => ({ default: m.IncomeSheet })),
)
const ArchiveSheet = lazy(() =>
  import('./ArchiveSheet').then((m) => ({ default: m.ArchiveSheet })),
)
const BudgetSheet = lazy(() =>
  import('./BudgetSheet').then((m) => ({ default: m.BudgetSheet })),
)
const CardsSheet = lazy(() => import('./CardsSheet').then((m) => ({ default: m.CardsSheet })))
const TransactionsSheet = lazy(() =>
  import('../views/TransactionsSheet').then((m) => ({
    default: m.TransactionsSheet,
  })),
)

export interface TransactionQuery {
  category?: CategoryId
  merchant?: string
  title?: string
  /** Read the whole account rather than the selected period. */
  overall?: boolean
  /** Only rows of these kinds, e.g. the refunds and discounts that came off the total. */
  kinds?: TxKind[]
}

interface SheetApi {
  openEntry: () => void
  openIncomeEntry: () => void
  openImport: () => void
  openSettings: () => void
  openAccount: () => void
  openIncome: () => void
  openBudgets: () => void
  openCards: () => void
  openArchive: () => void
  /** One statement, line by line, added up the way the bank adds it. */
  openStatement: (statementId: string) => void
  openRewards: () => void
  openTransactions: (query?: TransactionQuery) => void
}

const SheetContext = createContext<SheetApi | null>(null)

export function useSheets(): SheetApi {
  const value = useContext(SheetContext)
  if (!value) throw new Error('useSheets must be used inside <SheetProvider>')
  return value
}

export function SheetProvider({ children }: { children: ReactNode }) {
  const { stopExplore } = useExplore()
  const { state, visible } = useStore()
  const [importOpen, setImportOpen] = useState(false)
  const [entryOpen, setEntryOpen] = useState<'expense' | 'income' | null>(null)
  const openEntry = useCallback(() => { stopExplore(); setEntryOpen('expense') }, [stopExplore])
  const openIncomeEntry = useCallback(() => { stopExplore(); setEntryOpen('income') }, [stopExplore])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [budgetsOpen, setBudgetsOpen] = useState(false)
  const [cardsOpen, setCardsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [statementId, setStatementId] = useState<string | null>(null)
  const [rewardsOpen, setRewardsOpen] = useState(false)
  const [txQuery, setTxQuery] = useState<TransactionQuery | null>(null)

  const openImport = useCallback(() => { stopExplore(); setImportOpen(true) }, [stopExplore])
  const openSettings = useCallback(() => { stopExplore(); setSettingsOpen(true) }, [stopExplore])
  const openAccount = useCallback(() => { stopExplore(); setAccountOpen(true) }, [stopExplore])
  const openIncome = useCallback(() => { stopExplore(); setIncomeOpen(true) }, [stopExplore])
  const openBudgets = useCallback(() => { stopExplore(); setBudgetsOpen(true) }, [stopExplore])
  const openCards = useCallback(() => { stopExplore(); setCardsOpen(true) }, [stopExplore])
  const openArchive = useCallback(() => { stopExplore(); setArchiveOpen(true) }, [stopExplore])
  const openStatement = useCallback((id: string) => { stopExplore(); setStatementId(id) }, [stopExplore])
  const openRewards = useCallback(() => { stopExplore(); setRewardsOpen(true) }, [stopExplore])
  const openTransactions = useCallback(
    (query?: TransactionQuery) => { stopExplore(); setTxQuery(query ?? {}) },
    [stopExplore],
  )

  const api = useMemo<SheetApi>(
    () => ({
      openEntry,
      openIncomeEntry,
      openImport,
      openSettings,
      openAccount,
      openIncome,
      openBudgets,
      openCards,
      openArchive,
      openStatement,
      openRewards,
      openTransactions,
    }),
    [
      openEntry,
      openIncomeEntry,
      openImport,
      openSettings,
      openAccount,
      openIncome,
      openBudgets,
      openCards,
      openArchive,
      openStatement,
      openRewards,
      openTransactions,
    ],
  )

  const source = txQuery?.overall ? state.transactions : visible
  const rows = useMemo(() => {
    if (!txQuery) return []
    return source.filter(
      (tx) =>
        (!txQuery.category || tx.category === txQuery.category) &&
        (!txQuery.merchant || tx.merchant === txQuery.merchant) &&
        (!txQuery.kinds || txQuery.kinds.includes(tx.kind)),
    )
  }, [source, txQuery])

  const title =
    txQuery?.title ??
    (txQuery?.category ? categoryLabel(txQuery.category) : 'İşlemler')

  return (
    <SheetContext.Provider value={api}>
      {children}
      {entryOpen && (
        <EntrySheet
          initialKind={entryOpen}
          onClose={() => setEntryOpen(null)}
        />
      )}

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />

      {/* Not lazy and not behind a sheet: it must be able to appear on its own,
          wherever the person is, the moment sync needs an answer. It carries no
          Firebase code — that stays in the account sheet's chunk. */}
      <SyncGate />

      <Suspense fallback={null}>
        {cardsOpen && <CardsSheet open onClose={() => setCardsOpen(false)} />}
        {settingsOpen && (
          <SettingsSheet open onClose={() => setSettingsOpen(false)} />
        )}
        {accountOpen && (
          <AccountSheet open onClose={() => setAccountOpen(false)} />
        )}
        {incomeOpen && (
          <IncomeSheet open onClose={() => setIncomeOpen(false)} />
        )}
        {budgetsOpen && (
          <BudgetSheet open onClose={() => setBudgetsOpen(false)} />
        )}
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
        {statementId !== null && (
          <StatementSheet
            open
            onClose={() => setStatementId(null)}
            statementId={statementId}
          />
        )}
        {rewardsOpen && (
          <RewardsSheet open onClose={() => setRewardsOpen(false)} />
        )}
        {txQuery !== null && (
          <TransactionsSheet
            open
            onClose={() => setTxQuery(null)}
            title={title}
            transactions={rows}
          />
        )}
      </Suspense>
    </SheetContext.Provider>
  )
}
