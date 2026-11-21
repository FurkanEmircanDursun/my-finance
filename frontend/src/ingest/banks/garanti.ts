import { parseTrAmount, type Money } from '../../core/money'
import { addDays, parseSlashDate, parseTurkishLongDate, type DayKey } from '../../core/date'
import { fold } from '../../core/text'
import type { CategoryId } from '../../domain/categories'
import { REWARD_OPEN, splitBilledTag, splitRewardTags, stripBilledTag } from '../columns'
import type { AdapterOutput, BankAdapter, RawRow } from './types'
import { LOYALTY_SUFFIX_PATTERN, PAYMENT_PATTERNS, REWARD_ONLY_PATTERNS, resolvePeriodStart } from './types'
import {
  emptySummary, type IgnoredReason, type IgnoredRow, type Installment, type StatementSummary, type TxKind,
} from '../../domain/types'

/**
 * Garanti BBVA / Bonus statement lines, as they arrive from the PDF text layer:
 *
 *   08 Ağustos 2026 A101 9923 I353 BAHÇELİEVL ⟦0,09⟧ 788,50
 *   14 Ağustos 2026 UBER EATS-TRENDYOL GO-GET ⟦0,07-⟧ 370,00+
 *   05 Eylül 2026 OTOMATİK FATURA BONUS ⟦3.000,00⟧
 *   17 Ağustos 2026 Google makromusic for 899,99 TL 899,99
 *   bosluk 30 Ağustos 2026 MONEYPAY *MIGROSONE 0,50 500,19
 *
 * Amounts use Turkish grouping (1.234,56). A trailing `-` or `+` marks a credit
 * to the card.
 *
 * Which number is which. The statement has two numeric columns, "Bonus (TL)"
 * and "Tutar (TL)", and a row can fill either or both. From a PDF the column
 * reader (`ingest/columns.ts`) marks the bonus figure and the billed amount
 * separately. A row left with *only* a bonus figure is a
 * loyalty entry ("OTOMATİK FATURA BONUS 3.000,00" is 3.000 bonus points, not a
 * ₺3.000 purchase). Text with no column information (a portal `.txt` export)
 * falls back to the old rule: when two numbers close the line, the first is
 * bonus and the second is the billed amount.
 *
 * Two layout details cost transactions in an earlier version:
 *
 *  - Garanti's template emits spacer cells that render as the literal word
 *    "bosluk", which can land in front of the date. Anchoring the row pattern
 *    to the start of the line silently dropped every row behind a spacer.
 *  - Rows are grouped under the bank's own section headings ("Süpermarket",
 *    "Eczane", "Cafe & Restaurant"). Those are captured as a weak category
 *    hint — useful where our keywords find nothing, but never allowed to
 *    override them, because the bank files an ice-cream shop under "Konaklama".
 *    A heading we do not know ("GSM Shop") must *clear* the hint: otherwise the
 *    previous section's category bleeds onto rows that were never in it.
 */

const LINE_RE = /^(\d{1,2}\s+[A-Za-zğüşıöçĞÜŞİÖÇ]+\s+\d{4})(?:\s+(.*))?$/
const NUMBER_RE = /^\d{1,3}(?:\.\d{3})*,\d{2}[+-]?$|^\d+,\d{2}[+-]?$/
const INSTALLMENT_RE = /(?:TAKSIT|TAKSİT)?\s*(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\s*\.?\s*taksit)?(?=\s|$)/i
/** "Google makromusic for 899,99 TL 899,99" — the price is echoed twice. */
const ECHOED_PRICE_RE = /^(.*?)\s+[\d.,]+\s*TL\s+([\d.,]+[+-]?)$/i
/** Template spacer cells that leak into the text layer. */
const SPACER_RE = /(?:^|\s)bosluk(?=\s|$)/gi
const LONG_DATE = String.raw`\d{2}\s+[A-Za-zğüşıöçĞÜŞİÖÇ]+\s+\d{4}`
const HAS_DATE_RE = new RegExp(LONG_DATE)

const CUT_DATE_RE = new RegExp(String.raw`Hesap\s+Kesim\s+Tarihi[\s:]*(${LONG_DATE}|\d{2}[./]\d{2}[./]\d{4})`, 'i')
const DUE_DATE_RE = new RegExp(String.raw`Son\s+Ödeme\s+Tarihi[\s:]*(${LONG_DATE}|\d{2}[./]\d{2}[./]\d{4})`, 'i')
const CARD_RE = /\bBonus(?:\s+(?:Platinum|Gold|Genç|Trink))?\b|\bMoney\b|\bMiles&Smiles\b|\bShop&Fly\b/i

