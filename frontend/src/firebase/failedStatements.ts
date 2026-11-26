import { ParseError } from '../ingest/pipeline'
import { isPdfFile, MAX_STATEMENT_BYTES, StatementValidationError } from '../ingest/validation'
import { UserFacingError } from '../core/errors'
import { isAndroid, isIOS } from '../platform'
import type { ParseResult } from '../domain/types'

export const FAILED_STATEMENT_PREF_UPDATED = 'mizan:failed-statement-pref-updated'

const PREF_KEY = 'mizan:failed-statement-upload'
const REPORTS_KEY_PREFIX = 'mizan:failed-statement-reports:'
const MAX_TEXT_STATEMENT_BYTES = 5 * 1024 * 1024
const MAX_REPORT_JSON_BYTES = 256 * 1024
const MAX_LOCAL_RECORDS = 50
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/

export type FailedStatementExt = 'pdf' | 'csv' | 'txt'

export type FailedStorageErrorCode = 'unsupported_bank' | 'reconciliation' | 'unreadable' | 'other'

export type FailedStatementReason =
  | 'unsupported_bank'
  | 'ambiguous_bank'
  | 'unreadable_text'
  | 'unreadable_pdf'
  | 'skipped_rows'
  | 'reconciliation_mismatch'
  | 'printed_totals_mismatch'
  | 'unverified_cover'
  | 'no_rows'
  | 'unexpected_parse_error'

export interface FailedStatementDiagnosticRef {
  reportId: string
  ext: FailedStatementExt
}

export interface FailedStatementClassification {
  errorCode: FailedStorageErrorCode
  reason: FailedStatementReason
}

/**
 * Enabled by default for signed-in accounts so unsupported/unreadable statements
 * can be diagnosed and supported in future releases. Users can opt out anytime
 * from Ayarlar → Bulut ve Gizlilik.
 */
export function failedStatementUploadEnabled(): boolean {
  try {
    const stored = globalThis.localStorage?.getItem(PREF_KEY)
    if (stored === '0' || stored === 'false') return false
    return true
  } catch {
    return true
  }
}

export function setFailedStatementUploadEnabled(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(PREF_KEY, enabled ? '1' : '0')
  } catch {
    // Ignore restricted storage modes.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(FAILED_STATEMENT_PREF_UPDATED))
  }
}

function reportsStorageKey(uid: string): string {
  return `${REPORTS_KEY_PREFIX}${uid}`
}

export function listRecordedFailedStatements(uid: string): FailedStatementDiagnosticRef[] {
  try {
    const raw = globalThis.localStorage?.getItem(reportsStorageKey(uid))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is FailedStatementDiagnosticRef =>
        Boolean(
          item &&
            typeof item === 'object' &&
            typeof item.reportId === 'string' &&
            /^[0-9a-f]{64}$/.test(item.reportId) &&
            (item.ext === 'pdf' || item.ext === 'csv' || item.ext === 'txt'),
        ),
    )
  } catch {
    return []
  }
}

function saveRecordedFailedStatements(uid: string, items: readonly FailedStatementDiagnosticRef[]): void {
  try {
    const bounded = items.slice(-MAX_LOCAL_RECORDS)
    if (bounded.length) globalThis.localStorage?.setItem(reportsStorageKey(uid), JSON.stringify(bounded))
    else globalThis.localStorage?.removeItem(reportsStorageKey(uid))
  } catch {
    // Ignore restricted storage modes.
  }
}

function recordUploadedReport(uid: string, entry: FailedStatementDiagnosticRef): void {
  const existing = listRecordedFailedStatements(uid).filter((item) => item.reportId !== entry.reportId)
  existing.push(entry)
  saveRecordedFailedStatements(uid, existing)
}

function removeRecordedReport(uid: string, reportId: string): void {
  const remaining = listRecordedFailedStatements(uid).filter((item) => item.reportId !== reportId)
  saveRecordedFailedStatements(uid, remaining)
}

/**
 * Only genuine statement parsing/format failures are eligible for diagnostic upload.
 * Non-statements (invoices/receipts), invalid/empty/oversized files, password-locked
 * PDFs, duplicate cycles, wrong-card selections, and foreign-holder notices are
 * deliberately excluded (data minimization).
 */
