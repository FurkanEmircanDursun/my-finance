import type { DayKey } from '../../core/date'
import type { Money } from '../../core/money'
import type { CategoryId } from '../../domain/categories'
import type { Installment, TxKind } from '../../domain/types'

/** What an adapter emits before ids, categories and merchants are attached. */
export interface RawRow {
  date: DayKey
  description: string
  /** Always positive. */
  amount: Money
  kind: TxKind
  installment: Installment | null
  raw: string
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
  periodStart: DayKey | null
  periodEnd: DayKey | null
  dueDate: DayKey | null
  accountLabel: string
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
 * Rows that represent paying the card off, not spending.
 * Treated as `payment` so they never distort spend totals.
 */
export const PAYMENT_PATTERNS =
  /(ÖDEMENİZ|ODEMENIZ|TEŞEKKÜR|TESEKKUR|TAHSİLAT|TAHSILAT|KREDİ KARTI ÖDEME|KREDI KARTI ODEME|HESAPTAN ÖDEME|HESAPTAN ODEME|PAYMENT RECEIVED|BORÇ ÖDEME|BORC ODEME|OTOMATİK ÖDEME TALİMATI)/i

/**
 * Loyalty currency that never touched real money.
 *
 * The trailing-campaign pattern matters: Akbank lists chip-para awards as
 * ordinary rows ("Ev Ekleme Kampanyasi 100.00"), and counting them as spending
 * inflated the period total by exactly the amount later redeemed.
 */
export const REWARD_ONLY_PATTERNS =
  /(BONUS BEDAVA|CH[İI]P-?\s?PARA KAZAN|PUAN KAZAN|M[İI]L KAZAN|KAMPANYA [İI]ADES[İI]|KAMPANYA\S*\s*$)/i