/** Section headings Garanti prints above groups of rows. */
const SECTION_HINTS: Array<[string, CategoryId]> = [
  ['SUPERMARKET', 'market'],
  ['GIDA', 'market'],
  ['CAFE & RESTAURANT', 'dining'],
  ['CAFE&RESTAURANT', 'dining'],
  ['FAST FOOD', 'dining'],
  ['RESTORAN', 'dining'],
  ['PASTANE', 'dining'],
  ['ECZANE', 'health'],
  ['SAGLIK', 'health'],
  ['KONAKLAMA', 'travel'],
  ['SEYAHAT', 'travel'],
  ['AKARYAKIT', 'transport'],
  ['ULASIM', 'transport'],
  ['OTOMOTIV', 'transport'],
  ['KITAP EVI', 'education'],
  ['KIRTASIYE', 'education'],
  ['EGITIM', 'education'],
  ['GIYIM', 'clothing'],
  ['KOZMETIK', 'clothing'],
  ['EGLENCE', 'entertainment'],
  ['SANAT', 'entertainment'],
  ['ELEKTRONIK', 'home'],
  ['YAPI MARKET', 'home'],
  ['MOBILYA', 'home'],
  ['SIGORTA', 'insurance'],
  ['TELEKOMUNIKASYON', 'bills'],
  ['GSM', 'bills'],
]

/** Headings that end a section without starting a new one. */
const SECTION_RESET = [
  'DIGER HARCAMALARINIZ',
  'YURT DISI HARCAMALARINIZ',
  'BONUS HARCAMALARINIZ',
  'BONUS PROGRAM ORTAKLARI',
  'BONUS PLATINUM SAHIBI',
  'EKSTRE OZETI',
]

function readAmount(token: string): { value: Money; credit: boolean } {
  const credit = token.endsWith('-') || token.endsWith('+')
  return { value: Math.abs(parseTrAmount(token)), credit }
}

/**
 * Classifies a line that is not a transaction:
 *
 *   a category  — a heading we know
 *   null        — a heading that ends or replaces the section (forget the hint)
 *   undefined   — not a heading at all (an amount row, prose); leave the hint be
 *
 * The reset prefixes are tested first and unconditionally: "EKSTRE ÖZETİ" opens
 * a paragraph that contains dates, and must not be read as a row.
 */
