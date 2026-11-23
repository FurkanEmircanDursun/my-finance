import { afterEach, describe, expect, it, vi } from 'vitest'
import { QUARTER_GOLD_PURE_GRAMS, TROY_OUNCE_GRAMS } from '../domain/assets'
import { isQuoteStale, parseExchangeRates, parseFrankfurterRates, parseTruncgilRates } from './rates'

const now = Date.parse('2026-11-14T10:30:00Z')
const rawMarket = { Update_Date: '2026-11-14 13:16:02', HAS: { Buying: 6248.13, Selling: 6249.13 }, GUMUS: { Buying: 79.1, Selling: 79.18 }, USD: { Buying: 50.35, Selling: 50.37 }, EUR: { Buying: 55.55, Selling: 55.57 }, ONS: { Buying: 0, Selling: 0 } }
const rawReference = [
  { date: '2026-11-13', base: 'USD', quote: 'TRY', rate: 50 },
  { date: '2026-11-13', base: 'USD', quote: 'EUR', rate: 0.9 },
  { date: '2026-11-13', base: 'USD', quote: 'XAU', rate: 0.00025 },
  { date: '2026-11-13', base: 'USD', quote: 'XAG', rate: 0.02 },
]
const response = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response)

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('market data normalization', () => {
  it('uses midpoint, Turkey timestamps and quarter pure-metal content, never zero ONS', () => {
    const quotes = parseTruncgilRates(rawMarket, now)
    expect(Object.keys(quotes)).toHaveLength(5)
    expect(quotes['gold-gram']?.tryPerUnit).toBeCloseTo(6248.63)
    expect(quotes['gold-quarter']?.tryPerUnit).toBeCloseTo(6248.63 * QUARTER_GOLD_PURE_GRAMS)
    expect(quotes['silver-gram']?.tryPerUnit).toBeCloseTo(79.14)
    expect(quotes.usd?.asOf).toBe(Date.parse('2026-11-14T10:16:02Z'))
    expect(quotes.usd?.kind).toBe('market')
  })
  it('rejects bad, future, expired and inverted quotes rather than presenting them as current', () => {
    expect(parseTruncgilRates({ ...rawMarket, Update_Date: '2026-11-15 13:00:00' }, now)).toEqual({})
    expect(parseTruncgilRates({ ...rawMarket, Update_Date: '2026-10-01 13:00:00' }, now)).toEqual({})
    expect(parseTruncgilRates({ ...rawMarket, HAS: { Buying: 10, Selling: 0 } }, now)['gold-gram']).toBeUndefined()
    expect(parseTruncgilRates({ ...rawMarket, HAS: { Buying: 10, Selling: 9 } }, now)['gold-gram']).toBeUndefined()
    expect(parseTruncgilRates({ ...rawMarket, HAS: { Buying: '6248', Selling: '6249' } }, now)['gold-gram']).toBeUndefined()
  })
  it('inverts ounce-per-USD reference rates and preserves their oldest contributing date', () => {
    const quotes = parseFrankfurterRates(rawReference, now)
    expect(quotes['gold-gram']?.tryPerUnit).toBeCloseTo(50 / 0.00025 / TROY_OUNCE_GRAMS)
    expect(quotes.eur?.tryPerUnit).toBeCloseTo(50 / 0.9)
    expect(quotes.usd?.kind).toBe('reference')
    expect(quotes['gold-quarter']?.tryPerUnit).toBeCloseTo(quotes['gold-gram']!.tryPerUnit * QUARTER_GOLD_PURE_GRAMS)
  })
  it('validates the independent currency fallback and distinguishes stale data', () => {
    const quotes = parseExchangeRates({ result: 'success', base_code: 'USD', time_last_update_unix: now / 1000, rates: { USD: 1, TRY: 50, EUR: 0.9 } }, now)
    expect(quotes.eur?.tryPerUnit).toBeCloseTo(50 / 0.9)
    expect(parseExchangeRates({ result: 'success', base_code: 'EUR' }, now)).toEqual({})
    expect(isQuoteStale(quotes.usd!, now + 37 * 60 * 60 * 1000)).toBe(true)
    expect(isQuoteStale(parseTruncgilRates(rawMarket, now).usd!, now + 2 * 60 * 60 * 1000)).toBe(true)
  })
})

describe('rate refresh lifecycle', () => {
  it('deduplicates concurrent refresh and respects the request cooldown', async () => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now)
    const fetcher = vi.fn().mockImplementation(() => response(rawMarket))
    vi.stubGlobal('fetch', fetcher)
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
    const service = await import('./rates')
    const first = service.refreshAssetRates(true)
    expect(service.refreshAssetRates(true)).toBe(first)
    expect(Object.keys((await first).quotes)).toHaveLength(5)
    await service.refreshAssetRates(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('uses an independent reference provider when the live provider fails', async () => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now)
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('provider down')).mockImplementationOnce(() => response(rawReference))
    vi.stubGlobal('fetch', fetcher)
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
    const service = await import('./rates')
    const snapshot = await service.refreshAssetRates()
    expect(snapshot.quotes['gold-gram']?.source).toBe('frankfurter')
    expect(snapshot.quotes['gold-gram']?.kind).toBe('reference')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('keeps dated cached quotes during a total outage and reports unavailable prices honestly', async () => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now)
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => rawMarket })
    vi.stubGlobal('fetch', fetcher)
    const service = await import('./rates')
    await service.refreshAssetRates()
    vi.setSystemTime(now + 10 * 60 * 1000)
    fetcher.mockRejectedValue(new Error('offline'))
    const snapshot = await service.refreshAssetRates()
    expect(snapshot.quotes['gold-gram']?.cached).toBe(true)
    expect(snapshot.warning).toContain('Son kaydedilen')
    vi.resetModules()
    const empty = await import('./rates')
    expect((await empty.refreshAssetRates()).quotes).toEqual({})
  })
})
