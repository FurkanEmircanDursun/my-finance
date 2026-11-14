import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADAPTERS } from './banks'
import { extractText, recogniseLayerText } from './extract'
import { parseFile, parseStatementText } from './pipeline'
import { AKBANK_COLUMNS, AKBANK_NO_ACTIVITY, GARANTI_COLUMNS, GARANTI_FIRST, GARANTI_NO_ACTIVITY, instalmentStatement } from './fixtures'
import { MAX_STATEMENT_BYTES, StatementValidationError, validateStatementFile } from './validation'

vi.mock('./extract', async original => ({
  ...await original<typeof import('./extract')>(),
  extractText: vi.fn(),
}))

const parse = (text: string, engine = 'pdf-text') => parseStatementText(text, { rules: [], engine, fileName: 'ekstre.pdf' })
const options = { rules: [], useLocalOcr: false, ocrEndpoint: '' }
const pdf = (type = 'application/pdf') => new File(['%PDF-1.7\n'], 'ekstre.pdf', { type })
const errorCode = (run: () => unknown) => {
  try { run() } catch (error) {
    expect(error).toBeInstanceOf(StatementValidationError)
    return (error as StatementValidationError).code
  }
  throw new Error('Expected validation rejection')
}

afterEach(() => vi.restoreAllMocks())

describe('statement identity before bank transaction parsing', () => {
  const unrelated = [
    ['unrelated document', 'TEMEL PROGRAMLAMA DERS PROGRAMI\nAKBANK ile yapılan eğitim anlaşması\n01/09/2026 Birinci ders 100.00\n02/09/2026 İkinci ders 100.00\n03/09/2026 Üçüncü ders 100.00', 'not_statement'],
    ['bank-name spoof with parseable rows', 'AKBANK\n01/09/2026 KALEM 100.00\n02/09/2026 KITAP 100.00\n03/09/2026 DEFTER 100.00\nBu yalnızca bir eğitim örneğidir.', 'not_statement'],
    ['payment receipt', 'AKBANK\nKREDİ KARTI ÖDEME MAKBUZU\nİşlem Tarihi 01/09/2026\nSon Ödeme Tarihi 02/09/2026\nValör 03/09/2026\nÖdenen Tutar 300.00 TL', 'not_statement'],
    ['invoice mentioning a bank', 'E-ARŞİV FATURA\nAKBANK IBAN BİLGİLERİ\nHesap Kesim Tarihi 01/09/2026\nSon Ödeme Tarihi 02/09/2026\n03/09/2026 ÜRÜN 100.00', 'not_statement'],
    ['other bank with Akbank as merchant', 'YAPI KREDİ WORLD HESAP ÖZETİ\nHesap Kesim Tarihi 28/09/2026\nSon Ödeme Tarihi 08/10/2026\nDönem Borcu 100.00\n05/09/2026 AKBANK ÖDEME 100.00', 'unsupported_bank'],
    ['other issuer mentioning a supported payment bank', 'YAPI KREDİ WORLD HESAP ÖZETİ\nAKBANK ödeme hesabı\nHesap Kesim Tarihi 28/09/2026\nSon Ödeme Tarihi 08/10/2026\nDönem Borcu 100.00\n05/09/2026 ALIŞVERİŞ 100.00', 'unsupported_bank'],
    ['unsupported issuer using the Bonus programme', `DENİZBANK\n${GARANTI_COLUMNS}`, 'unsupported_bank'],
    ['unknown issuer with a statement-like table', 'ÖRNEK BANKASI HESAP ÖZETİ\nHesap Kesim Tarihi 28/09/2026\nSon Ödeme Tarihi 08/10/2026\nDönem Borcu 100.00\n05/09/2026 ALIŞVERİŞ 100.00', 'unsupported_bank'],
    ['date format without issuer', 'HESAP ÖZETİ\nHesap Kesim Tarihi 28/09/2026\nSon Ödeme Tarihi 08/10/2026\n01/09/2026 A 100.00\n02/09/2026 B 100.00\n03/09/2026 C 100.00', 'unsupported_bank'],
    ['PDF containing a CSV table', 'Tarih,Açıklama,Tutar\n01/09/2026,ALIŞVERİŞ,100.00\n02/09/2026,MARKET,200.00', 'not_statement'],
    ['mixed bank statements', `${AKBANK_COLUMNS}\n${GARANTI_COLUMNS}\nGARANTİ BBVA HESAP ÖZETİ`, 'ambiguous_bank'],
  ] as const

  it.each(unrelated)('rejects %s without calling any bank parser', (_name, text, code) => {
    const parsers = ADAPTERS.map(adapter => vi.spyOn(adapter, 'parse'))
    expect(errorCode(() => parse(text))).toBe(code)
    for (const parser of parsers) expect(parser).not.toHaveBeenCalled()
  })

  it.each(['pdf-text', 'pdf-ebcdic', 'ocr-service', 'ocr-browser', 'text'])('gates %s results before parsing', engine => {
    const parsers = ADAPTERS.map(adapter => vi.spyOn(adapter, 'parse'))
    expect(errorCode(() => parse(unrelated[1][1], engine))).toBe('not_statement')
    for (const parser of parsers) expect(parser).not.toHaveBeenCalled()
  })

  it.each([AKBANK_COLUMNS, GARANTI_COLUMNS, GARANTI_FIRST, instalmentStatement(1), instalmentStatement(2), instalmentStatement(3)])('accepts supported statement templates', text => {
    expect(parse(text).transactions.length).toBeGreaterThan(0)
  })

  it('accepts Garanti cover labels printed in columns above their date values', () => {
    const columnar = GARANTI_COLUMNS.replace('Hesap Kesim Tarihi 28 Eylül 2026', 'Hesap Kesim Tarihi Son Ödeme Tarihi Dönem Borcunuz Min. Ödeme Tutarı\n28 Eylül 2026 08 Ekim 2026 1.280,00 TL 480,00 TL')
    expect(parse(columnar).transactions.length).toBeGreaterThan(0)
  })

  it('accepts a columnar cover with the cut-date value detached by card columns', () => {
    const columnar = GARANTI_COLUMNS.replace('Hesap Kesim Tarihi 28 Eylül 2026', 'Hesap Kesim Tarihi Son Ödeme Tarihi Dönem Borcunuz Min. Ödeme Tutarı\nKart No Limit Kullanılabilir Limit\n28 Eylül 2026 08 Ekim 2026')
    expect(parse(columnar).transactions.length).toBeGreaterThan(0)
  })

  it.each([AKBANK_NO_ACTIVITY, GARANTI_NO_ACTIVITY])('keeps balanced zero-activity statements valid', text => {
    expect(parse(text)).toMatchObject({ transactions: [], reconciliation: { status: 'match', expectedCharges: 0 } })
  })

  it('does not treat another bank named in a transaction as an issuer', () => {
    expect(parse(`${AKBANK_COLUMNS}\n15/09/2026 GARANTİ BANKASI EFT 100.00`).bank).toBe('Akbank')
  })

  it('preserves short CSV exports from any bank for text files', () => {
    expect(parse('Tarih,Açıklama,Tutar\n01/09/2026,A,10.00', 'text').transactions).toHaveLength(1)
  })

  it.each(['', ' \n\t', '\u0000\u0000\u0000', 'AKBANK'])('rejects empty, damaged or insufficient text', text => {
    expect(errorCode(() => parse(text))).toBe('unreadable_text')
  })

  it('uses readable unrelated PDF text directly so classification can reject it without OCR', () => {
    expect(recogniseLayerText(unrelated[0][1])).toEqual({ text: unrelated[0][1], engine: 'pdf-text' })
    expect(recogniseLayerText('AKBANK')).toBeNull()
  })
})