function sectionHint(line: string): CategoryId | null | undefined {
  const folded = fold(line).trim()
  if (SECTION_RESET.some((reset) => folded.startsWith(reset))) return null

  if (line.length > 48) return undefined
  if (/\d{1,3}(?:\.\d{3})*,\d{2}/.test(line) || HAS_DATE_RE.test(line)) return undefined

  for (const [needle, category] of SECTION_HINTS) {
    if (folded === needle || folded.startsWith(`${needle} `) || folded.endsWith(` ${needle}`)) {
      return category
    }
  }

  // Letters and spacing only: a heading we have no category for. Forgetting the
  // previous hint is the safe direction — a missing hint costs nothing, a stale
  // one mislabels every row beneath it.
  return /^[A-Za-zğüşıöçĞÜŞİÖÇ&' .-]{3,}$/.test(line) ? null : undefined
}

function detect(text: string): number {
  const longDates =
    text.match(/\b\d{2}\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+\d{4}\b/gi)
      ?.length ?? 0
  if (longDates < 3) return 0

  let score = Math.min(0.65, longDates / 50)
  if (/GARANT[İI]/i.test(text)) score += 0.3
  if (/\bBONUS\b/i.test(text)) score += 0.15
  return Math.min(1, score)
}

function parseHeaderDate(raw: string): DayKey | null {
  return parseTurkishLongDate(raw) ?? parseSlashDate(raw)
}

/**
 * The cover figures, matched against a folded (upper-case, diacritic-free)
 * copy of the text so "Dönem Borcunuz" and "DÖNEM BORCUNUZ" are one pattern.
 */
function readSummary(text: string): StatementSummary {
  const folded = fold(text)
  const summary = emptySummary()
  const AMOUNT = String.raw`([\d.]+,\d{2})`

  const money = (re: RegExp): Money | null => {
    const m = re.exec(folded)
    return m ? parseTrAmount(m[1]) : null
  }
  const date = (re: RegExp): DayKey | null => {
    const m = re.exec(folded)
    return m ? parseTurkishLongDate(m[1]) : null
  }

  summary.totalDebt = money(new RegExp(String.raw`DONEM\s+BORCUNUZ\s+${AMOUNT}`))
  summary.previousBalance = money(new RegExp(String.raw`ONCEKI\s+DONEMDEN\s+DEVIR\s+EDILEN\s+TUTAR\s+${AMOUNT}`))
  summary.minPayment = money(new RegExp(String.raw`MIN\.?\s*ODEME\s+TUTAR\S*\s+${AMOUNT}`))

  // The cover's own ledger, one line under its column titles:
  //
  //   Önceki Bakiye  Dönem Harcamaları  Faiz ve Ücretler  Ödemeleriniz  Dönem Borcunuz  Min. Ödeme
  //   0,00 TL + 33.858,07 TL + 179,51 TL - 0,00 TL = 34.037,58 TL 13.616,00 TL
  //
  // It exists on every statement, which the "devir" row does not: a card's first
  // statement carries no balance forward, so that row is simply absent and the
  // check had nothing to compare against. A previous balance of nothing is still
  // a figure.
  const ledger = new RegExp(
    String.raw`ONCEKI\s+BAKIYE[^\n]*\n\s*${AMOUNT}\s*TL\s*\+\s*${AMOUNT}\s*TL\s*\+\s*${AMOUNT}\s*TL\s*-\s*${AMOUNT}\s*TL\s*=\s*${AMOUNT}\s*TL\s*${AMOUNT}\s*TL`,
  ).exec(folded)
  if (ledger) {
    summary.previousBalance ??= parseTrAmount(ledger[1])
    summary.totalDebt ??= parseTrAmount(ledger[5])
    summary.minPayment ??= parseTrAmount(ledger[6])
  }
  summary.creditLimit = money(new RegExp(String.raw`^KART\s+LIMITI\s+${AMOUNT}`, 'm'))
  summary.availableLimit = money(new RegExp(String.raw`KULLANILABILIR\s+LIMITINIZ\s+${AMOUNT}`))
  summary.cashAdvanceLimit = money(new RegExp(String.raw`NAKIT\s+AVANS\s+LIMITI\s+${AMOUNT}`))

  const rate = /AKDI\s+FAIZ:\s*%\s*(\d{1,2},\d{1,2})/.exec(folded)
  if (rate) summary.interestMonthly = Number.parseFloat(rate[1].replace(',', '.'))

  // These sentences wrap across lines, so the date is allowed to straddle one.
  summary.previousCutDate = date(new RegExp(String.raw`BIR\s+ONCEKI\s+HESAP\s+KESIM\s+TARIHINIZ\s+(${LONG_DATE})`))
  summary.nextCutDate = date(new RegExp(String.raw`BIR\s+SONRAKI\s+HESAP\s+KESIMINIZ\s+(${LONG_DATE})`))
  summary.nextDueDate = date(new RegExp(String.raw`SON\s+ODEMENIZ\s+(${LONG_DATE})`))

  const earned = money(new RegExp(String.raw`BU\s+DONEM\s+KAZANILAN\s+BONUS\s+${AMOUNT}`))
  const spent = money(new RegExp(String.raw`BU\s+DONEM\s+HARCANAN\s+BONUS\s+-?\s*${AMOUNT}`))
  const balance = money(new RegExp(String.raw`HARCANABILECEK\s+TOPLAM\s+BONUS\s+${AMOUNT}`))
  if (earned !== null || spent !== null || balance !== null) {
    summary.loyalty = { programme: 'Bonus', earned, spent, balance }
  }

  return summary
}

function parse(text: string): AdapterOutput {
  const rows: RawRow[] = []
  const ignored: IgnoredRow[] = []
  let skipped = 0
  let minDate: DayKey | null = null
  let maxDate: DayKey | null = null
  let hint: CategoryId | undefined

  // A document that carries column information says, for every number, which
  // column it is in. Wording heuristics are only for text that does not.
  const trustColumns = text.includes(REWARD_OPEN)

  for (const rawLine of text.split('\n')) {
    const despaced = rawLine.replace(SPACER_RE, ' ').replace(/\s{2,}/g, ' ').trim()
    if (!despaced) continue

    // Bonus-column figures are set aside first; what is left is the row proper.
    const { line, rewards } = splitRewardTags(despaced)
    if (!line) continue

    const heading = sectionHint(line)
    if (heading !== undefined) {
      hint = heading ?? undefined
      continue
    }

    const match = LINE_RE.exec(line)
    if (!match) continue

    const date = parseTurkishLongDate(match[1])
    if (!date) {
      skipped++
      continue
    }

    const body = match[2]?.trim() ?? ''
    const billed = splitBilledTag(body)
    const columnAware = rewards.length > 0
    let description = ''
    let amountToken = ''

    const echoed = ECHOED_PRICE_RE.exec(billed ? `${billed.before} ${billed.token}` : body)
    if (billed && NUMBER_RE.test(billed.token)) {
      description = echoed?.[1].trim() ?? billed.before
      amountToken = billed.token
    } else if (echoed && NUMBER_RE.test(echoed[2])) {
      description = echoed[1].trim()
      amountToken = echoed[2]
    } else {
      const parts = body.split(/\s+/)
      const last = parts[parts.length - 1]
      const prev = parts[parts.length - 2]

      if (!columnAware && parts.length >= 3 && NUMBER_RE.test(last) && NUMBER_RE.test(prev)) {
        // Text with no column information: bonus column, then billed amount.
        amountToken = last
        description = parts.slice(0, -2).join(' ')
      } else if (parts.length >= 2 && NUMBER_RE.test(last)) {
        amountToken = last
        description = parts.slice(0, -1).join(' ')
      } else if (columnAware && body && !NUMBER_RE.test(last)) {
        // Nothing but a bonus figure on the row: a loyalty entry, not a charge.
        const reason: IgnoredReason = rewards[0].endsWith('-') ? 'reward-spent' : 'reward-earned'
        ignored.push({
          date,
          description: body,
          amount: Math.abs(parseTrAmount(rewards[0])),
          reason,
          raw: line,
        })
        continue
      } else {
        skipped++
        continue
      }
    }

    let installment: Installment | null = null
    const instMatch = INSTALLMENT_RE.exec(description)
    if (instMatch) {
      const a = Number(instMatch[1])
      const b = Number(instMatch[2])
      if (a > 0 && b > 0) {
        // Garanti prints both orders depending on the card programme; the
        // instalment index can never exceed the plan length, so the smaller
        // number is the current one.
        installment = { current: Math.min(a, b), total: Math.max(a, b) }
        description = description.replace(instMatch[0], ' ')
      }
    }

    description = description.replace(/\s{2,}/g, ' ').trim()
    if (!description) {
      skipped++
      continue
    }

    const { value: amount, credit } = readAmount(amountToken)

    if (!billed && (REWARD_ONLY_PATTERNS.test(description) || (!trustColumns && LOYALTY_SUFFIX_PATTERN.test(description)))) {
      ignored.push({
        date,
        description,
        amount,
        reason: credit ? 'reward-spent' : 'campaign',
        raw: line,
      })
      continue
    }
    if (amount === 0) continue

    let kind: TxKind = credit ? 'refund' : 'expense'
    if (PAYMENT_PATTERNS.test(description)) kind = 'payment'

    if (!minDate || date < minDate) minDate = date
    if (!maxDate || date > maxDate) maxDate = date

    // A bonus figure beside a charge is what that purchase earned; a trailing
    // minus on it marks a clawback on a refund, which is not an award.
    const reward = rewards.length && !rewards[0].endsWith('-') ? Math.abs(parseTrAmount(rewards[0])) : 0

    rows.push({
      date, description, amount, kind, installment, raw: stripBilledTag(line), categoryHint: hint,
      ...(reward > 0 ? { reward } : {}),
    })
  }

  const cutMatch = CUT_DATE_RE.exec(text)
  const dueMatch = DUE_DATE_RE.exec(text)
  const cardMatch = CARD_RE.exec(text)
  const summary = readSummary(text)

  const periodEnd = (cutMatch ? parseHeaderDate(cutMatch[1]) : null) ?? maxDate

  return {
    rows,
    skipped,
    ignored,
    // Garanti prints no period range, but it does name the previous cut date,
    // and a cycle starts the day after. Failing that the rows are all there is
    // to go on — clamped, because an instalment row carries the same misleading
    // original-purchase date it does at Akbank.
    periodStart: resolvePeriodStart({
      printed: summary.previousCutDate ? addDays(summary.previousCutDate, 1) : null,
      earliestRow: minDate,
      periodEnd,
    }),
    periodEnd,
    dueDate: dueMatch ? parseHeaderDate(dueMatch[1]) : null,
    accountLabel: cardMatch ? `Garanti ${cardMatch[0].trim()}` : 'Garanti BBVA',
    summary,
  }
}

export const garantiAdapter: BankAdapter = {
  id: 'garanti',
  bank: 'Garanti BBVA',
  detect,
  parse,
}
