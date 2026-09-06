import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ImportSheet } from './ImportSheet'
import { SettingsSheet } from './SettingsSheet'
import { IncomeSheet } from './IncomeSheet'
import { BudgetSheet } from './BudgetSheet'
import { TransactionsSheet } from '../views/TransactionsSheet'
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
 */

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
  openIncome: () => void
  openBudgets: () => void
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
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [budgetsOpen, setBudgetsOpen] = useState(false)
  const [txQuery, setTxQuery] = useState<TransactionQuery | null>(null)

  const openImport = useCallback(() => setImportOpen(true), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const openIncome = useCallback(() => setIncomeOpen(true), [])
  const openBudgets = useCallback(() => setBudgetsOpen(true), [])
  const openTransactions = useCallback((query?: TransactionQuery) => setTxQuery(query ?? {}), [])

  const api = useMemo<SheetApi>(
    () => ({ openImport, openSettings, openIncome, openBudgets, openTransactions }),
    [openImport, openSettings, openIncome, openBudgets, openTransactions],
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

  const title =
    txQuery?.title ?? (txQuery?.category ? categoryLabel(txQuery.category) : 'İşlemler')

  return (
    <SheetContext.Provider value={api}>
      {children}

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <IncomeSheet open={incomeOpen} onClose={() => setIncomeOpen(false)} />
      <BudgetSheet open={budgetsOpen} onClose={() => setBudgetsOpen(false)} />
      <TransactionsSheet
        open={txQuery !== null}
        onClose={() => setTxQuery(null)}
        title={title}
        transactions={rows}
      />
    </SheetContext.Provider>
  )
}
