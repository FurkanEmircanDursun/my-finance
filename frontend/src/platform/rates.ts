import { ASSET_INSTRUMENTS, QUARTER_GOLD_PURE_GRAMS, TROY_OUNCE_GRAMS, type AssetInstrument, type AssetQuote, type AssetQuotes } from '../domain/assets'
import { measureOperation } from './diagnostics'

const MAX_QUOTE_AGE = 7 * 24 * 60 * 60 * 1000
const CACHE_TTL = 5 * 60 * 1000
const REQUEST_COOLDOWN = 60 * 1000
const ENDPOINTS = {
  truncgil: 'https://finans.truncgil.com/v4/today.json',
  frankfurter: 'https://api.frankfurter.dev/v2/rates?base=USD&quotes=TRY,EUR,XAU,XAG',
  exchange: 'https://open.er-api.com/v6/latest/USD',
} as const

export interface RateSnapshot {
  quotes: AssetQuotes
  fetchedAt: number
  warning: string | null
}

type JsonObject = Record<string, unknown>
const record = (value: unknown): JsonObject | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
const price = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1_000_000_000
const usableTime = (value: number, now: number) => Number.isFinite(value) && value > 0 && value <= now + 5 * 60 * 1000 && now - value <= MAX_QUOTE_AGE

function quote(instrument: AssetInstrument, tryPerUnit: number, asOf: number, source: AssetQuote['source'], kind: AssetQuote['kind']): AssetQuote {
  return { instrument, tryPerUnit, asOf, source, kind, cached: false }
}

