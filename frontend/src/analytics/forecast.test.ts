import { describe, expect, it } from 'vitest'
import { computeCashFlowForecast, sliceForecast } from './forecast'
import { toMinor } from '../core/money'
import type { CommitmentMonth, RecurringPayment } from './types'

function recurringFixture(overrides: Partial<RecurringPayment> = {}): RecurringPayment {
  return {
    merchant: 'test',
    label: 'Test',
    category: 'other',
    cadence: 'monthly',
    cadenceLabel: 'Aylık',
    intervalDays: 30,
    occurrences: 3,
    lastAmount: toMinor(1000),
    medianAmount: toMinor(1000),
    monthlyEquivalent: toMinor(1000),
    annualCost: toMinor(12000),
    firstSeen: '2026-05-01',
    lastSeen: '2026-07-01',
    nextExpected: '2026-07-31',
    priceChangePct: null,
    confidence: 0.9,
    status: 'active',
    transactionIds: [],
    ...overrides,
  }
}

function commitmentFixture(overrides: Partial<CommitmentMonth> = {}): CommitmentMonth {
  return { month: '2026-08', label: 'Ağu 2026', installments: 0, recurring: 0, total: 0, ...overrides }
}

const ASOF = '2026-07-20'

describe('computeCashFlowForecast', () => {
  it('spreads only the discretionary daily amount when nothing else is known', () => {
    const forecast = computeCashFlowForecast({
      asOf: ASOF,
      horizonDays: 10,
      monthlyIncome: 0,
      averageDailySpend: toMinor(100),
      activeRecurringExpense: [],
      activeRecurringIncome: [],
      commitments: [],
    })

    expect(forecast.points).toHaveLength(10)
    expect(forecast.points.every((p) => p.out === toMinor(100))).toBe(true)
    expect(forecast.totalOut).toBe(toMinor(1000))
    expect(forecast.endBalance).toBe(toMinor(-1000))
    expect(forecast.lowestBalance).toBe(toMinor(-1000))
    expect(forecast.lowestDate).toBe(forecast.points[9].date)
  })

  it('places a recurring expense on its expected date and repeats it at its interval', () => {
    const rent = recurringFixture({ nextExpected: '2026-07-25', intervalDays: 30, medianAmount: toMinor(5000) })
    const forecast = computeCashFlowForecast({
      asOf: ASOF,
      horizonDays: 40,
      monthlyIncome: 0,
      averageDailySpend: 0,
      activeRecurringExpense: [rent],
      activeRecurringIncome: [],
      commitments: [],
    })

    const first = forecast.points.find((p) => p.date === '2026-07-25')
    const second = forecast.points.find((p) => p.date === '2026-08-24')
    expect(first?.out).toBe(toMinor(5000))
    expect(second?.out).toBe(toMinor(5000))
    expect(forecast.totalOut).toBe(toMinor(10000))
  })

  it('subtracts the recurring monthly-equivalent from the discretionary baseline so it is not double-counted', () => {
    // toMinor(30) * 30.44 lands on an exact integer, so the subtraction cancels cleanly.
    const monthlyEquivalent = toMinor(30) * 30.44
    const rent = recurringFixture({ monthlyEquivalent, nextExpected: '2026-09-01', intervalDays: 30 })
    const forecast = computeCashFlowForecast({
      asOf: ASOF,
      horizonDays: 5, // short enough that the recurring occurrence never lands inside it
      monthlyIncome: 0,
      averageDailySpend: toMinor(30), // equals the recurring item's daily-equivalent share
      activeRecurringExpense: [rent],
      activeRecurringIncome: [],
      commitments: [],
    })

    expect(forecast.dailyDiscretionary).toBe(0)
    expect(forecast.totalOut).toBe(0)
  })

  it('spreads an instalment month total evenly across that month, using the commitment ladder', () => {
    const forecast = computeCashFlowForecast({
      asOf: '2026-07-28',
      horizonDays: 10,
      monthlyIncome: 0,
      averageDailySpend: 0,
      activeRecurringExpense: [],
      activeRecurringIncome: [],
      commitments: [commitmentFixture({ month: '2026-08', installments: toMinor(3100) })], // 3100 / 31 days = 100/day
    })

    const augustPoint = forecast.points.find((p) => p.date === '2026-08-05')
    expect(augustPoint?.out).toBe(toMinor(100))
  })

  it('falls back to the profile monthly income on the 1st of each covered month when no recurring income is detected', () => {
    const forecast = computeCashFlowForecast({
      asOf: '2026-07-20',
      horizonDays: 45, // covers 2026-08-01 and 2026-09-01
      monthlyIncome: toMinor(40000),
      averageDailySpend: 0,
      activeRecurringExpense: [],
      activeRecurringIncome: [],
      commitments: [],
    })

    expect(forecast.points.find((p) => p.date === '2026-08-01')?.in).toBe(toMinor(40000))
    expect(forecast.points.find((p) => p.date === '2026-09-01')?.in).toBe(toMinor(40000))
    expect(forecast.totalIn).toBe(toMinor(80000))
  })

  it('does not fall back to the lump-sum income guess once a recurring income pattern is detected', () => {
    const salary = recurringFixture({
      nextExpected: '2026-07-30',
      intervalDays: 30,
      medianAmount: toMinor(45000),
    })
    const forecast = computeCashFlowForecast({
      asOf: '2026-07-20',
      horizonDays: 45,
      monthlyIncome: toMinor(40000), // present, but should be ignored in favour of the detected pattern
      averageDailySpend: 0,
      activeRecurringExpense: [],
      activeRecurringIncome: [salary],
      commitments: [],
    })

    expect(forecast.points.find((p) => p.date === '2026-08-01')?.in ?? 0).toBe(0)
    expect(forecast.points.find((p) => p.date === '2026-07-30')?.in).toBe(toMinor(45000))
    expect(forecast.totalIn).toBe(toMinor(45000) * 2) // 2026-07-30 and 2026-08-29
  })
})

