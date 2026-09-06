import { clamp, cv, scoreBand } from '../core/stats'
import { money, percent, round, type Money } from '../core/money'
import type { HealthComponent, HealthReport } from './types'

/**
 * Financial health score, rebuilt as a weighted, explainable index.
 *
 * The previous version started at 100 and subtracted arbitrary points when a
 * category crossed a hard-coded share, which meant a month with high grocery
 * spend and no other signal scored the same as a month of pure discretionary
 * spend. Each component here is scored 0-100 on its own axis, carries its own
 * weight, and states the number it was derived from — so the total can always
 * be traced back to a fact on the statement.
 *
 * Components that cannot be computed (no income entered, one month of data)
 * are dropped and the remaining weights are renormalised, rather than silently
 * scoring zero.
 */

export interface HealthInput {
  netSpend: Money
  monthlyIncome: Money
  /** Average monthly spend across the covered period. */
  monthlySpend: Money
  /** Instalments + active recurring payments due next month. */
  committedMonthly: Money
  /** Share of spend in `want` categories, 0-1. */
  discretionaryShare: number
  /** Monthly spend totals for full months only. */
  monthlySeries: Money[]
  /** Share of spend that reached a real category, 0-1. */
  classifiedShare: number
  /** Merchant concentration, 0-1. */
  concentration: number
}

export function computeHealth(input: HealthInput): HealthReport {
  const components: HealthComponent[] = []

  const reference = input.monthlyIncome > 0 ? input.monthlyIncome : input.monthlySpend

  // ── Savings rate ────────────────────────────────────────────────────────────
  if (input.monthlyIncome > 0) {
    const rate = (input.monthlyIncome - input.monthlySpend) / input.monthlyIncome
    components.push({
      id: 'savings',
      label: 'Tasarruf oranı',
      // 25% saved scores full marks, spending everything scores zero.
      score: scoreBand(rate, 0.25, -0.05),
      weight: 0.3,
      detail: `Gelirin ${percent(rate * 100)}'i harcanmadan kalıyor`,
    })
  }

  // ── Committed outflow ───────────────────────────────────────────────────────
  if (reference > 0) {
    const load = input.committedMonthly / reference
    components.push({
      id: 'commitment',
      label: 'Sabit yük',
      // Under 15% committed is comfortable; over 45% is fragile.
      score: scoreBand(load, 0.15, 0.45),
      weight: 0.25,
      detail: `${money(input.committedMonthly)} taksit ve düzenli ödeme · ${percent(load * 100)}`,
    })
  }

  // ── Discretionary share ─────────────────────────────────────────────────────
  components.push({
    id: 'discretionary',
    label: 'İsteğe bağlı harcama',
    score: scoreBand(input.discretionaryShare, 0.2, 0.6),
    weight: 0.2,
    detail: `Harcamanın ${percent(input.discretionaryShare * 100)}'i isteğe bağlı kategorilerde`,
  })

  // ── Volatility ──────────────────────────────────────────────────────────────
  if (input.monthlySeries.length >= 3) {
    const variation = cv(input.monthlySeries)
    components.push({
      id: 'volatility',
      label: 'İstikrar',
      score: scoreBand(variation, 0.1, 0.6),
      weight: 0.15,
      detail: `Aylık harcama sapması ${percent(variation * 100)}`,
    })
  }

  // ── Concentration ───────────────────────────────────────────────────────────
  components.push({
    id: 'concentration',
    label: 'Dağılım',
    score: scoreBand(input.concentration, 0.15, 0.6),
    weight: 0.1,
    detail: `Harcama yoğunlaşma endeksi ${round(input.concentration, 2)}`,
  })

  // ── Data quality ────────────────────────────────────────────────────────────
  components.push({
    id: 'coverage',
    label: 'Sınıflandırma',
    score: scoreBand(input.classifiedShare, 0.95, 0.6),
    weight: 0.08,
    detail: `Harcamanın ${percent(input.classifiedShare * 100)}'i kategorilendirildi`,
  })

  const totalWeight = components.reduce((s, c) => s + c.weight, 0)
  const score = totalWeight
    ? Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight)
    : 0

  const normalised = components.map((c) => ({ ...c, weight: round(c.weight / totalWeight, 2) }))
  const bounded = clamp(score, 0, 100)

  return {
    score: bounded,
    band: bounded >= 70 ? 'strong' : bounded >= 45 ? 'fair' : 'weak',
    label: bounded >= 70 ? 'Sağlıklı' : bounded >= 45 ? 'Dikkat gerektiriyor' : 'Kırılgan',
    components: normalised.sort((a, b) => b.weight - a.weight),
  }
}
