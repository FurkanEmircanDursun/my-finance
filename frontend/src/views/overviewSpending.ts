import { category, type CategoryId } from '../domain/categories'
import { spendAmount, type Budget, type Transaction } from '../domain/types'
import type { DayKey } from '../core/date'
import { dailyNetSpending } from '../analytics/longitudinal'

export function overviewSpending(rows: readonly Transaction[], month: string, today: DayKey) {
  const byCategory = new Map<CategoryId, number>()
  let gross = 0
  let refunds = 0
  for (const row of rows) {
    if (row.kind === 'refund') refunds += row.amount
    if (row.kind !== 'expense') continue
    const id = category(row.category).id
    gross += row.amount
    byCategory.set(id, (byCategory.get(id) ?? 0) + row.amount)
  }
  const categories = [...byCategory]
    .map(([id, total]) => ({ ...category(id), total, share: total / gross * 100 }))
    .sort((a, b) => b.total - a.total)
  const days = dailyNetSpending(rows, month, today, 'all')
  const peak = days.reduce<(typeof days)[number] | null>((highest, day) =>
    (day.net ?? 0) > (highest?.net ?? 0) ? day : highest, null)
  return { gross, refunds, categories, days, peak }
}

export interface HabitComponent {
  label: string
  score: number
  weight: number
}

/** A period-level planning score. Only configured goals and recorded income contribute. */
export function spendingHabits(net: number, gross: number, income: number, limit: number, unclassified: number, scoped: boolean) {
  if (!scoped || gross <= 0 || (limit <= 0 && income <= 0)) return null
  const scoreAgainst = (reference: number) => Math.min(100, Math.round(reference / Math.max(reference, net) * 100))
  const components: HabitComponent[] = [
    ...(limit > 0 ? [{ label: 'Aylık limite uyum', score: scoreAgainst(limit), weight: 50 }] : []),
    ...(income > 0 ? [{ label: 'Gelirle gideri karşılama', score: scoreAgainst(income), weight: 30 }] : []),
    { label: 'Kategorilendirme', score: Math.round((1 - unclassified / gross) * 100), weight: 20 },
  ]
  const weights = components.reduce((sum, item) => sum + item.weight, 0)
  const score = Math.round(components.reduce((sum, item) => sum + item.score * item.weight, 0) / weights)
  return { score, components }
}

export function biggestBudgetOverrun(rows: readonly Transaction[], budgets: readonly Budget[]) {
  const spend = new Map<CategoryId, number>()
  for (const row of rows) spend.set(row.category, (spend.get(row.category) ?? 0) + spendAmount(row))
  return budgets
    .map(budget => ({ ...budget, difference: (spend.get(budget.category) ?? 0) - budget.limit }))
    .filter(budget => budget.limit > 0 && budget.difference > 0)
    .sort((a, b) => b.difference - a.difference)[0]
}
