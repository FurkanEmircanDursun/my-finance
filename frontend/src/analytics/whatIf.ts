import { addMonths, type MonthKey } from '../core/date'
import type { Money } from '../core/money'

export interface WhatIfInput {
  /** Target savings goal in minor units (kuruş). */
  targetAmount: Money
  /** Already accumulated cash/savings baseline in minor units. */
  baseSaved: Money
  /** Current monthly savings rate in minor units. */
  baseMonthlySavings: Money
  /** Simulated extra monthly savings from slider (+0 .. +50.000 ₺) in minor units. */
  extraMonthlySavings: Money
  /** Live TL value of the user's Assets portfolio (Gold, Silver, FX) in minor units. */
  portfolioTotalMinor: Money
  /** Whether to include the Assets portfolio in starting capital toward the goal. */
  includePortfolio: boolean
  /** Current total credit card statement debt in minor units. */
  statementDebtMinor: Money
  /** Whether to pay off credit card statement debt upfront from starting capital. */
  deductCardDebt: boolean
  /** Anchor month for completion date projection (YYYY-MM). */
  asOfMonth: MonthKey
}

export interface WhatIfResult {
  targetAmount: Money
  baselineStartingCapital: Money
  simulatedStartingCapital: Money
  baselineMonthlyPace: Money
  simulatedMonthlyPace: Money
  baselineRemaining: Money
  simulatedRemaining: Money
  baselineMonthsToTarget: number | null
  simulatedMonthsToTarget: number | null
  /** Positive means the goal is reached `monthsSaved` months earlier than baseline. */
  monthsSaved: number | null
  baselineTargetMonth: MonthKey | null
  simulatedTargetMonth: MonthKey | null
  /** Projected net wealth after 12 months under the simulated parameters. */
  twelveMonthProjectedWealth: Money
  /** Percentage of target amount already covered by simulated starting capital (0..100). */
  coverageRatioPct: number
}

const MAX_HORIZON_MONTHS = 240

export function simulateWhatIf(input: WhatIfInput): WhatIfResult {
  const targetAmount = Math.max(0, Math.round(input.targetAmount))
  const baselineStartingCapital = Math.max(0, Math.round(input.baseSaved))
  const portfolioAddition = input.includePortfolio ? Math.max(0, Math.round(input.portfolioTotalMinor)) : 0
  const debtDeduction = input.deductCardDebt ? Math.max(0, Math.round(input.statementDebtMinor)) : 0

  const simulatedStartingCapital = Math.round(
    baselineStartingCapital + portfolioAddition - debtDeduction,
  )

  const baselineMonthlyPace = Math.max(0, Math.round(input.baseMonthlySavings))
  const simulatedMonthlyPace = Math.max(
    0,
    Math.round(input.baseMonthlySavings + input.extraMonthlySavings),
  )

  const baselineRemaining = Math.max(0, targetAmount - baselineStartingCapital)
  const simulatedRemaining = Math.max(0, targetAmount - simulatedStartingCapital)

  const computeMonths = (remaining: Money, pace: Money): number | null => {
    if (remaining <= 0) return 0
    if (pace <= 0) return null
    const raw = Math.ceil(remaining / pace)
    return raw <= MAX_HORIZON_MONTHS ? raw : MAX_HORIZON_MONTHS
  }

  const baselineMonthsToTarget = computeMonths(baselineRemaining, baselineMonthlyPace)
  const simulatedMonthsToTarget = computeMonths(simulatedRemaining, simulatedMonthlyPace)

  let monthsSaved: number | null = null
  if (baselineMonthsToTarget !== null && simulatedMonthsToTarget !== null) {
    monthsSaved = baselineMonthsToTarget - simulatedMonthsToTarget
  }

  const baselineTargetMonth =
    baselineMonthsToTarget !== null
      ? addMonths(input.asOfMonth, baselineMonthsToTarget)
      : null

  const simulatedTargetMonth =
    simulatedMonthsToTarget !== null
      ? addMonths(input.asOfMonth, simulatedMonthsToTarget)
      : null

  const twelveMonthProjectedWealth = Math.max(
    0,
    simulatedStartingCapital + simulatedMonthlyPace * 12,
  )

  const coverageRatioPct =
    targetAmount > 0
      ? Math.min(100, Math.max(0, Math.round((simulatedStartingCapital / targetAmount) * 100)))
      : 0

  return {
    targetAmount,
    baselineStartingCapital,
    simulatedStartingCapital,
    baselineMonthlyPace,
    simulatedMonthlyPace,
    baselineRemaining,
    simulatedRemaining,
    baselineMonthsToTarget,
    simulatedMonthsToTarget,
    monthsSaved,
    baselineTargetMonth,
    simulatedTargetMonth,
    twelveMonthProjectedWealth,
    coverageRatioPct,
  }
}
