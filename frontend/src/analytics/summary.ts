import { money, percent, count } from '../core/money'
import { fullDayLabel, monthLabel } from '../core/date'
import { GOAL_STATUS_LABEL } from './goal'
import { sliceForecast } from './forecast'
import type { Analysis } from './types'
import type { Profile } from '../domain/types'

/**
 * The whole analysis compressed into something a person can paste into a note,
 * a message, or a spreadsheet — the fastest way to get an answer out of the app
 * without screenshotting five panels.
 *
 * It is deliberately plain text rather than a rendered report: it survives
 * being pasted anywhere, and it states the assumptions (assumed income,
 * covered days) next to the figures that depend on them, so a number never
 * travels without the caveat that qualifies it.
 */
export function buildSummary(
  analysis: Analysis,
  overall: Analysis,
  profile: Profile,
  periodLabel: string,
): string {
  const { meta, totals, categories, trend, health, natures } = analysis
  const lines: string[] = []

  const monthlyAverage = Math.round(totals.netSpend / Math.max(meta.monthsEquivalent, 1))
  const assumedMonths = analysis.monthly.filter((m) => m.covered && m.incomeAssumed)

  lines.push(`MY FINANCE — ${periodLabel.toUpperCase()}`)
  if (meta.from && meta.to) {
    lines.push(`${fullDayLabel(meta.from)} — ${fullDayLabel(meta.to)} · ${count(meta.coveredDays || meta.days)} günlük veri`)
  }
  lines.push('')

  // ── Headline ────────────────────────────────────────────────────────────────
  lines.push('HARCAMA')
  lines.push(`  Net harcama       ${money(totals.netSpend)}`)
  lines.push(`  Aylık ortalama    ${money(monthlyAverage)}`)
  lines.push(`  Günlük ortalama   ${money(trend.averageDailySpend)}`)
  lines.push(`  İşlem sayısı      ${count(meta.spendCount)}`)
  if (totals.refunds > 0) lines.push(`  İadeler           ${money(totals.refunds)}`)
  if (trend.momPct !== null) {
    lines.push(`  Önceki döneme     ${trend.momPct > 0 ? '+' : ''}${trend.momPct}%`)
  }
  lines.push('')

  // ── Income and savings ──────────────────────────────────────────────────────
  if (profile.monthlyIncome > 0) {
    const rate = (profile.monthlyIncome - monthlyAverage) / profile.monthlyIncome
    lines.push('GELİR VE TASARRUF')
    lines.push(`  Aylık gelir       ${money(profile.monthlyIncome)}`)
    lines.push(`  Aylık tasarruf    ${money(profile.monthlyIncome - monthlyAverage)} (${percent(rate * 100)})`)
    if (assumedMonths.length > 0) {
      lines.push(`  Not: ${count(assumedMonths.length)} ayda ekstrede gelir satırı yok, profildeki aylık gelir varsayıldı.`)
    }
    lines.push('')
  }

  // ── Where it went ───────────────────────────────────────────────────────────
  if (categories.length > 0) {
    lines.push('NEREYE GİTTİ')
    for (const category of categories.slice(0, 8)) {
      const name = category.label.padEnd(20, ' ').slice(0, 20)
      lines.push(`  ${name} ${money(category.total).padStart(12, ' ')}  ${percent(category.share * 100)}`)
    }
    const want = natures.find((n) => n.nature === 'want')
    if (want) lines.push(`  İsteğe bağlı harcama payı: ${percent(want.share * 100)}`)
    lines.push('')
  }

  // ── Forward view ────────────────────────────────────────────────────────────
  const next = overall.commitments[0]
  const activeRecurring = overall.recurring.filter((r) => r.status === 'active')
  if (next || activeRecurring.length) {
    lines.push('GELECEK')
    if (next && next.total > 0) {
      lines.push(`  ${monthLabel(next.month)} bağlı  ${money(next.total)} (taksit ${money(next.installments)} + düzenli ${money(next.recurring)})`)
    }
    if (activeRecurring.length) {
      const monthlyLoad = activeRecurring.reduce((s, r) => s + r.monthlyEquivalent, 0)
      lines.push(`  Düzenli ödeme     ${count(activeRecurring.length)} adet · ${money(monthlyLoad)}/ay`)
    }

    const near = sliceForecast(overall.forecast, 30)
    lines.push(
      `  30 gün tahmini    gelir ${money(near.totalIn)} · gider ${money(near.totalOut)} · net ${money(near.endBalance - near.openingBalance, { sign: true })}`,
    )
    lines.push('')
  }

  // ── Goal ────────────────────────────────────────────────────────────────────
  const goal = overall.goal
  if (goal) {
    lines.push('TASARRUF HEDEFİ')
    lines.push(`  Hedef             ${money(goal.goal.targetAmount)} · ${monthLabel(goal.goal.targetMonth)}`)
    lines.push(`  Durum             ${GOAL_STATUS_LABEL[goal.status]} (${money(goal.delta, { sign: true })})`)
    lines.push(`  Biriken / gereken ${money(goal.currentActual)} / ${money(goal.requiredAtNow)}`)
    if (goal.requiredMonthlyPaceFromNow !== null) {
      lines.push(`  Gereken tempo     ${money(goal.requiredMonthlyPaceFromNow)}/ay`)
    }
    if (goal.maxMonthlySpend !== null) {
      lines.push(`  Bu ay en fazla    ${money(goal.maxMonthlySpend)} harcayabilirsiniz`)
    }
    lines.push('')
  }

  // ── Findings ────────────────────────────────────────────────────────────────
  if (analysis.insights.length > 0) {
    lines.push('DİKKAT EDİLECEKLER')
    for (const insight of analysis.insights.slice(0, 5)) {
      lines.push(`  · ${insight.title}`)
    }
    lines.push('')
  }

  lines.push(`Finansal sağlık: ${health.score}/100 — ${health.label}`)
  lines.push(`Sınıflandırılan harcama: ${percent(meta.classifiedShare * 100)}`)

  return lines.join('\n')
}
