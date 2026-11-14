import { describe, expect, it } from 'vitest'
import { buildJourney } from './journey'
import { createEntry } from './entry'

const profile = { spendingLimit: 0, budgets: [] }
const expense = createEntry({
  amount: '10',
  date: '2026-11-01',
  description: 'Kahve',
  kind: 'expense',
  category: 'dining',
  method: 'Nakit',
})!
describe('budget journey', () => {
  it('does not award category completion for empty data or payments', () => {
    expect(buildJourney([], profile).points).toBe(0)
    expect(
      buildJourney([{ ...expense, kind: 'payment' }], profile).points,
    ).toBe(0)
  })
  it('never awards more points for more expensive or repeated spending', () => {
    expect(buildJourney([expense], profile).points).toBe(50)
    expect(
      buildJourney(
        Array.from({ length: 100 }, () => ({ ...expense, amount: 10000000 })),
        profile,
      ).points,
    ).toBe(50)
  })
  it('requires all expense categories and allows refunds without progress inflation', () => {
    expect(
      buildJourney([expense, { ...expense, category: 'other' }], profile)
        .points,
    ).toBe(25)
    expect(buildJourney([{ ...expense, kind: 'refund' }], profile).points).toBe(
      0,
    )
  })
  it('derives progress from current data and can undo completion', () => {
    const rows = [expense, { ...expense, kind: 'income' as const }]
    expect(buildJourney(rows, { ...profile, spendingLimit: 1000 }).points).toBe(
      100,
    )
    expect(buildJourney(rows, profile).points).toBe(75)
  })
})
