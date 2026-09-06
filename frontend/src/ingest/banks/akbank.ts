import { parseEnAmount, type Money } from '../../core/money'
import { parseSlashDate, type DayKey } from '../../core/date'
import type { AdapterOutput, BankAdapter, RawRow } from './types'
import { PAYMENT_PATTERNS, REWARD_ONLY_PATTERNS } from './types'
import type { Installment, TxKind } from '../../domain/types'

/**
 * Akbank / Axess statement lines look like:
 *
 *   05/07/2026 TRENDYOL.COM (1,065.00 TL) 3/2.taksit 355.00 355.00x1
 *   18/07/2026 KENT ECZANESI (1,012.53 TL +Vade Farkı) 3/2.taksit 337.51 337.51x1
 *   09/07/2026 SPOTIFY 149.99
 *   14/07/2026 IADE - TRENDYOL 220.00(-)
 *
 * Amounts use Anglo grouping (1,065.00). The first amount in the trailing run
 * is the amount billed on this statement; the rest are instalment remainder and
 * loyalty columns. `N/M.taksit` reads as total/current — verified against the
 * disclosed principal: 1,065.00 / 3 == 355.00.
 */

const LINE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/
const PRINCIPAL_RE = /\(([\d,.]+)\s*TL[^)]*\)/
const INSTALLMENT_RE = /(?:^|\s)(\d{1,2})\/(\d{1,2})\s*\.?\s*taksit/i
const AMOUNT_TOKEN_RE = /^[\d,]+\.\d{2}(?:\(-\))?(?:x\d+)?$|^[\d,]+(?:\(-\))?(?:x\d+)?$/

const DUE_DATE_RE = /Son\s+Ödeme\s+Tarihi[\s:]*([\d]{2}[./][\d]{2}[./][\d]{4})/i
const CUT_DATE_RE = /(?:Hesap\s+Kesim|Hesap\s+Özeti)\s+Tarihi[\s:]*([\d]{2}[./][\d]{2}[./][\d]{4})/i
const CARD_RE = /\b(Axess|Wings|Free Card|Fish|Neo)\b/i

function looksLikeAmount(token: string): boolean {
  return AMOUNT_TOKEN_RE.test(token) && /\d/.test(token)
}

function readAmount(token: string): { value: Money; credit: boolean } {
  const credit = token.includes('(-)')
  const body = token.replace(/\(-\)/g, '').replace(/x\d+$/i, '')
  return { value: Math.abs(parseEnAmount(body)), credit }
}

function detect(text: string): number {
  const slashDates = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/g)?.length ?? 0
  if (slashDates < 3) return 0

  let score = Math.min(0.6, slashDates / 60)
  if (/\bAKBANK\b/i.test(text)) score += 0.35
  if (/\bAXESS\b/i.test(text)) score += 0.2
  if (/taksit/i.test(text)) score += 0.1
  // Anglo grouping is the Akbank tell; Garanti uses 1.234,56.
  if (/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/.test(text)) score += 0.15
  return Math.min(1, score)
}

function parse(text: string): AdapterOutput {
  const rows: RawRow[] = []
  let skipped = 0
  let minDate: DayKey | null = null
  let maxDate: DayKey | null = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const match = LINE_RE.exec(line)
    if (!match) continue

    const date = parseSlashDate(match[1])
    if (!date) {
      skipped++
      continue
    }

    // Peel trailing numeric columns off the right.
    const parts = match[2].trim().split(/\s+/)
    const trailing: string[] = []
    while (parts.length && looksLikeAmount(parts[parts.length - 1])) {
      trailing.unshift(parts.pop()!)
    }
    if (!trailing.length) {
      skipped++
      continue
    }

    let description = parts.join(' ')
    const { value: amount, credit } = readAmount(trailing[0])

    // Instalment metadata is read before the description is cleaned.
    let installment: Installment | null = null
    const instMatch = INSTALLMENT_RE.exec(description)
    if (instMatch) {
      const total = Number(instMatch[1])
      const current = Number(instMatch[2])
      if (total > 0 && current > 0) {
        installment = {
          current: Math.min(current, total),
          total: Math.max(current, total),
        }
      }
    }

    const principalMatch = PRINCIPAL_RE.exec(description)
    if (principalMatch && installment) {
      installment.principal = parseEnAmount(principalMatch[1])
    }

    description = description
      .replace(PRINCIPAL_RE, ' ')
      .replace(INSTALLMENT_RE, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()

    if (!description) {
      skipped++
      continue
    }

    let kind: TxKind = credit ? 'refund' : 'expense'
    if (PAYMENT_PATTERNS.test(description)) kind = 'payment'
    // Loyalty-only lines move no real money.
    if (REWARD_ONLY_PATTERNS.test(description)) continue
    if (amount === 0) continue

    if (!minDate || date < minDate) minDate = date
    if (!maxDate || date > maxDate) maxDate = date

    rows.push({ date, description, amount, kind, installment, raw: line })
  }

  const dueMatch = DUE_DATE_RE.exec(text)
  const cutMatch = CUT_DATE_RE.exec(text)
  const cardMatch = CARD_RE.exec(text)

  return {
    rows,
    skipped,
    periodStart: minDate,
    periodEnd: cutMatch ? parseSlashDate(cutMatch[1]) ?? maxDate : maxDate,
    dueDate: dueMatch ? parseSlashDate(dueMatch[1]) : null,
    accountLabel: cardMatch ? `Akbank ${cardMatch[1]}` : 'Akbank',
  }
}

export const akbankAdapter: BankAdapter = {
  id: 'akbank',
  bank: 'Akbank',
  detect,
  parse,
}