describe('file validation before extraction', () => {
  it.each(['application/pdf', 'application/octet-stream', ''])('accepts PDF signature with %s MIME', async mime => {
    await expect(validateStatementFile(pdf(mime))).resolves.toBeUndefined()
  })

  it('accepts a PDF header after a leading preamble', async () => {
    await expect(validateStatementFile(new File(['\ufeff%PDF-1.7\n'], 'ekstre.pdf'))).resolves.toBeUndefined()
  })

  it.each([
    [new File([], 'bos.pdf'), 'empty_file'],
    [new File(['unrelated text renamed'], 'ekstre.pdf', { type: 'application/pdf' }), 'invalid_pdf'],
    [new File(['%PDF-1.7\n'], 'ekstre.pdf', { type: 'image/png' }), 'invalid_file'],
    [new File(['%PDF-1.7\n'], 'ekstre.txt', { type: 'text/plain' }), 'invalid_file'],
    [new File(['unrelated'], 'script.html', { type: 'text/html' }), 'invalid_file'],
    [{ name: 'large.pdf', type: 'application/pdf', size: MAX_STATEMENT_BYTES + 1 } as File, 'file_too_large'],
  ])('rejects invalid containers before extraction', async (file, code) => {
    const extraction = vi.mocked(extractText)
    extraction.mockClear()
    await expect(parseFile(file as File, options)).rejects.toMatchObject({ name: 'StatementValidationError', code })
    expect(extraction).not.toHaveBeenCalled()
  })

  it.each([
    ['PasswordException', 'password_required'],
    ['InvalidPDFException', 'invalid_pdf'],
    ['MissingPDFException', 'invalid_pdf'],
    ['UnexpectedResponseException', 'unreadable_pdf'],
  ])('turns %s into safe Turkish instructions', async (name, code) => {
    const internal = new Error('private path, contents, implementation detail')
    internal.name = name
    vi.mocked(extractText).mockRejectedValueOnce(internal)
    const error = await parseFile(pdf(), options).catch(error => error)
    expect(error).toMatchObject({ name: 'StatementValidationError', code, hint: expect.any(String) })
    expect(error.message).not.toContain('private')
    expect(error.hint).not.toContain('private')
  })

  it('validates extracted PDF contents before the transaction parser', async () => {
    vi.mocked(extractText).mockResolvedValueOnce({ text: 'AKBANK KREDİ KARTI ÖDEME DEKONTU\n01/09/2026 ÖDEME 100.00\n02/09/2026 VALÖR 100.00\n03/09/2026 ONAY 100.00', engine: 'pdf-text' })
    const parsers = ADAPTERS.map(adapter => vi.spyOn(adapter, 'parse'))
    await expect(parseFile(pdf(), options)).rejects.toBeInstanceOf(StatementValidationError)
    for (const parser of parsers) expect(parser).not.toHaveBeenCalled()
  })

  it('passes valid PDF contents through extraction and validation', async () => {
    vi.mocked(extractText).mockResolvedValueOnce({ text: GARANTI_COLUMNS, engine: 'pdf-text' })
    await expect(parseFile(pdf('application/octet-stream'), options)).resolves.toMatchObject({ bank: 'Garanti BBVA' })
  })
})
