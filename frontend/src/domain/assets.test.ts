import { describe, expect, it } from 'vitest'
import { holdingValueMinor, isAssetHolding, normalizeAssetHoldings, parseAssetQuantity, portfolioValue, quantityInput, type AssetHolding, type AssetQuote } from './assets'

const holding: AssetHolding = { id: 'gold', instrument: 'gold-gram', quantityMicros: 1_250_000, updatedAt: 1 }
const quote: AssetQuote = { instrument: 'gold-gram', tryPerUnit: 6000.25, asOf: 1, source: 'truncgil', kind: 'market', cached: false }

describe('asset holdings', () => {
  it('parses exact Turkish quantities to six decimal places', () => {
    expect(parseAssetQuantity('1.250,123456')).toBe(1_250_123_456)
    expect(parseAssetQuantity('0,000001')).toBe(1)
    expect(parseAssetQuantity('1,25')).toBe(1_250_000)
    for (const input of ['0', '-1', '1,1234567', '1.25', '1abc', 'Infinity', '999999999999999999']) expect(parseAssetQuantity(input)).toBeNull()
    expect(quantityInput(1_250_001)).toBe('1,250001')
    expect(quantityInput(2_000_000)).toBe('2')
  })
  it('normalizes untrusted backups, invalid quantities and duplicate IDs', () => {
    expect(isAssetHolding(holding)).toBe(true)
    expect(isAssetHolding({ ...holding, quantityMicros: 1.2 })).toBe(false)
    expect(isAssetHolding({ ...holding, instrument: 'bitcoin' })).toBe(false)
    expect(normalizeAssetHoldings([null, holding, { ...holding, quantityMicros: -1 }, { ...holding, updatedAt: 2, quantityMicros: 2_000_000, extra: 'discard' }])).toEqual([{ ...holding, updatedAt: 2, quantityMicros: 2_000_000 }])
  })
  it('rounds only the final valuation to integer kuruş', () => {
    expect(holdingValueMinor(holding, quote)).toBe(750031)
    expect(holdingValueMinor(holding, undefined)).toBeNull()
    expect(holdingValueMinor(holding, { ...quote, tryPerUnit: NaN })).toBeNull()
    expect(holdingValueMinor({ ...holding, quantityMicros: Number.MAX_SAFE_INTEGER }, { ...quote, tryPerUnit: 1e9 })).toBeNull()
  })
  it('never treats missing quotes as zero or a partial portfolio as its total', () => {
    const silver: AssetHolding = { ...holding, id: 'silver', instrument: 'silver-gram' }
    const portfolio = portfolioValue([holding, silver], { 'gold-gram': quote })
    expect(portfolio.total).toBeNull()
    expect(portfolio.knownValue).toBe(750031)
    expect(portfolio.missing).toBe(1)
    expect(portfolioValue([], {}).total).toBe(0)
  })
})
