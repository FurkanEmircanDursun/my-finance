import { parseTrAmount, type Money } from '../../core/money'
import { parseTurkishLongDate, type DayKey } from '../../core/date'
import { fold } from '../../core/text'
import type { CategoryId } from '../../domain/categories'
import type { AdapterOutput, BankAdapter, RawRow } from './types'
import { PAYMENT_PATTERNS, REWARD_ONLY_PATTERNS } from './types'
import type { Installment, TxKind } from '../../domain/types'

/**
 * Garanti BBVA / Bonus statement lines, as they arrive from the PDF text layer:
 *
 *   08 Ağustos 2026 A101 9923 I353 BAHÇELİEVL 0,09 788,50
 *   14 Ağustos 2026 UBER EATS-TRENDYOL GO-GET 0,07- 370,00+
 *   21 Ağustos 2026 MEDİCANA HASTANE İŞL 100,00
 *   17 Ağustos 2026 Google makromusic for 899,99 TL 899,99
 *   bosluk 30 Ağustos 2026 MONEYPAY *MIGROSONE 0,50 500,19
 *
 * Amounts use Turkish grouping (1.234,56). A trailing `-` or `+` marks a credit
 * to the card. When two numbers close the line, the first is bonus earned and
 * the second is the billed amount.
 *
 * Two layout details cost transactions in the previous version:
 *
 *  - Garanti's template emits spacer cells that render as the literal word
 *    "bosluk", which can land in front of the date. Anchoring the row pattern
 *    to the start of the line silently dropped every row behind a spacer.
 *  - Rows are grouped under the bank's own section headings ("Süpermarket",
 *    "Eczane", "Cafe & Restaurant"). Those are captured as a weak category
 *    hint — useful where our keywords find nothing, but never allowed to
 *    override them, because the bank files an ice-cream shop under "Konaklama".
 */

const LINE_RE = /(?:^|\s)(\d{2}\s+[A-Za-zğüşıöçĞÜŞİÖÇ]+\s+\d{4})\s+(.+)$/
const NUMBER_RE = /^\d{1,3}(?:\.\d{3})*,\d{2}[+-]?$|^\d+,\d{2}[+-]?$/
const INSTALLMENT_RE = /(?:TAKSIT|TAKSİT)?\s*(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\s*\.?\s*taksit)?(?=\s|$)/i
/** "Google makromusic for 899,99 TL 899,99" — the price is echoed twice. */
const ECHOED_PRICE_RE = /^(.*?)\s+[\d.,]+\s*TL\s+([\d.,]+[+-]?)$/i
/** Template spacer cells that leak into the text layer. */
const SPACER_RE = /(?:^|\s)bosluk(?=\s|$)/gi

const CUT_DATE_RE = /Hesap\s+Kesim\s+Tarihi[\s:]*(\d{2}\s+[A-Za-zğüşıöçĞÜŞİÖÇ]+\s+\d{4}|\d{2}[./]\d{2}[./]\d{4})/i
const DUE_DATE_RE = /Son\s+Ödeme\s+Tarihi[\s:]*(\d{2}\s+[A-Za-zğüşıöçĞÜŞİÖÇ]+\s+\d{4}|\d{2}[./]\d{2}[./]\d{4})/i
const CARD_RE = /\bBonus(?:\s+(?:Platinum|Gold|Genç|Trink))?\b|\bMoney\b|\bMiles&Smiles\b|\bShop&Fly\b/i

/** Section headings Garanti prints above groups of rows. */
const SECTION_HINTS: Array<[string, CategoryId]> = [
  ['SUPERMARKET', 'market'],
  ['GIDA', 'market'],
  ['CAFE & RESTAURANT', 'dining'],
  ['CAFE&RESTAURANT', 'dining'],
  ['FAST FOOD', 'dining'],
  ['RESTORAN', 'dining'],
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
 * A heading is a short line with no amount on it. Testing that first keeps a
 * merchant called "Eczane Sağlık Market" from being mistaken for a heading.
 */
function sectionHint(line: string): CategoryId | null | undefined {
  if (line.length > 48) return undefined
  if (/\d{1,3}(?:\.\d{3})*,\d{2}/.test(line)) return undefined

  const folded = fold(line).trim()
  if (SECTION_RESET.some((reset) => folded.startsWith(reset))) return null

  for (const [needle, category] of SECTION_HINTS) {
    if (folded === needle || folded.startsWith(`${needle} `) || folded.endsWith(` ${needle}`)) {
      return category
    }
  }
  return undefined
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
  const long = parseTurkishLongDate(raw)
  if (long) return long
  const m = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(raw.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function parse(text: string): AdapterOutput {
  const rows: RawRow[] = []
  let skipped = 0
  let minDate: DayKey | null = null
  let maxDate: DayKey | null = null
  let hint: CategoryId | undefined

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(SPACER_RE, ' ').replace(/\s{2,}/g, ' ').trim()
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

    const body = match[2].trim()
    let description = ''
    let amountToken = ''

    const echoed = ECHOED_PRICE_RE.exec(body)
    if (echoed) {
      description = echoed[1].trim()
      amountToken = echoed[2]
    } else {
      const parts = body.split(/\s+/)
      const last = parts[parts.length - 1]
      const prev = parts[parts.length - 2]

      if (parts.length >= 3 && NUMBER_RE.test(last) && NUMBER_RE.test(prev)) {
        // bonus column + billed amount
        amountToken = last
        description = parts.slice(0, -2).join(' ')
      } else if (parts.length >= 2 && NUMBER_RE.test(last)) {
        amountToken = last
        description = parts.slice(0, -1).join(' ')
      } else {
        // Prose that happens to contain a date, e.g. the "next statement date"
        // paragraph. Not a transaction and not a parse failure.
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

    if (REWARD_ONLY_PATTERNS.test(description)) continue

    const { value: amount, credit } = readAmount(amountToken)
    if (amount === 0) continue

    let kind: TxKind = credit ? 'refund' : 'expense'
    if (PAYMENT_PATTERNS.test(description)) kind = 'payment'

    if (!minDate || date < minDate) minDate = date
    if (!maxDate || date > maxDate) maxDate = date

    rows.push({ date, description, amount, kind, installment, raw: line, categoryHint: hint })
  }

  const cutMatch = CUT_DATE_RE.exec(text)
  const dueMatch = DUE_DATE_RE.exec(text)
  const cardMatch = CARD_RE.exec(text)

  return {
    rows,
    skipped,
    periodStart: minDate,
    periodEnd: cutMatch ? parseHeaderDate(cutMatch[1]) ?? maxDate : maxDate,
    dueDate: dueMatch ? parseHeaderDate(dueMatch[1]) : null,
    accountLabel: cardMatch ? `Garanti ${cardMatch[0].trim()}` : 'Garanti BBVA',
  }
}

export const garantiAdapter: BankAdapter = {
  id: 'garanti',
  bank: 'Garanti BBVA',
  detect,
  parse,
}
