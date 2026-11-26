import { describe, expect, it } from 'vitest'
import { computeFiftyThirtyTwenty, ruleBucketOf } from './fiftyThirtyTwenty'
import type { CategoryStat } from './types'
import { category, type CategoryId } from '../domain/categories'

function cat(id: CategoryId, total: number): CategoryStat {
  const def = category(id)
  return {
    id: def.id,
    label: def.label,
    color: def.color,
    nature: def.nature,
    total,
    gross: total,
    refunded: 0,
    share: 0,
    count: 1,
    median: total,
    monthlyAverage: total,
  }
}

describe('computeFiftyThirtyTwenty', () => {
  it('accounts for 100% of monthly income including groceries, transport, and unclassified spending', () => {
    const income = 12_500_000 // ₺125.000,00
    const categories = [
      cat('bills', 711_271), // ₺7.112,71 (need)
      cat('dining', 2_310_085), // ₺23.100,85 (want)
      cat('market', 1_000_000), // ₺10.000,00 (mixed -> essential need)
      cat('transport', 244_807), // ₺2.448,07 (mixed -> essential need)
      cat('other', 500_000), // ₺5.000,00 (mixed -> other)
    ]
    const netSpend = categories.reduce((s, c) => s + c.total, 0) // ₺47.661,63

    const res = computeFiftyThirtyTwenty(categories, income, netSpend)

    expect(res.needTotal).toBe(711_271 + 1_000_000 + 244_807)
    expect(res.wantTotal).toBe(2_310_085)
    expect(res.otherTotal).toBe(500_000)
    expect(res.savingsTotal).toBe(income - netSpend)
    expect(res.needTotal + res.wantTotal + res.otherTotal + res.savingsTotal).toBe(income)
    expect(res.base).toBe(income)
    expect(res.deficitTotal).toBe(0)
  })

  it('keeps base equal to income and reports deficit when spending exceeds income', () => {
    const income = 10_000_000 // ₺100.000
    const categories = [cat('rent', 7_000_000), cat('dining', 5_000_000)]
    const netSpend = 12_000_000 // ₺120.000

    const res = computeFiftyThirtyTwenty(categories, income, netSpend)

    expect(res.base).toBe(income)
    expect(res.savingsTotal).toBe(0)
    expect(res.deficitTotal).toBe(2_000_000)
    expect(res.needPct).toBe(70)
    expect(res.wantPct).toBe(50)
    expect(res.savePct).toBe(0)
  })

  it('classifies market/transport as need, home as want, and neutral/other as other', () => {
    expect(ruleBucketOf(cat('market', 100))).toBe('need')
    expect(ruleBucketOf(cat('transport', 100))).toBe('need')
    expect(ruleBucketOf(cat('home', 100))).toBe('want')
    expect(ruleBucketOf(cat('other', 100))).toBe('other')
    expect(ruleBucketOf(cat('fintech', 100))).toBe('other')
    expect(ruleBucketOf(cat('cash', 100))).toBe('other')
  })
})
