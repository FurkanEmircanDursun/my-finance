/**
 * All dates in the domain are stored as `DayKey` ("YYYY-MM-DD") strings.
 *
 * Rationale: a plain sortable string avoids timezone drift (the previous code
 * round-tripped through `toISOString()`, which shifts local dates backwards for
 * UTC+3) and makes grouping a hash lookup instead of a Date allocation.
 */

export type DayKey = string // YYYY-MM-DD
export type MonthKey = string // YYYY-MM

export const TR_MONTHS: Record<string, number> = {
  ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6,
  temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
}

const MONTH_LABELS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

export const WEEKDAY_LABELS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
export const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

/** Fold Turkish characters so month names match regardless of casing quirks. */
export function foldTr(input: string): string {
  return input
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function makeDayKey(year: number, month1: number, day: number): DayKey {
  return `${year}-${pad(month1)}-${pad(day)}`
}

/** "05/07/2026" -> "2026-07-05". Returns null when the shape does not match. */
export function parseSlashDate(raw: string): DayKey | null {
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(raw.trim())
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return makeDayKey(year, month, day)
}

/** "08 Ağustos 2026" -> "2026-08-08". Returns null when the shape does not match. */
export function parseTurkishLongDate(raw: string): DayKey | null {
  const parts = raw.trim().split(/\s+/)
  if (parts.length < 3) return null
  const day = Number(parts[0])
  const month = TR_MONTHS[foldTr(parts[1])]
  const year = Number(parts[2])
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return null
  return makeDayKey(year, month, day)
}

/** Accepts the formats this app can produce, plus ISO. */
export function parseAnyDate(raw: string): DayKey | null {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return parseSlashDate(s) ?? parseTurkishLongDate(s)
}

export function monthOf(day: DayKey): MonthKey {
  return day.slice(0, 7)
}

export function yearOf(key: DayKey | MonthKey): number {
  return Number(key.slice(0, 4))
}

export function monthIndexOf(key: DayKey | MonthKey): number {
  return Number(key.slice(5, 7)) - 1
}

export function dayOfMonth(day: DayKey): number {
  return Number(day.slice(8, 10))
}

export function monthLabel(key: MonthKey, short = false): string {
  const idx = monthIndexOf(key)
  const list = short ? MONTH_SHORT : MONTH_LABELS
  return `${list[idx] ?? '?'} ${yearOf(key)}`
}

export function dayLabel(key: DayKey): string {
  return `${dayOfMonth(key)} ${MONTH_SHORT[monthIndexOf(key)] ?? ''}`
}

export function fullDayLabel(key: DayKey): string {
  return `${dayOfMonth(key)} ${MONTH_LABELS[monthIndexOf(key)] ?? ''} ${yearOf(key)}`
}

/** Days since 1970-01-01 — the unit used for all interval maths. */
export function toEpochDay(key: DayKey): number {
  return Math.round(Date.UTC(yearOf(key), monthIndexOf(key), dayOfMonth(key)) / 86_400_000)
}

export function fromEpochDay(epochDay: number): DayKey {
  const d = new Date(epochDay * 86_400_000)
  return makeDayKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function addDays(key: DayKey, days: number): DayKey {
  return fromEpochDay(toEpochDay(key) + days)
}

export function addMonths(key: MonthKey, months: number): MonthKey {
  const total = yearOf(key) * 12 + monthIndexOf(key) + months
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

export function monthDiff(a: MonthKey, b: MonthKey): number {
  return (yearOf(b) * 12 + monthIndexOf(b)) - (yearOf(a) * 12 + monthIndexOf(a))
}

export function daysInMonth(key: MonthKey): number {
  return new Date(Date.UTC(yearOf(key), monthIndexOf(key) + 1, 0)).getUTCDate()
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key: DayKey): number {
  const jsDay = new Date(Date.UTC(yearOf(key), monthIndexOf(key), dayOfMonth(key))).getUTCDay()
  return jsDay === 0 ? 6 : jsDay - 1
}

export function isWeekend(key: DayKey): boolean {
  return weekdayIndex(key) >= 5
}

/** Inclusive day range, gap-filled. */
export function eachDay(from: DayKey, to: DayKey): DayKey[] {
  const start = toEpochDay(from)
  const end = toEpochDay(to)
  if (end < start) return []
  const out: DayKey[] = new Array(end - start + 1)
  for (let i = 0; i <= end - start; i++) out[i] = fromEpochDay(start + i)
  return out
}

/** Inclusive month range, gap-filled. */
export function eachMonth(from: MonthKey, to: MonthKey): MonthKey[] {
  const span = monthDiff(from, to)
  if (span < 0) return []
  const out: MonthKey[] = new Array(span + 1)
  for (let i = 0; i <= span; i++) out[i] = addMonths(from, i)
  return out
}

export function todayKey(): DayKey {
  const now = new Date()
  return makeDayKey(now.getFullYear(), now.getMonth() + 1, now.getDate())
}
