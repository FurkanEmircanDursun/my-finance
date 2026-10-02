import { parseEnAmount, type Money } from '../../core/money'
import { addDays, parseSlashDate, type DayKey } from '../../core/date'
import { splitRewardTags } from '../columns'
import type { AdapterOutput, BankAdapter, RawRow } from './types'
import {
  PAYMENT_PATTERNS, REWARD_ONLY_PATTERNS, readForeignAmount, resolvePeriodStart, stripForeignNote,
} from './types'
import {
  emptySummary, type IgnoredReason, type IgnoredRow, type Installment, type StatementSummary, type TxKind,
} from '../../domain/types'

/**
 * Akbank / Axess statement lines look like:
 *
 *   05/07/2026 TRENDYOL.COM (1,065.00 TL) 3/2.taksit 355.00 355.00x1
 *   18/07/2026 KENT ECZANESI (1,012.53 TL +Vade Farkı) 3/2.taksit 337.51 337.51x1
 *   09/07/2026 SPOTIFY 149.99
 *   14/07/2026 IADE - TRENDYOL 220.00(-)
 *   01/09/2026 STEAMGAMES.COM 4259522 BELLEVUE USA (orjinal tutar3.99 $ ) 201.13
 *
 * Amounts use Anglo grouping (1,065.00). The first amount in the trailing run
 * is the amount billed on this statement; the rest are instalment remainder and
 * loyalty columns. `N/M.taksit` reads as total/current — verified against the
 * disclosed principal: 1,065.00 / 3 == 355.00.
 *
 * A number that sits under "Dönem İçi Chip-para" arrives wrapped in `⟦…⟧` (see
 * `ingest/columns.ts`). It is a loyalty figure, never a charge: stripped before
 * the row is read, and a row left with no charge at all is a chip-para award.
 */

const LINE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/
const PRINCIPAL_RE = /\(([\d,.]+)\s*TL[^)]*\)/
const INSTALLMENT_RE = /(?:^|\s)(\d{1,2})\/(\d{1,2})\s*\.?\s*taksit/i
const AMOUNT_TOKEN_RE = /^[\d,]+\.\d{2}(?:\(-\))?(?:x\d+)?$|^[\d,]+(?:\(-\))?(?:x\d+)?$/

// "Bir Sonraki Son Ödeme Tarihi" names the *next* cycle; only the bare form is this statement's.
const DUE_DATE_RE = /(?<!Sonraki\s+)Son\s+Ödeme\s+Tarihi[\s:]*([\d]{2}[./][\d]{2}[./][\d]{4})/i
const CUT_DATE_RE = /(?<!Sonraki\s+)(?:Hesap\s+Kesim|Hesap\s+Özeti)\s+Tarihi[\s:]*([\d]{2}[./][\d]{2}[./][\d]{4})/i
/**
 * Akbank prints the cycle it is billing for, verbatim:
 *
 *   Ekstre  Dönemi 27/07/2026-28/08/2026
 *
 * This is the authority on the period. Deriving it from the rows instead read
 * an instalment's original purchase date as the start of the cycle — see
 * `resolvePeriodStart`.
 */
const PERIOD_RE =
  /Ekstre\s+D[öo]nemi[\s:]*(\d{2}\/\d{2}\/\d{4})\s*[-‐-―]\s*(\d{2}\/\d{2}\/\d{4})/i
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

/**
 * The cover figures. Written to tolerate the mojibake EBCDIC decoding leaves in
 * running text ("Tutarz" for "Tutarı"): labels are matched loosely, amounts
 * strictly.
 */
function readSummary(text: string, periodStart: DayKey | null): StatementSummary {
  const summary = emptySummary()
  const money = (re: RegExp): Money | null => {
    const m = re.exec(text)
    return m ? parseEnAmount(m[1]) : null
  }
  const date = (re: RegExp): DayKey | null => {
    const m = re.exec(text)
    return m ? parseSlashDate(m[1]) : null
  }
  const AMOUNT = String.raw`([\d,]+\.\d{2})`

  summary.totalDebt = money(new RegExp(String.raw`D[öo]nem\s+Borcu\s+${AMOUNT}`, 'i'))
  summary.previousBalance = money(
    new RegExp(String.raw`[ÖO]nceki\s+D[öo]nem\s+Hesap\s+[ÖO]zeti\s+Bakiyesi\s+${AMOUNT}`, 'i'),
  )
  summary.minPayment = money(new RegExp(String.raw`En\s+Az\s+[ÖO]deme\s+Tutar\S*\s+${AMOUNT}`, 'i'))
  summary.creditLimit = money(new RegExp(String.raw`^Kart\s+Limiti\s+${AMOUNT}`, 'im'))
  summary.availableLimit = money(new RegExp(String.raw`Kullan\S*\s+Kart\s+Limiti\s+${AMOUNT}`, 'i'))
  summary.cashAdvanceLimit = money(new RegExp(String.raw`Toplam\s+Nakit\s+Avans\s+Limiti\s+${AMOUNT}`, 'i'))

  // The first percentage after "Akdi Faiz" in the rate table is the monthly one.
  const rate = /Akdi\s+Faiz[\s\S]{0,160}?%\s?(\d{1,2},\d{1,2})/i.exec(text)
  if (rate) summary.interestMonthly = Number.parseFloat(rate[1].replace(',', '.'))

  summary.nextCutDate = date(/Bir\s+Sonraki\s+Hesap\s+Kesim\s+Tarihi[\s:]*(\d{2}\/\d{2}\/\d{4})/i)
  summary.nextDueDate = date(/Bir\s+Sonraki\s+Son\s+[ÖO]deme\s+Tarihi[\s:]*(\d{2}\/\d{2}\/\d{4})/i)
  summary.previousCutDate = periodStart ? addDays(periodStart, -1) : null

  const chip = money(new RegExp(String.raw`Chip\s+Para\s+Bakiyeniz\s+${AMOUNT}`, 'i'))
  if (chip !== null) summary.loyalty = { programme: 'Chip-para', earned: null, spent: null, balance: chip }

  return summary
}

