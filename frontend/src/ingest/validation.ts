import { ADAPTERS } from './banks'
import type { BankAdapter } from './banks/types'
import { fold } from '../core/text'

export type StatementValidationCode =
  | 'invalid_file' | 'empty_file' | 'file_too_large' | 'invalid_pdf'
  | 'password_required' | 'unreadable_pdf' | 'unreadable_text'
  | 'not_statement' | 'unsupported_bank' | 'ambiguous_bank'

const COPY: Record<StatementValidationCode, [string, string]> = {
  invalid_file: ['Bu dosya türü desteklenmiyor.', 'PDF, TXT veya CSV biçiminde bir ekstre seçin.'],
  empty_file: ['Seçilen dosya boş.', 'Bankanızdan ekstreyi yeniden indirip deneyin.'],
  file_too_large: ['Dosya 25 MB sınırını aşıyor.', 'Ekstreyi tek dönemlik PDF olarak indirip yeniden deneyin.'],
  invalid_pdf: ['Dosya geçerli bir PDF değil veya bozulmuş.', 'Dosyanın adını değiştirmek yerine bankanızdan PDF ekstreyi yeniden indirin.'],
  password_required: ['PDF şifreyle korunuyor.', 'Şifresiz bir kopyasını kaydedip yeniden yükleyin.'],
  unreadable_pdf: ['PDF okunamadı.', 'Dosyanın açılabildiğini kontrol edin veya bankanızdan yeniden indirin.'],
  unreadable_text: ['Ekstre metni okunamadı.', 'Daha net bir PDF yükleyin. Taranmış ekstreler için Ayarlar’dan yerel OCR servisini kullanabilirsiniz.'],
  not_statement: ['Bu belge bir kredi kartı ekstresi olarak doğrulanamadı.', 'Dekont, fatura veya başka bir belge yerine bankanızın dönemlik kredi kartı ekstresini yükleyin.'],
  unsupported_bank: ['Bu bankanın PDF ekstre formatı henüz desteklenmiyor.', 'PDF için Akbank/Axess, Garanti BBVA/Bonus, İş Bankası/Maximum, QNB, Dünya Katılım/Paraf ve Halkbank/Paraf ekstreleri destekleniyor. Diğer bankalar için CSV dışa aktarımını kullanabilirsiniz.'],
  ambiguous_bank: ['Belgede birden fazla bankaya ait ekstre bilgisi bulundu.', 'Her bankanın ekstresini ayrı bir dosya olarak yükleyin.'],
}

/** Contains only product copy: document text and parser internals never reach the UI. */
export class StatementValidationError extends Error {
  readonly hint: string

  constructor(readonly code: StatementValidationCode) {
    super(COPY[code][0])
    this.name = 'StatementValidationError'
    this.hint = COPY[code][1]
  }
}

export const MAX_STATEMENT_BYTES = 25 * 1024 * 1024

export function isPdfFile(file: Pick<File, 'name' | 'type'>): boolean {
  return /\.pdf$/i.test(file.name) || file.type?.toLowerCase().split(';')[0].trim() === 'application/pdf'
}

/** Checks the container before loading PDF.js or sending anything to OCR. */
export async function validateStatementFile(file: File): Promise<void> {
  if (file.size === 0) throw new StatementValidationError('empty_file')
  if (file.size > MAX_STATEMENT_BYTES) throw new StatementValidationError('file_too_large')

  const mime = file.type.toLowerCase().split(';')[0].trim()
  const genericMime = !mime || mime === 'application/octet-stream'
  if (isPdfFile(file)) {
    if (!genericMime && mime !== 'application/pdf') throw new StatementValidationError('invalid_file')
    const header = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer())
    // PDF.js accepts a PDF header within the first 1024 bytes, including a BOM/preamble.
    if (!/%PDF-\d\.\d\b/.test(header)) throw new StatementValidationError('invalid_pdf')
    return
  }

  if (!/\.(?:txt|csv)$/i.test(file.name)
    || (!genericMime && !['text/plain', 'text/csv', 'application/csv', 'application/vnd.ms-excel'].includes(mime))) {
    throw new StatementValidationError('invalid_file')
  }
  const header = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer())
  if (/%PDF-\d\.\d\b/.test(header)) throw new StatementValidationError('invalid_file')
}

