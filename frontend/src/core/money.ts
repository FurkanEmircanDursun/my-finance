/**
 * Money is stored as an integer number of minor units (kuruş).
 *
 * Rationale: repeated float addition over thousands of statement lines drifts
 * (0.1 + 0.2 !== 0.3). Every amount entering the system is converted once at the
 * parser boundary and stays an integer until it is formatted for display.
 */

export type Money = number

export const ZERO: Money = 0

/** 123.45 -> 12345 */
export function toMinor(value: number): Money {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

/** 12345 -> 123.45 */
export function toMajor(value: Money): number {
  return value / 100
}

export function absM(value: Money): Money {
  return value < 0 ? -value : value
}

export function sumM(values: readonly Money[]): Money {
  let total = 0
  for (let i = 0; i < values.length; i++) total += values[i]
  return total
}

/** Ratio of two money values, safe against division by zero. */
export function ratio(part: Money, whole: Money): number {
  if (!whole) return 0
  return part / whole
}

/** Percentage 0-100 with `digits` decimals, safe against division by zero. */
export function pct(part: Money, whole: Money, digits = 1): number {
  if (!whole) return 0
  return round(( part / whole) * 100, digits)
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Turkish grouping: "1.234,56" -> 123456 (minor units).
 * Trailing/leading sign markers used by TR bank statements are handled by the
 * caller; this function only reads magnitude.
 */
export function parseTrAmount(raw: string): Money {
  const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? toMinor(value) : 0
}

/** Anglo grouping: "1,234.56" -> 123456 (minor units). */
export function parseEnAmount(raw: string): Money {
  const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/,/g, '')
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? toMinor(value) : 0
}

/**
 * Detects the grouping convention from the string shape, then parses.
 * Used by the generic CSV adapter where the locale is unknown.
 */
export function parseAmountAuto(raw: string): Money {
  const s = raw.trim()
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) return parseTrAmount(s)
  if (lastDot > lastComma) return parseEnAmount(s)
  // No separator at all, or only grouping separators of one kind.
  return toMinor(Number.parseFloat(s.replace(/[^\d-]/g, '')) || 0)
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const nf0 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nfPlain = new Intl.NumberFormat('tr-TR')

/** "₺1.234" — dashboard default, no decimals. */
export function money(value: Money, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const major = toMajor(value)
  const body = opts.decimals ? nf2.format(Math.abs(major)) : nf0.format(Math.abs(major))
  const neg = value < 0
  const prefix = opts.sign && !neg && value !== 0 ? '+' : neg ? '−' : ''
  return `${prefix}₺${body}`
}

/** "₺1.234,56" — tables and anything the user may reconcile against a statement. */
export function money2(value: Money, opts: { sign?: boolean } = {}): string {
  return money(value, { decimals: true, sign: opts.sign })
}

const nfCompact = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

/** "₺1,2 Mn" — axis labels and dense tiles. */
export function moneyCompact(value: Money): string {
  const major = Math.abs(toMajor(value))
  const sign = value < 0 ? '−' : ''
  // Formatted through Intl so the decimal separator stays a comma in tr-TR.
  if (major >= 1_000_000) return `${sign}₺${nfCompact.format(round(major / 1_000_000, 1))} Mn`
  if (major >= 1_000) {
    return `${sign}₺${nfCompact.format(round(major / 1_000, major >= 10_000 ? 0 : 1))} B`
  }
  return `${sign}₺${nf0.format(major)}`
}

export function count(value: number): string {
  return nfPlain.format(value)
}

export function percent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '%0'
  return `%${nfPlain.format(round(value, digits))}`
}

export function signedPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '%0'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}%${nfPlain.format(round(Math.abs(value), digits))}`
}
