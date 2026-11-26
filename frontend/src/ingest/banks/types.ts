import { addDays, toEpochDay, type DayKey } from '../../core/date'
import type { Money } from '../../core/money'
import type { CategoryId } from '../../domain/categories'
import type { ForeignAmount, IgnoredRow, Installment, StatementSummary, TxKind } from '../../domain/types'

/** What an adapter emits before ids, categories and merchants are attached. */
export interface RawRow {
  date: DayKey
  description: string
  /** Always positive. */
  amount: Money
  kind: TxKind
  installment: Installment | null
  raw: string
  /** Original foreign-currency price, when the line discloses one. */
  foreign?: ForeignAmount
  /** Bonus / chip-para this purchase earned, in the programme's minor units. */
  reward?: Money
  /** Adapter may pre-assign a category when the line itself is conclusive. */
  category?: CategoryId
  /**
   * Weaker signal than `category`: used only when the keyword classifier finds
   * nothing. Garanti groups rows under its own section headings, which are
   * useful but not always right, so they lose to our own rules.
   */
  categoryHint?: CategoryId
}

export interface AdapterOutput {
  rows: RawRow[]
  /** Lines that looked like transactions but could not be read. */
  skipped: number
  /** Loyalty and campaign lines read but deliberately not counted as money. */
  ignored: IgnoredRow[]
  periodStart: DayKey | null
  periodEnd: DayKey | null
  dueDate: DayKey | null
  accountLabel: string
  /** The cover figures the bank prints — used to verify the rows, never to replace them. */
  summary: StatementSummary
  printedTotals?: { charges: Money; payments: Money; paymentLikeRefunds?: Money }
}

const CURRENCY_SYMBOLS: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' }

/**
 * "orjinal tutar 3.99 $" → { amount: 399, currency: 'USD' }. Akbank prints the
 * original price inside the description; the TL column stays the billed amount.
 */
const FOREIGN_NOTE_RE =
  /\(?\s*orjinal\s+tutar\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*([$€£]|USD|EUR|GBP)?\s*\)?/i

/** QNB prints "(USD 5.00)" or "(EUR 12.99)" beside the merchant name. */
const PAREN_CURRENCY_RE = /\(\s*(USD|EUR|GBP)\s+(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*\)/i

export function readForeignAmount(description: string): ForeignAmount | undefined {
  const match = FOREIGN_NOTE_RE.exec(description)
  if (match) {
    const value = Number.parseFloat(match[1].replace(/,/g, ''))
    if (Number.isFinite(value) && value > 0) {
      const symbol = (match[2] ?? '').toUpperCase()
      return { amount: Math.round(value * 100), currency: CURRENCY_SYMBOLS[symbol] ?? (symbol || 'USD') }
    }
  }

  const paren = PAREN_CURRENCY_RE.exec(description)
  if (paren) {
    const value = Number.parseFloat(paren[2].replace(/,/g, ''))
    if (Number.isFinite(value) && value > 0) {
      return { amount: Math.round(value * 100), currency: paren[1].toUpperCase() }
    }
  }

  return undefined
}

/** Removes foreign-currency notes such as "(orjinal tutar …)" or "(USD 5.00)". */
export function stripForeignNote(description: string): string {
  return description
    .replace(FOREIGN_NOTE_RE, ' ')
    .replace(PAREN_CURRENCY_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export interface BankAdapter {
  id: string
  /** Human-readable bank name written onto every transaction. */
  bank: string
  /**
   * Confidence that this adapter owns the document, 0-1.
   * The registry picks the highest scorer above `MIN_CONFIDENCE`.
   */
  detect(text: string): number
  parse(text: string): AdapterOutput
}

/**
 * Longest a single card cycle can plausibly be. Banks shift the cut date by a
 * few days for weekends and holidays, so a cycle runs roughly 28–35 days; 45
 * leaves room for that without admitting a date from a different cycle.
 */
const MAX_CYCLE_DAYS = 45

/** Cycle length assumed when a statement gives nothing better to go on. */
const DEFAULT_CYCLE_DAYS = 31

/**
 * When a statement's period actually started.
 *
 * The earliest transaction date is **not** the answer, which is what this whole
 * helper exists to say. An instalment row carries the date of the *original
 * purchase*, not of the charge on this statement:
 *
 *   05/07/2026 TRENDYOL.COM (1,065.00 TL) 3/2.taksit  355.00
 *
 * That line is the second of three instalments, billed in a statement whose own
 * printed period is 27/07–28/08. Reading the period start off the rows stretched
 * a 33-day cycle into 55 days.
 *
 * The damage was not cosmetic. `coverageDaysByMonth` feeds `monthsEquivalent`,
 * which is the divisor behind every "per month" figure in the app — so a period
 * inflated by 67% halved the reported monthly spend and, because assumed income
 * is scaled by the same coverage, inflated reported savings and the health
 * score with it. On the statements this was found with, "aylık ortalama" read
 * ₺28.164 where the truth was ₺45.796.
 *
 * So: trust the printed period when the bank prints one; otherwise fall back to
 * the rows, but refuse a span no card cycle could produce.
 */
export function resolvePeriodStart({
  printed,
  earliestRow,
  periodEnd,
}: {
  /** Period start as printed on the statement, when it prints one. */
  printed: DayKey | null
  earliestRow: DayKey | null
  periodEnd: DayKey | null
}): DayKey | null {
  if (printed) return printed
  if (!periodEnd) return earliestRow
  if (!earliestRow) return addDays(periodEnd, -(DEFAULT_CYCLE_DAYS - 1))

  const span = toEpochDay(periodEnd) - toEpochDay(earliestRow)
  if (span >= 0 && span <= MAX_CYCLE_DAYS) return earliestRow

  return addDays(periodEnd, -(DEFAULT_CYCLE_DAYS - 1))
}

/**
 * Rows that represent paying the card off, not spending.
 * Treated as `payment` so they never distort spend totals.
 */
export const PAYMENT_PATTERNS =
  /(ÖDEMENİZ|ODEMENIZ|TEŞEKKÜR|TESEKKUR|TAHSİLAT|TAHSILAT|KREDİ KARTI ÖDEME|KREDI KARTI ODEME|HESAPTAN ÖDEME|HESAPTAN ODEME|HESAPTAN AKTARIM|PAYMENT RECEIVED|BORÇ ÖDEME|BORC ODEME|OTOMATİK ÖDEME TALİMATI|OTOMATIK ODEME TALIMATI|OTOMAT[İI]K TAHS[İI]LAT)/i

/**
 * Loyalty currency that never touched real money.
 *
 * The trailing-campaign pattern matters: Akbank lists chip-para awards as
 * ordinary rows ("Ev Ekleme Kampanyasi 100.00"), and counting them as spending
 * inflated the period total by exactly the amount later redeemed.
 */
export const REWARD_ONLY_PATTERNS =
  /(BONUS BEDAVA|CH[İI]P-?\s?PARA KAZAN|PUAN KAZAN|M[İI]L KAZAN|KAMPANYA [İI]ADES[İI]|KAMPANYA\S*\s*$)/i

/**
 * Garanti lists the bonus it awards as rows of their own ("MARKET GENC BONUS",
 * "OTOMATİK FATURA BONUS"). A PDF says which column the number is in, which is
 * authoritative; this wording is only the fallback for a text export that has
 * no columns, so it is never applied when column information exists.
 */
export const LOYALTY_SUFFIX_PATTERN = /\bBONUS\s*$/i