/** A readable text layer should be classified directly, rather than OCR'd again. */
export function hasReadableText(text: string): boolean {
  const letters = text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g)?.length ?? 0
  const damaged = text.match(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f\ufffd]/g)?.length ?? 0
  return letters >= 40 && damaged < Math.max(3, text.length * 0.02)
}

const DATE = String.raw`(?:\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}\s+(?:OCAK|SUBAT|MART|NISAN|MAYIS|HAZIRAN|TEMMUZ|AGUSTOS|EYLUL|EKIM|KASIM|ARALIK)\s+\d{4})`
const ROW_START = new RegExp(String.raw`^(?:BOSLUK\s+)?${DATE}\s+`, 'i')
const OTHER_ISSUER = /\b(?:YAPI\s*KREDI|ZIRAAT|VAKIFBANK|DENIZBANK|TEB|ING\s+BANK|HSBC|KUVEYT\s*TURK|ALBARAKA|ENPARA|ODEABANK|SEKERBANK)\b/

/**
 * Proves the issuer and statement structure before any bank transaction parser runs.
 * Dates, a bank word, or a plausible transaction row on their own are insufficient.
 * Amounts and row counts are deliberately not acceptance conditions: an authentic
 * first/zero-activity statement still needs to reach its parser and reconciliation.
 */
