export type AssetInstrument = 'gold-gram' | 'gold-quarter' | 'silver-gram' | 'usd' | 'eur'

export interface AssetHolding {
  id: string
  instrument: AssetInstrument
  /** Six decimal places; holdings never enter the income/expense ledger. */
  quantityMicros: number
  updatedAt: number
}

export interface AssetQuote {
  instrument: AssetInstrument
  tryPerUnit: number
  asOf: number
  source: 'truncgil' | 'frankfurter' | 'exchangerate-api'
  kind: 'market' | 'reference'
  cached: boolean
}

export type AssetQuotes = Partial<Record<AssetInstrument, AssetQuote>>

export const QUANTITY_SCALE = 1_000_000
export const TROY_OUNCE_GRAMS = 31.1034768
/** Darphane's quarter ziynet standard, distinct from the 1.804 g quarter sikke. */
export const QUARTER_GOLD_PURE_GRAMS = 1.754 * 0.9166
export const ASSET_INSTRUMENTS: { id: AssetInstrument; label: string; unit: string; color: string; note: string }[] = [
  { id: 'gold-gram', label: 'Gram altın', unit: 'gram', color: '#ae853a', note: 'Saf / has altın gram referansı' },
  { id: 'gold-quarter', label: 'Çeyrek altın', unit: 'adet', color: '#c39849', note: '22 ayar ziynet · 1,754 g · metal değeri' },
  { id: 'silver-gram', label: 'Gram gümüş', unit: 'gram', color: '#77889b', note: 'Saf gümüş gram referansı' },
  { id: 'usd', label: 'Amerikan doları', unit: 'USD', color: '#34866d', note: 'USD / TRY referans kuru' },
  { id: 'eur', label: 'Euro', unit: 'EUR', color: '#7161d8', note: 'EUR / TRY referans kuru' },
]

export function isAssetHolding(value: unknown): value is AssetHolding {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 128 &&
    ASSET_INSTRUMENTS.some(item => item.id === row.instrument) &&
    Number.isSafeInteger(row.quantityMicros) && Number(row.quantityMicros) > 0 &&
    Number.isSafeInteger(row.updatedAt) && Number(row.updatedAt) >= 0
}

export function normalizeAssetHoldings(value: unknown): AssetHolding[] {
  if (!Array.isArray(value)) return []
  const unique = new Map<string, AssetHolding>()
  for (const row of value) {
    if (!isAssetHolding(row)) continue
    const previous = unique.get(row.id)
    if (!previous || row.updatedAt >= previous.updatedAt) {
      unique.set(row.id, { id: row.id, instrument: row.instrument, quantityMicros: row.quantityMicros, updatedAt: row.updatedAt })
    }
  }
  return [...unique.values()]
}

/** Strict Turkish quantities, converted without floating-point parsing. */
export function parseAssetQuantity(input: string): number | null {
  const value = input.trim()
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,6})?$/.test(value)) return null
  const [whole, fraction = ''] = value.replace(/\./g, '').split(',')
  const micros = BigInt(whole) * BigInt(QUANTITY_SCALE) + BigInt(fraction.padEnd(6, '0'))
  return micros > 0 && micros <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(micros) : null
}

export function quantityInput(micros: number): string {
  const whole = Math.floor(micros / QUANTITY_SCALE)
  const fraction = String(micros % QUANTITY_SCALE).padStart(6, '0').replace(/0+$/, '')
  return `${whole}${fraction ? `,${fraction}` : ''}`
}

export function formatAssetQuantity(micros: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 6 }).format(micros / QUANTITY_SCALE)
}

/** Invalid or unavailable quotes remain unpriced, never silently worth zero. */
export function holdingValueMinor(holding: AssetHolding, quote: AssetQuote | undefined): number | null {
  if (!quote || quote.instrument !== holding.instrument || !Number.isFinite(quote.tryPerUnit) || quote.tryPerUnit <= 0) return null
  const result = Math.round(holding.quantityMicros / QUANTITY_SCALE * quote.tryPerUnit * 100)
  return Number.isSafeInteger(result) && result >= 0 ? result : null
}

export function portfolioValue(holdings: readonly AssetHolding[], quotes: AssetQuotes) {
  const rows = holdings.map(holding => ({ holding, value: holdingValueMinor(holding, quotes[holding.instrument]) }))
  const missing = rows.filter(row => row.value === null).length
  const knownValue = rows.reduce((sum, row) => sum + (row.value ?? 0), 0)
  const safe = Number.isSafeInteger(knownValue)
  return { rows, missing, knownValue: safe ? knownValue : null, total: missing === 0 && safe ? knownValue : null }
}
