import { parseAmountAuto, type Money } from '../../core/money'
import { parseAnyDate, type DayKey } from '../../core/date'
import { fold } from '../../core/text'
import type { AdapterOutput, BankAdapter, RawRow } from './types'
import { PAYMENT_PATTERNS } from './types'
import { emptySummary, type TxKind } from '../../domain/types'

/**
 * Delimited export adapter — covers every bank that offers "CSV / Excel'e aktar"
 * even when this project has no dedicated parser for it.
 *
 * Column roles are inferred from the header, falling back to positional
 * heuristics (first date-shaped column, last number-shaped column).
 */

const DELIMITERS = [';', '\t', ','] as const

const DATE_HEADERS = ['TARIH', 'ISLEM TARIHI', 'DATE', 'TRANSACTION DATE', 'VALOR']
const DESC_HEADERS = ['ACIKLAMA', 'ISLEM', 'DESCRIPTION', 'DETAY', 'ISYERI', 'MERCHANT', 'NARRATIVE']
const AMOUNT_HEADERS = ['TUTAR', 'AMOUNT', 'ISLEM TUTARI', 'BORC', 'DEBIT', 'CREDIT', 'ALACAK']

function pickDelimiter(sample: string): string {
  let best = ','
  let bestCount = 0
  for (const d of DELIMITERS) {
    const count = sample.split(d).length - 1
    if (count > bestCount) {
      bestCount = count
      best = d
    }
  }
  return best
}

/** Minimal RFC4180 splitter — handles quoted fields containing the delimiter. */
function splitRow(line: string, delimiter: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      out.push(field.trim())
      field = ''
    } else {
      field += ch
    }
  }
  out.push(field.trim())
  return out
}

function findColumn(headers: string[], candidates: string[]): number {
  const folded = headers.map(fold)
  for (const candidate of candidates) {
    const exact = folded.indexOf(candidate)
    if (exact !== -1) return exact
  }
  for (let i = 0; i < folded.length; i++) {
    if (candidates.some((c) => folded[i].includes(c))) return i
  }
  return -1
}

function detect(text: string): number {
  const lines = text.split('\n').filter((l) => l.trim()).slice(0, 12)
  if (lines.length < 2) return 0

  const delimiter = pickDelimiter(lines.slice(0, 5).join('\n'))
  const headers = splitRow(lines[0], delimiter)
  if (headers.length < 3) return 0

  const hasDate = findColumn(headers, DATE_HEADERS) !== -1
  const hasAmount = findColumn(headers, AMOUNT_HEADERS) !== -1
  if (!hasDate || !hasAmount) return 0

  // Deliberately below the dedicated adapters so a real statement wins.
  return 0.55
}

function parse(text: string): AdapterOutput {
  const lines = text.split('\n').filter((l) => l.trim())
  const delimiter = pickDelimiter(lines.slice(0, 5).join('\n'))
  const headers = splitRow(lines[0], delimiter)

  const dateCol = findColumn(headers, DATE_HEADERS)
  const descCol = findColumn(headers, DESC_HEADERS)
  const amountCol = findColumn(headers, AMOUNT_HEADERS)

  const rows: RawRow[] = []
  let skipped = 0
  let minDate: DayKey | null = null
  let maxDate: DayKey | null = null

  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i], delimiter)
    if (cells.length < 2) continue

    const date = parseAnyDate(cells[dateCol] ?? '')
    if (!date) {
      skipped++
      continue
    }

    const description = (descCol !== -1 ? cells[descCol] : cells.find((c) => /[A-Za-zĞÜŞİÖÇğüşıöç]{3}/.test(c))) ?? ''
    const rawAmount = amountCol !== -1 ? cells[amountCol] : cells[cells.length - 1]
    const signed: Money = parseAmountAuto(rawAmount ?? '')

    if (!description || signed === 0) {
      skipped++
      continue
    }

    // Exports write outflows as negative; the domain stores magnitude + kind.
    let kind: TxKind = signed < 0 ? 'expense' : 'income'
    if (PAYMENT_PATTERNS.test(description)) kind = 'payment'

    if (!minDate || date < minDate) minDate = date
    if (!maxDate || date > maxDate) maxDate = date

    rows.push({
      date,
      description,
      amount: Math.abs(signed),
      kind,
      installment: null,
      raw: lines[i],
    })
  }

  return {
    rows,
    skipped,
    ignored: [],
    periodStart: minDate,
    periodEnd: maxDate,
    dueDate: null,
    accountLabel: 'CSV içe aktarım',
    summary: emptySummary(),
  }
}

export const csvAdapter: BankAdapter = {
  id: 'csv',
  bank: 'CSV',
  detect,
  parse,
}
