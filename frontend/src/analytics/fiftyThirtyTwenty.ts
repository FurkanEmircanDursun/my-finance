import type { CategoryId } from '../domain/categories'
import type { Money } from '../core/money'
import type { CategoryStat } from './types'

export type RuleBucket = 'need' | 'want' | 'other'

/**
 * Maps each spending category into the 50/30/20 financial balance rule:
 * - `need`:  Essential living expenses (bills, rent, health, education, tax, insurance, fees, groceries, transport)
 * - `want`:  Discretionary / lifestyle expenses (dining, subscriptions, e-commerce, entertainment, clothing, travel, home)
 * - `other`: Unclassified / cash / wallet transfers (`other`, `fintech`, `cash`, `rewards`)
 *
 * Every positive category is assigned to exactly one bucket so no spending
 * ever disappears between the rule bars, the donut slices, and net savings.
 */
const ESSENTIAL_MIXED: ReadonlySet<CategoryId> = new Set(['market', 'transport'])
const DISCRETIONARY_MIXED: ReadonlySet<CategoryId> = new Set(['home'])

export function ruleBucketOf(category: Pick<CategoryStat, 'id' | 'nature'>): RuleBucket {
  if (category.nature === 'need' || ESSENTIAL_MIXED.has(category.id)) return 'need'
  if (category.nature === 'want' || DISCRETIONARY_MIXED.has(category.id)) return 'want'
  return 'other'
}

export interface FiftyThirtyTwenty {
  income: Money
  netSpend: Money
  needTotal: Money
  wantTotal: Money
  otherTotal: Money
  savingsTotal: Money
  deficitTotal: Money
  unallocatedRefunds: Money
  /** Denominator used for percentages (`income` when > 0, otherwise classified spend). */
  base: Money
  needPct: number
  wantPct: number
  otherPct: number
  savePct: number
}

export function computeFiftyThirtyTwenty(
  categories: readonly CategoryStat[],
  income: Money,
  netSpend: Money,
  unallocatedRefunds: Money = 0,
): FiftyThirtyTwenty {
  let needTotal = 0
  let wantTotal = 0
  let otherTotal = 0

  for (const cat of categories) {
    if (cat.total <= 0) continue
    const bucket = ruleBucketOf(cat)
    if (bucket === 'need') needTotal += cat.total
    else if (bucket === 'want') wantTotal += cat.total
    else otherTotal += cat.total
  }

  const categorizedTotal = needTotal + wantTotal + otherTotal
  const savingsTotal = income > 0 ? Math.max(0, income - netSpend) : 0
  const deficitTotal = income > 0 ? Math.max(0, netSpend - income) : 0
  const base = income > 0 ? income : categorizedTotal
  const denom = Math.max(1, base)

  return {
    income,
    netSpend,
    needTotal,
    wantTotal,
    otherTotal,
    savingsTotal,
    deficitTotal,
    unallocatedRefunds,
    base,
    needPct: base > 0 ? Math.round((needTotal / denom) * 100) : 0,
    wantPct: base > 0 ? Math.round((wantTotal / denom) * 100) : 0,
    otherPct: base > 0 ? Math.round((otherTotal / denom) * 100) : 0,
    savePct: income > 0 ? Math.max(0, Math.round((savingsTotal / income) * 100)) : 0,
  }
}
