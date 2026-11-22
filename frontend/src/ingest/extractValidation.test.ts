import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractText } from './extract'
import { parseFile } from './pipeline'
import { AKBANK_COLUMNS, GARANTI_NO_ACTIVITY } from './fixtures'
import { ADAPTERS } from './banks'

const harness = vi.hoisted(() => ({
  items: [] as Array<{ str: string; transform: number[]; width: number }>,
  browserText: '',
  pageCount: 1,
  render: vi.fn(() => ({ promise: Promise.resolve() })),
  terminate: vi.fn(async () => {}),
  destroy: vi.fn(async () => {}),
  createWorker: vi.fn(),
  getTextContent: vi.fn(),
}))

vi.mock('pdfjs-dist/legacy/build/pdf.min.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: harness.pageCount,
      getPage: async () => ({
        getTextContent: harness.getTextContent,
        getViewport: () => ({ width: 100, height: 100 }),
        render: harness.render,
      }),
      destroy: harness.destroy,
    }),
  }),
}))
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: 'mock-worker' }))
vi.mock('tesseract.js', () => ({ default: { createWorker: harness.createWorker } }))

const file = () => new File(['%PDF-1.7\n'], 'ekstre.pdf', { type: 'application/pdf' })
const options = { useLocalOcr: true, ocrEndpoint: 'http://127.0.0.1:8001/ocr', rules: [] }

beforeEach(() => {
  vi.clearAllMocks()
  harness.items = []
  harness.browserText = ''
  harness.pageCount = 1
  harness.getTextContent.mockImplementation(async () => ({ items: harness.items }))
  harness.createWorker.mockResolvedValue({
    recognize: async () => ({ data: { text: harness.browserText } }),
    terminate: harness.terminate,
  })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect: vi.fn() }) }),
  })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('PDF extraction followed by document validation', () => {
  it('destroys the PDF document when text extraction fails', async () => {
    const failure = new Error('Synthetic extraction failure')
    harness.getTextContent.mockRejectedValueOnce(failure)
    await expect(extractText(file(), options)).rejects.toBe(failure)
    expect(harness.destroy).toHaveBeenCalledOnce()
    expect(harness.createWorker).not.toHaveBeenCalled()
  })

  it('rejects readable unrelated PDFs without launching either OCR engine or a bank parser', async () => {
    harness.items = [{ str: 'AKBANK İLE TEMEL PROGRAMLAMA EĞİTİMİ VE DERS PROGRAMI. Bu belge bir ders kitabıdır.', transform: [1, 0, 0, 10, 0, 700], width: 400 }]
    const parsers = ADAPTERS.map(adapter => vi.spyOn(adapter, 'parse'))
    await expect(parseFile(file(), options)).rejects.toMatchObject({ code: 'not_statement' })
    expect(fetch).not.toHaveBeenCalled()
    expect(harness.createWorker).not.toHaveBeenCalled()
    for (const parser of parsers) expect(parser).not.toHaveBeenCalled()
  })

  it('reads a scanned supported statement with the configured local OCR service', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ text: AKBANK_COLUMNS }) } as Response)
    await expect(parseFile(file(), options)).resolves.toMatchObject({ bank: 'Akbank', engine: 'ocr-service' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(harness.createWorker).not.toHaveBeenCalled()
  })

  it('rejects readable unrelated service OCR text before a bank parser', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'AKBANK EĞİTİM PROGRAMI\nBu belge bir eğitim programıdır.\n01/09/2026 DERS 100.00\n02/09/2026 DERS 100.00\n03/09/2026 DERS 100.00' }) } as Response)
    const parsers = ADAPTERS.map(adapter => vi.spyOn(adapter, 'parse'))
    await expect(parseFile(file(), options)).rejects.toMatchObject({ code: 'not_statement' })
    expect(harness.createWorker).not.toHaveBeenCalled()
    for (const parser of parsers) expect(parser).not.toHaveBeenCalled()
  })

  it('falls back to browser OCR when the local service is unavailable and preserves no-activity statements', async () => {
    harness.browserText = GARANTI_NO_ACTIVITY
    await expect(parseFile(file(), options)).resolves.toMatchObject({ bank: 'Garanti BBVA', engine: 'ocr-browser', transactions: [] })
    expect(harness.render).toHaveBeenCalledOnce()
    expect(harness.terminate).toHaveBeenCalledOnce()
    expect(harness.destroy).toHaveBeenCalledTimes(2)
  })

  it('runs browser OCR directly when local OCR is disabled', async () => {
    harness.browserText = AKBANK_COLUMNS
    await expect(extractText(file(), { ...options, useLocalOcr: false })).resolves.toMatchObject({ text: AKBANK_COLUMNS, engine: 'ocr-browser' })
    expect(fetch).not.toHaveBeenCalled()
    expect(harness.terminate).toHaveBeenCalledOnce()
  })

  it('uses the readable cover and OCRs only the missing transaction page', async () => {
    const firstRow = AKBANK_COLUMNS.indexOf('07/09/2026')
    const cover = AKBANK_COLUMNS.slice(0, firstRow).trim().split('\n')
    const items = cover.map((str, index) => ({ str, transform: [1, 0, 0, 10, 0, 800 - index * 15], width: 400 }))
    harness.pageCount = 2
    harness.getTextContent.mockResolvedValueOnce({ items }).mockResolvedValueOnce({ items: [] })
    harness.browserText = AKBANK_COLUMNS.slice(firstRow)
    await expect(parseFile(file(), options)).resolves.toMatchObject({
      bank: 'Akbank', engine: 'pdf-ocr', skipped: 0, reconciliation: { status: 'match' },
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(harness.render).toHaveBeenCalledOnce()
  })

  it('reports a blank scan after both text and OCR extraction produced nothing', async () => {
    await expect(parseFile(file(), options)).rejects.toMatchObject({ code: 'unreadable_text' })
    expect(harness.terminate).toHaveBeenCalledOnce()
  })
})
