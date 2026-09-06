import { addDays, dayLabel, daysInMonth, eachMonth, monthOf, type DayKey } from '../core/date'
import type { Money } from '../core/money'
import type { CommitmentMonth, RecurringPayment } from './types'

/**
 * Forward daily cash-flow projection.
 *
 * This is not a bank balance — the app never sees one, by design. It is a
 * running net of expected money in vs money out from the day after the data
 * ends, built from three layers:
 *
 *   1. Detected recurring expenses and income, placed on their next expected
 *      dates (and repeated forward at their own interval).
 *   2. Instalment plans still owed, spread evenly across the days of the
 *      month they are billed in (the exact due day is not recorded).
 *   3. Everything else — ordinary day-to-day spending — approximated as a
 *      flat daily amount derived from the historical average, with the
 *      recurring/instalment share subtracted out so it is not counted twice.
 */

export interface ForecastPoint {
  date: DayKey
  label: string
  in: Money
  out: Money
  net: Money
  /** Cumulative net from the first projected day. */
  balance: Money
}

export interface CashFlowForecast {
  asOf: DayKey
  horizonDays: number
  points: ForecastPoint[]
  totalIn: Money
  totalOut: Money
  endBalance: Money
  /** Lowest point the balance reaches — the tightest day in the window. */
  lowestBalance: Money
  lowestDate: DayKey | null
  /** Daily spend attributed to habit rather than a named commitment. */
  dailyDiscretionary: Money
  /** Where the projection starts. Zero when no balance is on file, in which case every figure is relative to today rather than absolute. */
  openingBalance: Money
  /**
   * True when `openingBalance` is a real number the user entered. Without it a
   * dip below zero means only "you will spend this much before payday", which
   * is true of every monthly-paid household and must not be reported as a
   * shortfall.
   */
  hasOpeningBalance: boolean
}

export interface ForecastInputs {
  /** Last day covered by the data — the projection starts the day after. */
  asOf: DayKey
  horizonDays: number
  monthlyIncome: Money
  averageDailySpend: Money
  activeRecurringExpense: readonly RecurringPayment[]
  activeRecurringIncome: readonly RecurringPayment[]
  commitments: readonly CommitmentMonth[]
  /** Cash on hand today, when the user has told us. 0 means "unknown"; the projection then runs relative to today. */
  openingBalance?: Money
}

const DAYS_PER_MONTH = 30.44

/** Places each item's next occurrences on their expected dates within the window. */
function projectOccurrences(
  items: readonly RecurringPayment[],
  asOf: DayKey,
  endDay: DayKey,
): Map<DayKey, Money> {
  const byDay = new Map<DayKey, Money>()

  for (const item of items) {
    let next = item.nextExpected
    while (next <= asOf) next = addDays(next, item.intervalDays)
    while (next <= endDay) {
      byDay.set(next, (byDay.get(next) ?? 0) + item.medianAmount)
      next = addDays(next, item.intervalDays)
    }
  }

  return byDay
}

export function computeCashFlowForecast(inputs: ForecastInputs): CashFlowForecast {
  const {
    asOf, horizonDays, monthlyIncome, averageDailySpend,
    activeRecurringExpense, activeRecurringIncome, commitments, openingBalance = 0,
  } = inputs
  const endDay = addDays(asOf, horizonDays)

  const recurringExpenseMonthly = activeRecurringExpense.reduce((s, r) => s + r.monthlyEquivalent, 0)
  const installmentMonthly = commitments[0]?.installments ?? 0

  // The historical daily average already contains the recurring and
  // instalment charges placed explicitly below; subtracting their
  // daily-equivalent here keeps "everything else" from double-counting them.
  const dailyDiscretionary = Math.max(
    0,
    Math.round(averageDailySpend - (recurringExpenseMonthly + installmentMonthly) / DAYS_PER_MONTH),
  )

  const expenseByDay = projectOccurrences(activeRecurringExpense, asOf, endDay)
  const incomeByDay = projectOccurrences(activeRecurringIncome, asOf, endDay)

  // No recurring income pattern was detected (common with only a couple of
  // months of data) — fall back to the profile's stated monthly income,
  // landing on the 1st of each covered month, the closest guess without a
  // known payday.
  if (activeRecurringIncome.length === 0 && monthlyIncome > 0) {
    for (const month of eachMonth(monthOf(asOf), monthOf(endDay))) {
      const firstOfMonth = `${month}-01`
      if (firstOfMonth > asOf && firstOfMonth <= endDay) {
        incomeByDay.set(firstOfMonth, (incomeByDay.get(firstOfMonth) ?? 0) + monthlyIncome)
      }
    }
  }

  const commitmentByMonth = new Map(commitments.map((c) => [c.month, c]))

  const points: ForecastPoint[] = []
  let balance = openingBalance
  let totalIn = 0
  let totalOut = 0
  let lowestBalance = openingBalance
  let lowestDate: DayKey | null = null

  for (let i = 1; i <= horizonDays; i++) {
    const date = addDays(asOf, i)
    const month = monthOf(date)
    const commitMonth = commitmentByMonth.get(month)
    const installmentDaily = commitMonth ? commitMonth.installments / daysInMonth(month) : 0

    const out = Math.round(installmentDaily) + (expenseByDay.get(date) ?? 0) + dailyDiscretionary
    const inc = incomeByDay.get(date) ?? 0
    const net = inc - out
    balance += net
    totalIn += inc
    totalOut += out
    if (balance < lowestBalance) {
      lowestBalance = balance
      lowestDate = date
    }

    points.push({ date, label: dayLabel(date), in: inc, out, net, balance })
  }

  return {
    asOf, horizonDays, points, totalIn, totalOut,
    endBalance: balance, lowestBalance, lowestDate, dailyDiscretionary,
    openingBalance, hasOpeningBalance: openingBalance > 0,
  }
}

/** Re-derives the summary figures for a shorter look-ahead window from an already-computed forecast, without recomputing the projection. */
export function sliceForecast(forecast: CashFlowForecast, days: number): CashFlowForecast {
  const count = Math.min(days, forecast.points.length)
  const points = forecast.points.slice(0, count)

  let totalIn = 0
  let totalOut = 0
  let lowestBalance = forecast.openingBalance
  let lowestDate: DayKey | null = null
  for (const p of points) {
    totalIn += p.in
    totalOut += p.out
    if (p.balance < lowestBalance) {
      lowestBalance = p.balance
      lowestDate = p.date
    }
  }

  return {
    asOf: forecast.asOf,
    horizonDays: count,
    points,
    totalIn,
    totalOut,
    endBalance: points.length ? points[points.length - 1].balance : forecast.openingBalance,
    lowestBalance,
    lowestDate,
    dailyDiscretionary: forecast.dailyDiscretionary,
    openingBalance: forecast.openingBalance,
    hasOpeningBalance: forecast.hasOpeningBalance,
  }
}
