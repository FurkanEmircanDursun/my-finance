import { describe, expect, it } from 'vitest'
import { demoTransactions } from '../domain/demo'
import type { Transaction } from '../domain/types'
import { biggestBudgetOverrun, overviewSpending, spendingHabits } from './overviewSpending'

const sample = demoTransactions('2026-11')[1]
const row = (fields: Partial<Transaction>): Transaction => ({ ...sample, ...fields })

describe('month overview', () => {
  it('uses the billed day and keeps refunds out of gross shares and card payments out of spending', () => {
    const rows = [
      row({ date: '2026-06-01', billedOn: '2026-11-01', amount: 7_500 }),
      row({ category: 'market', date: '2026-11-05', amount: 2_500 }),
      row({ category: 'market', date: '2026-11-06', kind: 'refund', amount: 4_000 }),
      row({ kind: 'payment', amount: 9_000 }),
    ]
    const overview = overviewSpending(rows, '2026-11', '2026-11-08')
    expect(overview.gross).toBe(10_000)
    expect(overview.refunds).toBe(4_000)
    expect(overview.categories.map(category => category.share)).toEqual([75, 25])
    expect(overview.peak).toMatchObject({ date: '2026-11-01', net: 7_500 })
    expect(overview.days[5]).toMatchObject({ date: '2026-11-06', net: -4_000, count: 1 })
    expect(overview.days[7]).toMatchObject({ count: 0, net: 0 })
    expect(overview.days).toHaveLength(8)
    expect(biggestBudgetOverrun(rows, [{ category: 'rent', limit: 5_000 }])?.difference).toBe(2_500)
  })

  it('keeps all-period breakdowns available and requires a single month for daily data', () => {
    const report = overviewSpending([row({ amount: 1_000 })], 'all', '2026-11-08')
    expect(report.days).toEqual([])
    expect(report.categories[0].share).toBe(100)
  })

  it('explains the score against configured targets and omits unavailable criteria', () => {
    expect(spendingHabits(20_000, 25_000, 15_000, 10_000, 5_000, true)?.score).toBe(64)
    expect(spendingHabits(20_000, 25_000, 0, 0, 5_000, true)).toBeNull()
    expect(spendingHabits(20_000, 25_000, 0, 10_000, 5_000, false)).toBeNull()
    expect(spendingHabits(20_000, 25_000, 0, 10_000, 5_000, true)?.components).toHaveLength(2)
  })
})