export function validateStatementText(text: string, options: { allowCsv: boolean }): BankAdapter {
  if (!text.trim()) throw new StatementValidationError('unreadable_text')

  const csv = ADAPTERS.find(adapter => adapter.id === 'csv')!
  if (csv.detect(text) >= 0.35) {
    if (options.allowCsv) return csv
    throw new StatementValidationError('not_statement')
  }
  if (!hasReadableText(text)) throw new StatementValidationError('unreadable_text')

  const lines = fold(text).replace(/\r/g, '').split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  // Merchant names may contain another bank. They are not issuer evidence.
  const coverLines = lines.filter(line => !ROW_START.test(line))
  const cover = coverLines.slice(0, 80).join('\n')
  const nonRowText = coverLines.length > 80
    ? `${cover}\n${coverLines.slice(-40).join('\n')}`
    : cover
  const compact = lines.join(' ')
  const opening = lines.slice(0, 8).join('\n')
  const otherDocument = /(?:^|\n)(?:E[- ]?(?:ARSIV\s+)?FATURA|FATURA|(?:KREDI\s+KARTI\s+|EFT\s+|HAVALE\s+|ISLEM\s+|ODEME\s+)?DEKONTU?|(?:KREDI\s+KARTI\s+)?ODEME\s+MAKBUZU|TAHSILAT\s+MAKBUZU)(?:\s*(?:NO|NUMARASI|:|$))/m.test(opening)
  if (otherDocument) throw new StatementValidationError('not_statement')

  // A columnar cover can print all labels on one row and all values on the next.
  // Only known cover labels may intervene: a random later transaction date is
  // not evidence for a heading that has lost its own value.
  const coverLabels = String.raw`(?:(?:SON ODEME TARIHI|DONEM BORCU(?:NUZ)?|MIN\.? ODEME TUTAR(?:I|INIZ)|EN AZ ODEME TUTARI)[\s:]*){0,4}`
  const cycleDate = new RegExp(String.raw`(?<!SONRAKI )(?:HESAP\s+(?:KESIM|OZETI)\s+TARIHI|EKSTRE\s+DONEMI)[\s:]*${coverLabels}${DATE}`).test(compact)
  const dueDate = new RegExp(String.raw`(?<!SONRAKI )SON\s+ODEME\s+TARIHI[\s:]*${DATE}`).test(compact)
  const balance = /\b(?:DONEM\s+BORCU(?:NUZ)?|HESAP\s+OZETI\s+BORCU|HESAP\s+BAKIYESI)\s*:?\s*[\d.,]+/.test(compact)
  const table = /\bISLEM\s+TARIHI\b/.test(compact) && /\b(?:DONEM\s+ICI\s+ISLEMLER|TUTAR)\b/.test(compact)
  // Text exporters can separate the cut-date value from its heading by the
  // card/customer columns. A dated due date plus the bank's transaction-table
  // headings still proves the statement layout without guessing that value.
  const columnarCycle = /\bHESAP\s+KESIM\s+TARIHI\b/.test(compact) && dueDate && table
  const statementStructure = (cycleDate || columnarCycle) && (dueDate || balance || table)

  const matchedIds: string[] = []
  const akbank = /(?:^|\n)(?:AKBANK\b|(?:AXESS|WINGS|FREE\s+CARD|FISH)\b[^\n]*(?:HESAP\s+OZETI|EKSTRE))/.test(nonRowText)
    || /\bAKBANK\b[^\n]*\b(?:AXESS|WINGS|FREE\s+CARD)\b/.test(nonRowText)
  if (akbank) matchedIds.push('akbank')

  const garanti = /(?:^|\n)(?:T\.\s*)?GARANTI(?:\s+BBVA|\s+BANKASI|\b)/.test(nonRowText)
    // Garanti's real template may name only the product on its cover.
    || (/\bBONUS\s+(?:PLATINUM|GOLD|FLEXI|CLASSIC(?:\s+TROY)?|GENC|TRINK|PLUS|BUSINESS)\b[^\n]*\bBILGILERINIZ\b/.test(nonRowText) && table)
  if (garanti) matchedIds.push('garanti')

  const isbank = /(?:^|\n)(?:TURKIYE\s+)?IS\s+BANKASI\b/.test(nonRowText)
    || /\bISBANK\.COM\.TR\b|\bMAXIMUM(?:GENC)?\.COM\.TR\b/.test(nonRowText)
    || (/\bHESAP\s+OZETI\s+BORCU\b/.test(nonRowText) && /\bMAXIPUAN\b/.test(nonRowText))
  if (isbank) matchedIds.push('isbank')

  // Guard against a customer's work address on another bank's cover mentioning
  // "DÜNYA KATILIM BANKASI" mid-line: require a leading heading, domain, or Paraf pairing.
  const dunyakatilim = /(?:^|\n)DUNYA\s+KATILIM\b/.test(nonRowText)
    || /\bDUNYAKATILIM\.COM\.TR\b/.test(nonRowText)
    || (/\bDUNYA\s+KATILIM\b/.test(nonRowText) && /\bPARAF(?:PARA)?\b/.test(nonRowText))
  if (dunyakatilim) matchedIds.push('dunyakatilim')

  const qnb = /(?:^|\n)QNB\b/.test(nonRowText)
    || /\bQNB(?:CARD)?\.COM\.TR\b|\bQNB\s+BANK\b|\bQNB\s+(?:TRENDYOL|CARDFINANS|MILES&SMILES|FIRST|FIX|GO)\b/.test(nonRowText)
  if (qnb) matchedIds.push('qnb')

  const halkbank = /(?:^|\n)(?:TURKIYE\s+)?HALK\s+BANKASI\b|(?:^|\n)HALKBANK\b/.test(nonRowText)
    || /\bHALKBANK\.COM\.TR\b|\bPARAF\.COM\.TR\b/.test(nonRowText)
  if (halkbank) matchedIds.push('halkbank')

  // Some unsupported banks also issue Bonus/Paraf cards. Their own issuer heading
  // takes precedence over a shared product name or payment-bank mention.
  if (statementStructure && OTHER_ISSUER.test(coverLines.slice(0, 8).join('\n'))) {
    throw new StatementValidationError('unsupported_bank')
  }
  if (!statementStructure) throw new StatementValidationError('not_statement')
  if (matchedIds.length > 1) throw new StatementValidationError('ambiguous_bank')
  if (matchedIds.length === 0) throw new StatementValidationError('unsupported_bank')
  return ADAPTERS.find(adapter => adapter.id === matchedIds[0])!
}

/** PDF.js errors are implementation details; only stable instructions escape. */
export function pdfExtractionError(error: unknown): StatementValidationError {
  if (error instanceof StatementValidationError) return error
  const name = error instanceof Error ? error.name : ''
  if (name === 'PasswordException') return new StatementValidationError('password_required')
  if (name === 'InvalidPDFException' || name === 'MissingPDFException') return new StatementValidationError('invalid_pdf')
  return new StatementValidationError('unreadable_pdf')
}