describe('opening balance', () => {
  it('runs relative to today when no balance is on file', () => {
    const forecast = computeCashFlowForecast({
      asOf: ASOF,
      horizonDays: 10,
      monthlyIncome: 0,
      averageDailySpend: toMinor(100),
      activeRecurringExpense: [],
      activeRecurringIncome: [],
      commitments: [],
    })

    expect(forecast.hasOpeningBalance).toBe(false)
    expect(forecast.openingBalance).toBe(0)
    expect(forecast.points[0].balance).toBe(toMinor(-100))
  })

  it('starts the projection at the balance on file, so the dip is an absolute figure', () => {
    const forecast = computeCashFlowForecast({
      asOf: ASOF,
      horizonDays: 10,
      monthlyIncome: 0,
      averageDailySpend: toMinor(100),
      activeRecurringExpense: [],
      activeRecurringIncome: [],
      commitments: [],
      openingBalance: toMinor(1500),
    })

    expect(forecast.hasOpeningBalance).toBe(true)
    expect(forecast.points[0].balance).toBe(toMinor(1400))
    expect(forecast.endBalance).toBe(toMinor(500)) // 1500 − 10 × 100
    // Never goes below zero, so the lowest point is the final day, not a shortfall.
    expect(forecast.lowestBalance).toBe(toMinor(500))
  })

  it('keeps the opening balance as the floor when the projection only ever rises', () => {
    const forecast = computeCashFlowForecast({
      asOf: ASOF,
      horizonDays: 5,
      monthlyIncome: 0,
      averageDailySpend: 0,
      activeRecurringExpense: [],
      activeRecurringIncome: [],
      commitments: [],
      openingBalance: toMinor(2000),
    })

    expect(forecast.lowestBalance).toBe(toMinor(2000))
    expect(forecast.lowestDate).toBeNull()
  })
})

describe('sliceForecast', () => {
  it('re-derives totals and the lowest point for a shorter window without recomputing the projection', () => {
    const forecast = computeCashFlowForecast({
      asOf: ASOF,
      horizonDays: 90,
      monthlyIncome: toMinor(40000),
      averageDailySpend: toMinor(200),
      activeRecurringExpense: [],
      activeRecurringIncome: [],
      commitments: [],
    })

    const at30 = sliceForecast(forecast, 30)
    expect(at30.points).toHaveLength(30)
    expect(at30.horizonDays).toBe(30)
    expect(at30.endBalance).toBe(forecast.points[29].balance)

    let expectedLowest = 0
    for (const p of at30.points) if (p.balance < expectedLowest) expectedLowest = p.balance
    expect(at30.lowestBalance).toBe(expectedLowest)
  })

  it('clamps to the available points when asked for a longer window than exists', () => {
    const forecast = computeCashFlowForecast({
      asOf: ASOF,
      horizonDays: 10,
      monthlyIncome: 0,
      averageDailySpend: toMinor(50),
      activeRecurringExpense: [],
      activeRecurringIncome: [],
      commitments: [],
    })

    const at90 = sliceForecast(forecast, 90)
    expect(at90.points).toHaveLength(10)
    expect(at90.horizonDays).toBe(10)
  })
})
