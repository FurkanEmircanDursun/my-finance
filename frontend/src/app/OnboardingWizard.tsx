import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Field, TextInput } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { useStore } from '../store/AppStore'
import { money, toMinor } from '../core/money'
import { monthLabel, monthOf, todayKey, yearOf } from '../core/date'
import { buildLedgerSeries, monthsOfYear } from '../domain/ledger'
import type { CategoryId } from '../domain/categories'
import type { MonthKey } from '../core/date'

/**
 * First-run setup, in four short steps.
 *
 * The app's own data source — a card statement — cannot tell it a salary or a
 * rent, and without those it can only report card spending, never whether a
 * month ended up or down. Asking once, before the first import, is what makes
 * every later screen able to answer that. Every step is skippable: someone who
 * only wants to read a statement should not be held at a form.
 */

interface FixedItem {
  id: string
  label: string
  amount: string
  category: CategoryId
}

const SUGGESTED: Array<{ label: string; category: CategoryId }> = [
  { label: 'Kira', category: 'rent' },
  { label: 'Aidat', category: 'rent' },
  { label: 'Elektrik', category: 'bills' },
  { label: 'Su', category: 'bills' },
  { label: 'İnternet', category: 'bills' },
  { label: 'Kredi taksiti', category: 'fees' },
]

