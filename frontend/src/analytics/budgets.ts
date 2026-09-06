import { daysInMonth, type MonthKey } from '../core/date'
import { category, type CategoryId } from '../domain/categories'
import type { Money } from '../core/money'
import type { Budget } from '../domain/types'

/**
 * What a category budget (set in Ayarlar) is actually doing, month to month.
 *
 * The limit itself was already stored and shown as a number in Ayarlar, but
 * nothing anywhere read it back — a user could set "₺2.000 Market" and the
 * app would never once compare a real total against it. This is what turns
 * the number into a running total, the thing every budgeting app leads with.
 */
export type BudgetStatus = 'ok' | 'warning' | 'over'

export interface BudgetProgress {
  category: CategoryId
  label: string
  color: string
  limit: Money
  /** Spent so far in `month`. */
  spent: Money
  /** Extrapolated month-end spend at the current daily pace; null once the month is not still in progress. */
  projected: Money | null
  /** spent / limit, uncapped — can exceed 1. */
  share: number
  status: BudgetStatus
}

export interface BudgetOptions {
  month: MonthKey
  /** Days into `month` covered by data so far; only set when `month` is genuinely still in progress. */
  elapsedDays: number | null
}

const WARNING_SHARE = 0.85

export function buildBudgetProgress(
  budgets: readonly Budget[],
  monthCategoryTotals: ReadonlyMap<CategoryId, Money>,
  options: BudgetOptions,
): BudgetProgress[] {
  const { month, elapsedDays } = options

  return budgets
    .map((budget): BudgetProgress => {
      const def = category(budget.category)
      const spent = monthCategoryTotals.get(budget.category) ?? 0

      const projected =
        elapsedDays !== null && elapsedDays >= 5
          ? Math.round((spent / elapsedDays) * daysInMonth(month))
          : null

      const share = budget.limit > 0 ? spent / budget.limit : 0
      const overBudget = spent > budget.limit
      const trending = projected !== null && projected > budget.limit

      return {
        category: budget.category,
        label: def.label,
        color: def.color,
        limit: budget.limit,
        spent,
        projected,
        share,
        status: overBudget ? 'over' : trending || share >= WARNING_SHARE ? 'warning' : 'ok',
      }
    })
    .sort((a, b) => b.share - a.share)
}
