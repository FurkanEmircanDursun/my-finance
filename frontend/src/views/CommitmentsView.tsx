import { useState } from 'react'
import { Badge, Empty, Grid, Meter, Section, Segmented, Stat } from '../ui/primitives'
import { CashFlowChart, CommitmentChart, GoalTrajectoryChart } from '../ui/charts'
import { GOAL_STATUS_LABEL, type GoalProgress } from '../analytics/goal'
import { sliceForecast, type CashFlowForecast } from '../analytics/forecast'
import { money, count, percent } from '../core/money'
import { monthLabel, fullDayLabel } from '../core/date'
import { categoryLabel } from '../domain/categories'
import type { Analysis } from '../analytics/types'
import type { Money } from '../core/money'
import type { Profile } from '../domain/types'

export function CommitmentsView({ analysis, profile }: { analysis: Analysis; profile: Profile }) {
  const { installments, commitments, recurring, goal, forecast } = analysis

  const open = installments.filter((plan) => plan.remainingCount > 0)
  const remainingTotal = open.reduce((s, p) => s + p.remainingAmount, 0)
  const activeRecurring = recurring.filter((r) => r.status === 'active')
  const recurringMonthly = activeRecurring.reduce((s, r) => s + r.monthlyEquivalent, 0)

  const next = commitments[0]
  const twelveMonthTotal = commitments.reduce((s, m) => s + m.total, 0)
  const income = profile.monthlyIncome
  const hasForecast = forecast.totalIn > 0 || forecast.totalOut > 0

  if (!open.length && !activeRecurring.length && !goal && !hasForecast) {
    return (
      <Empty
        title="Bağlı bir ödeme yok"
        description="Açık taksit planı, aktif düzenli ödeme veya tasarruf hedefi bulunamadı. Ayarlar'dan bir hedef koyabilirsiniz."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-2xs text-faint">Tüm işlem geçmişiniz taranır; bu sekme bir döneme daraltılamaz.</p>

      {hasForecast && <ForecastSection forecast={forecast} />}

      {goal && <GoalSection goal={goal} monthlyIncome={income} />}

      <Grid className="sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Gelecek ay bağlı"
          value={money(next?.total ?? 0)}
          hint={next ? monthLabel(next.month) : undefined}
          tone={income > 0 && (next?.total ?? 0) > income * 0.4 ? 'negative' : 'neutral'}
        />
        <Stat
          label="Kalan taksit borcu"
          value={money(remainingTotal)}
          hint={`${count(open.length)} açık plan`}
        />
        <Stat
          label="Düzenli ödeme yükü"
          value={money(recurringMonthly)}
          hint={`${count(activeRecurring.length)} aktif ödeme`}
        />
        <Stat
          label="12 aylık toplam"
          value={money(twelveMonthTotal)}
          hint="Mevcut planlar ve abonelikler sürerse"
        />
      </Grid>

      {income > 0 && next && (
        <Section title="Gelire oranla bağlı tutar" description={`Aylık gelir ${money(income)}`}>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="num text-2xl font-semibold text-ink">
                {percent((next.total / income) * 100)}
              </span>
              <span className="text-2xs text-muted">
                {money(next.total)} / {money(income)}
              </span>
            </div>
            <Meter
              value={next.total}
              max={income}
              tone={next.total > income * 0.4 ? 'negative' : next.total > income * 0.25 ? 'warning' : 'positive'}
            />
            <p className="text-2xs text-muted">
              %25 altı rahat, %40 üstü kırılgan kabul edilir. Kalan{' '}
              <span className="num font-medium text-ink">{money(income - next.total)}</span> serbest harcama
              ve tasarruf için kalır.
            </p>
          </div>
        </Section>
      )}

      <Section
        title="12 aylık yükümlülük merdiveni"
        description="Bugünden sonra yeni harcama yapılmasa bile ödenecek tutarlar"
      >
        <CommitmentChart data={commitments} height={210} />
      </Section>

      {open.length > 0 && (
        <Section title="Açık taksit planları" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line text-2xs text-faint">
                  <th className="px-4 py-2.5 font-medium">Plan</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Kategori</th>
                  <th className="px-4 py-2.5 text-right font-medium">Aylık</th>
                  <th className="px-4 py-2.5 font-medium">İlerleme</th>
                  <th className="px-4 py-2.5 text-right font-medium">Kalan</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">Bitiş</th>
                </tr>
              </thead>
              <tbody>
                {open.map((plan) => (
                  <tr key={plan.id} className="border-b border-line last:border-b-0 hover:bg-hover">
                    <td className="max-w-[200px] px-4 py-2.5">
                      <p className="truncate text-2xs font-medium text-ink">{plan.label}</p>
                      <p className="text-2xs text-faint">
                        {plan.bank}
                        {plan.principal ? ` · ana tutar ${money(plan.principal)}` : ''}
                      </p>
                    </td>
                    <td className="hidden px-4 py-2.5 md:table-cell">
                      <Badge>{categoryLabel(plan.category)}</Badge>
                    </td>
                    <td className="num px-4 py-2.5 text-right text-2xs font-medium text-ink">
                      {money(plan.monthlyAmount, { decimals: true })}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Meter value={plan.paidCount} max={plan.totalCount} className="w-20" />
                        <span className="num text-2xs text-muted">
                          {plan.paidCount}/{plan.totalCount}
                        </span>
                      </div>
                    </td>
                    <td className="num px-4 py-2.5 text-right text-2xs font-medium text-ink">
                      {money(plan.remainingAmount)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right text-2xs text-faint lg:table-cell">
                      {monthLabel(plan.endMonth, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="Ay ay yükümlülük" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-2xs text-faint">
                <th className="px-4 py-2.5 font-medium">Dönem</th>
                <th className="px-4 py-2.5 text-right font-medium">Taksit</th>
                <th className="px-4 py-2.5 text-right font-medium">Düzenli ödeme</th>
                <th className="px-4 py-2.5 text-right font-medium">Toplam</th>
                {income > 0 && <th className="px-4 py-2.5 text-right font-medium">Gelir payı</th>}
              </tr>
            </thead>
            <tbody>
              {commitments.map((month) => (
                <tr key={month.month} className="border-b border-line last:border-b-0 hover:bg-hover">
                  <td className="px-4 py-2.5 text-2xs text-ink">{monthLabel(month.month)}</td>
                  <td className="num px-4 py-2.5 text-right text-2xs text-muted">
                    {month.installments ? money(month.installments) : '—'}
                  </td>
                  <td className="num px-4 py-2.5 text-right text-2xs text-muted">
                    {month.recurring ? money(month.recurring) : '—'}
                  </td>
                  <td className="num px-4 py-2.5 text-right text-2xs font-medium text-ink">
                    {money(month.total)}
                  </td>
                  {income > 0 && (
                    <td className="num px-4 py-2.5 text-right text-2xs text-muted">
                      {percent((month.total / income) * 100)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

type Horizon = '30' | '60' | '90'

function ForecastSection({ forecast }: { forecast: CashFlowForecast }) {
  const [horizon, setHorizon] = useState<Horizon>('30')
  const view = sliceForecast(forecast, Number(horizon))
  // With a real balance on file, dropping below zero means running out of
  // money. Without one the line starts at zero and dips before every payday,
  // so only ending the window down — spending more than comes in — is a
  // problem worth colouring red.
  const negative = forecast.hasOpeningBalance ? view.lowestBalance < 0 : view.endBalance < 0

  return (
    <Section
      title="Nakit akışı tahmini"
      description={
        forecast.hasOpeningBalance
          ? `Bugünkü ${money(forecast.openingBalance)} bakiyeden başlayarak, bilinen ödemeler ve alışılmış harcama hızıyla`
          : 'Bugüne göre: bilinen ödemeler ve alışılmış harcama hızıyla paranın ne kadar artıp azalacağı'
      }
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
      <div className="space-y-4">
        <Grid className="sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Beklenen gelir" value={money(view.totalIn)} tone="positive" />
          <Stat label="Beklenen gider" value={money(view.totalOut)} />
          <Stat
            label={forecast.hasOpeningBalance ? `${horizon}. gün bakiye` : `${horizon}. gün net`}
            value={money(view.endBalance, { sign: !forecast.hasOpeningBalance })}
            hint={forecast.hasOpeningBalance ? `Bugün ${money(forecast.openingBalance)}` : 'Bugüne göre fark'}
            tone={view.endBalance >= 0 ? 'positive' : 'negative'}
          />
          <Stat
            label="En düşük nokta"
            value={money(view.lowestBalance, { sign: !forecast.hasOpeningBalance })}
            hint={view.lowestDate ? fullDayLabel(view.lowestDate) : 'Bugünün altına inmiyor'}
            tone={negative ? 'negative' : 'neutral'}
          />
        </Grid>

        <CashFlowChart points={view.points} height={220} negative={negative} />

        {negative && view.lowestDate && (
          <p className="text-2xs leading-relaxed text-negative">
            {fullDayLabel(view.lowestDate)} civarında bakiye {money(view.lowestBalance)} seviyesine iniyor —
            bu tarihten önce planlanmamış büyük bir harcama sıkıntı yaratabilir.
          </p>
        )}
        {!forecast.hasOpeningBalance && (
          <p className="text-2xs leading-relaxed text-muted">
            Sıfır çizgisi bugünü gösterir, banka bakiyenizi değil. Maaşla yaşayan herkes maaş gününden önce
            bu çizginin altına iner; bu normaldir. Gerçek bakiye üzerinden görmek için Ayarlar'dan{' '}
            <span className="font-medium text-ink">bugünkü nakit</span> tutarını girin.
          </p>
        )}
        <p className="text-2xs text-faint">
          {forecast.dailyDiscretionary > 0
            ? `Tespit edilen düzenli ödeme ve taksitlerin üzerine günlük ${money(forecast.dailyDiscretionary)} alışılmış harcama eklendi.`
            : 'Yalnızca bilinen taksit ve düzenli ödemelere göre hesaplandı.'}{' '}
          Düzenli maaş tespit edilemediyse Ayarlar'daki aylık gelir her ayın 1'ine yerleştirilerek
          varsayılır.
        </p>
      </div>
    </Section>
  )
}

const STATUS_TONE = {
  'not-started': 'neutral',
  ahead: 'positive',
  behind: 'negative',
  reached: 'positive',
  ended: 'negative',
} as const

function GoalSection({ goal, monthlyIncome }: { goal: GoalProgress; monthlyIncome: Money }) {
  const onPace = goal.status === 'ahead' || goal.status === 'reached'
  const g = goal.goal

  return (
    <Section
      title="Tasarruf hedefi"
      description={`${money(g.targetAmount)} · hedef ayı ${monthLabel(g.targetMonth)}`}
    >
      <div className="space-y-4">
        <Grid className="sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Durum"
            value={GOAL_STATUS_LABEL[goal.status]}
            tone={STATUS_TONE[goal.status]}
            hint={
              goal.status === 'ahead' || goal.status === 'behind'
                ? `Gereken tempoya göre ${money(goal.delta, { sign: true })}`
                : goal.status === 'not-started'
                  ? `${monthLabel(g.startMonth)} itibarıyla başlar`
                  : undefined
            }
          />
          <Stat
            label="Şu ana kadar biriken"
            value={money(goal.currentActual)}
            hint={`Gereken ${money(goal.requiredAtNow)}`}
          />
          <Stat
            label="Kalan"
            value={money(goal.remainingAmount)}
            hint={goal.monthsRemaining > 0 ? `${count(goal.monthsRemaining)} ay kaldı` : 'Hedef ayı bu ay'}
          />
          <Stat
            label="Bu ay en fazla harcama"
            value={goal.maxMonthlySpend !== null ? money(goal.maxMonthlySpend) : '—'}
            hint={
              goal.maxMonthlySpend !== null
                ? `Aylık ${money(goal.requiredMonthlyPaceFromNow ?? 0)} biriktirmeye göre`
                : monthlyIncome > 0
                  ? 'Hedef ayı geçti'
                  : 'Ayarlar\'dan aylık gelir girin'
            }
            tone={goal.maxMonthlySpend !== null ? 'neutral' : undefined}
          />
        </Grid>

        <div>
          <GoalTrajectoryChart points={goal.points} height={220} onPace={onPace} />
          <div className="mt-2 flex flex-wrap items-center gap-4 text-2xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--text-faint)' }} />
              Gereken tempo
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{ background: onPace ? 'var(--positive)' : 'var(--negative)' }}
              />
              Gerçekleşen birikim
            </span>
          </div>
        </div>

        {goal.projectedFinalAmount !== null && goal.status !== 'reached' && goal.status !== 'ended' && (
          <p className="text-2xs leading-relaxed text-muted">
            Son {count(goal.monthsElapsed)} ayın ortalama temposuyla ({money(goal.averageMonthlyPaceSoFar ?? 0)}/ay)
            devam ederseniz {monthLabel(g.targetMonth)} sonunda yaklaşık{' '}
            <span className="num font-medium text-ink">{money(goal.projectedFinalAmount)}</span> birikmiş olur.
          </p>
        )}
      </div>
    </Section>
  )
}
