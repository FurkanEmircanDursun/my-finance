import { eachMonth, monthDiff, monthLabel, type MonthKey } from '../core/date'
import { clamp } from '../core/stats'
import type { Money } from '../core/money'
import type { SavingsGoal } from '../domain/types'
import type { MonthlyPoint } from './types'

/**
 * Turns a savings goal (a target amount by a target month) into a trajectory:
 * what "on pace" looks like every month between start and target, what the
 * user actually did each month, and whether the gap between the two is
 * closing or widening right now.
 *
 * The required line is linear — straight from `startingAmount` at `startMonth`
 * to `targetAmount` at `targetMonth`. A curved "ideal" pace (e.g. save more
 * once discretionary spending drops) would need assumptions this module has
 * no basis for, so it stays the simplest honest baseline: save the same
 * amount every month and you arrive exactly on time.
 *
 * What counts as a month's saving comes from `MonthlyPoint.savings`, which
 * falls back to the profile's monthly income when the month has no income
 * rows of its own — the normal case, since a credit-card statement lists
 * spending and never a salary.
 */

export type GoalStatus = 'not-started' | 'ahead' | 'behind' | 'reached' | 'ended'

export interface GoalPoint {
  month: MonthKey
  label: string
  /** Cumulative saved by this month under the straight-line plan. */
  required: Money
  /** Cumulative actually saved by this month, or null for months not yet reached. */
  actual: Money | null
}

export interface GoalProgress {
  goal: SavingsGoal
  points: GoalPoint[]
  /** The month progress is measured as of — the data's own latest month, clamped to the goal window. */
  asOfMonth: MonthKey
  status: GoalStatus
  currentActual: Money
  requiredAtNow: Money
  /** currentActual − requiredAtNow: positive means ahead of the straight-line pace. */
  delta: Money
  monthsElapsed: number
  monthsRemaining: number
  totalMonths: number
  remainingAmount: Money
  /** Monthly saving still needed to land on target from here; null once there is no time left. */
  requiredMonthlyPaceFromNow: number | null
  /** What saving has actually averaged per month so far; null before any full month has elapsed. */
  averageMonthlyPaceSoFar: number | null
  /** Where the current pace would land by the target month, if it continues unchanged. */
  projectedFinalAmount: number | null
  /**
   * The highest this month's spending can be without missing the pace needed
   * from here — `income − requiredMonthlyPaceFromNow`, floored at 0. Null when
   * no income is on file (there is nothing to subtract the requirement from)
   * or the deadline has already passed.
   */
  maxMonthlySpend: Money | null
}

function clampMonth(month: MonthKey, min: MonthKey, max: MonthKey): MonthKey {
  if (month < min) return min
  if (month > max) return max
  return month
}

export function computeGoalProgress(
  goal: SavingsGoal,
  monthly: readonly MonthlyPoint[],
  dataAsOfMonth: MonthKey,
  monthlyIncome: Money,
): GoalProgress {
  const { targetAmount, targetMonth, startMonth, startingAmount } = goal

  // Only months a statement actually covers count as saving months, and each
  // contributes `savings` (income basis − net spend), not the row-level `net`.
  // Reading `net` meant a card statement — which never lists a salary — scored
  // every month as a total loss, while a month holding nothing but a manually
  // entered salary scored as if the whole amount had been saved.
  const savingsByMonth = new Map<MonthKey, Money>()
  for (const point of monthly) {
    if (point.covered) savingsByMonth.set(point.month, point.savings)
  }

  const totalMonths = Math.max(0, monthDiff(startMonth, targetMonth))
  const months = eachMonth(startMonth, targetMonth)

  // The straight-line target, evaluated at the *end* of each month in `months`
  // (startMonth through targetMonth inclusive, so `months.length` saving
  // opportunities in total). Both this and `actual` below fold in that same
  // month's own contribution, so the two stay apples-to-apples: comparing "0
  // months elapsed" required against "this month's savings already banked"
  // would flatter every trajectory by exactly one month, most visibly at the
  // very start.
  const requiredAt = (index: number): Money =>
    Math.round(startingAmount + ((targetAmount - startingAmount) * (index + 1)) / months.length)

  const asOfMonth = clampMonth(dataAsOfMonth, startMonth, targetMonth)
  const asOfIndex = monthDiff(startMonth, asOfMonth)

  let running = startingAmount
  const points: GoalPoint[] = months.map((month, index) => {
    const known = savingsByMonth.get(month)
    const reached = month <= asOfMonth
    if (reached) running += known ?? 0
    return {
      month,
      label: monthLabel(month, true),
      required: requiredAt(index),
      actual: reached ? running : null,
    }
  })

  const currentActual = points[asOfIndex]?.actual ?? startingAmount
  const requiredAtNow = requiredAt(asOfIndex)
  const delta = currentActual - requiredAtNow

  // Completed saving months, for averaging — distinct from `asOfIndex`, which
  // is a position in the points array, not a count. A goal whose start month
  // has not actually arrived yet (`dataAsOfMonth < startMonth`) has zero of
  // them, however the clamp above positions `asOfMonth`.
  const hasStarted = dataAsOfMonth >= startMonth
  const monthsElapsed = hasStarted ? clamp(asOfIndex + 1, 0, months.length) : 0
  const monthsRemaining = Math.max(0, monthDiff(dataAsOfMonth, targetMonth))
  const remainingAmount = Math.max(0, targetAmount - currentActual)

  const requiredMonthlyPaceFromNow = monthsRemaining > 0 ? remainingAmount / monthsRemaining : null

  const averageMonthlyPaceSoFar =
    monthsElapsed > 0 ? (currentActual - startingAmount) / monthsElapsed : null

  const projectedFinalAmount =
    averageMonthlyPaceSoFar !== null
      ? Math.round(currentActual + averageMonthlyPaceSoFar * monthsRemaining)
      : null

  const maxMonthlySpend =
    monthlyIncome > 0 && requiredMonthlyPaceFromNow !== null
      ? Math.max(0, Math.round(monthlyIncome - requiredMonthlyPaceFromNow))
      : null

  let status: GoalStatus
  if (currentActual >= targetAmount) status = 'reached'
  else if (dataAsOfMonth > targetMonth) status = 'ended'
  else if (dataAsOfMonth < startMonth) status = 'not-started'
  else status = delta >= 0 ? 'ahead' : 'behind'

  return {
    goal,
    points,
    asOfMonth,
    status,
    currentActual,
    requiredAtNow,
    delta,
    monthsElapsed,
    monthsRemaining,
    totalMonths,
    remainingAmount,
    requiredMonthlyPaceFromNow: requiredMonthlyPaceFromNow !== null ? Math.round(requiredMonthlyPaceFromNow) : null,
    averageMonthlyPaceSoFar: averageMonthlyPaceSoFar !== null ? Math.round(averageMonthlyPaceSoFar) : null,
    projectedFinalAmount,
    maxMonthlySpend,
  }
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  'not-started': 'Henüz başlamadı',
  ahead: 'Hedefin önünde',
  behind: 'Hedefin gerisinde',
  reached: 'Hedefe ulaşıldı',
  ended: 'Süre doldu',
}
