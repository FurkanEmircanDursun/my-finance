import { detectAdapter } from './banks'
import { extractText, type ProgressFn } from './extract'
import { createCategorizer } from './categorize'
import { assignIds } from './identity'
import { reconcile } from './reconcile'
import { normalizeMerchant } from '../core/text'
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

/**
 * Statement text → transactions, with no file system and no PDF library in
 * sight. Everything that decides what a statement *means* happens here, which
 * is what makes it possible to test it against real extracted text and to run
 * it from the command line.
 */
export function parseStatementText(text: string, options: TextParseOptions): ParseResult {
  const { onProgress } = options

  if (!text.trim()) {
    throw new ParseError('Dosya içeriği okunamadı.', 'PDF taranmış olabilir; Ayarlar\'dan yerel OCR servisini açmayı deneyin.')
  }

  const detection = detectAdapter(text)
  if (!detection) {
    throw new ParseError(
      'Ekstre formatı tanınamadı.',
      'Akbank, Garanti BBVA ve genel CSV dışa aktarımları destekleniyor.',
    )
  }

  onProgress?.(`${detection.adapter.bank} formatı ayrıştırılıyor…`)
  const output = detection.adapter.parse(text)

  if (!output.rows.length) {
    throw new ParseError(
      'Dosyada işlem satırı bulunamadı.',
      `${detection.adapter.bank} olarak tanındı ama ${output.skipped} satır okunamadı.`,
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
  const bank = detection.adapter.bank
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
    source: detection.adapter.id === 'csv' ? 'csv' : 'statement',
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

  return {
    bank,
    engine: options.engine,
    accountLabel: output.accountLabel,
    transactions,
    skipped: output.skipped,
    periodStart: output.periodStart,
    periodEnd,
    dueDate: output.dueDate,
    label,
    summary: output.summary,
    reconciliation: reconcile(output.rows, output.summary),
    ignored: output.ignored,
  }
}

export async function parseFile(file: File, options: PipelineOptions): Promise<ParseResult> {
  const { text, engine } = await extractText(file, {
    useLocalOcr: options.useLocalOcr,
    ocrEndpoint: options.ocrEndpoint,
    onProgress: options.onProgress,
  })

  return parseStatementText(text, {
    rules: options.rules,
    engine,
    fileName: file.name,
    onProgress: options.onProgress,
  })
}
