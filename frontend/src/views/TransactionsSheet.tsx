import { useMemo, useState } from 'react'
import { ArrowDownLeft, Plus, Search } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Chip, Empty, TextInput } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { MoneyValue } from '../ui/MoneyValue'
import { count } from '../core/money'
import { fold } from '../core/text'
import { EntrySheet } from '../app/EntrySheet'
import { CATEGORIES, categoryColor, type CategoryId } from '../domain/categories'
import { spendAmount, type Transaction } from '../domain/types'
import { useStore } from '../store/AppStore'
import { applyFilters } from '../store/selectors'
import { useSheets } from '../app/sheets'
import { TransactionItem } from '../ui/TransactionItem'
import { useTransactionDelete } from '../ui/useTransactionDelete'
import { hapticTap } from '../platform/haptics'

const PAGE_SIZE = 60

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
  return (
    <Modal open={open} onClose={onClose} title={title} variant="sheet">
      <TransactionList transactions={transactions} onAdd={() => setAdding(true)} />
      <ManualTransactionModal open={adding} onClose={() => setAdding(false)} />
    </Modal>
  )
}

export function TransactionsView() {
  const { state } = useStore()
  const { openIncome, openIncomeEntry } = useSheets()
  const transactions = useMemo(
    () =>
      applyFilters(
        state.transactions,
        { ...state.filters, includeNonSpend: true },
        { periodGrouping: state.settings.periodGrouping, statements: state.statements },
      ),
    [state.transactions, state.filters, state.settings.periodGrouping, state.statements],
  )

  return (
    <div className="transactions-page">
      <header className="dashboard-title">
        <div>
          <h1>İşlemler</h1>
          <p>Ara, filtrele veya işyeri kategorisini tek dokunuşla düzelt</p>
        </div>
        <button type="button" className="quiet-button" onClick={openIncome}>
          <ArrowDownLeft size={16} /> Sabit gelir ve giderler
        </button>
      </header>
      <TransactionList transactions={transactions} onIncome={openIncomeEntry} />
    </div>
  )
}

type KindFilter = 'all' | 'expense' | 'income' | 'refund'

function TransactionList({
  transactions,
  onAdd,
  onIncome,
}: {
  transactions: Transaction[]
  onAdd?: () => void
  onIncome?: () => void
}) {
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [expanded, setExpanded] = useState<string | null>(null)

  const rows = useMemo(() => {
    const folded = query.trim() ? fold(query.trim()) : ''
    const list = transactions.filter((tx) => {
      if (kindFilter !== 'all' && tx.kind !== kindFilter) return false
      if (!folded) return true
      return fold(tx.description).includes(folded) || tx.merchant.includes(folded)
    })
    return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [transactions, query, kindFilter])

  const total = rows.reduce((sum, tx) => sum + spendAmount(tx), 0)

  return (
    <div className="transaction-list">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <TextInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="İşyeri veya açıklama ara"
            aria-label="İşlem ara"
            className="pl-10"
          />
        </div>
        {onAdd && (
          <Button variant="primary" onClick={onAdd} className="shrink-0">
            <Plus size={16} /> Ekle
          </Button>
        )}
        {onIncome && (
          <Button onClick={onIncome} className="shrink-0">
            <ArrowDownLeft size={16} /> Gelir ekle
          </Button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="İşlem türü filtresi">
          {(
            [
              ['all', 'Tümü'],
              ['expense', 'Gider'],
              ['income', 'Gelir'],
              ['refund', 'İade'],
            ] as const
          ).map(([value, label]) => (
            <Chip
              key={value}
              selected={kindFilter === value}
              onClick={() => {
                hapticTap()
                setKindFilter(value)
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
        <p className="transaction-result" aria-live="polite" style={{ paddingBlock: 0 }}>
          {count(rows.length)} işlem · Net harcama{' '}
          <strong className="text-ink">
            <MoneyValue value={total} duration={320} />
          </strong>
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty
          compact
          title="İşlem bulunamadı"
          description={
            query || kindFilter !== 'all'
              ? 'Filtreleri temizleyip başka bir sözcükle ara.'
              : 'Başka bir ay seçebilir veya işlem ekleyebilirsin.'
          }
        />
      ) : (
        <ul className="transaction-list-rows">
          {rows.slice(0, limit).map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              open={expanded === tx.id}
              onToggle={() => {
                hapticTap()
                setExpanded((prev) => (prev === tx.id ? null : tx.id))
              }}
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
      hapticTap()
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
      <TransactionItem
        transaction={tx}
        onOpen={onToggle}
        expanded={open}
        onDelete={() => {
          remove(tx)
          onDone()
        }}
      />

      {open && (
        <div className="rise-in mb-3 rounded-[var(--radius)] border border-line bg-sunken p-3.5">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {CATEGORIES.map((def) => (
              <button
                key={def.id}
                type="button"
                disabled={saving}
                onClick={() => void assign(def.id)}
                className={clsx(
                  'flex min-h-[42px] items-center gap-2 rounded-[var(--radius-sm)] border px-3 text-left text-label font-medium transition-all duration-150',
                  def.id === tx.category
                    ? 'border-accent-border bg-accent-soft font-semibold text-accent-text'
                    : 'border-line bg-raised text-ink hover:border-line-strong hover:bg-hover',
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.color }} />
                <span className="truncate">{def.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-label font-medium text-muted">
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
          {saving && (
            <p role="status" className="mt-2 text-label text-muted">
              İşlemler kontrol ediliyor…
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-label text-negative">
              İşlem geçmişi yüklenemedi. Bağlantını kontrol edip tekrar dene.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

function ManualTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <EntrySheet onClose={onClose} /> : null
}
