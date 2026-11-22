import { extractText, type ExtractResult, type ProgressFn } from './extract'
import { isPdfFile, pdfExtractionError, validateStatementFile, validateStatementText } from './validation'
import { createCategorizer } from './categorize'
import { assignIds } from './identity'
import { reconcile } from './reconcile'
import { fold, normalizeMerchant } from '../core/text'
import { monthLabel, monthOf } from '../core/date'
import type { CategoryRule, ParseResult, Transaction } from '../domain/types'

export interface PipelineOptions {
  rules: readonly CategoryRule[]
  useLocalOcr: boolean
  ocrEndpoint: string
  onProgress?: ProgressFn
}

export class ParseError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message)
    this.name = 'ParseError'
  }
}

/** True when an instalment row's printed date predates the cycle that bills it. */
function billedOn(
  date: string,
  installment: Transaction['installment'],
  periodStart: string | null,
  periodEnd: string | null,
): boolean {
  return Boolean(installment && periodStart && periodEnd && date < periodStart)
}

export interface TextParseOptions {
  rules: readonly CategoryRule[]
  /** How the text was obtained: "pdf-text", "pdf-ebcdic", "ocr-service", "text"… */
  engine: string
  /** Used in the label when the statement names no period. */
  fileName: string
  onProgress?: ProgressFn
}

/** Read only explicitly labelled, masked card numbers; ambiguous numbers prove nothing. */
function maskedCardSuffix(text: string): string | undefined {
  const header = fold(text.split('\n', 60).join('\n'))
  const suffixes = new Set(Array.from(
    header.matchAll(/\bKART[ \t]+(?:NUMARASI|NO\.?)[ \t]*:?[ \t]*(?:\n[ \t]*)?(?:\d{4}|[*X•●]{4})[ \t-]*(?:[\d*X•●]{4}[ \t-]*){2}(\d{4})(?![\d*X•●])/g),
  ).filter(match => /[*X•●]/.test(match[0])).map(match => match[1]))
  return suffixes.size === 1 ? [...suffixes][0] : undefined
}

/**
 * Statement text → transactions, with no file system and no PDF library in
 * sight. Everything that decides what a statement *means* happens here, which
 * is what makes it possible to test it against real extracted text and to run
 * it from the command line.
 */
