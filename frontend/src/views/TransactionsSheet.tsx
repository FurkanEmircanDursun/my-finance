import { useMemo, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Empty, Field, Segmented, TextInput } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { money, money2, count, toMinor } from '../core/money'
import { fullDayLabel, parseAnyDate, todayKey } from '../core/date'
import { fold, normalizeMerchant } from '../core/text'
import { hash } from '../core/hash'
import { CATEGORIES, categoryColor, categoryLabel, type CategoryId } from '../domain/categories'
import { spendAmount, type Transaction, type TxKind } from '../domain/types'
import { useStore } from '../store/AppStore'

const PAGE_SIZE = 60

const KIND_LABEL: Record<TxKind, string> = {
  expense: 'Harcama',
  refund: 'İade',
  income: 'Gelir',
  payment: 'Borç ödeme',
}

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
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const rows = useMemo(() => {
    const folded = query.trim() ? fold(query.trim()) : ''
    const list = folded
      ? transactions.filter((tx) => fold(tx.description).includes(folded) || tx.merchant.includes(folded))
      : transactions
    return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [transactions, query])

  const total = rows.reduce((sum, tx) => sum + spendAmount(tx), 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={`${money(total)} · ${count(rows.length)} işlem`}
      variant="sheet"
    >
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
        <Button onClick={() => setAdding(true)} className="shrink-0">
          <Plus size={16} />
          Ekle
        </Button>
      </div>

      {rows.length === 0 ? (
        <Empty title="Kayıt yok" />
      ) : (
        <ul className="-mx-2">
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

      <ManualTransactionModal open={adding} onClose={() => setAdding(false)} />
    </Modal>
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
  const { dispatch } = useStore()
  const [onlyThis, setOnlyThis] = useState(false)

  const assign = (category: CategoryId) => {
    dispatch({ type: 'setCategory', transactionIds: [tx.id], category, learn: !onlyThis })
    onDone()
  }

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2 py-3 text-left transition-colors duration-200 hover:bg-hover"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: categoryColor(tx.category) }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-ink">{tx.description}</span>
          <span className="mt-0.5 block truncate text-label text-faint">
            {fullDayLabel(tx.date)} · {categoryLabel(tx.category)}
            {tx.installment ? ` · taksit ${tx.installment.current}/${tx.installment.total}` : ''}
            {tx.kind !== 'expense' ? ` · ${KIND_LABEL[tx.kind]}` : ''}
          </span>
        </span>
        <span
          className={clsx(
            'num shrink-0 text-body font-semibold',
            tx.kind === 'expense' ? 'text-ink' : 'text-positive',
          )}
        >
          {tx.kind === 'expense' ? '' : '+'}
          {money2(tx.amount)}
        </span>
      </button>

      {open && (
        <div className="rise-in px-2 pb-4">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {CATEGORIES.map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => assign(def.id)}
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
                checked={onlyThis}
                onChange={(e) => setOnlyThis(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Sadece bu işlem
            </label>

            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                dispatch({ type: 'deleteTransactions', ids: [tx.id] })
                onDone()
              }}
            >
              <Trash2 size={14} />
              Sil
            </Button>
          </div>

          {!onlyThis && (
            <p className="mt-2 text-label text-faint">
              <Badge dot={categoryColor(tx.category)}>{tx.merchant}</Badge> işyerinin tüm işlemleri
              güncellenir.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/* ── Manual entry ────────────────────────────────────────────────────────── */

function ManualTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch } = useStore()
  const [date, setDate] = useState(todayKey())
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<TxKind>('expense')
  const [category, setCategory] = useState<CategoryId>('other')

  const valid = description.trim().length > 0 && Number.parseFloat(amount.replace(',', '.')) > 0

  const submit = () => {
    const parsedDate = parseAnyDate(date) ?? todayKey()
    const value = toMinor(Math.abs(Number.parseFloat(amount.replace(',', '.'))))
    const merchant = normalizeMerchant(description)

    dispatch({
      type: 'addManual',
      transaction: {
        id: hash(`manual|${parsedDate}|${value}|${merchant}|${Date.now()}`),
        date: parsedDate,
        description: description.trim(),
        merchant,
        amount: value,
        kind,
        category,
        categoryLocked: true,
        bank: 'Manuel',
        accountLabel: 'Manuel kayıt',
        installment: null,
        source: 'manual',
      },
    })

    setDate(todayKey())
    setDescription('')
    setAmount('')
    setKind('expense')
    setCategory('other')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="İşlem ekle"
      footer={
        <Button variant="primary" disabled={!valid} onClick={submit}>
          Ekle
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Açıklama">
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Örn. Kira ödemesi"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tutar (₺)">
            <TextInput
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
          </Field>
          <Field label="Tarih">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Tür">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'expense', label: 'Harcama' },
              { value: 'income', label: 'Gelir' },
            ]}
          />
        </Field>

        <Field label="Kategori">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {CATEGORIES.map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => setCategory(def.id)}
                className={clsx(
                  'flex min-h-[44px] items-center gap-2 rounded-[var(--radius)] px-3 text-left text-body transition-colors duration-200',
                  category === def.id ? 'bg-accent-soft text-accent-text' : 'bg-sunken text-ink hover:bg-hover',
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.color }} />
                <span className="truncate">{def.label}</span>
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
