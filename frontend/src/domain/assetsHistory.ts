import type { DayKey, MonthKey } from '../core/date'
import { ASSET_INSTRUMENTS, isAssetHolding, portfolioValue, type AssetHolding, type AssetInstrument, type AssetQuote, type AssetQuotes } from './assets'

export interface AssetValuationRow {
  instrument: AssetInstrument
  quantityMicros: number
  valueMinor: number
  tryPerUnit: number
  quoteAsOf: number
  source: AssetQuote['source']
  kind: AssetQuote['kind']
}

/** A real observation, never a reconstructed investment return. */
export interface AssetValuationSnapshot {
  id: string
  day: DayKey
  observedAt: number
  totalMinor: number
  origin: 'quotes' | 'manual'
  rows: AssetValuationRow[]
}

export const MAX_ASSET_VALUATION_MONTHS = 240
const MAX_CLOCK_SKEW = 5 * 60 * 1000
const maxObservationQuoteAge = (kind: AssetQuote['kind']) => kind === 'market' ? 60 * 60 * 1000 : 36 * 60 * 60 * 1000
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
const monthOf = (day: DayKey): MonthKey => day.slice(0, 7)
const nonNegativeMinor = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799999

export function assetValuationDay(now = Date.now()): DayKey {
  const parts = dayFormatter.formatToParts(now)
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function validDay(value: unknown): value is DayKey {
  if (typeof value !== 'string' || !/^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value)) return false
  const time = Date.parse(`${value}T12:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

function normalizeRow(value: unknown): AssetValuationRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<AssetValuationRow>
  if (!ASSET_INSTRUMENTS.some(item => item.id === row.instrument) || !Number.isSafeInteger(row.quantityMicros) || Number(row.quantityMicros) <= 0 ||
      !nonNegativeMinor(row.valueMinor) || typeof row.tryPerUnit !== 'number' || !Number.isFinite(row.tryPerUnit) || row.tryPerUnit <= 0 || row.tryPerUnit >= 1_000_000_000 ||
      !timestamp(row.quoteAsOf) || !['truncgil', 'frankfurter', 'exchangerate-api'].includes(String(row.source)) || !['market', 'reference'].includes(String(row.kind))) return null
  if (Math.round(Number(row.quantityMicros) / 1_000_000 * row.tryPerUnit * 100) !== row.valueMinor) return null
  return { instrument: row.instrument!, quantityMicros: row.quantityMicros!, valueMinor: row.valueMinor, tryPerUnit: row.tryPerUnit, quoteAsOf: row.quoteAsOf, source: row.source!, kind: row.kind! }
}

function normalizeSnapshot(value: unknown): AssetValuationSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<AssetValuationSnapshot>
  if (!validDay(row.day) || !timestamp(row.observedAt) || !nonNegativeMinor(row.totalMinor) || !Array.isArray(row.rows) || row.rows.length > ASSET_INSTRUMENTS.length ||
      !['quotes', 'manual'].includes(String(row.origin)) || row.day > assetValuationDay(row.observedAt)) return null
  const rows = row.rows.map(normalizeRow)
  if (rows.some(item => item === null)) return null
  const usableRows = rows as AssetValuationRow[]
  if (new Set(usableRows.map(item => item.instrument)).size !== usableRows.length) return null
  if (row.origin === 'manual' && usableRows.length !== 0) return null
  if (row.origin === 'quotes') {
    const total = usableRows.reduce((sum, item) => sum + item.valueMinor, 0)
    if (!Number.isSafeInteger(total) || total !== row.totalMinor || row.day !== assetValuationDay(row.observedAt) ||
        usableRows.some(item => item.quoteAsOf > row.observedAt! + MAX_CLOCK_SKEW || row.observedAt! - item.quoteAsOf > maxObservationQuoteAge(item.kind))) return null
  }
  return { id: `valuation-${monthOf(row.day)}`, day: row.day, observedAt: row.observedAt, totalMinor: row.totalMinor, origin: row.origin!, rows: usableRows.sort((a, b) => a.instrument.localeCompare(b.instrument)) }
}

function isNewer(candidate: AssetValuationSnapshot, previous: AssetValuationSnapshot): boolean {
  return candidate.day > previous.day || (candidate.day === previous.day && candidate.observedAt >= previous.observedAt)
}

/** Keep one latest dated observation per month, bounded for the profile document. */
export function normalizeAssetValuations(value: unknown): AssetValuationSnapshot[] {
  if (!Array.isArray(value)) return []
  const months = new Map<string, AssetValuationSnapshot>()
  for (const raw of value) {
    const snapshot = normalizeSnapshot(raw)
    if (!snapshot) continue
    const previous = months.get(snapshot.id)
    if (!previous || isNewer(snapshot, previous)) months.set(snapshot.id, snapshot)
  }
  return [...months.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-MAX_ASSET_VALUATION_MONTHS)
}

export function mergeAssetValuations(...sources: readonly unknown[]): AssetValuationSnapshot[] {
  return normalizeAssetValuations(sources.flatMap(source => Array.isArray(source) ? source : []))
}

export function upsertAssetValuation(history: readonly AssetValuationSnapshot[], snapshot: AssetValuationSnapshot): AssetValuationSnapshot[] {
  const candidate = normalizeSnapshot(snapshot)
  const previous = history.find(item => item.id === candidate?.id)
  if (!candidate || (previous && !isNewer(candidate, previous))) return history as AssetValuationSnapshot[]
  // Repainting or revisiting a page must not produce an endless profile write.
  if (previous && candidate.day === previous.day && candidate.origin === previous.origin && candidate.totalMinor === previous.totalMinor && JSON.stringify(candidate.rows) === JSON.stringify(previous.rows)) return history as AssetValuationSnapshot[]
  return mergeAssetValuations(history, [candidate])
}

/** Only complete, freshly fetched, dated quotes can establish a market observation. */
export function createAssetValuation(holdings: readonly AssetHolding[], quotes: AssetQuotes, now = Date.now()): AssetValuationSnapshot | null {
  if (!timestamp(now) || holdings.some(item => !isAssetHolding(item))) return null
  const quantities = new Map<AssetInstrument, number>()
  for (const holding of holdings) {
    const quantity = (quantities.get(holding.instrument) ?? 0) + holding.quantityMicros
    if (!Number.isSafeInteger(quantity)) return null
    quantities.set(holding.instrument, quantity)
  }
  const grouped = [...quantities.entries()].map(([instrument, quantityMicros]) => ({ id: instrument, instrument, quantityMicros, updatedAt: now }))
  const portfolio = portfolioValue(grouped, quotes)
  if (portfolio.total === null) return null
  const rows: AssetValuationRow[] = []
  for (const { holding, value } of portfolio.rows) {
    const quote = quotes[holding.instrument]
    if (!quote || quote.cached || !timestamp(quote.asOf) || quote.asOf > now + MAX_CLOCK_SKEW || now - quote.asOf > maxObservationQuoteAge(quote.kind) || value === null) return null
    rows.push({ instrument: holding.instrument, quantityMicros: holding.quantityMicros, valueMinor: value, tryPerUnit: quote.tryPerUnit, quoteAsOf: quote.asOf, source: quote.source, kind: quote.kind })
  }
  const day = assetValuationDay(now)
  return normalizeSnapshot({ id: `valuation-${monthOf(day)}`, day, observedAt: now, totalMinor: portfolio.total, origin: 'quotes', rows })
}

/** A user's dated total is kept explicitly manual, with no invented quantities or prices. */
export function createManualAssetValuation(day: DayKey, totalMinor: number, now = Date.now()): AssetValuationSnapshot | null {
  return normalizeSnapshot({ id: `valuation-${monthOf(day)}`, day, observedAt: now, totalMinor, origin: 'manual', rows: [] })
}

export function monthlyAssetValuations(history: readonly AssetValuationSnapshot[]): AssetValuationSnapshot[] {
  return normalizeAssetValuations(history)
}