export function classifyFailedStatementUpload(
  error: unknown,
  parsed?: ParseResult,
  stage: 'parse' | 'post-parse' = 'parse',
): FailedStatementClassification | null {
  if (stage !== 'parse') return null

  if (error instanceof StatementValidationError) {
    switch (error.code) {
      case 'unsupported_bank':
        return { errorCode: 'unsupported_bank', reason: 'unsupported_bank' }
      case 'ambiguous_bank':
        return { errorCode: 'other', reason: 'ambiguous_bank' }
      case 'unreadable_text':
        return { errorCode: 'unreadable', reason: 'unreadable_text' }
      case 'unreadable_pdf':
        return { errorCode: 'unreadable', reason: 'unreadable_pdf' }
      default:
        return null
    }
  }

  if (error instanceof ParseError) {
    if (parsed) {
      if (parsed.bank !== 'CSV' && parsed.skipped > 0) {
        return { errorCode: 'reconciliation', reason: 'skipped_rows' }
      }
      if (parsed.reconciliation.status === 'mismatch') {
        return { errorCode: 'reconciliation', reason: 'reconciliation_mismatch' }
      }
      if (parsed.printedTotalsMismatch) {
        return { errorCode: 'reconciliation', reason: 'printed_totals_mismatch' }
      }
      if (parsed.bank !== 'CSV' && parsed.reconciliation.status === 'unverified') {
        return { errorCode: 'reconciliation', reason: 'unverified_cover' }
      }
    }
    if (/işlem satırı bulunamadı/i.test(error.message)) {
      return { errorCode: 'other', reason: 'no_rows' }
    }
    if (/okunamayan işlem/i.test(error.message)) {
      return { errorCode: 'reconciliation', reason: 'skipped_rows' }
    }
    if (/uyuşmuyor/i.test(error.message)) {
      return { errorCode: 'reconciliation', reason: 'reconciliation_mismatch' }
    }
    if (/önceki bakiyesi/i.test(error.message)) {
      return { errorCode: 'reconciliation', reason: 'unverified_cover' }
    }
    return null
  }

  if (error instanceof UserFacingError) return null
  return { errorCode: 'other', reason: 'unexpected_parse_error' }
}

function resolveFileSpec(file: File): { ext: FailedStatementExt; contentType: string; maxBytes: number } | null {
  if (isPdfFile(file)) {
    return { ext: 'pdf', contentType: 'application/pdf', maxBytes: MAX_STATEMENT_BYTES }
  }
  if (/\.csv$/i.test(file.name)) {
    return { ext: 'csv', contentType: 'text/csv', maxBytes: MAX_TEXT_STATEMENT_BYTES }
  }
  if (/\.txt$/i.test(file.name)) {
    return { ext: 'txt', contentType: 'text/plain', maxBytes: MAX_TEXT_STATEMENT_BYTES }
  }
  return null
}

function safeAppVersion(): string {
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.trim() : ''
  return SEMVER_RE.test(version) ? version : '0.0.0'
}

function currentPlatform(): 'ios' | 'android' | 'web' {
  if (isIOS()) return 'ios'
  if (isAndroid()) return 'android'
  return 'web'
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\u0000-\u001f/\\]/g, '_').slice(0, 180) || 'statement'
}

