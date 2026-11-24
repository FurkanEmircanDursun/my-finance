import { useMemo, useState, type ReactNode } from 'react'
import { CalendarClock, ChevronDown, ChevronRight, Plus, Receipt, Upload } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Empty, Meter, Section, Segmented } from '../ui/primitives'
import { CashFlowChart, CommitmentChart, GoalTrajectoryChart } from '../ui/charts'
import { MoneyValue } from '../ui/MoneyValue'
import { AnimatedProgress, Stagger } from '../ui/motion'
import { GOAL_STATUS_LABEL, type GoalProgress } from '../analytics/goal'
import { sliceForecast, type CashFlowForecast } from '../analytics/forecast'
import { buildUpcomingPayments, type UpcomingPayment } from '../analytics/upcoming'
import { money, count, percent } from '../core/money'
import { monthLabel, fullDayLabel, todayKey } from '../core/date'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'

export function FutureView() {
  const { state, overall } = useStore()
  const { openSettings, openImport, openEntry } = useSheets()
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

  const heading = (
    <header className="dashboard-title">
      <div>
        <h1>Gelecek</h1>
        <p>Yaklaşan ödemeler, açık taksitler, nakit akışı ve hedefler</p>
      </div>
      <button type="button" className="quiet-button" onClick={openSettings}>
        Planı düzenle
      </button>
    </header>
  )

  if (!open.length && !activeRecurring.length && !goal && !hasForecast && !upcoming.length) {
    return (
      <div>
        {heading}
        <Empty
          icon={<CalendarClock size={24} />}
          title="Ödeme planın kayıtlarınla oluşur"
          description="Ekstreni yükle; taksitlerin ve yaklaşan son ödeme tarihlerin burada görünsün. Düzenli ödemeler, yeterli kayıt oluşunca bulunur."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => openImport()}>
                <Upload size={16} /> Ekstre yükle
              </Button>
              <Button onClick={openEntry}>
                <Plus size={16} /> Kayıt ekle
              </Button>
              <Button variant="ghost" onClick={openSettings}>
                Tasarruf hedefi koy
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {heading}

      <Stagger index={0}>
        {upcoming.length > 0 ? (
          <UpcomingSection payments={upcoming} />
        ) : (
          <div className="bento-card">
            <Section title="Yaklaşan ödemeler">
              <p className="max-w-xl text-body text-muted">
                Kayıtlarında önümüzdeki 45 güne ait bir ödeme tarihi bulunamadı. Güncel ekstreni ekleyerek son ödeme tarihini görebilirsin.
              </p>
              <Button size="sm" className="mt-3" onClick={() => openImport()}>
                <Upload size={15} /> Güncel ekstre ekle
              </Button>
            </Section>
          </div>
        )}
      </Stagger>

      <Stagger index={1}>
        <section className="bento-card">
          <span className="text-micro font-semibold uppercase text-faint">Bağlı Ödeme Yükü</span>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="text-title font-semibold text-ink">Kayıtlarına göre ödeme yükün</h2>
            {twelveMonthTotal > 0 && (
              <div className="text-figure font-bold text-ink">
                <MoneyValue value={twelveMonthTotal} decimals={false} />
                <span className="ml-1.5 text-label font-normal text-muted">/ 12 ay</span>
              </div>
            )}
          </div>

          <p className="mt-3 max-w-2xl text-body text-muted">
            {next && next.total > 0 ? (
              <>
                <span className="font-semibold text-ink">{monthLabel(next.month)}</span> için{' '}
                <span className="num font-semibold text-ink">{money(next.total)}</span> bağlı.{' '}
              </>
            ) : (
              'Kayıtlı taksit veya aktif düzenli ödeme görünmüyor. '
            )}
            {heaviest && heaviest.total > 0 && (
              <>
                En yoğun ay <span className="font-semibold text-ink">{monthLabel(heaviest.month)}</span>:{' '}
                <span className="num font-semibold text-ink">{money(heaviest.total)}</span>.{' '}
              </>
            )}
            {[
              open.length > 0 ? `${count(open.length)} açık taksit planı` : null,
              activeRecurring.length > 0 ? `${count(activeRecurring.length)} aktif abonelik` : null,
            ]
              .filter(Boolean)
              .join(', ')}
            {(open.length > 0 || activeRecurring.length > 0) && '.'}
          </p>

          {overall.meta.months.length < 3 && (
            <p className="mt-3 max-w-xl text-label leading-relaxed text-faint">
              Düzenli ödemeleri belirlemek için en az üç aylık kayıt gerekir; şu an{' '}
              {count(overall.meta.months.length)} ay var. Taksitler ilk ekstreden itibaren görünür.
            </p>
          )}

          {income > 0 && next && next.total > 0 && (
            <div className="mt-5 space-y-2 rounded-[var(--radius)] border border-line bg-sunken p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-label font-medium text-muted">
                  {monthLabel(next.month)} yükü, aylık gelirinin{' '}
                  <span className="num font-semibold text-ink">
                    {percent((next.total / income) * 100)}
                  </span>
                  &apos;i
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
      </Stagger>

      {twelveMonthTotal > 0 && (
        <FutureDisclosure
          title="12 aylık ödeme planı"
          description={`${money(twelveMonthTotal)} · kalan taksitler ve aktif düzenli ödemelerin tahmini`}
          defaultOpen
        >
          <CommitmentChart data={commitments} height={225} />
          <p className="mt-3 max-w-xl text-label text-muted">
            Bu plan son kayıtlarından sonraki aydan başlar. Yeni harcamalar, fiyat değişiklikleri ve iptal edilen abonelikler tahmini değiştirir.
          </p>
        </FutureDisclosure>
      )}

      {open.length > 0 && (
        <FutureDisclosure
          title="Açık taksitler"
          description={`${count(open.length)} plan · kalan ${money(open.reduce((s, p) => s + p.remainingAmount, 0))}`}
        >
          <ul className="-mx-2 divide-y divide-line">
            {open.map((plan) => (
              <li key={plan.id} className="px-2 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-body font-medium text-ink">{plan.label}</span>
                  <span className="num shrink-0 text-body font-semibold text-ink">
                    {money(plan.monthlyAmount, { decimals: true })}
                    <span className="ml-1 text-label font-normal text-faint">/ay</span>
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <AnimatedProgress value={plan.paidCount} max={plan.totalCount} tone="accent" height={6} className="flex-1" />
                  <span className="num shrink-0 text-right text-label text-faint">
                    {plan.paidCount}/{plan.totalCount} taksit · son {monthLabel(plan.endMonth, true)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </FutureDisclosure>
      )}

      {hasForecast && (forecast.totalIn > 0 || forecast.hasOpeningBalance) ? (
        <FutureDisclosure
          title="Nakit akışı tahmini"
          description="30, 60 veya 90 gün sonraki olası durum"
        >
          <ForecastSection forecast={forecast} onOpenSettings={openSettings} />
        </FutureDisclosure>
      ) : hasForecast ? (
        <div className="bento-card">
          <Section title="Nakit akışı">
            <button
              type="button"
              onClick={openSettings}
              className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] border border-accent-border bg-accent-soft px-4 py-3 text-left transition-all duration-200 hover:brightness-105"
            >
              <span className="flex-1 text-body text-accent-text">
                Önümüzdeki 30 gün için nakit akışını gösterebilmem için aylık gelirini ya da bugünkü nakdini gir.
              </span>
              <ChevronRight size={18} className="shrink-0 text-accent" />
            </button>
          </Section>
        </div>
      ) : null}

      {goal && <GoalSection goal={goal} />}
    </div>
  )
}

function FutureDisclosure({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string
  description?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultOpen)
  return (
    <details
      className="bento-card group"
      open={defaultOpen}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
        <h2 className="text-title font-semibold text-ink">
          {title}
          {description && (
            <span className="mt-1 block text-label font-normal text-muted">{description}</span>
          )}
        </h2>
        <ChevronDown
          size={18}
          className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      {expanded && <div className="rise-in mt-5 border-t border-line pt-5">{children}</div>}
    </details>
  )
}

function UpcomingSection({ payments }: { payments: UpcomingPayment[] }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? payments : payments.slice(0, 4)
  return (
    <div className="bento-card">
      <Section title="Yaklaşan ödemeler" description="Önümüzdeki 45 gün">
        <ul className="-mx-2 divide-y divide-line">
          {shown.map((payment, index) => (
            <li
              key={`${payment.kind}-${payment.date}-${index}`}
              className="flex min-h-[60px] items-center gap-3.5 px-2 py-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-sunken text-accent-text">
                {payment.kind === 'recurring' ? <CalendarClock size={17} /> : <Receipt size={17} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-body font-medium text-ink">{payment.label}</span>
                  <Badge tone={payment.daysUntil <= 3 ? 'warning' : 'neutral'}>
                    {payment.daysUntil === 1 ? 'yarın' : `${count(payment.daysUntil)} gün`}
                  </Badge>
                </span>
                <span className="mt-0.5 block text-label text-faint">
                  {fullDayLabel(payment.date)}
                  {payment.minimum !== null && ` · asgari ${money(payment.minimum)}`}
                </span>
              </span>
              {payment.amount !== null ? (
                <span className="num shrink-0 text-body font-semibold text-ink">
                  {money(payment.amount, { decimals: payment.kind === 'statement' })}
                </span>
              ) : (
                <span className="shrink-0 text-label text-faint">Tutar bilinmiyor</span>
              )}
            </li>
          ))}
        </ul>
        {payments.length > 4 && (
          <Button
            variant="ghost"
            className="mt-3 w-full"
            onClick={() => setShowAll((value) => !value)}
            aria-expanded={showAll}
          >
            {showAll ? 'İlk 4 ödemeyi göster' : `${count(payments.length)} ödemenin tümünü gör`}
            <ChevronDown size={16} className={clsx('transition-transform duration-200', showAll && 'rotate-180')} />
          </Button>
        )}
      </Section>
    </div>
  )
}

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
  const negative = forecast.hasOpeningBalance ? view.lowestBalance < 0 : view.endBalance < 0

  return (
    <Section
      title="Beklenen bakiye"
      actions={
        <Segmented
          value={horizon}
          onChange={setHorizon}
          options={[
            { value: '30', label: '30 gün' },
            { value: '60', label: '60 gün' },
            { value: '90', label: '90 gün' },
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

      <CashFlowChart points={view.points} height={230} negative={negative} />

      {negative && view.lowestDate && (
        <p className="mt-4 text-body text-negative">
          {fullDayLabel(view.lowestDate)} civarında {money(view.lowestBalance)} seviyesine iniyor.
        </p>
      )}

      {!forecast.hasOpeningBalance && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-4 text-label font-semibold text-accent-text underline-offset-4 hover:underline"
        >
          Sıfır çizgisi bugünü gösterir, bakiyeni değil. Bugünkü nakdini gir →
        </button>
      )}
    </Section>
  )
}

function GoalSection({ goal }: { goal: GoalProgress }) {
  const [showTrajectory, setShowTrajectory] = useState(true)
  const onPace = goal.status === 'ahead' || goal.status === 'reached'
  const g = goal.goal

  return (
    <div className="bento-card">
      <Section
        title="Tasarruf hedefi"
        description={`${money(g.targetAmount)} · ${monthLabel(g.targetMonth)}`}
        actions={<Badge tone={onPace ? 'positive' : 'negative'}>{GOAL_STATUS_LABEL[goal.status]}</Badge>}
      >
        <p className="mb-4 max-w-xl text-body text-muted">
          <span className="num font-semibold text-ink">{money(goal.currentActual)}</span> birikti, gereken{' '}
          <span className="num">{money(goal.requiredAtNow)}</span>.{' '}
          {goal.maxMonthlySpend !== null && (
            <>
              Bu ay en fazla{' '}
              <span className="num font-semibold text-ink">{money(goal.maxMonthlySpend)}</span> harca.
            </>
          )}
        </p>

        <details
          className="group"
          open={showTrajectory}
          onToggle={(event) => setShowTrajectory(event.currentTarget.open)}
        >
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-label font-semibold text-accent-text">
            Hedefin gidişatını gör
            <ChevronDown size={15} className="transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
          </summary>
          {showTrajectory && (
            <div className="mt-3">
              <GoalTrajectoryChart points={goal.points} height={225} onPace={onPace} />
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
            </div>
          )}
        </details>
      </Section>
    </div>
  )
}
