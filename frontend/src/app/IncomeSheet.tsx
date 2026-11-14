import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Field, Segmented, TextInput } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { useStore } from '../store/AppStore'
import { money } from '../core/money'
import { monthLabel, monthOf, todayKey, yearOf } from '../core/date'
import { CATEGORIES, categoryLabel, type CategoryId } from '../domain/categories'
import { buildLedgerSeries, buildMonthLedgers, monthsOfYear } from '../domain/ledger'
import { entryAmount } from '../domain/entry'
import type { MonthKey } from '../core/date'

/**
 * Salary, rent, cash — the money a card statement cannot see.
 *
 * This used to be a tab called "Gelir–Gider", which put a data-entry form in
 * the same strip as the screens that answer questions. It is not a question; it
 * is the thing you tell the app once so the questions can be answered. So it
 * opens as a sheet, from the one line on the overview that says what is missing.
 *
 * Everything entered here becomes an ordinary manual transaction, so it flows
 * into every other view without those views knowing this screen exists.
 */
export function IncomeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useStore()
  const today = todayKey()
  const thisMonth = monthOf(today)
  const [year, setYear] = useState(yearOf(today))
  const [editing, setEditing] = useState<MonthKey | null>(thisMonth)

  const years = useMemo(() => {
    const set = new Set<number>([yearOf(today)])
    for (const tx of state.transactions) set.add(yearOf(tx.date))
    return [...set].sort((a, b) => b - a)
  }, [state.transactions, today])

  const months = useMemo(() => monthsOfYear(year, thisMonth), [year, thisMonth])
  const ledgers = useMemo(
    () => buildMonthLedgers(state.transactions, months),
    [state.transactions, months],
  )

  const totals = ledgers.reduce((acc, m) => acc + m.net, 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gelir ve sabit giderler"
      description={`${year} yılı net ${money(totals, { sign: true })}`}
      variant="sheet"
    >
      {years.length > 1 && (
        <div className="mb-4">
          <Segmented
            value={String(year)}
            onChange={(next) => setYear(Number(next))}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
      )}

      <ul className="-mx-2">
        {ledgers.map((row) => {
          const untouched = row.income === 0 && row.entries.length === 0 && row.statementSpend === 0 && row.manualSpend === 0
          const spend = row.statementSpend + row.manualSpend
          return (
            <li key={row.month} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => setEditing((prev) => (prev === row.month ? null : row.month))}
                aria-expanded={editing === row.month}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2 py-3 text-left transition-colors duration-200 hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-body text-ink">
                    {monthLabel(row.month)}
                    {row.month === thisMonth && <Badge tone="accent">bu ay</Badge>}
                  </span>
                  <span className="mt-0.5 block text-label text-faint">
                    {untouched
                      ? 'Kayıt yok'
                      : `gelir ${money(row.income)} · gider ${money(spend)}`}
                  </span>
                </span>
                <span
                  className={clsx(
                    'num shrink-0 text-body font-semibold',
                    untouched ? 'text-faint' : row.net >= 0 ? 'text-positive' : 'text-negative',
                  )}
                >
                  {untouched ? '—' : money(row.net, { sign: true })}
                </span>
              </button>

              {editing === row.month && (
                <MonthEntries
                  month={row.month}
                  laterMonths={months.filter((m) => m > row.month)}
                  entries={row.entries}
                />
              )}
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

const QUICK_EXPENSES: Array<{ label: string; category: CategoryId }> = [
  { label: 'Kira', category: 'rent' },
  { label: 'Aidat', category: 'rent' },
  { label: 'Elektrik', category: 'bills' },
  { label: 'Su', category: 'bills' },
  { label: 'Doğalgaz', category: 'bills' },
  { label: 'İnternet', category: 'bills' },
  { label: 'Okul', category: 'education' },
  { label: 'Kredi taksiti', category: 'fees' },
]

function MonthEntries({
  month,
  laterMonths,
  entries,
}: {
  month: MonthKey
  laterMonths: MonthKey[]
  entries: Array<{ id: string; description: string; amount: number; kind: string; category: CategoryId }>
}) {
  const { dispatch } = useStore()
  const [kind, setKind] = useState<'income' | 'expense'>('income')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  // Neutral by default: the quick chips set a category along with their label,
  // but anything typed by hand should not silently inherit whatever the last
  // chip was — a "Nakit market" row landing under Kira & Aidat is worse than
  // one landing under Diğer.
  const [category, setCategory] = useState<CategoryId>('other')
  const [repeat, setRepeat] = useState(false)

  const value = entryAmount(amount) ?? 0
  const valid = label.trim().length > 0 && value > 0

  const submit = () => {
    if (!valid) return
    const draft = {
      label: label.trim(),
      amount: value,
      kind,
      category: kind === 'income' ? ('other' as CategoryId) : category,
    }
    dispatch({
      type: 'addManualBatch',
      transactions: buildLedgerSeries(draft, repeat ? [month, ...laterMonths] : [month]),
    })
    setLabel('')
    setAmount('')
    setCategory('other')
    setRepeat(false)
  }

  return (
    <div className="rise-in space-y-4 px-2 pb-5">
      {entries.length > 0 && (
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2.5 rounded-[var(--radius)] bg-sunken px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-body text-ink">{entry.description}</span>
              {entry.kind !== 'income' && <Badge>{categoryLabel(entry.category)}</Badge>}
              <span
                className={clsx(
                  'num text-body font-semibold',
                  entry.kind === 'income' ? 'text-positive' : 'text-ink',
                )}
              >
                {entry.kind === 'income' ? '+' : '−'}
                {money(entry.amount)}
              </span>
              <button
                type="button"
                aria-label={`${entry.description} kaydını sil`}
                onClick={() => dispatch({ type: 'deleteTransactions', ids: [entry.id] })}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-faint hover:bg-hover hover:text-negative"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Segmented
        value={kind}
        onChange={(next) => {
          setKind(next)
          setLabel('')
        }}
        options={[
          { value: 'income', label: 'Gelir' },
          { value: 'expense', label: 'Gider' },
        ]}
      />

      {kind === 'expense' && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_EXPENSES.map((quick) => (
            <button
              key={quick.label}
              type="button"
              onClick={() => {
                setLabel(quick.label)
                setCategory(quick.category)
              }}
              className={clsx(
                'h-9 rounded-[var(--radius)] px-3 text-label font-semibold transition-colors duration-200',
                label === quick.label ? 'bg-accent-soft text-accent-text' : 'bg-sunken text-muted hover:text-ink',
              )}
            >
              {quick.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Açıklama">
          <TextInput
            value={label}
            placeholder={kind === 'income' ? 'Maaş' : 'Kira'}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Field label="Tutar (₺)" hint="Örnek: 15.000,50">
          <TextInput
            inputMode="decimal"
            value={amount}
            placeholder="0"
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>

      {kind === 'expense' && (
        <Field label="Kategori">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.filter((c) => c.nature !== 'neutral').map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => setCategory(def.id)}
                className={clsx(
                  'flex h-9 items-center gap-2 rounded-[var(--radius)] px-3 text-label font-semibold transition-colors duration-200',
                  category === def.id ? 'bg-accent-soft text-accent-text' : 'bg-sunken text-muted hover:text-ink',
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: def.color }} />
                {def.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {laterMonths.length > 0 && (
        <label className="flex cursor-pointer items-start gap-2.5 text-body text-muted">
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          Sonraki {laterMonths.length} aya da uygula
        </label>
      )}

      <Button variant="primary" disabled={!valid} onClick={submit}>
        <Plus size={16} />
        Ekle
      </Button>
    </div>
  )
}
