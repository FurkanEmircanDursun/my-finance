import { useMemo, useState } from 'react'
import { ArrowDownLeft, Plus, Search } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Empty, TextInput } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { money2, count } from '../core/money'
import { fold } from '../core/text'
import { EntrySheet } from '../app/EntrySheet'
import { CATEGORIES, categoryColor, type CategoryId } from '../domain/categories'
import { spendAmount, type Transaction } from '../domain/types'
import { useStore } from '../store/AppStore'
import { applyFilters } from '../store/selectors'
import { useSheets } from '../app/sheets'
import { TransactionItem } from '../ui/TransactionItem'
import { useTransactionDelete } from '../ui/useTransactionDelete'

const PAGE_SIZE = 60

/**
 * The transaction list, as a drill-down rather than a tab.
 *
 * Nobody opens an app to look at rows; they open it with a question, and rows
 * are where the question bottoms out. So this arrives from somewhere — a
 * category, a merchant, a subscription — already carrying its own title and
 * its own subset.
 *
 * Selection is gone. The old screen had a checkbox column, a select-all, and
 * three buttons that only existed once something was ticked. What people were
 * actually doing with all that was re-categorising a merchant, so a row now
 * opens in place and re-categorising it teaches the rule for that merchant by
 * default — the bulk operation, expressed as the single thing it really is.
 */
export function TransactionsSheet({
  open,
  onClose,
  title,
  transactions,
}: {
  open: boolean
  onClose: () => void
  title: string
  transactions: Transaction[]
}) {
  const [adding, setAdding] = useState(false)
  return <Modal open={open} onClose={onClose} title={title} variant="sheet">
    <TransactionList transactions={transactions} onAdd={() => setAdding(true)} />
    <ManualTransactionModal open={adding} onClose={() => setAdding(false)} />
  </Modal>
}

export function TransactionsView() {
  const { state } = useStore()
  const { openIncome, openIncomeEntry } = useSheets()
  const transactions = useMemo(() => applyFilters(
    state.transactions, { ...state.filters, includeNonSpend: true },
    { periodGrouping: state.settings.periodGrouping, statements: state.statements },
  ), [state.transactions, state.filters, state.settings.periodGrouping, state.statements])

  return <div className="transactions-page">
    <header className="dashboard-title"><div><h1>İşlemler</h1></div>
      <button type="button" className="quiet-button" onClick={openIncome}><ArrowDownLeft size={17} /> Sabit gelir ve giderler</button>
    </header>
    <TransactionList transactions={transactions} onIncome={openIncomeEntry} />
  </div>
}

function TransactionList({ transactions, onAdd, onIncome }: {
  transactions: Transaction[]
  onAdd?: () => void
  onIncome?: () => void
}) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [expanded, setExpanded] = useState<string | null>(null)

  const rows = useMemo(() => {
    const folded = query.trim() ? fold(query.trim()) : ''
    const list = folded
      ? transactions.filter((tx) => fold(tx.description).includes(folded) || tx.merchant.includes(folded))
      : transactions
    return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [transactions, query])

  const total = rows.reduce((sum, tx) => sum + spendAmount(tx), 0)

  return (
    <div className="transaction-list">
      <div className="mb-4 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <TextInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="İşyeri ara"
            aria-label="İşlem ara"
            className="pl-9"
          />
        </div>
        {onAdd && <Button onClick={onAdd} className="shrink-0"><Plus size={16} /> Ekle</Button>}
        {onIncome && <Button onClick={onIncome} className="shrink-0"><ArrowDownLeft size={16} /> Gelir ekle</Button>}
      </div>
      <p className="transaction-result" aria-live="polite">{count(rows.length)} işlem · Net harcama <span className="num">{money2(total)}</span></p>

      {rows.length === 0 ? (
        <Empty compact title="İşlem bulunamadı" description={query ? "Başka bir sözcükle ara." : "Başka bir ay seçebilir veya işlem ekleyebilirsin."} />
      ) : (
        <ul className="transaction-list-rows">
          {rows.slice(0, limit).map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              open={expanded === tx.id}
              onToggle={() => setExpanded((prev) => (prev === tx.id ? null : tx.id))}
              onDone={() => setExpanded(null)}
            />
          ))}
        </ul>
      )}

      {limit < rows.length && (
        <div className="mt-4 text-center">
          <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            {count(rows.length - limit)} işlem daha
          </Button>
        </div>
      )}

    </div>
  )
}

/* ── One row, and its editor ─────────────────────────────────────────────── */

function TransactionRow({
  tx,
  open,
  onToggle,
  onDone,
}: {
  tx: Transaction
  open: boolean
  onToggle: () => void
  onDone: () => void
}) {
  const { dispatch, ensureHistory, historyReady, syncNow } = useStore()
  const [onlyThis, setOnlyThis] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const remove = useTransactionDelete()

  const assign = async (category: CategoryId) => {
    setError(false)
    setSaving(true)
    try {
      if (!onlyThis && !historyReady) {
        syncNow()
        await ensureHistory()
      }
      dispatch({ type: 'setCategory', transactionIds: [tx.id], category, learn: !onlyThis })
      onDone()
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="border-b border-line last:border-b-0">
      <TransactionItem transaction={tx} onOpen={onToggle} expanded={open} onDelete={() => { remove(tx); onDone() }} />

      {open && (
        <div className="rise-in px-2 pb-4">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {CATEGORIES.map((def) => (
              <button
                key={def.id}
                type="button"
                disabled={saving}
                onClick={() => void assign(def.id)}
                className={clsx(
                  'flex min-h-[44px] items-center gap-2 rounded-[var(--radius)] px-3 text-left text-body transition-colors duration-200',
                  def.id === tx.category ? 'bg-accent-soft text-accent-text' : 'bg-sunken text-ink hover:bg-hover',
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.color }} />
                <span className="truncate">{def.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            {/* Learning the merchant is the default because it is what people
                mean: they are not fixing one line, they are telling the app
                what this shop is. */}
            <label className="flex cursor-pointer items-center gap-2 text-body text-muted">
              <input
                type="checkbox"
                disabled={saving}
                checked={onlyThis}
                onChange={(e) => setOnlyThis(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Sadece bu işlem
            </label>


          </div>

          {!onlyThis && (
            <p className="mt-2 text-label text-faint">
              <Badge dot={categoryColor(tx.category)}>{tx.merchant}</Badge> işyerinin tüm işlemleri
              güncellenir.
            </p>
          )}
          {saving && <p role="status">İşlemler kontrol ediliyor…</p>}
          {error && <p role="alert">İşlem geçmişi yüklenemedi. Bağlantını kontrol edip tekrar dene.</p>}
        </div>
      )}
    </li>
  )
}

/* ── Manual entry ────────────────────────────────────────────────────────── */

function ManualTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <EntrySheet onClose={onClose} /> : null
}
