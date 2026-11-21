import { describe, expect, it } from 'vitest'
import type { AssetHolding, AssetQuote } from './assets'
import { assetValuationDay, createAssetValuation, createManualAssetValuation, MAX_ASSET_VALUATION_MONTHS, mergeAssetValuations, monthlyAssetValuations, normalizeAssetValuations, upsertAssetValuation } from './assetsHistory'

const now = Date.parse('2026-11-14T12:00:00+03:00')
const holding: AssetHolding = { id: 'usd', instrument: 'usd', quantityMicros: 2_500_000, updatedAt: now }
const quote: AssetQuote = { instrument: 'usd', tryPerUnit: 40, asOf: now - 1000, source: 'truncgil', kind: 'market', cached: false }

describe('genuine portfolio observations', () => {
  it('records a complete quote-based value with exact quantity, source and quote date', () => {
    const snapshot = createAssetValuation([holding], { usd: quote }, now)!
    expect(snapshot).toEqual({ id: 'valuation-2026-11', day: '2026-11-14', observedAt: now, totalMinor: 10_000, origin: 'quotes', rows: [
      { instrument: 'usd', quantityMicros: 2_500_000, valueMinor: 10_000, tryPerUnit: 40, quoteAsOf: now - 1000, source: 'truncgil', kind: 'market' },
    ] })
  })
  it('uses Istanbul observation dates across the UTC day boundary', () => {
    expect(assetValuationDay(Date.parse('2026-10-31T22:00:00Z'))).toBe('2026-11-01')
  })
  it('groups the same instrument while rejecting missing, cached and expired prices', () => {
    expect(createAssetValuation([holding, { ...holding, id: 'second' }], { usd: quote }, now)?.totalMinor).toBe(20_000)
    expect(createAssetValuation([holding], {}, now)).toBeNull()
    expect(createAssetValuation([holding], { usd: { ...quote, cached: true } }, now)).toBeNull()
    expect(createAssetValuation([holding], { usd: { ...quote, asOf: now - 2 * 60 * 60 * 1000 } }, now)).toBeNull()
    expect(createAssetValuation([holding], { usd: { ...quote, asOf: now - 8 * 86_400_000 } }, now)).toBeNull()
    expect(createAssetValuation([holding], { usd: { ...quote, kind: 'reference', asOf: now - 24 * 60 * 60 * 1000 } }, now)?.totalMinor).toBe(10_000)
    expect(createAssetValuation([holding], { usd: { ...quote, kind: 'reference', asOf: now - 48 * 60 * 60 * 1000 } }, now)).toBeNull()
    expect(createAssetValuation([holding], { usd: { ...quote, asOf: now + 6 * 60_000 } }, now)).toBeNull()
  })
  it('does not persist overflowing quantities or valuations', () => {
    expect(createAssetValuation([{ ...holding, quantityMicros: Number.MAX_SAFE_INTEGER }, { ...holding, id: 'second' }], { usd: quote }, now)).toBeNull()
    expect(createAssetValuation([{ ...holding, quantityMicros: Number.MAX_SAFE_INTEGER }], { usd: { ...quote, tryPerUnit: 999_999_999 } }, now)).toBeNull()
  })
  it('represents an explicitly empty observed portfolio as zero, never an unpriced holding', () => {
    expect(createAssetValuation([], {}, now)).toMatchObject({ totalMinor: 0, rows: [], origin: 'quotes' })
  })
})

describe('user-provided historical totals and monthly preservation', () => {
  it('keeps a manual total without inventing historical prices or quantities', () => {
    expect(createManualAssetValuation('2026-10-31', 150_000, now)).toEqual({ id: 'valuation-2026-10', day: '2026-10-31', observedAt: now, totalMinor: 150_000, origin: 'manual', rows: [] })
    expect(createManualAssetValuation('2026-10-31', 0, now)?.totalMinor).toBe(0)
  })
  it('rejects future/invalid dates and unsafe totals', () => {
    for (const day of ['2026-11-15', '2026-02-30', '2026-13-01', '0000-01-01', 'x']) expect(createManualAssetValuation(day, 100, now)).toBeNull()
    for (const total of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(createManualAssetValuation('2026-10-31', total, now)).toBeNull()
  })
  it('keeps the latest observation date in a month ahead of a later-entered earlier date', () => {
    const later = createManualAssetValuation('2026-10-31', 20_000, now)!
    const earlier = createManualAssetValuation('2026-10-10', 10_000, now + 1000)!
    expect(mergeAssetValuations([later], [earlier])).toEqual([later])
    expect(upsertAssetValuation([later], earlier)).toEqual([later])
    const correction = createManualAssetValuation('2026-10-31', 25_000, now + 1000)!
    expect(mergeAssetValuations([later], [correction])).toEqual([correction])
  })
  it('does not create repeated profile writes for the same observation data', () => {
    const snapshot = createAssetValuation([holding], { usd: quote }, now)!
    const history = [snapshot]
    expect(upsertAssetValuation(history, { ...snapshot, observedAt: now + 1000 })).toBe(history)
    const changedQuote = createAssetValuation([holding], { usd: { ...quote, tryPerUnit: 41 } }, now + 1000)!
    expect(upsertAssetValuation(history, changedQuote)[0].totalMinor).toBe(10_250)
  })
  it('returns real months only, sorted, without filling missing valuation history', () => {
    const january = createManualAssetValuation('2026-01-31', 20_000, now)!
    const november = createAssetValuation([holding], { usd: quote }, now)!
    expect(monthlyAssetValuations([november, january]).map(row => row.day.slice(0, 7))).toEqual(['2026-01', '2026-11'])
  })
  it('rejects inconsistent totals, duplicates, unknown source and invented manual rows', () => {
    const snapshot = createAssetValuation([holding], { usd: quote }, now)!
    expect(normalizeAssetValuations([
      { ...snapshot, totalMinor: 1 }, { ...snapshot, rows: [...snapshot.rows, ...snapshot.rows] },
      { ...snapshot, rows: [{ ...snapshot.rows[0], source: 'unknown' }] }, { ...snapshot, origin: 'manual' },
    ])).toEqual([])
  })
  it('bounds profile history to the latest 240 monthly observations', () => {
    const history = Array.from({ length: 241 }, (_, index) => createManualAssetValuation(`${2000 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-01`, 100, now)!)
    const bounded = normalizeAssetValuations(history)
    expect(bounded).toHaveLength(MAX_ASSET_VALUATION_MONTHS)
    expect(bounded[0].day).toBe('2000-02-01')
    expect(bounded[bounded.length - 1]?.day).toBe('2020-01-01')
  })
})
