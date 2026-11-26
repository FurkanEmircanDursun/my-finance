import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ParseError } from '../ingest/pipeline'
import { StatementValidationError } from '../ingest/validation'
import { UserFacingError } from '../core/errors'
import { emptySummary, type ParseResult } from '../domain/types'
import {
  classifyFailedStatementUpload,
  deleteAllRecordedFailedStatements,
  deleteFailedStatementReport,
  failedStatementUploadEnabled,
  listRecordedFailedStatements,
  setFailedStatementUploadEnabled,
  uploadFailedStatement,
} from './failedStatements'

const mocks = vi.hoisted(() => ({
  storage: { app: { name: '[DEFAULT]' } },
  ref: vi.fn((_storage: unknown, path: string) => ({ fullPath: path })),
  uploadBytes: vi.fn(),
  deleteObject: vi.fn(),
}))

vi.mock('firebase/storage', () => ({
  ref: mocks.ref,
  uploadBytes: mocks.uploadBytes,
  deleteObject: mocks.deleteObject,
}))

vi.mock('./storage', () => ({
  getFirebaseStorage: () => mocks.storage,
}))

const SAMPLE_SHA = 'a'.repeat(64)

const memoryStore = new Map<string, string>()

beforeEach(() => {
  vi.clearAllMocks()
  memoryStore.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => { memoryStore.set(key, value) },
    removeItem: (key: string) => { memoryStore.delete(key) },
  })
  mocks.uploadBytes.mockResolvedValue({} as never)
  mocks.deleteObject.mockResolvedValue(undefined)
})

const sampleParsed: ParseResult = {
  bank: 'Akbank',
  engine: 'pdf-text',
  accountLabel: 'Akbank Axess',
  transactions: [],
  skipped: 2,
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  dueDate: '2026-11-10',
  label: 'Akbank Axess · Ekim 2026',
  summary: emptySummary(),
  reconciliation: {
    status: 'mismatch',
    printedDebt: 10000,
    previousBalance: 0,
    payments: 0,
    parsedCharges: 8000,
    expectedCharges: 10000,
    delta: -2000,
  },
  ignored: [],
}

describe('failed statement upload eligibility (data minimization)', () => {
  it('accepts genuine bank-statement parse and reconciliation failures', () => {
    expect(classifyFailedStatementUpload(new StatementValidationError('unsupported_bank'))).toEqual({
      errorCode: 'unsupported_bank',
      reason: 'unsupported_bank',
    })
    expect(classifyFailedStatementUpload(new StatementValidationError('unreadable_text'))).toEqual({
      errorCode: 'unreadable',
      reason: 'unreadable_text',
    })
    expect(classifyFailedStatementUpload(new StatementValidationError('unreadable_pdf'))).toEqual({
      errorCode: 'unreadable',
      reason: 'unreadable_pdf',
    })
    expect(classifyFailedStatementUpload(new StatementValidationError('ambiguous_bank'))).toEqual({
      errorCode: 'other',
      reason: 'ambiguous_bank',
    })
    expect(
      classifyFailedStatementUpload(
        new ParseError('Ekstrede okunamayan işlem satırları var.'),
        sampleParsed,
        'parse',
      ),
    ).toEqual({
      errorCode: 'reconciliation',
      reason: 'skipped_rows',
    })
    expect(
      classifyFailedStatementUpload(
        new ParseError('Okunan hareketler bankanın ekstre toplamlarıyla uyuşmuyor.'),
        { ...sampleParsed, skipped: 0 },
        'parse',
      ),
    ).toEqual({
      errorCode: 'reconciliation',
      reason: 'reconciliation_mismatch',
    })
    expect(classifyFailedStatementUpload(new ParseError('Dosyada işlem satırı bulunamadı.'))).toEqual({
      errorCode: 'other',
      reason: 'no_rows',
    })
  })

  it('refuses non-statements, password-locked PDFs, invalid files, duplicates, and card mismatches', () => {
    for (const code of ['not_statement', 'invalid_file', 'empty_file', 'file_too_large', 'invalid_pdf', 'password_required'] as const) {
      expect(classifyFailedStatementUpload(new StatementValidationError(code))).toBeNull()
    }
    expect(classifyFailedStatementUpload(new ParseError('Bu kart ve döneme ait ekstre var.'), undefined, 'post-parse')).toBeNull()
    expect(classifyFailedStatementUpload(new ParseError('Mevcut ekstreyi güncellemek için dönem borcu ve önceki bakiyesi okunabilen bir dosya yükle.'), { ...sampleParsed, bank: 'CSV', skipped: 0, reconciliation: { ...sampleParsed.reconciliation, status: 'unverified' } }, 'post-parse')).toBeNull()
    expect(classifyFailedStatementUpload(new UserFacingError('Seçilen kart bulunamadı.'), undefined, 'post-parse')).toBeNull()
  })
})

