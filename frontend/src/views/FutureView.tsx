import { useMemo, useState } from 'react'
import { CalendarClock, ChevronRight, Receipt } from 'lucide-react'
import { clsx } from 'clsx'
import { Button, Empty, Meter, Section, Segmented } from '../ui/primitives'
import { CashFlowChart, CommitmentChart, GoalTrajectoryChart } from '../ui/charts'
import { GOAL_STATUS_LABEL, type GoalProgress } from '../analytics/goal'
import { sliceForecast, type CashFlowForecast } from '../analytics/forecast'
import { buildUpcomingPayments, type UpcomingPayment } from '../analytics/upcoming'
import { money, count, percent } from '../core/money'
import { monthLabel, fullDayLabel, todayKey } from '../core/date'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'

/**
 * What is already owed.
 *
 * Always reads the whole account rather than the selected period: an
 * instalment plan and a subscription are not facts about August, and filtering
 * them to one month would starve the detection of the occurrences it needs.
 *
 * The page opens with a sentence rather than a row of four tiles. "₺52.400
 * bağlı, en yoğun ay Kasım" is the thing someone came here to learn; the tiles
 * made them assemble it themselves out of four numbers with equal weight.
 */
export function FutureView() {
  const { state, overall } = useStore()
  const { openSettings } = useSheets()
  const { installments, commitments, recurring, goal, forecast } = overall

  const upcoming = useMemo(
    () => buildUpcomingPayments(recurring, state.statements, todayKey()),
    [recurring, state.statements],
  )

  const open = installments.filter((plan) => plan.remainingCount > 0)
  const activeRecurring = recurring.filter((r) => r.status === 'active')
  const income = state.profile.monthlyIncome
  const hasForecast = forecast.totalIn > 0 || forecast.totalOut > 0

  const next = commitments[0]
  const twelveMonthTotal = commitments.reduce((s, m) => s + m.total, 0)
  const heaviest = commitments.reduce(
    (max, m) => (m.total > (max?.total ?? 0) ? m : max),
    commitments[0] as (typeof commitments)[number] | undefined,
  )

  if (!open.length && !activeRecurring.length && !goal && !hasForecast && !upcoming.length) {
    return (
      <Empty
        title="Bağlı bir ödeme yok"
        action={
          <Button onClick={openSettings}>Tasarruf hedefi koy</Button>
        }
      />
    )
  }

  return (
    <div className="space-y-10">
      {/* ── The sentence ─────────────────────────────────────────────────── */}
      <section>
        <span className="num text-hero font-semibold text-ink">{money(twelveMonthTotal)}</span>
        <p className="mt-4 max-w-xl text-body text-muted">
          Önümüzdeki 12 ayda bağlı olan tutar. {heaviest && heaviest.total > 0 && (
            <>
              En yoğun ay <span className="font-semibold text-ink">{monthLabel(heaviest.month)}</span>:{' '}
              <span className="font-semibold text-ink">{money(heaviest.total)}</span>.{' '}
            </>
          )}
          {/* Built as a list so a missing half never leaves a dangling comma or
              a sentence that stops mid-breath. */}
          {[
            open.length > 0 ? `${count(open.length)} açık taksit planı` : null,
            activeRecurring.length > 0 ? `${count(activeRecurring.length)} aktif abonelik` : null,
          ]
            .filter(Boolean)
            .join(', ')}
          {(open.length > 0 || activeRecurring.length > 0) && '.'}
        </p>

        {/* A pattern needs repetitions. With fewer than three months on file the
            page cannot find subscriptions or bills, and an empty list would read
            as "you have none" rather than "I have not seen enough yet". */}
        {overall.meta.months.length < 3 && (
          <p className="mt-3 max-w-xl text-label leading-relaxed text-faint">
            Abonelik ve faturaları fark edebilmem için en az üç aylık ekstre gerekir; şimdilik{' '}
            {count(overall.meta.months.length)} ay var. Taksitler ise ilk ekstreden itibaren görünür.
          </p>
        )}

        {income > 0 && next && next.total > 0 && (
          <div className="mt-6 space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-body text-muted">
                Gelecek ay gelirinin{' '}
                <span className="num font-semibold text-ink">{percent((next.total / income) * 100)}</span>
                {"'i"} şimdiden bağlı
              </span>
              <span className="num text-label text-faint">
                {money(next.total)} / {money(income)}
              </span>
            </div>
            <Meter
              value={next.total}
              max={income}
              tone={next.total > income * 0.4 ? 'negative' : next.total > income * 0.25 ? 'warning' : 'positive'}
            />
          </div>
        )}
      </section>

      {/* ── The ladder ───────────────────────────────────────────────────── */}
      <Section title="12 ay" description="Bugünden sonra hiç harcama yapılmasa bile ödenecek">
        <CommitmentChart data={commitments} height={210} />
      </Section>

      {/* ── What lands next ──────────────────────────────────────────────── */}
      {upcoming.length > 0 && <UpcomingSection payments={upcoming} />}

      {/* ── Instalments ──────────────────────────────────────────────────── */}
      {open.length > 0 && (
        <Section title="Taksitler" description={`Kalan ${money(open.reduce((s, p) => s + p.remainingAmount, 0))}`}>
          <ul className="-mx-2">
            {open.map((plan) => (
              <li key={plan.id} className="px-2 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-body text-ink">{plan.label}</span>
                  <span className="num shrink-0 text-body font-semibold text-ink">
                    {money(plan.monthlyAmount, { decimals: true })}
                    <span className="ml-1 text-label font-normal text-faint">/ay</span>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <Meter value={plan.paidCount} max={plan.totalCount} className="flex-1" />
                  {/* "2/3" alone reads as a fraction of something; the last month
                      is the date people actually plan around. */}
                  <span className="num w-40 shrink-0 text-right text-label text-faint">
                    {plan.paidCount}/{plan.totalCount} taksit · son {monthLabel(plan.endMonth, true)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Forecast ─────────────────────────────────────────────────────── */}
      {/* Without a known inflow the line is only the outflow running down from
          zero — a red chart that says "you will spend ₺41.000" and nothing else,
          which is a statement about the average, not a forecast. It waits for an
          income or a balance. */}
      {hasForecast && (forecast.totalIn > 0 || forecast.hasOpeningBalance) ? (
        <ForecastSection forecast={forecast} onOpenSettings={openSettings} />
      ) : hasForecast ? (
        <Section title="Nakit akışı">
          <button
            type="button"
            onClick={openSettings}
            className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius-lg)] bg-accent-soft px-4 py-3 text-left transition-colors duration-200 hover:brightness-95"
          >
            <span className="flex-1 text-body text-accent-text">
              Önümüzdeki 30 gün için nakit akışını gösterebilmem için aylık gelirini ya da bugünkü nakdini gir.
            </span>
            <ChevronRight size={18} className="shrink-0 text-accent" />
          </button>
        </Section>
      ) : null}

      {/* ── Goal ─────────────────────────────────────────────────────────── */}
      {goal && <GoalSection goal={goal} />}
    </div>
  )
}

/* ── Upcoming ────────────────────────────────────────────────────────────── */

function UpcomingSection({ payments }: { payments: UpcomingPayment[] }) {
  return (
    <Section title="Yaklaşan ödemeler" description="Önümüzdeki 45 gün">
      <ul className="-mx-2">
        {payments.map((payment, index) => (
          <li
            key={`${payment.kind}-${payment.date}-${index}`}
            className="flex min-h-[56px] items-center gap-3 px-2 py-2.5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken text-faint">
              {payment.kind === 'recurring' ? <CalendarClock size={16} /> : <Receipt size={16} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body text-ink">{payment.label}</span>
              <span className="mt-0.5 block text-label text-faint">
                {fullDayLabel(payment.date)} ·{' '}
                {payment.daysUntil === 1 ? 'yarın' : `${count(payment.daysUntil)} gün kaldı`}
                {payment.minimum !== null && ` · asgari ${money(payment.minimum)}`}
              </span>
            </span>
            {payment.amount !== null && (
              <span className="num shrink-0 text-body font-semibold text-ink">
                {money(payment.amount, { decimals: payment.kind === 'statement' })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* ── Cash-flow forecast ──────────────────────────────────────────────────── */

type Horizon = '30' | '60' | '90'

function ForecastSection({
  forecast,
  onOpenSettings,
}: {
  forecast: CashFlowForecast
  onOpenSettings: () => void
}) {
  const [horizon, setHorizon] = useState<Horizon>('30')
  const view = sliceForecast(forecast, Number(horizon))
  // With a real balance on file, dropping below zero means running out of
  // money. Without one the line starts at zero and dips before every payday,
  // so only ending the window down — spending more than comes in — is a
  // problem worth colouring red.
  const negative = forecast.hasOpeningBalance ? view.lowestBalance < 0 : view.endBalance < 0

  return (
    <Section
      title="Nakit akışı"
      actions={
        <Segmented
          value={horizon}
          onChange={setHorizon}
          options={[
            { value: '30', label: '30' },
            { value: '60', label: '60' },
            { value: '90', label: '90' },
          ]}
        />
      }
    >
      <p className="mb-4 max-w-xl text-body text-muted">
        {horizon} gün sonunda{' '}
        <span className={clsx('num font-semibold', view.endBalance >= 0 ? 'text-positive' : 'text-negative')}>
          {money(view.endBalance, { sign: !forecast.hasOpeningBalance })}
        </span>
        {forecast.hasOpeningBalance ? ' kalır' : ' fark oluşur'}. Beklenen gelir {money(view.totalIn)}, gider{' '}
        {money(view.totalOut)}.
      </p>

      <CashFlowChart points={view.points} height={220} negative={negative} />

      {negative && view.lowestDate && (
        <p className="mt-4 text-body text-negative">
          {fullDayLabel(view.lowestDate)} civarında {money(view.lowestBalance)} seviyesine iniyor.
        </p>
      )}

      {!forecast.hasOpeningBalance && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-4 text-body text-accent underline-offset-4 hover:underline"
        >
          Sıfır çizgisi bugünü gösterir, bakiyeni değil. Bugünkü nakdini gir.
        </button>
      )}
    </Section>
  )
}

/* ── Savings goal ────────────────────────────────────────────────────────── */

function GoalSection({ goal }: { goal: GoalProgress }) {
  const onPace = goal.status === 'ahead' || goal.status === 'reached'
  const g = goal.goal

  return (
    <Section title="Tasarruf hedefi" description={`${money(g.targetAmount)} · ${monthLabel(g.targetMonth)}`}>
      <p className="mb-4 max-w-xl text-body text-muted">
        <span className={clsx('font-semibold', onPace ? 'text-positive' : 'text-negative')}>
          {GOAL_STATUS_LABEL[goal.status]}.
        </span>{' '}
        {money(goal.currentActual)} birikti, gereken {money(goal.requiredAtNow)}.{' '}
        {goal.maxMonthlySpend !== null && (
          <>
            Bu ay en fazla{' '}
            <span className="num font-semibold text-ink">{money(goal.maxMonthlySpend)}</span> harca.
          </>
        )}
      </p>

      <GoalTrajectoryChart points={goal.points} height={220} onPace={onPace} />

      <div className="mt-3 flex flex-wrap items-center gap-5 text-label text-muted">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--text-faint)' }} />
          Gereken tempo
        </span>
        <span className="flex items-center gap-2">
          <span
            className="h-0.5 w-4 rounded-full"
            style={{ background: onPace ? 'var(--positive)' : 'var(--negative)' }}
          />
          Gerçekleşen
        </span>
      </div>
    </Section>
  )
}