export function parseStatementText(text: string, options: TextParseOptions): ParseResult {
  const { onProgress } = options

  const adapter = validateStatementText(text, { allowCsv: options.engine === 'text' })

  onProgress?.(`${adapter.bank} formatı ayrıştırılıyor…`)
  const output = adapter.parse(text)

  const reconciliation = reconcile(output.rows, output.summary)
  const printedTotals = output.printedTotals
  const chargesDelta = printedTotals ? printedTotals.charges - reconciliation.parsedCharges : 0
  const paymentsDelta = printedTotals ? printedTotals.payments - reconciliation.payments : 0
  const paymentLikeRefunds = printedTotals?.paymentLikeRefunds ?? 0
  const printedTotalsMismatch = chargesDelta !== paymentsDelta || (chargesDelta !== 0 && chargesDelta !== paymentLikeRefunds)
  // Empty is meaningful only when a supported bank explicitly says the cycle
  // had no activity and its printed balance confirms it. Missing/failed text
  // extraction must never clear a missing-statement warning.
  const noActivity = /\b(?:BU\s+)?(?:EKSTRE\s+)?DONEM(?:DE|INDE)?(?:\s+ICI)?\s+(?:KART\s+)?(?:ISLEM(?:INIZ)?|HARCAMA(?:NIZ)?|HAREKET(?:INIZ)?)\s+(?:BULUNMAMAKTADIR|YOKTUR)\b/.test(fold(text).replace(/\s+/g, ' '))
  const verifiedEmpty = adapter.id !== 'csv' && output.periodEnd !== null && output.skipped === 0
    && noActivity && reconciliation.status === 'match' && reconciliation.expectedCharges === 0
  if (!output.rows.length && !verifiedEmpty) {
    throw new ParseError(
      'Dosyada işlem satırı bulunamadı.',
      `${adapter.bank} olarak tanındı ama ${output.skipped} satır okunamadı.`,
    )
  }

  onProgress?.('İşlemler sınıflandırılıyor…')

  const categorize = createCategorizer(options.rules)

  /**
   * Adapter-declared category wins outright; our keyword rules come next; a
   * statement's own section heading is the last resort, because banks file
   * an ice-cream shop under "Konaklama" often enough to matter.
   */
  const resolveCategory = (row: (typeof output.rows)[number], merchant: string) => {
    if (row.category) return row.category
    const auto = categorize(row.description, merchant)
    return auto === 'other' && row.categoryHint ? row.categoryHint : auto
  }

  const ruleMerchants = new Set(options.rules.map((r) => r.merchant))
  const bank = adapter.bank
  const merchants = output.rows.map((row) => normalizeMerchant(row.description))

  const ids = assignIds(
    output.rows.map((row) => ({
      bank,
      accountLabel: output.accountLabel,
      date: row.date,
      amount: row.amount,
      description: row.description,
      kind: row.kind,
      installment: row.installment,
    })),
  )

  const periodEnd = output.periodEnd ?? output.rows[output.rows.length - 1]?.date ?? null

  const transactions: Transaction[] = output.rows.map((row, i) => ({
    id: ids[i],
    date: row.date,
    description: row.description,
    merchant: merchants[i],
    amount: row.amount,
    kind: row.kind,
    category: resolveCategory(row, merchants[i]),
    categoryLocked: ruleMerchants.has(merchants[i]),
    bank,
    accountLabel: output.accountLabel,
    installment: row.installment,
    source: adapter.id === 'csv' ? 'csv' : 'statement',
    // An instalment prints its original purchase date, which can sit months
    // before the statement that bills it. It is charged on the cut date.
    ...(billedOn(row.date, row.installment, output.periodStart, periodEnd) ? { billedOn: periodEnd! } : {}),
    ...(row.foreign ? { foreign: row.foreign } : {}),
    ...(row.reward ? { reward: row.reward } : {}),
    raw: row.raw,
  }))

  const label = periodEnd
    ? `${output.accountLabel} · ${monthLabel(monthOf(periodEnd))}`
    : `${output.accountLabel} · ${options.fileName}`

  const reportedCardLast4 = adapter.id === 'csv' ? undefined : maskedCardSuffix(text)
  return {
    bank,
    engine: options.engine,
    accountLabel: output.accountLabel,
    ...(reportedCardLast4 ? { reportedCardLast4 } : {}),
    transactions,
    skipped: output.skipped,
    periodStart: output.periodStart,
    periodEnd,
    dueDate: output.dueDate,
    label,
    summary: output.summary,
    reconciliation,
    ...(printedTotalsMismatch ? { printedTotalsMismatch: true } : {}),
    ignored: output.ignored,
  }
}

export function statementImportProblem(result: ParseResult, pdf: boolean): ParseError | null {
  const hint = 'Bankadan indirdiğin özgün ekstreyle yeniden dene.'
  if (result.bank !== 'CSV' && result.skipped > 0) {
    return new ParseError('Ekstrede okunamayan işlem satırları var. Hiçbir hareket kaydedilmedi.', hint)
  }
  if (result.reconciliation.status === 'mismatch' || result.printedTotalsMismatch) {
    return new ParseError('Okunan hareketler bankanın ekstre toplamlarıyla uyuşmuyor. Hiçbir hareket kaydedilmedi.', hint)
  }
  if (pdf && result.reconciliation.status === 'unverified') {
    return new ParseError('Ekstrenin dönem borcu veya önceki bakiyesi okunamadı. Hiçbir hareket kaydedilmedi.', hint)
  }
  return null
}

export async function parseFile(file: File, options: PipelineOptions): Promise<ParseResult> {
  await validateStatementFile(file)
  const parse = ({ text, engine }: ExtractResult) => parseStatementText(text, {
    rules: options.rules, engine, fileName: file.name, onProgress: options.onProgress,
  })
  const candidates = new WeakMap<ExtractResult, ParseResult>()
  let bank: string | undefined
  let extracted: Awaited<ReturnType<typeof extractText>>
  try {
    extracted = await extractText(file, {
      useLocalOcr: options.useLocalOcr,
      ocrEndpoint: options.ocrEndpoint,
      onProgress: options.onProgress,
      assessReadable: candidate => {
        try {
          const result = parse(candidate)
          if (bank && bank !== result.bank) return 'reject'
          bank = result.bank
          candidates.set(candidate, result)
          return statementImportProblem(result, true) ? 'retry' : 'accept'
        } catch (error) {
          return error instanceof ParseError ? 'retry' : 'reject'
        }
      },
    })
  } catch (error) {
    if (isPdfFile(file)) throw pdfExtractionError(error)
    throw error
  }
  return candidates.get(extracted) ?? parse(extracted)
}
