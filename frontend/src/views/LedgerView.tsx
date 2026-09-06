import { useMemo, useState } from 'react'
import { Plus, Trash2, Wallet } from 'lucide-react'
import { Badge, Button, Field, Grid, Section, Segmented, Stat, TextInput } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { useStore } from '../store/AppStore'
import { money, toMajor, toMinor } from '../core/money'
import { monthLabel, monthOf, todayKey, yearOf } from '../core/date'
import { CATEGORIES, categoryLabel, type CategoryId } from '../domain/categories'
import { buildLedgerSeries, buildLedgerTransaction, buildMonthLedgers, monthsOfYear } from '../domain/ledger'
import type { MonthKey } from '../core/date'

/**
 * Where the money a statement cannot see gets entered: salary, rent, cash —
 * per month, including months already gone by.
 *
 * The page answers one question per row (did this month end up or down) and
 * one for the year at the top. Everything entered here becomes an ordinary
 * manual transaction, so it flows into every other view without this screen
 * needing to know about them.
 */
export function LedgerView() {
  const { state, dispatch } = useStore()
  const today = todayKey()
  const thisMonth = monthOf(today)
  const [year, setYear] = useState(yearOf(today))
  const [editing, setEditing] = useState<MonthKey | null>(null)

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

  const totals = ledgers.reduce(
    (acc, m) => ({
      income: acc.income + m.income,
      spend: acc.spend + m.statementSpend + m.manualSpend,
      net: acc.net + m.net,
    }),
    { income: 0, spend: 0, net: 0 },
  )

  const emptyMonths = ledgers.filter((m) => m.income === 0 && m.entries.length === 0)

  return (
    <div className="space-y-4">
      <Grid className="sm:grid-cols-3">
        <Stat label={`${year} toplam gelir`} value={money(totals.income)} tone="positive" />
        <Stat label={`${year} toplam gider`} value={money(totals.spend)} hint="ekstre + elden" />
        <Stat
          label="Net"
          value={money(totals.net, { sign: true })}
          tone={totals.net >= 0 ? 'positive' : 'negative'}
          hint="gelir − gider"
        />
      </Grid>

      <Section
        title="Ay ay gelir ve gider"
        description="Ekstrede görünmeyen her şeyi buradan girin — maaş, kira, nakit"
        actions={
          years.length > 1 && (
            <Segmented
              value={String(year)}
              onChange={(next) => setYear(Number(next))}
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
            />
          )
        }
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-2xs text-faint">
                <th className="px-4 py-2.5 font-medium">Ay</th>
                <th className="px-4 py-2.5 text-right font-medium">Gelir</th>
                <th className="px-4 py-2.5 text-right font-medium">Ekstre gideri</th>
                <th className="px-4 py-2.5 text-right font-medium">Elden gider</th>
                <th className="px-4 py-2.5 text-right font-medium">Net</th>
                <th className="px-4 py-2.5 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {ledgers.map((row) => {
                const untouched = row.income === 0 && row.entries.length === 0
                return (
                  <tr key={row.month} className="border-b border-line last:border-b-0 hover:bg-hover">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 text-2xs font-medium text-ink">
                        {monthLabel(row.month)}
                        {row.month === thisMonth && <Badge tone="accent">bu ay</Badge>}
                        {untouched && <Badge tone="warning">boş</Badge>}
                      </span>
                    </td>
                    <td className="num px-4 py-2.5 text-right text-2xs text-positive">
                      {row.income ? money(row.income) : '—'}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-2xs text-muted">
                      {row.statementSpend ? money(row.statementSpend) : '—'}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-2xs text-muted">
                      {row.manualSpend ? money(row.manualSpend) : '—'}
                    </td>
                    <td
                      className={`num px-4 py-2.5 text-right text-2xs font-semibold ${
                        row.net >= 0 ? 'text-positive' : 'text-negative'
                      }`}
                    >
                      {row.income || row.statementSpend || row.manualSpend
                        ? money(row.net, { sign: true })
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(row.month)}>
                        <Plus size={12} />
                        {untouched ? 'Doldur' : 'Düzenle'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {emptyMonths.length > 0 && (
        <Section title="Geriye dönük doldurma" description="Boş bırakılan aylar analizden düşer">
          <div className="space-y-3">
            <p className="text-2xs leading-relaxed text-muted">
              {year} yılının{' '}
              <span className="font-medium text-ink">{emptyMonths.length} ayında</span> hiç kayıt yok. Bu
              aylara maaşınızı ve kira gibi sabit giderlerinizi girerseniz yıllık net tutar ve tasarruf
              hedefi bu ayları da kapsar.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {emptyMonths.map((m) => (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => setEditing(m.month)}
                  className="rounded border border-line bg-sunken px-2.5 py-1 text-2xs text-muted hover:border-accent hover:text-ink"
                >
                  {monthLabel(m.month, true)}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      <MonthEntryModal
        month={editing}
        laterMonths={editing ? months.filter((m) => m > editing) : []}
        entries={ledgers.find((l) => l.month === editing)?.entries ?? []}
        onClose={() => setEditing(null)}
        onDelete={(id) => dispatch({ type: 'deleteTransactions', ids: [id] })}
      />
    </div>
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

function MonthEntryModal({
  month,
  laterMonths,
  entries,
  onClose,
  onDelete,
}: {
  month: MonthKey | null
  laterMonths: MonthKey[]
  entries: Array<{ id: string; description: string; amount: number; kind: string; category: CategoryId }>
  onClose: () => void
  onDelete: (id: string) => void
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

  if (!month) return null

  const value = toMinor(Math.abs(Number.parseFloat(amount.replace(',', '.')) || 0))
  const valid = label.trim().length > 0 && value > 0

  const reset = () => {
    setLabel('')
    setAmount('')
    setCategory('other')
    setRepeat(false)
  }

  const submit = () => {
    if (!valid) return
    const draft = {
      label: label.trim(),
      amount: value,
      kind,
      category: kind === 'income' ? ('other' as CategoryId) : category,
    }

    const months = repeat ? [month, ...laterMonths] : [month]
    dispatch({ type: 'addManualBatch', transactions: buildLedgerSeries(draft, months) })
    reset()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${monthLabel(month)} · gelir ve gider`}
      description="Ekstrede görünmeyen kayıtlar. Girdikleriniz tüm analizlere dahil olur."
      footer={
        <>
          <Button size="sm" onClick={onClose}>
            Kapat
          </Button>
          <Button size="sm" variant="primary" disabled={!valid} onClick={submit}>
            <Plus size={12} />
            Ekle
          </Button>
        </>
      }
    >
      <div className="space-y-4">
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
                className={`rounded border px-2.5 py-1 text-2xs transition-colors ${
                  label === quick.label
                    ? 'border-accent bg-accent-soft text-accent-text'
                    : 'border-line bg-sunken text-muted hover:text-ink'
                }`}
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
          <Field label="Tutar (₺)">
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
                  className={`flex items-center gap-1.5 rounded border px-2 py-1 text-2xs transition-colors ${
                    category === def.id
                      ? 'border-accent bg-accent-soft text-accent-text'
                      : 'border-line bg-sunken text-muted hover:text-ink'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: def.color }} />
                  {def.label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {laterMonths.length > 0 && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded border border-line bg-sunken px-3 py-2.5">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
            />
            <span className="text-2xs leading-relaxed text-muted">
              <span className="font-medium text-ink">Sonraki aylara da uygula.</span> Aynı tutar{' '}
              {monthLabel(laterMonths[laterMonths.length - 1], true)} ayına kadar {laterMonths.length} aya
              daha eklenir. Tutar değişirse o ayı tek tek düzeltebilirsiniz.
            </span>
          </label>
        )}

        {entries.length > 0 && (
          <div>
            <p className="mb-1.5 text-2xs text-faint">Bu ayın kayıtları</p>
            <div className="space-y-1.5">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2.5 rounded border border-line bg-sunken px-3 py-2"
                >
                  <Wallet size={12} className={entry.kind === 'income' ? 'text-positive' : 'text-faint'} />
                  <span className="min-w-0 flex-1 truncate text-2xs text-ink">{entry.description}</span>
                  {entry.kind !== 'income' && <Badge>{categoryLabel(entry.category)}</Badge>}
                  <span
                    className={`num text-2xs font-medium ${
                      entry.kind === 'income' ? 'text-positive' : 'text-ink'
                    }`}
                  >
                    {entry.kind === 'income' ? '+' : '−'}
                    {money(entry.amount)}
                  </span>
                  <button
                    type="button"
                    aria-label={`${entry.description} kaydını sil`}
                    onClick={() => onDelete(entry.id)}
                    className="rounded p-1 text-faint hover:bg-hover hover:text-negative"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Re-exported so the onboarding wizard builds rows the same way this page does. */
export { buildLedgerTransaction, toMajor }