function parse(text: string): AdapterOutput {
  const rows: RawRow[] = []
  const ignored: IgnoredRow[] = []
  let skipped = 0
  let minDate: DayKey | null = null
  let maxDate: DayKey | null = null

  const ignore = (date: DayKey, description: string, amount: Money, reason: IgnoredReason, raw: string) => {
    ignored.push({ date, description, amount, reason, raw })
  }

  for (const rawLine of text.split('\n')) {
    const { line, rewards } = splitRewardTags(rawLine.trim())
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
      // Only a chip-para figure on the row: an award, not a charge.
      if (rewards.length && parts.length) {
        ignore(date, parts.join(' '), Math.abs(parseEnAmount(rewards[0])), 'reward-earned', line)
      } else {
        skipped++
      }
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

    // "Kalan Borç / Taksit" prints what is left as `amount x count`
    // ("1,690.62x1": one more instalment). The bank's own count beats inferring
    // it from `total − current`, which cannot see an early payoff or a re-plan.
    if (installment) {
      for (const token of trailing.slice(1)) {
        const left = /^([\d,]+\.\d{2})x(\d+)$/.exec(token)
        if (left) {
          installment.remaining = { count: Number(left[2]), amount: parseEnAmount(left[1]) }
          break
        }
      }
    }

    const foreign = readForeignAmount(description)

    description = stripForeignNote(
      description
        .replace(PRINCIPAL_RE, ' ')
        .replace(INSTALLMENT_RE, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )

    if (!description) {
      skipped++
      continue
    }

    let kind: TxKind = credit ? 'refund' : 'expense'
    if (PAYMENT_PATTERNS.test(description)) kind = 'payment'

    // Loyalty-only lines move no real money. The column tells us when we can
    // see it; the wording is the fallback for text that has no columns (.txt).
    if (REWARD_ONLY_PATTERNS.test(description)) {
      ignore(date, description, amount, 'campaign', line)
      continue
    }
    if (amount === 0) continue

    if (!minDate || date < minDate) minDate = date
    if (!maxDate || date > maxDate) maxDate = date

    // A loyalty figure printed beside a charge is what that purchase earned.
    const reward = rewards.length && !rewards[0].includes('(-)') ? Math.abs(parseEnAmount(rewards[0])) : 0

    rows.push({
      date, description, amount, kind, installment, raw: line,
      ...(foreign ? { foreign } : {}),
      ...(reward > 0 ? { reward } : {}),
    })
  }

  const dueMatch = DUE_DATE_RE.exec(text)
  const cutMatch = CUT_DATE_RE.exec(text)
  const cardMatch = CARD_RE.exec(text)
  const periodMatch = PERIOD_RE.exec(text)

  const printedStart = periodMatch ? parseSlashDate(periodMatch[1]) : null
  const printedEnd = periodMatch ? parseSlashDate(periodMatch[2]) : null

  const periodStart = resolvePeriodStart({
    printed: printedStart,
    earliestRow: minDate,
    periodEnd: printedEnd ?? (cutMatch ? parseSlashDate(cutMatch[1]) : null) ?? maxDate,
  })

  return {
    rows,
    skipped,
    ignored,
    periodStart,
    periodEnd: printedEnd ?? (cutMatch ? parseSlashDate(cutMatch[1]) ?? maxDate : maxDate),
    dueDate: dueMatch ? parseSlashDate(dueMatch[1]) : null,
    accountLabel: cardMatch ? `Akbank ${cardMatch[1]}` : 'Akbank',
    summary: readSummary(text, periodStart),
  }
}

export const akbankAdapter: BankAdapter = {
  id: 'akbank',
  bank: 'Akbank',
  detect,
  parse,
}
