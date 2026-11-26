import { describe, expect, it } from 'vitest'
import { simulateWhatIf } from './whatIf'

describe('simulateWhatIf', () => {
  it('calculates months saved when adding extra monthly savings and portfolio assets', () => {
    const res = simulateWhatIf({
      targetAmount: 300_000_00, // 300.000 ₺
      baseSaved: 50_000_00, // 50.000 ₺
      baseMonthlySavings: 10_000_00, // 10.000 ₺/mo -> 25 months baseline
      extraMonthlySavings: 5_000_00, // +5.000 ₺/mo -> 15.000 ₺/mo
      portfolioTotalMinor: 70_000_00, // 70.000 ₺ in Gold/FX
      includePortfolio: true,
      statementDebtMinor: 30_000_00, // 30.000 ₺ card debt
      deductCardDebt: true,
      asOfMonth: '2026-08',
    })

    // Baseline: (300k - 50k) / 10k = 25 months
    expect(res.baselineMonthsToTarget).toBe(25)
    // Simulated starting capital: 50k + 70k - 30k = 90k
    expect(res.simulatedStartingCapital).toBe(90_000_00)
    // Simulated remaining: 300k - 90k = 210k at 15k/mo = 14 months
    expect(res.simulatedMonthsToTarget).toBe(14)
    // Months saved: 25 - 14 = 11 months earlier!
    expect(res.monthsSaved).toBe(11)
    expect(res.simulatedTargetMonth).toBe('2027-10')
  })

  it('returns 0 months when portfolio assets immediately cover the target', () => {
    const res = simulateWhatIf({
      targetAmount: 100_000_00,
      baseSaved: 20_000_00,
      baseMonthlySavings: 5_000_00,
      extraMonthlySavings: 0,
      portfolioTotalMinor: 95_000_00,
      includePortfolio: true,
      statementDebtMinor: 0,
      deductCardDebt: false,
      asOfMonth: '2026-08',
    })

    expect(res.simulatedMonthsToTarget).toBe(0)
    expect(res.coverageRatioPct).toBe(100)
    expect(res.monthsSaved).toBe(16)
  })
})