describe('failed statement upload preference and Storage lifecycle', () => {
  it('defaults to enabled and persists user opt-out', () => {
    expect(failedStatementUploadEnabled()).toBe(true)
    setFailedStatementUploadEnabled(false)
    expect(failedStatementUploadEnabled()).toBe(false)
    setFailedStatementUploadEnabled(true)
    expect(failedStatementUploadEnabled()).toBe(true)
  })

  it('uploads source file + structured report.json to owner write-once dropbox with validated metadata', async () => {
    const file = new File(['%PDF-1.7\nSynthetic unreadable fixture'], 'ekstre.pdf', { type: 'application/pdf' })
    const refResult = await uploadFailedStatement({
      uid: 'owner-1',
      file,
      sha256: SAMPLE_SHA,
      classification: { errorCode: 'reconciliation', reason: 'skipped_rows' },
      userMessage: 'Ekstrede okunamayan işlem satırları var.',
      parsed: sampleParsed,
    })

    expect(refResult).toEqual({ reportId: SAMPLE_SHA, ext: 'pdf' })
    expect(mocks.uploadBytes).toHaveBeenCalledTimes(2)
    expect(mocks.ref).toHaveBeenCalledWith(mocks.storage, `users/owner-1/failed-statements/${SAMPLE_SHA}/source.pdf`)
    expect(mocks.ref).toHaveBeenCalledWith(mocks.storage, `users/owner-1/failed-statements/${SAMPLE_SHA}/report.json`)

    const [, , pdfMeta] = mocks.uploadBytes.mock.calls[0]
    expect(pdfMeta).toMatchObject({
      contentType: 'application/pdf',
      customMetadata: {
        errorCode: 'reconciliation',
        reason: 'skipped_rows',
        sha256: SAMPLE_SHA,
      },
    })

    const [, reportBytes, reportMeta] = mocks.uploadBytes.mock.calls[1]
    expect(reportMeta.contentType).toBe('application/json')
    const decoded = JSON.parse(new TextDecoder().decode(reportBytes as Uint8Array))
    expect(decoded).toMatchObject({
      schemaVersion: 1,
      reportId: SAMPLE_SHA,
      file: { ext: 'pdf', mimeType: 'application/pdf', sha256: SAMPLE_SHA },
      failure: { errorCode: 'reconciliation', reason: 'skipped_rows' },
      parseDiagnostics: { bank: 'Akbank', skippedCount: 2, reconciliation: { delta: -2000 } },
    })

    expect(listRecordedFailedStatements('owner-1')).toEqual([{ reportId: SAMPLE_SHA, ext: 'pdf' }])
  })

  it('deletes both source and report objects and clears the local record', async () => {
    const file = new File(['%PDF-1.7\nFixture'], 'ekstre.pdf', { type: 'application/pdf' })
    const entry = (await uploadFailedStatement({
      uid: 'owner-1',
      file,
      sha256: SAMPLE_SHA,
      classification: { errorCode: 'unsupported_bank', reason: 'unsupported_bank' },
      userMessage: 'Desteklenmeyen banka.',
    }))!

    await deleteFailedStatementReport('owner-1', entry)
    expect(mocks.deleteObject).toHaveBeenCalledTimes(2)
    expect(listRecordedFailedStatements('owner-1')).toEqual([])
  })

  it('cleans up all recorded bundles on account wipe even if an object already expired', async () => {
    const file = new File(['%PDF-1.7\nFixture'], 'ekstre.pdf', { type: 'application/pdf' })
    await uploadFailedStatement({
      uid: 'owner-1',
      file,
      sha256: SAMPLE_SHA,
      classification: { errorCode: 'unsupported_bank', reason: 'unsupported_bank' },
      userMessage: 'Desteklenmeyen banka.',
    })
    mocks.deleteObject.mockRejectedValueOnce({ code: 'storage/object-not-found' })

    await expect(deleteAllRecordedFailedStatements('owner-1')).resolves.toBeUndefined()
    expect(listRecordedFailedStatements('owner-1')).toEqual([])
  })
})