export function OnboardingWizard() {
  const { state, dispatch } = useStore()
  const [step, setStep] = useState(0)
  const [income, setIncome] = useState('')
  const [items, setItems] = useState<FixedItem[]>([])
  const [backfill, setBackfill] = useState<MonthKey[]>([])

  const today = todayKey()
  const thisMonth = monthOf(today)
  const yearMonths = monthsOfYear(yearOf(today), thisMonth)

  // Only for a genuinely fresh install: no statements, no rows, no income set.
  const fresh =
    state.hydrated &&
    state.transactions.length === 0 &&
    state.statements.length === 0 &&
    state.profile.monthlyIncome === 0
  const [dismissed, setDismissed] = useState(false)

  if (!fresh || dismissed) return null

  const incomeValue = toMinor(Math.abs(Number.parseFloat(income.replace(',', '.')) || 0))
  const fixedTotal = items.reduce(
    (sum, item) => sum + toMinor(Math.abs(Number.parseFloat(item.amount.replace(',', '.')) || 0)),
    0,
  )

  const addItem = (label = '', category: CategoryId = 'rent') =>
    setItems((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, label, amount: '', category }])

  const finish = () => {
    if (incomeValue > 0) dispatch({ type: 'setProfile', profile: { monthlyIncome: incomeValue } })

    // The months to write rows into: whatever was ticked, plus the current one
    // when nothing was, so a first-time user still ends up with one real month.
    const months = backfill.length ? [...backfill].sort() : [thisMonth]
    const rows = []

    if (incomeValue > 0) {
      rows.push(
        ...buildLedgerSeries(
          { label: 'Maaş', amount: incomeValue, kind: 'income', category: 'other' },
          months,
        ),
      )
    }

    for (const item of items) {
      const amount = toMinor(Math.abs(Number.parseFloat(item.amount.replace(',', '.')) || 0))
      if (!item.label.trim() || amount <= 0) continue
      rows.push(
        ...buildLedgerSeries(
          { label: item.label.trim(), amount, kind: 'expense', category: item.category },
          months,
        ),
      )
    }

    if (rows.length) dispatch({ type: 'addManualBatch', transactions: rows })
    setDismissed(true)
  }

  const steps = ['Gelir', 'Sabit giderler', 'Geçmiş aylar', 'Hazır']

  return (
    <Modal
      open
      onClose={() => setDismissed(true)}
      title="Kurulum"
      description={`${step + 1}/4 · ${steps[step]}`}
      footer={
        <>
          {step > 0 && (
            <Button size="sm" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={12} />
              Geri
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Şimdilik geç
          </Button>
          {step < 3 ? (
            <Button size="sm" variant="primary" onClick={() => setStep(step + 1)}>
              Devam
              <ArrowRight size={12} />
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={finish}>
              <Check size={12} />
              Bitir
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1">
          {steps.map((label, index) => (
            <span
              key={label}
              className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-accent' : 'bg-sunken'}`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <p className="text-body leading-relaxed text-ink">
              Kredi kartı ekstresi maaşınızı göstermez. Aylık net gelirinizi bir kez girin; ay sonunda
              artıda mı ekside mi olduğunuzu ancak böyle söyleyebiliriz.
            </p>
            <Field label="Aylık net gelir (₺)" hint="Sonra Ayarlar'dan değiştirebilirsiniz">
              <TextInput
                inputMode="decimal"
                autoFocus
                value={income}
                placeholder="30000"
                onChange={(e) => setIncome(e.target.value)}
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-body leading-relaxed text-ink">
              Karttan geçmeyen sabit giderleriniz — kira, aidat, faturalar. Bunlar da ekstrede yoktur.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.filter((s) => !items.some((i) => i.label === s.label)).map((suggestion) => (
                <button
                  key={suggestion.label}
                  type="button"
                  onClick={() => addItem(suggestion.label, suggestion.category)}
                  className="inline-flex items-center gap-1 rounded border border-line bg-sunken px-2.5 py-1 text-label text-muted hover:border-accent hover:text-ink"
                >
                  <Plus size={11} />
                  {suggestion.label}
                </button>
              ))}
            </div>

            {items.length > 0 && (
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <TextInput
                      className="flex-1"
                      value={item.label}
                      placeholder="Kira"
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((i) => (i.id === item.id ? { ...i, label: e.target.value } : i)),
                        )
                      }
                    />
                    <TextInput
                      className="w-28"
                      inputMode="decimal"
                      value={item.amount}
                      placeholder="0"
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((i) => (i.id === item.id ? { ...i, amount: e.target.value } : i)),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={`${item.label || 'Kalem'} kaldır`}
                      onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                      className="rounded p-1.5 text-faint hover:bg-hover hover:text-negative"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button size="sm" onClick={() => addItem()}>
              <Plus size={12} />
              Kalem ekle
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-body leading-relaxed text-ink">
              Geriye dönük ayları da doldurmak ister misiniz? Seçtiğiniz her aya aynı gelir ve sabit
              giderler yazılır — sonra tek tek düzeltebilirsiniz.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {yearMonths.map((month) => {
                const selected = backfill.includes(month)
                return (
                  <button
                    key={month}
                    type="button"
                    onClick={() =>
                      setBackfill((prev) =>
                        selected ? prev.filter((m) => m !== month) : [...prev, month],
                      )
                    }
                    aria-pressed={selected}
                    className={`rounded border px-2.5 py-1 text-label transition-colors ${
                      selected
                        ? 'border-transparent bg-ink text-inverse'
                        : 'border-line bg-raised text-muted hover:text-ink'
                    }`}
                  >
                    {monthLabel(month, true)}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setBackfill(yearMonths)}>
                Tüm yılı seç
              </Button>
              <Button size="sm" onClick={() => setBackfill([thisMonth])}>
                Sadece bu ay
              </Button>
              {backfill.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setBackfill([])}>
                  Temizle
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-body leading-relaxed text-ink">Şunlar kaydedilecek:</p>
            <div className="space-y-2 rounded border border-line bg-sunken p-3">
              <Row label="Aylık gelir" value={incomeValue > 0 ? money(incomeValue) : 'girilmedi'} />
              <Row
                label="Sabit gider"
                value={fixedTotal > 0 ? `${money(fixedTotal)} · ${items.length} kalem` : 'girilmedi'}
              />
              <Row
                label="Yazılacak ay"
                value={
                  backfill.length
                    ? `${backfill.length} ay`
                    : `1 ay (${monthLabel(thisMonth, true)})`
                }
              />
              {incomeValue > 0 && (
                <Row
                  label="Aylık net"
                  value={money(incomeValue - fixedTotal, { sign: true })}
                  tone={incomeValue - fixedTotal >= 0 ? 'positive' : 'negative'}
                />
              )}
            </div>
            <p className="text-label leading-relaxed text-muted">
              Bitirdikten sonra ekstrenizi yükleyin; kart harcamaları bu tabloya eklenir ve her ayın net
              durumu <Badge tone="accent">Gelir–Gider</Badge> sekmesinde görünür.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-label text-muted">{label}</span>
      <span
        className={`num text-label font-medium ${
          tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink'
        }`}
      >
        {value}
      </span>
    </div>
  )
}
