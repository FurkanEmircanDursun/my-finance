import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Empty, Meter, Section } from '../ui/primitives'
import { MonthlyFlowChart } from '../ui/charts'
import { TrendPill } from '../ui/finance'
import { money, count, percent, signedPercent } from '../core/money'
import { monthLabel } from '../core/date'
import { categoryLabel } from '../domain/categories'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'
import type { RecurringPayment } from '../analytics/types'

/**
 * Where the money went — the detail page, and the only one.
 *
 * Three screens folded into this one. Cash flow and categories were separate
 * tabs, which forced the reader to hold one page in their head while looking at
 * the other; the monthly total and the category that caused it belong side by
 * side. "Düzenli ödemeler" was a third tab holding a single table that only
 * makes sense next to the categories it explains.
 *
 * Gone with them: the donut (a second drawing of the bar list beside it, and
 * worse at comparing shares), the six-column category table (four of those
 * columns answered questions nobody had), the merchant sort control (total is
 * the answer), and two long methodology essays that explained the algorithm to
 * people who wanted to know what they spent on food.
 */
export function SpendingView() {
  const { state, analysis, overall } = useStore()
  const { openBudgets, openTransactions } = useSheets()
  const [detail, setDetail] = useState(false)

  const { totals, categories, merchants, monthly, trend, habits, meta, budgets } = analysis
  const limit = state.profile.spendingLimit
  const latest = monthly[monthly.length - 1]

  if (!meta.transactionCount) {
    return <Empty title="Bu dönemde işlem yok" description="Üstteki dönem seçiminden başka bir ay seç." />
  }

  return (
    <div className="space-y-10">
      {/* ── Two figures, and the rest folded away ────────────────────────── */}
      <section>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="surface p-5">
            <div className="num text-figure font-semibold text-ink">{money(totals.netSpend)}</div>
            <div className="mt-2 text-body text-muted">Net harcama</div>
          </div>
          <div className="surface p-5">
            <div
              className={clsx(
                'num text-figure font-semibold',
                totals.savings >= 0 ? 'text-positive' : 'text-negative',
              )}
            >
              {money(totals.savings, { sign: true })}
            </div>
            <div className="mt-2 text-body text-muted">Kalan</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDetail((v) => !v)}
          aria-expanded={detail}
          className="-ml-2 mt-3 flex h-11 items-center gap-1.5 rounded-[var(--radius)] px-2 text-body text-muted transition-colors duration-200 hover:bg-hover hover:text-ink"
        >
          Detay
          <ChevronDown size={16} className={clsx('transition-transform duration-200', detail && 'rotate-180')} />
        </button>

        {detail && (
          <dl className="rise-in mt-1 space-y-1">
            <DetailRow
              label="Gelir"
              value={money(totals.incomeBasis)}
              note={
                totals.incomeAssumed ? 'ayarlardaki aylık gelirden'
                : totals.income > 0 ? 'ekstredeki gelir satırları'
                : 'girilmedi'
              }
            />
            <DetailRow label="Brüt harcama" value={money(totals.spend)} note={`${count(meta.spendCount)} işlem`} />
            <DetailRow label="İadeler" value={money(totals.refunds)} />
            <DetailRow label="Kart borcu ödemesi" value={money(totals.payments)} note="harcama değil" />
          </dl>
        )}
      </section>

      {/* ── Month by month ───────────────────────────────────────────────── */}
      <Section
        title="Ay ay"
        description="Soluk sütunlar kısmi dönemler"
        actions={<TrendPill value={trend.momPct} suffix="son iki tam ay" />}
      >
        <MonthlyFlowChart data={monthly} height={200} showIncome />

        {limit > 0 && latest && (
          <div className="mt-5 space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-label text-muted">{monthLabel(latest.month)} · aylık limit</span>
              <span className="num text-label text-muted">
                {money(latest.spend)} / {money(limit)}
              </span>
            </div>
            <Meter
              value={latest.spend}
              max={limit}
              tone={latest.spend > limit ? 'negative' : latest.spend > limit * 0.85 ? 'warning' : 'positive'}
            />
          </div>
        )}
      </Section>

      {/* ── Categories ───────────────────────────────────────────────────── */}
      <Section
        title="Kategoriler"
        actions={
          <Button size="sm" variant="ghost" onClick={openBudgets}>
            Limitler
          </Button>
        }
      >
        <ul className="-mx-2">
          {categories.map((stat) => {
            const budget = budgets.items.find((b) => b.category === stat.id)
            return (
              <li key={stat.id}>
                <button
                  type="button"
                  onClick={() => openTransactions({ category: stat.id })}
                  className="w-full rounded-[var(--radius)] px-2 py-3 text-left transition-colors duration-200 hover:bg-hover"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: stat.color }}
                        aria-hidden
                      />
                      <span className="truncate text-body text-ink">{stat.label}</span>
                      {budget && budget.status !== 'ok' && (
                        <Badge tone={budget.status === 'over' ? 'negative' : 'warning'}>
                          {budget.status === 'over' ? 'Aşıldı' : 'Yaklaşıyor'}
                        </Badge>
                      )}
                    </span>
                    <span className="num shrink-0 text-body font-semibold text-ink">{money(stat.total)}</span>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    {/* A category with a ceiling is measured against its ceiling;
                        one without is measured against the biggest category.
                        Same bar, two honest meanings. */}
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (stat.total / (budget?.limit || categories[0]?.total || 1)) * 100)}%`,
                          background:
                            budget?.status === 'over' ? 'var(--negative)'
                            : budget?.status === 'warning' ? 'var(--warning)'
                            : stat.color,
                        }}
                      />
                    </div>
                    <span className="num w-24 shrink-0 text-right text-label text-faint">
                      {budget ? `/ ${money(budget.limit)}` : `${percent(stat.share * 100)} · ${count(stat.count)}`}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </Section>

      {/* ── Subscriptions ────────────────────────────────────────────────── */}
      {/* Read from `overall`, never the selected period: recurring detection
          needs the whole history to see a rhythm at all. */}
      <RecurringSection
        items={overall.recurring}
        onOpen={(item) => openTransactions({ merchant: item.merchant, title: item.label, overall: true })}
      />

      {/* ── Merchants ────────────────────────────────────────────────────── */}
      <Section title="En çok harcadığın yerler">
        <ul className="-mx-2">
          {merchants.slice(0, 8).map((merchant) => (
            <li key={merchant.merchant}>
              <button
                type="button"
                onClick={() => openTransactions({ merchant: merchant.merchant, title: merchant.label })}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2 py-2.5 text-left transition-colors duration-200 hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-ink">{merchant.label}</span>
                  <span className="mt-0.5 block text-label text-faint">
                    {categoryLabel(merchant.category)} · {count(merchant.count)} işlem
                  </span>
                </span>
                <span className="num shrink-0 text-body font-semibold text-ink">{money(merchant.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Small but frequent ───────────────────────────────────────────── */}
      {habits.length > 0 && (
        <Section title="Küçük ama sık" description="Tek tek küçük, yıllık toplamı büyük">
          <ul className="-mx-2">
            {habits.slice(0, 5).map((habit) => (
              <li key={habit.merchant}>
                <button
                  type="button"
                  onClick={() => openTransactions({ merchant: habit.merchant, title: habit.label })}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2 py-2.5 text-left transition-colors duration-200 hover:bg-hover"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">{habit.label}</span>
                    <span className="mt-0.5 block text-label text-faint">
                      ayda {habit.perMonth} kez · {money(habit.medianAmount)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-body font-semibold text-ink">
                    {money(habit.annualProjection)}
                    <span className="ml-1 text-label font-normal text-faint">/yıl</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Movers ───────────────────────────────────────────────────────── */}
      {trend.movers.length > 0 && (
        <Section title="Geçen aya göre">
          <ul className="-mx-2">
            {trend.movers.slice(0, 6).map((mover) => (
              <li key={mover.id} className="flex min-h-[44px] items-center gap-3 px-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: mover.color }} />
                <span className="min-w-0 flex-1 truncate text-body text-ink">{mover.label}</span>
                <span className="num shrink-0 text-body text-muted">{money(mover.delta, { sign: true })}</span>
                <span className="w-16 shrink-0 text-right">
                  <TrendPill value={mover.deltaPct} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function DetailRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex min-h-[36px] items-baseline justify-between gap-3 px-2">
      <dt className="text-body text-muted">
        {label}
        {note && <span className="ml-2 text-label text-faint">{note}</span>}
      </dt>
      <dd className="num text-body text-ink">{value}</dd>
    </div>
  )
}

function RecurringSection({
  items,
  onOpen,
}: {
  items: RecurringPayment[]
  onOpen: (item: RecurringPayment) => void
}) {
  const [showLapsed, setShowLapsed] = useState(false)

  const active = items.filter((r) => r.status === 'active')
  const lapsed = items.filter((r) => r.status === 'lapsed')
  const rows = showLapsed ? [...active, ...lapsed] : active

  if (!items.length) return null

  const monthly = active.reduce((s, r) => s + r.monthlyEquivalent, 0)

  return (
    <Section
      title="Düzenli ödemeler"
      description={`Ayda ${money(monthly)} · yılda ${money(active.reduce((s, r) => s + r.annualCost, 0))}`}
      actions={
        lapsed.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowLapsed((v) => !v)}>
            {showLapsed ? 'Durmuşları gizle' : `Durmuş (${lapsed.length})`}
          </Button>
        )
      }
    >
      <ul className="-mx-2">
        {rows.map((item) => {
          const rise = item.priceChangePct !== null && item.priceChangePct >= 10
          return (
            <li key={item.merchant}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2 py-2.5 text-left transition-colors duration-200 hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-body text-ink">{item.label}</span>
                    {item.status === 'lapsed' && <Badge tone="warning">Durmuş</Badge>}
                    {rise && <Badge tone="negative">{signedPercent(item.priceChangePct!)}</Badge>}
                  </span>
                  <span className="mt-0.5 block text-label text-faint">
                    {item.cadenceLabel} · yılda {money(item.annualCost)}
                  </span>
                </span>
                <span className="num shrink-0 text-body font-semibold text-ink">
                  {money(item.lastAmount, { decimals: true })}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