/** Truncgil publishes its local timestamp in Turkey time and numeric bid/ask pairs. */
export function parseTruncgilRates(value: unknown, now = Date.now()): AssetQuotes {
  const data = record(value)
  if (!data || typeof data.Update_Date !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(data.Update_Date)) return {}
  const asOf = Date.parse(`${data.Update_Date.replace(' ', 'T')}+03:00`)
  if (!usableTime(asOf, now)) return {}
  if (new Date(asOf + 3 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ') !== data.Update_Date) return {}
  const midpoint = (key: string): number | null => {
    const row = record(data[key])
    if (!row || !price(row.Buying) || !price(row.Selling) || row.Selling < row.Buying) return null
    return (row.Buying + row.Selling) / 2
  }
  const result: AssetQuotes = {}
  const gram = midpoint('HAS')
  const silver = midpoint('GUMUS')
  const usd = midpoint('USD')
  const eur = midpoint('EUR')
  if (gram !== null) {
    result['gold-gram'] = quote('gold-gram', gram, asOf, 'truncgil', 'market')
    result['gold-quarter'] = quote('gold-quarter', gram * QUARTER_GOLD_PURE_GRAMS, asOf, 'truncgil', 'market')
  }
  if (silver !== null) result['silver-gram'] = quote('silver-gram', silver, asOf, 'truncgil', 'market')
  if (usd !== null) result.usd = quote('usd', usd, asOf, 'truncgil', 'market')
  if (eur !== null) result.eur = quote('eur', eur, asOf, 'truncgil', 'market')
  return result
}

/** Daily official-source fallback. XAU/XAG quotes are troy ounces per USD. */
export function parseFrankfurterRates(value: unknown, now = Date.now()): AssetQuotes {
  if (!Array.isArray(value)) return {}
  const rates = new Map<string, { rate: number; asOf: number }>()
  for (const valueRow of value) {
    const row = record(valueRow)
    if (!row || row.base !== 'USD' || typeof row.quote !== 'string' || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !price(row.rate)) continue
    const asOf = Date.parse(`${row.date}T00:00:00Z`)
    if (!usableTime(asOf, now)) continue
    if (asOf >= (rates.get(row.quote)?.asOf ?? 0)) rates.set(row.quote, { rate: row.rate, asOf })
  }
  const usd = rates.get('TRY')
  if (!usd) return {}
  const result: AssetQuotes = { usd: quote('usd', usd.rate, usd.asOf, 'frankfurter', 'reference') }
  const eur = rates.get('EUR')
  if (eur) result.eur = quote('eur', usd.rate / eur.rate, Math.min(usd.asOf, eur.asOf), 'frankfurter', 'reference')
  for (const [symbol, instrument] of [['XAU', 'gold-gram'], ['XAG', 'silver-gram']] as const) {
    const metal = rates.get(symbol)
    if (!metal) continue
    const gram = usd.rate / metal.rate / TROY_OUNCE_GRAMS
    const asOf = Math.min(usd.asOf, metal.asOf)
    if (!price(gram)) continue
    result[instrument] = quote(instrument, gram, asOf, 'frankfurter', 'reference')
    if (instrument === 'gold-gram') result['gold-quarter'] = quote('gold-quarter', gram * QUARTER_GOLD_PURE_GRAMS, asOf, 'frankfurter', 'reference')
  }
  return result
}

export function parseExchangeRates(value: unknown, now = Date.now()): AssetQuotes {
  const data = record(value)
  const rates = record(data?.rates)
  if (!data || data.result !== 'success' || data.base_code !== 'USD' || !rates || rates.USD !== 1 || !price(rates.TRY) || !price(rates.EUR) || typeof data.time_last_update_unix !== 'number') return {}
  const asOf = data.time_last_update_unix * 1000
  if (!usableTime(asOf, now)) return {}
  return {
    usd: quote('usd', rates.TRY, asOf, 'exchangerate-api', 'reference'),
    eur: quote('eur', rates.TRY / rates.EUR, asOf, 'exchangerate-api', 'reference'),
  }
}

export function isQuoteStale(value: AssetQuote, now = Date.now()): boolean {
  return now - value.asOf > (value.kind === 'market' ? 60 * 60 * 1000 : 36 * 60 * 60 * 1000)
}

export function isQuoteAvailable(value: AssetQuote, now = Date.now()): boolean {
  return price(value.tryPerUnit) && usableTime(value.asOf, now)
}

function validatedQuotes(value: unknown, now: number): AssetQuotes {
  const data = record(value)
  if (!data) return {}
  const result: AssetQuotes = {}
  for (const { id } of ASSET_INSTRUMENTS) {
    const row = record(data[id])
    if (!row || row.instrument !== id || !price(row.tryPerUnit) || typeof row.asOf !== 'number' || !usableTime(row.asOf, now) || !['truncgil', 'frankfurter', 'exchangerate-api'].includes(String(row.source)) || !['market', 'reference'].includes(String(row.kind))) continue
    result[id] = { instrument: id, tryPerUnit: row.tryPerUnit, asOf: row.asOf, source: row.source as AssetQuote['source'], kind: row.kind as AssetQuote['kind'], cached: true }
  }
  return result
}

let memory: RateSnapshot | null = null
let inFlight: Promise<RateSnapshot> | null = null
let lastRequest = 0

export function cachedAssetRates(now = Date.now()): RateSnapshot | null {
  if (memory) {
    const quotes = validatedQuotes(memory.quotes, now)
    if (Object.keys(quotes).length) return { ...memory, quotes }
  }
  return null
}

async function requestJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally { clearTimeout(timeout) }
}

/** One refresh at a time; no timers, background polling, account or quantity payload. */
export function refreshAssetRates(force = false): Promise<RateSnapshot> {
  if (inFlight) return inFlight
  const now = Date.now()
  const cached = cachedAssetRates(now)
  if (cached && now - cached.fetchedAt < (force ? REQUEST_COOLDOWN : CACHE_TTL)) return Promise.resolve(cached)
  if (now - lastRequest < REQUEST_COOLDOWN) return Promise.resolve(cached ?? { quotes: {}, fetchedAt: now, warning: 'Kur kaynağına ulaşılamadı. Bir dakika sonra yeniden dene.' })
  lastRequest = now
  inFlight = measureOperation('quote_refresh', async () => {
    let quotes: AssetQuotes = {}
    try { quotes = parseTruncgilRates(await requestJson(ENDPOINTS.truncgil)) } catch { /* Try the independent reference provider. */ }
    if (Object.keys(quotes).length < ASSET_INSTRUMENTS.length) {
      try { quotes = { ...parseFrankfurterRates(await requestJson(ENDPOINTS.frankfurter)), ...quotes } } catch { /* A dated local cache can still cover a provider outage. */ }
    }
    if (!quotes.usd || !quotes.eur) {
      try { quotes = { ...parseExchangeRates(await requestJson(ENDPOINTS.exchange)), ...quotes } } catch { /* Leave unavailable instruments explicitly unpriced. */ }
    }
    const networkCount = Object.keys(quotes).length
    quotes = { ...(cached?.quotes ?? {}), ...quotes }
    const warning = networkCount === 0 ? cached ? 'Kur kaynaklarına ulaşılamadı. Son kaydedilen fiyatlar gösteriliyor.' : 'Kur kaynaklarına ulaşılamadı. Varlıklarını kaydedebilirsin; değerler bağlantı gelince hesaplanır.' : Object.values(quotes).some(value => value?.cached) ? 'Bazı fiyatlar son kaydedilen veriden gösteriliyor.' : null
    const snapshot: RateSnapshot = { quotes, fetchedAt: networkCount ? Date.now() : cached?.fetchedAt ?? Date.now(), warning }
    if (Object.keys(quotes).length) memory = snapshot
    return snapshot
  }).finally(() => { inFlight = null })
  return inFlight
}