async function computeFileSha256(file: File): Promise<string | null> {
  if (!globalThis.crypto?.subtle || typeof file.arrayBuffer !== 'function') return null
  const bytes = await file.arrayBuffer()
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function isStorageAlreadyExistsOrDenied(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : ''
  return code === 'storage/unauthorized' || code === 'storage/object-already-exists'
}

export interface UploadFailedStatementInput {
  uid: string
  file: File
  sha256?: string
  classification: FailedStatementClassification
  userMessage: string
  parsed?: ParseResult
}

/**
 * Deposits the unreadable/failed source file and a structured JSON diagnostic
 * report into the owner's write-once Firebase Storage dropbox:
 *   users/{uid}/failed-statements/{sha256}/source.{ext}
 *   users/{uid}/failed-statements/{sha256}/report.json
 *
 * Returns the diagnostic ref on success (or if already uploaded for the exact
 * same SHA-256), and `null` on any skip or upload error so importing is never
 * disrupted.
 */
export async function uploadFailedStatement(
  input: UploadFailedStatementInput,
): Promise<FailedStatementDiagnosticRef | null> {
  const { uid, file, classification, userMessage, parsed } = input
  if (!uid || !file) return null

  const spec = resolveFileSpec(file)
  if (!spec || file.size <= 0 || file.size > spec.maxBytes) return null

  const sha256 = input.sha256 && /^[0-9a-f]{64}$/.test(input.sha256)
    ? input.sha256
    : await computeFileSha256(file)
  if (!sha256) return null

  const createdAt = new Date().toISOString()
  const appVersion = safeAppVersion()
  const customMetadata = {
    errorCode: classification.errorCode,
    reason: classification.reason,
    appVersion,
    sha256,
    createdAt,
  }

  const reportPayload = {
    schemaVersion: 1,
    reportId: sha256,
    createdAt,
    appVersion,
    platform: currentPlatform(),
    file: {
      name: sanitizeFileName(file.name),
      ext: spec.ext,
      mimeType: spec.contentType,
      sizeBytes: file.size,
      sha256,
    },
    failure: {
      errorCode: classification.errorCode,
      reason: classification.reason,
      message: userMessage.slice(0, 500),
    },
    ...(parsed
      ? {
          parseDiagnostics: {
            bank: parsed.bank,
            accountLabel: parsed.accountLabel,
            engine: parsed.engine,
            transactionCount: parsed.transactions.length,
            skippedCount: parsed.skipped,
            periodStart: parsed.periodStart,
            periodEnd: parsed.periodEnd,
            dueDate: parsed.dueDate,
            printedTotalsMismatch: Boolean(parsed.printedTotalsMismatch),
            reconciliation: parsed.reconciliation,
            summary: parsed.summary,
          },
        }
      : {}),
  }

  const reportBytes = new TextEncoder().encode(JSON.stringify(reportPayload, null, 2))
  if (reportBytes.byteLength === 0 || reportBytes.byteLength > MAX_REPORT_JSON_BYTES) return null

  try {
    const [{ ref, uploadBytes }, { getFirebaseStorage }] = await Promise.all([
      import('firebase/storage'),
      import('./storage'),
    ])
    const storage = getFirebaseStorage()
    const base = `users/${uid}/failed-statements/${sha256}`
    const sourceRef = ref(storage, `${base}/source.${spec.ext}`)
    const reportRef = ref(storage, `${base}/report.json`)

    const sourceBytes = new Uint8Array(await file.arrayBuffer())
    let uploadedOrDuplicate = false

    const results = await Promise.allSettled([
      uploadBytes(sourceRef, sourceBytes, { contentType: spec.contentType, customMetadata }),
      uploadBytes(reportRef, reportBytes, { contentType: 'application/json', customMetadata }),
    ])

    for (const outcome of results) {
      if (outcome.status === 'fulfilled') {
        uploadedOrDuplicate = true
      } else if (isStorageAlreadyExistsOrDenied(outcome.reason)) {
        // Because storage.rules enforces write-once (`allow create`, `allow update: if false`),
        // re-uploading the exact same failing SHA-256 returns storage/unauthorized.
        const alreadyRecorded = listRecordedFailedStatements(uid).some((r) => r.reportId === sha256)
        if (alreadyRecorded) uploadedOrDuplicate = true
      }
    }

    if (!uploadedOrDuplicate) return null

    const entry: FailedStatementDiagnosticRef = { reportId: sha256, ext: spec.ext }
    recordUploadedReport(uid, entry)
    return entry
  } catch {
    return null
  }
}

function isObjectNotFound(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : ''
  return code === 'storage/object-not-found'
}

/** Deletes a single owner-uploaded diagnostic bundle (source file + JSON report). */
export async function deleteFailedStatementReport(
  uid: string,
  entry: FailedStatementDiagnosticRef,
): Promise<void> {
  if (!uid || !/^[0-9a-f]{64}$/.test(entry.reportId)) return
  const [{ ref, deleteObject }, { getFirebaseStorage }] = await Promise.all([
    import('firebase/storage'),
    import('./storage'),
  ])
  const storage = getFirebaseStorage()
  const base = `users/${uid}/failed-statements/${entry.reportId}`

  const deletions = [
    deleteObject(ref(storage, `${base}/source.${entry.ext}`)),
    deleteObject(ref(storage, `${base}/report.json`)),
  ]
  const results = await Promise.allSettled(deletions)
  for (const result of results) {
    if (result.status === 'rejected' && !isObjectNotFound(result.reason)) {
      throw result.reason
    }
  }
  removeRecordedReport(uid, entry.reportId)
}

/** Best-effort deletion of all recorded diagnostic bundles for this account on cloud wipe / account deletion. */
export async function deleteAllRecordedFailedStatements(uid: string): Promise<void> {
  const entries = listRecordedFailedStatements(uid)
  if (!entries.length) return
  for (const entry of entries) {
    await deleteFailedStatementReport(uid, entry).catch(() => {
      // Do not block account deletion if a Storage object already expired via 30-day cleanup.
    })
  }
  saveRecordedFailedStatements(uid, [])
}
