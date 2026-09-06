import { describe, expect, it } from 'vitest'
import { buildBudgetProgress } from './budgets'
import { toMinor } from '../core/money'
import type { Budget } from '../domain/types'
import type { CategoryId } from '../domain/categories'

function budget(category: CategoryId, limit: number): Budget {
  return { category, limit: toMinor(limit) }
}

describe('buildBudgetProgress', () => {
  it('reads spent from the month-category map, not from an all-time total', () => {
    const totals = new Map<CategoryId, number>([['market', toMinor(1200)]])
    const [progress] = buildBudgetProgress([budget('market', 2000)], totals, {
      month: '2026-08',
      elapsedDays: null,
    })

    expect(progress.spent).toBe(toMinor(1200))
    expect(progress.limit).toBe(toMinor(2000))
    expect(progress.share).toBeCloseTo(0.6)
    expect(progress.status).toBe('ok')
  })

  it('flags a category already over its limit regardless of pace', () => {
    const totals = new Map<CategoryId, number>([['market', toMinor(2500)]])
    const [progress] = buildBudgetProgress([budget('market', 2000)], totals, {
      month: '2026-08',
      elapsedDays: 5, // early in the month — pace alone would not yet call this "over"
    })

    expect(progress.status).toBe('over')
  })

  it('warns from the pace, before the limit is actually crossed', () => {
    // 500 spent in 5 days of a 31-day month projects to ~3.100 against a 2.000 limit.
    const totals = new Map<CategoryId, number>([['market', toMinor(500)]])
    const [progress] = buildBudgetProgress([budget('market', 2000)], totals, {
      month: '2026-08',
      elapsedDays: 5,
    })

    expect(progress.spent).toBeLessThan(progress.limit)
    expect(progress.projected).toBeGreaterThan(progress.limit)
    expect(progress.status).toBe('warning')
  })

  it('warns once spend alone crosses the warning share, even with no pace to project from', () => {
    const totals = new Map<CategoryId, number>([['market', toMinor(1800)]])
    const [progress] = buildBudgetProgress([budget('market', 2000)], totals, {
      month: '2026-08',
      elapsedDays: null, // e.g. statement grouping, or the month is fully behind the data
    })

    expect(progress.projected).toBeNull()
    expect(progress.status).toBe('warning')
  })

  it('does not project from fewer than 5 elapsed days', () => {
    const totals = new Map<CategoryId, number>([['market', toMinor(400)]])
    const [progress] = buildBudgetProgress([budget('market', 2000)], totals, {
      month: '2026-08',
      elapsedDays: 3,
    })

    expect(progress.projected).toBeNull()
  })

  it('treats a category with no spending yet as zero, not a gap', () => {
    const [progress] = buildBudgetProgress([budget('dining', 1000)], new Map(), {
      month: '2026-08',
      elapsedDays: 10,
    })

    expect(progress.spent).toBe(0)
    expect(progress.status).toBe('ok')
  })

  it('orders the worst-off category first', () => {
    const totals = new Map<CategoryId, number>([
      ['market', toMinor(2500)], // over
      ['dining', toMinor(100)], // barely touched
    ])
    const progress = buildBudgetProgress(
      [budget('market', 2000), budget('dining', 1000)],
      totals,
      { month: '2026-08', elapsedDays: null },
    )

    expect(progress.map((p) => p.category)).toEqual(['market', 'dining'])
  })
})
