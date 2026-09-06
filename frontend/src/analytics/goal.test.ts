import { describe, expect, it } from 'vitest'
import { computeGoalProgress } from './goal'
import { toMinor } from '../core/money'
import type { MonthlyPoint } from './types'
import type { SavingsGoal } from '../domain/types'

/** A covered month that saved `value`. */
function net(month: string, value: number, overrides: Partial<MonthlyPoint> = {}): MonthlyPoint {
  return {
    month,
    label: month,
    spend: 0,
    income: 0,
    refunds: 0,
    net: toMinor(value),
    count: 1,
    partial: false,
    covered: true,
    incomeBasis: 0,
    incomeAssumed: false,
    savings: toMinor(value),
    ...overrides,
  }
}

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    targetAmount: toMinor(6000),
    targetMonth: '2026-06',
    startMonth: '2026-01',
    startingAmount: 0,
    ...overrides,
  }
}

describe('computeGoalProgress', () => {
  it('is exactly on pace when saving evenly matches the straight line', () => {
    // ₺6.000 over Jan–Jun = 6 saving months = ₺1.000/month.
    const monthly = ['2026-01', '2026-02', '2026-03'].map((m) => net(m, 1000))
    const result = computeGoalProgress(goal(), monthly, '2026-03', 0)

    expect(result.currentActual).toBe(toMinor(3000))
    expect(result.requiredAtNow).toBe(toMinor(3000))
    expect(result.delta).toBe(0)
    expect(result.status).toBe('ahead') // delta >= 0 counts as ahead
  })

  it('required and actual both include the current month, not a month-early snapshot', () => {
    // Regression: an earlier version compared "this month's savings already
    // banked" against "required before this month started", which flattered
    // every trajectory by exactly one month — most visibly right at the
    // start, where required was 0 no matter what had already been saved.
    const monthly = [net('2026-01', 1000)]
    const result = computeGoalProgress(goal(), monthly, '2026-01', 0)

    expect(result.requiredAtNow).toBe(toMinor(1000)) // NOT 0
    expect(result.currentActual).toBe(toMinor(1000))
    expect(result.delta).toBe(0)
  })

  it('detects falling behind pace', () => {
    const monthly = ['2026-01', '2026-02', '2026-03'].map((m) => net(m, 500))
    const result = computeGoalProgress(goal(), monthly, '2026-03', 0)

    expect(result.currentActual).toBe(toMinor(1500))
    expect(result.requiredAtNow).toBe(toMinor(3000))
    expect(result.delta).toBe(toMinor(-1500))
    expect(result.status).toBe('behind')
  })

  it('detects running ahead of pace', () => {
    const monthly = ['2026-01', '2026-02'].map((m) => net(m, 2000))
    const result = computeGoalProgress(goal(), monthly, '2026-02', 0)

    expect(result.delta).toBeGreaterThan(0)
    expect(result.status).toBe('ahead')
  })

  it('flags the goal as reached once the target is hit, even early', () => {
    const monthly = [net('2026-01', 7000)]
    const result = computeGoalProgress(goal(), monthly, '2026-01', 0)

    expect(result.status).toBe('reached')
    expect(result.remainingAmount).toBe(0)
  })

  it('flags a missed deadline as ended, not behind', () => {
    const monthly = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map((m) => net(m, 500))
    const result = computeGoalProgress(goal(), monthly, '2026-07', 0) // a month past target

    expect(result.status).toBe('ended')
    expect(result.remainingAmount).toBeGreaterThan(0)
  })

  it('is not-started before its own start month, and reports zero elapsed months', () => {
    const result = computeGoalProgress(goal({ startMonth: '2026-05' }), [], '2026-02', 0)

    expect(result.status).toBe('not-started')
    expect(result.monthsElapsed).toBe(0)
    expect(result.averageMonthlyPaceSoFar).toBeNull()
    expect(result.projectedFinalAmount).toBeNull()
  })

  it('collapses a same-month goal to a single checkpoint requiring the full amount', () => {
    const result = computeGoalProgress(
      goal({ startMonth: '2026-03', targetMonth: '2026-03', targetAmount: toMinor(1000) }),
      [net('2026-03', 400)],
      '2026-03',
      0,
    )

    expect(result.points).toHaveLength(1)
    expect(result.requiredAtNow).toBe(toMinor(1000))
    expect(result.currentActual).toBe(toMinor(400))
    expect(result.remainingAmount).toBe(toMinor(600))
  })

  it('computes the monthly pace still needed and the resulting max spend', () => {
    // ₺6.000 target, ₺1.500 saved after month 1 of 6 → ₺4.500 left over 5 months = ₺900/mo.
    const monthly = [net('2026-01', 1500)]
    const result = computeGoalProgress(goal(), monthly, '2026-01', toMinor(10_000))

    expect(result.requiredMonthlyPaceFromNow).toBe(toMinor(900))
    expect(result.maxMonthlySpend).toBe(toMinor(10_000 - 900))
  })

  it('leaves maxMonthlySpend null when no income is on file', () => {
    const result = computeGoalProgress(goal(), [net('2026-01', 500)], '2026-01', 0)
    expect(result.maxMonthlySpend).toBeNull()
    expect(result.requiredMonthlyPaceFromNow).not.toBeNull() // the pace itself is still known
  })

  it('leaves maxMonthlySpend null once the deadline has passed', () => {
    const result = computeGoalProgress(goal(), [], '2026-07', toMinor(10_000))
    expect(result.requiredMonthlyPaceFromNow).toBeNull()
    expect(result.maxMonthlySpend).toBeNull()
  })

  it('projects the final amount from the average pace so far', () => {
    // ₺1.000/mo average over 2 elapsed months, 4 months remaining from Feb.
    const monthly = ['2026-01', '2026-02'].map((m) => net(m, 1000))
    const result = computeGoalProgress(goal(), monthly, '2026-02', 0)

    expect(result.averageMonthlyPaceSoFar).toBe(toMinor(1000))
    expect(result.projectedFinalAmount).toBe(toMinor(2000) + toMinor(1000) * 4)
  })

  it('treats a month with no transactions as zero net, not a gap', () => {
    const monthly = [net('2026-01', 1000)] // February has no data at all
    const result = computeGoalProgress(goal(), monthly, '2026-02', 0)

    expect(result.currentActual).toBe(toMinor(1000)) // unchanged by the silent month
    expect(result.points[1].actual).toBe(toMinor(1000))
  })

  it('runs on the savings basis, not on the raw row-level net', () => {
    // What a card statement looks like: ₺30.000 income on file, ₺10.000 spent,
    // and no income row at all. `net` says −10.000, `savings` says +20.000 —
    // reading `net` here is what produced wildly negative goal figures.
    const monthly = [
      net('2026-01', -10_000, { savings: toMinor(20_000), incomeBasis: toMinor(30_000), incomeAssumed: true }),
    ]
    const result = computeGoalProgress(
      goal({ targetAmount: toMinor(60_000) }),
      monthly,
      '2026-01',
      toMinor(30_000),
    )

    expect(result.currentActual).toBe(toMinor(20_000)) // not −10.000
    expect(result.requiredAtNow).toBe(toMinor(10_000))
    expect(result.status).toBe('ahead')
  })

  it('ignores months no statement covers, however much income they carry', () => {
    // A manually entered salary lands in a month with no spending data. Counting
    // it would report a month of perfect saving that never happened.
    const monthly = [
      net('2026-01', 1000),
      net('2026-02', 25_000, { covered: false, savings: toMinor(25_000) }),
    ]
    const result = computeGoalProgress(goal(), monthly, '2026-01', 0)

    expect(result.currentActual).toBe(toMinor(1000))
    expect(result.points[1].actual).toBeNull() // not yet reached, and never credited
  })
})
