import { detectAdapter } from './banks'
import { extractText, type ProgressFn } from './extract'
import { createCategorizer } from './categorize'
import { normalizeMerchant } from '../core/text'
import { hash } from '../core/hash'
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

/**
 * Content-addressed transaction id.
 *
 * Uses date + amount + merchant (not the raw line): the same purchase read once
 * from the PDF text layer and once from OCR produces slightly different raw
 * text but must still deduplicate. The ordinal disambiguates two genuinely
 * identical charges on the same day.
 */
function transactionId(date: string, amount: number, merchant: string, ordinal: number): string {
  return hash(`${date}|${amount}|${merchant}|${ordinal}`)
}

export async function parseFile(file: File, options: PipelineOptions): Promise<ParseResult> {
  const { onProgress } = options

  const { text, engine } = await extractText(file, {
    useLocalOcr: options.useLocalOcr,
    ocrEndpoint: options.ocrEndpoint,
    onProgress,
  })

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
  const seenPerDay = new Map<string, number>()

  const transactions: Transaction[] = output.rows.map((row) => {
    const merchant = normalizeMerchant(row.description)
    const dayAmountKey = `${row.date}|${row.amount}|${merchant}`
    const ordinal = seenPerDay.get(dayAmountKey) ?? 0
    seenPerDay.set(dayAmountKey, ordinal + 1)

    return {
      id: transactionId(row.date, row.amount, merchant, ordinal),
      date: row.date,
      description: row.description,
      merchant,
      amount: row.amount,
      kind: row.kind,
      category: resolveCategory(row, merchant),
      categoryLocked: ruleMerchants.has(merchant),
      bank: detection.adapter.bank,
      accountLabel: output.accountLabel,
      installment: row.installment,
      source: detection.adapter.id === 'csv' ? 'csv' : 'statement',
      raw: row.raw,
    }
  })

  const periodEnd = output.periodEnd ?? transactions[transactions.length - 1]?.date ?? null
  const label = periodEnd
    ? `${output.accountLabel} · ${monthLabel(monthOf(periodEnd))}`
    : `${output.accountLabel} · ${file.name}`

  return {
    bank: detection.adapter.bank,
    engine,
    transactions,
    skipped: output.skipped,
    periodStart: output.periodStart,
    periodEnd,
    dueDate: output.dueDate,
    label,
  }
}
