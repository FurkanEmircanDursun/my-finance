import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Cloud,
  CreditCard as CreditCardIcon,
  Eye,
  FileCheck2,
  FileText,
  Lock,
  ShieldAlert,
  ShieldBan,
  Trash2,
  Upload,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Skeleton, TextInput } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { BankLogoBadge } from '../ui/BankLogo'
import { ReconciliationBadge } from '../ui/statements'
import { PdfPreviewModal } from '../ui/PdfPreview'
import { useSheets } from './sheets'
import { useStore } from '../store/AppStore'
import { useImport } from '../hooks/useImport'
import { deleteFailedStatementReport } from '../firebase/failedStatements'
import { isPdfFile } from '../ingest/validation'
import { matchesTypedCardholderName } from '../ingest/ownership'
import { fold } from '../core/text'
import { fullDayLabel } from '../core/date'
import { count, money2 } from '../core/money'
import type { ImportErrorCode, ImportOutcome } from '../domain/types'
import { importedCardDraft, legacyCardKey } from '../domain/cardLifecycle'
import { SaveImportedCardOffer } from './SaveImportedCardOffer'
import '../styles/cards.css'

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
}

const SUPPORTED_BANKS = [
  'Akbank Axess',
  'Garanti BBVA Bonus',
  'İş Bankası Maximum',
  'QNB',
  'Dünya Katılım Paraf',
  'Halkbank Paraf',
  'Genel CSV',
] as const

type OnFinished = (outcomes: ImportOutcome[], cardId: string, files: readonly File[]) => void

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function errorMeta(code: ImportErrorCode | undefined, error?: string): {
  label: string
  isOwnership: boolean
} {
  if (code === 'different_holder' || (error && /adına kayıtlı/i.test(error))) {
    return { label: 'Farklı kart sahibi', isOwnership: true }
  }
  if (code === 'unsupported_bank') return { label: 'Desteklenmeyen banka', isOwnership: false }
  if (code === 'reconciliation') return { label: 'Toplam uyuşmazlığı', isOwnership: false }
  if (code === 'unreadable') return { label: 'Okunamayan dosya', isOwnership: false }
  if (code === 'duplicate_cycle') return { label: 'Dönem zaten kayıtlı', isOwnership: false }
  return { label: 'Aktarılamadı', isOwnership: false }
}

function PreviewButton({
  file,
  onPreview,
  compact = false,
}: {
  file?: File
  onPreview: (file: File) => void
  compact?: boolean
}) {
  if (!file || !isPdfFile(file)) return null
  return (
    <button
      type="button"
      onClick={() => onPreview(file)}
      aria-label={`${file.name} PDF önizleme`}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-raised font-medium text-ink transition hover:border-accent-border hover:bg-hover hover:text-accent-text',
        compact ? 'h-8 px-2.5 text-[12px]' : 'h-9 px-3 text-label',
      )}
    >
      <Eye size={compact ? 13 : 14} />
      <span>Önizle</span>
    </button>
  )
}

function FailedOutcomesPanel({
  failed,
  fileForName,
  onPreview,
}: {
  failed: readonly ImportOutcome[]
  fileForName: (name: string) => File | undefined
  onPreview: (file: File, subtitle?: string) => void
}) {
  const { authUser } = useStore()
  const [expanded, setExpanded] = useState(false)
  const [reportState, setReportState] = useState<Record<string, 'deleting' | 'deleted' | 'error'>>({})
  if (!failed.length) return null

  const handleDeleteReport = async (report: NonNullable<ImportOutcome['diagnosticReport']>) => {
    if (!authUser?.uid || authUser.isAnonymous) return
    setReportState((prev) => ({ ...prev, [report.reportId]: 'deleting' }))
    try {
      await deleteFailedStatementReport(authUser.uid, report)
      setReportState((prev) => ({ ...prev, [report.reportId]: 'deleted' }))
    } catch {
      setReportState((prev) => ({ ...prev, [report.reportId]: 'error' }))
    }
  }

  const ownershipCount = failed.filter((o) => errorMeta(o.errorCode, o.error).isOwnership).length
  const visible = expanded ? failed : failed.slice(0, 5)

  return (
    <section
      role="alert"
      className="space-y-2.5 rounded-[var(--radius-lg)] border border-negative/30 bg-negative-soft/45 p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <span className="flex items-center gap-2 text-label font-semibold text-negative">
          {ownershipCount === failed.length ? <ShieldBan size={15} /> : <AlertCircle size={15} />}
          {ownershipCount === failed.length
            ? 'Farklı kart sahibi nedeniyle engellendi'
            : 'Aktarılamayan dosyalar'}
        </span>
        <div className="flex items-center gap-1.5">
          {ownershipCount > 0 && ownershipCount < failed.length && (
            <Badge tone="negative">{count(ownershipCount)} farklı kişi</Badge>
          )}
          <Badge tone="negative">{count(failed.length)} dosya</Badge>
        </div>
      </div>

      <ul className="max-h-[42vh] space-y-2 overflow-y-auto pr-0.5">
        {visible.map((outcome, index) => {
          const meta = errorMeta(outcome.errorCode, outcome.error)
          const file = fileForName(outcome.fileName)
          const report = outcome.diagnosticReport
          const deleteStatus = report ? reportState[report.reportId] : undefined
          return (
            <li
              key={`${outcome.fileName}-${index}`}
              className="rounded-[var(--radius)] border border-negative/20 bg-raised px-3.5 py-3"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold',
                        meta.isOwnership
                          ? 'bg-negative/15 text-negative'
                          : 'bg-sunken text-muted border border-line',
                      )}
                    >
                      {meta.isOwnership ? <ShieldBan size={11} /> : <AlertCircle size={11} />}
                      {meta.label}
                    </span>
                    {outcome.cardholderName && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-negative/25 bg-negative-soft/60 px-2 py-0.5 text-[11px] font-medium text-negative">
                        {outcome.cardholderName}
                      </span>
                    )}
                    {file && formatBytes(file.size) && (
                      <span className="text-[11px] text-faint">{formatBytes(file.size)}</span>
                    )}
                  </div>
                  <p
                    className="mt-1.5 truncate text-label font-semibold text-ink"
                    title={outcome.fileName}
                  >
                    {outcome.fileName}
                  </p>
                  <p className="mt-1 text-label leading-relaxed text-muted">{outcome.error}</p>
                  {report && authUser?.uid && !authUser.isAnonymous && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Cloud size={12} className="shrink-0 text-faint" aria-hidden="true" />
                        {deleteStatus === 'deleted'
                          ? 'Korumalı alandaki kayıt silindi.'
                          : deleteStatus === 'error'
                            ? 'Kayıt silinemedi, tekrar dene.'
                            : 'Biçim desteği için korumalı alana kaydedildi (30 günde otomatik silinir).'}
                      </span>
                      {deleteStatus !== 'deleted' && (
                        <button
                          type="button"
                          disabled={deleteStatus === 'deleting'}
                          onClick={() => { void handleDeleteReport(report) }}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-negative transition hover:bg-negative-soft disabled:opacity-50"
                        >
                          <Trash2 size={11} aria-hidden="true" />
                          {deleteStatus === 'deleting' ? 'Siliniyor…' : 'Sil'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <PreviewButton
                  file={file}
                  compact
                  onPreview={(f) => onPreview(f, `${meta.label}${outcome.cardholderName ? ` · ${outcome.cardholderName}` : ''}`)}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {failed.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-[var(--radius)] border border-negative/20 bg-raised text-label font-medium text-ink transition hover:bg-hover"
        >
          {expanded ? 'Daha az göster' : `Tüm ${count(failed.length)} dosyayı göster`}
          <ChevronDown
            size={15}
            className={clsx('transition-transform duration-150', expanded && 'rotate-180')}
          />
        </button>
      )}
    </section>
  )
}

function usePicker(
  onFinished?: OnFinished,
  initialCardId?: string,
  initialFiles: File[] = [],
  autoStart = false,
  repairStatementId?: string,
) {
  const cardId = initialCardId ?? ''
  const { run, progress } = useImport()
  const [queue, setQueue] = useState<File[]>(initialFiles)
  const [sessionFiles, setSessionFiles] = useState<File[]>(initialFiles)
  const [rejected, setRejected] = useState(false)
  const autoStarted = useRef(false)
  const [reviewItems, setReviewItems] = useState<readonly ImportOutcome[] | null>(null)
  const pendingReview = useRef<((approved: boolean) => void) | null>(null)

  const requestReview = useCallback(
    (items: readonly ImportOutcome[]) =>
      new Promise<boolean>((resolve) => {
        pendingReview.current = resolve
        setReviewItems(items)
      }),
    [],
  )

  const finishReview = (approved: boolean) => {
    pendingReview.current?.(approved)
    pendingReview.current = null
    setReviewItems(null)
  }

  useEffect(() => () => { pendingReview.current?.(false) }, [])

  const onDrop = useCallback((accepted: File[], rejections: unknown[]) => {
    setRejected(rejections.length > 0)
    setQueue((prev) => [...prev, ...accepted])
  }, [])

  const dropzone = useDropzone({
    onDrop,
    accept: repairStatementId ? { 'application/pdf': ['.pdf'] } : ACCEPT,
    multiple: true,
    disabled: progress.running,
    noClick: true,
    noKeyboard: true,
  })

  const start = useCallback(async () => {
    if (progress.running) return
    const batch = [...queue]
    setSessionFiles(batch)
    const outcomes = await run(
      batch,
      cardId || undefined,
      false,
      repairStatementId,
      requestReview,
    )
    if (outcomes) {
      setQueue([])
      onFinished?.(outcomes, cardId, batch)
    }
  }, [run, queue, cardId, onFinished, progress.running, repairStatementId, requestReview])

  useEffect(() => {
    if (!autoStart || autoStarted.current || !queue.length) return
    const timer = window.setTimeout(() => {
      autoStarted.current = true
      void start()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [autoStart, queue.length, start])

  return { dropzone, queue, setQueue, sessionFiles, rejected, progress, start, reviewItems, finishReview }
}

function Picker({
  onFinished,
  primaryLabel,
  initialCardId,
  initialFiles,
  autoStart,
  repairStatementId,
  onPreviewFile,
}: {
  onFinished?: OnFinished
  primaryLabel: string
  initialCardId?: string
  initialFiles?: File[]
  autoStart?: boolean
  repairStatementId?: string
  onPreviewFile: (file: File, subtitle?: string) => void
}) {
  const { state } = useStore()
  const {
    dropzone,
    queue,
    setQueue,
    sessionFiles,
    rejected,
    progress,
    start,
    reviewItems,
    finishReview,
  } = usePicker(onFinished, initialCardId, initialFiles, autoStart, repairStatementId)
  const { getRootProps, getInputProps, isDragActive } = dropzone
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const [typedNames, setTypedNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (reviewItems) {
      setTypedNames({})
      reviewHeading.current?.focus()
    }
  }, [reviewItems])

  const fileForName = useCallback(
    (name: string) =>
      sessionFiles.find((f) => f.name === name) ?? queue.find((f) => f.name === name),
    [sessionFiles, queue],
  )

  if (reviewItems) {
    const readyItems = reviewItems.filter((item) => item.ok && item.statement)
    const dupItems = reviewItems.filter((item) => item.ok && item.alreadyImported)
    const blockedItems = reviewItems.filter((item) => !item.ok)
    const savedCardIds = new Set((state.profile.cards ?? []).map((card) => card.id))

    const requiredNames = Array.from(
      new Map(
        readyItems
          .flatMap((item) => item.warnings ?? [])
          .filter((w) => w.requiresExplicitConfirm && w.expectedConfirmName)
          .map((w) => [
            fold(w.expectedConfirmName!).replace(/\s+/g, ' ').trim(),
            w.expectedConfirmName!,
          ]),
      ).values(),
    )
    const allConfirmed = requiredNames.every((name) =>
      matchesTypedCardholderName(typedNames[name] ?? '', name),
    )

    return (
      <section aria-labelledby="import-review-heading" className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="import-review-heading"
              ref={reviewHeading}
              tabIndex={-1}
              className="text-title font-semibold text-ink focus:outline-none"
            >
              Kaydetmeden önce kontrol et
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="positive">{count(readyItems.length)} hazır</Badge>
              {requiredNames.length > 0 && (
                <Badge tone="negative">Onay gerekli</Badge>
              )}
              {dupItems.length > 0 && <Badge tone="neutral">{count(dupItems.length)} mevcut</Badge>}
              {blockedItems.length > 0 && <Badge tone="negative">{count(blockedItems.length)} aktarılamadı</Badge>}
            </div>
          </div>
          <p className="text-label leading-relaxed text-muted">
            Banka, kart ve dönem bilgileri otomatik eşleştirildi. İstersen her PDF’i kaydetmeden önce önizleyebilirsin.
          </p>
          {repairStatementId && (
            <p className="text-label text-muted">
              Onayladığında bu ekstrenin işlem listesi PDF’deki doğrulanmış işlemlerle güncellenir.
            </p>
          )}
        </div>

        <ul className="max-h-[42vh] space-y-2.5 overflow-y-auto pr-0.5">
          {readyItems.map((item, index) => {
            const { fileName, statement, reportedCardLast4, cardholderName, warnings } = item
            if (!statement) return null
            const file = fileForName(fileName)
            const isSavedCard = Boolean(statement.cardId && savedCardIds.has(statement.cardId))
            const hasOwnershipWarning = Boolean(warnings?.some((w) => w.requiresExplicitConfirm))
            return (
              <li
                key={`${fileName}-${index}`}
                className={clsx(
                  'space-y-2.5 rounded-[var(--radius-lg)] border p-3.5',
                  hasOwnershipWarning
                    ? 'border-negative/35 bg-negative-soft/25'
                    : 'border-line bg-sunken',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <BankLogoBadge
                        bank={statement.bank}
                        accountLabel={statement.accountLabel}
                      />
                      {reportedCardLast4 && (
                        <span className="num rounded-md border border-line bg-raised px-1.5 py-0.5 text-[11px] font-medium text-muted">
                          •••• {reportedCardLast4}
                        </span>
                      )}
                      {cardholderName && (
                        <Badge tone={hasOwnershipWarning ? 'negative' : 'positive'}>
                          {hasOwnershipWarning ? <ShieldAlert size={12} /> : <UserCheck size={12} />} {cardholderName}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 truncate text-label font-medium text-ink" title={fileName}>
                      {fileName}
                    </p>
                  </div>
                  {statement.summary?.totalDebt != null && (
                    <div className="shrink-0 text-right">
                      <span className="block text-[11px] text-faint">Dönem borcu</span>
                      <strong className="num text-body font-semibold text-ink">
                        {money2(statement.summary.totalDebt)}
                      </strong>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-label text-muted">
                    <ReconciliationBadge reconciliation={statement.reconciliation} />
                    <span>{count(statement.transactionCount)} işlem</span>
                    {statement.periodEnd && <span>· {fullDayLabel(statement.periodEnd)}</span>}
                    <span className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">
                      <CreditCardIcon size={11} />
                      {isSavedCard ? 'Kayıtlı kart' : 'Yeni kart'}
                    </span>
                  </div>
                  <PreviewButton
                    file={file}
                    compact
                    onPreview={(f) =>
                      onPreviewFile(
                        f,
                        `${statement.accountLabel ?? statement.bank}${statement.periodEnd ? ` · ${fullDayLabel(statement.periodEnd)}` : ''}`,
                      )
                    }
                  />
                </div>

                {warnings && warnings.length > 0 && (
                  <div className="space-y-1.5">
                    {warnings.map((w) => (
                      <div
                        key={w.code}
                        role="alert"
                        className={clsx(
                          'flex items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-label text-ink',
                          w.requiresExplicitConfirm
                            ? 'border-negative/35 bg-negative-soft/50'
                            : 'border-warning/35 bg-warning-soft/50',
                        )}
                      >
                        {w.requiresExplicitConfirm ? (
                          <ShieldAlert size={15} className="mt-0.5 shrink-0 text-negative" />
                        ) : (
                          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
                        )}
                        <div className="min-w-0">
                          <strong className="block font-semibold text-ink">{w.title}</strong>
                          <p className="mt-0.5 leading-relaxed text-muted">{w.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}

          {dupItems.map((item, index) => {
            const file = fileForName(item.fileName)
            return (
              <li
                key={`dup-${item.fileName}-${index}`}
                className="flex items-center justify-between gap-2.5 rounded-[var(--radius)] border border-line bg-raised px-3.5 py-2.5 text-label"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink" title={item.fileName}>
                    {item.fileName}
                  </p>
                  <p className="mt-0.5 text-faint">
                    {item.existingMatchLabel
                      ? `${item.existingMatchLabel} ile aynı dosya (atlandı).`
                      : 'Daha önce eklenmiş (atlandı).'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PreviewButton file={file} compact onPreview={(f) => onPreviewFile(f, 'Zaten yüklü')} />
                  <Badge tone="neutral">Mevcut</Badge>
                </div>
              </li>
            )
          })}
        </ul>

        {requiredNames.length > 0 && (
          <section
            aria-label="Farklı kart sahibi onayı"
            className="space-y-3 rounded-[var(--radius-lg)] border border-negative/40 bg-negative-soft/45 p-4"
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert size={18} className="mt-0.5 shrink-0 text-negative" />
              <div className="min-w-0">
                <h3 className="text-body font-semibold text-ink">
                  Başkası adına kayıtlı ekstre yüklemek üzeresiniz
                </h3>
                <p className="mt-0.5 text-label leading-relaxed text-muted">
                  Başkasına ait ekstre eklemek harcama ve analizlerinizi karıştırabilir. Buna rağmen yüklemek istiyorsanız aşağıdaki kart sahibi {requiredNames.length > 1 ? 'adlarını' : 'adını'} aynen yazın.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {requiredNames.map((expectedName, idx) => {
                const currentValue = typedNames[expectedName] ?? ''
                const matched = matchesTypedCardholderName(currentValue, expectedName)
                const inputId = `confirm-holder-${idx}`
                return (
                  <div key={expectedName} className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor={inputId} className="text-label text-muted">
                        Onay için yazın:{' '}
                        <strong className="select-all font-semibold text-ink">{expectedName}</strong>
                      </label>
                      {matched && (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-positive">
                          <CheckCircle2 size={13} /> Ad doğrulandı
                        </span>
                      )}
                    </div>
                    <TextInput
                      id={inputId}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={expectedName}
                      value={currentValue}
                      aria-invalid={currentValue.trim().length > 0 && !matched}
                      onChange={(e) =>
                        setTypedNames((prev) => ({ ...prev, [expectedName]: e.target.value }))
                      }
                    />
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {blockedItems.length > 0 && (
          <FailedOutcomesPanel
            failed={blockedItems}
            fileForName={fileForName}
            onPreview={onPreviewFile}
          />
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" className="flex-1" onClick={() => finishReview(false)}>
            Dosyalara dön
          </Button>
          <Button
            type="button"
            variant="primary"
            className="flex-1"
            disabled={!allConfirmed}
            onClick={() => allConfirmed && finishReview(true)}
          >
            {repairStatementId
              ? 'Onayla ve güncelle'
              : requiredNames.length > 0
                ? 'Yine de yükle ve kaydet'
                : `${count(readyItems.length)} ekstreyi kaydet`}
          </Button>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <div {...getRootProps({ className: 'import-dropzone', 'data-dragging': isDragActive || undefined })}>
        <input {...getInputProps({ 'aria-label': 'Ekstre dosyası' })} />
        {progress.running ? (
          <div className="import-progress" role="status">
            <strong>{progress.fileName}</strong>
            <span>{progress.message}</span>
            <Skeleton className="mx-auto mt-2 h-2 w-48 rounded-full" />
            {progress.total > 1 && (
              <span>
                Dosya {progress.done + 1} / {progress.total}
              </span>
            )}
          </div>
        ) : (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
              <Upload size={20} />
            </span>
            <Button type="button" variant="primary" onClick={dropzone.open}>
              Dosya seç
            </Button>
            <p className="text-label text-muted">
              {isDragActive
                ? 'Ekstreni şimdi bırak'
                : repairStatementId
                  ? 'Bankanın özgün PDF ekstresini seç'
                  : 'PDF, TXT veya CSV sürükleyip bırak · Banka ve çoklu kartlar otomatik tanınır'}
            </p>
          </>
        )}
      </div>

      {!repairStatementId && !progress.running && queue.length === 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {SUPPORTED_BANKS.map((bank) => (
            <span
              key={bank}
              className="rounded-full border border-line bg-sunken px-2.5 py-1 text-[11px] font-medium text-muted"
            >
              {bank}
            </span>
          ))}
        </div>
      )}

      {rejected && (
        <p className="flex items-center gap-2 text-label font-medium text-negative">
          <AlertCircle size={16} className="shrink-0" />
          {repairStatementId
            ? 'Bu adımda yalnızca PDF seçebilirsin.'
            : 'Yalnızca PDF, TXT ve CSV okunabilir.'}
        </p>
      )}

      {queue.length > 0 && !progress.running && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-label font-medium text-muted">
              Seçilen dosyalar ({count(queue.length)})
            </span>
            {queue.length > 1 && (
              <button
                type="button"
                onClick={() => setQueue([])}
                className="text-label font-medium text-faint transition hover:text-negative"
              >
                Tümünü temizle
              </button>
            )}
          </div>

          <div className="max-h-[38vh] space-y-2 overflow-y-auto pr-0.5">
            {queue.map((file, index) => {
              const pdf = isPdfFile(file)
              return (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-2.5 rounded-[var(--radius)] border border-line bg-sunken px-3.5 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={clsx(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold uppercase',
                        pdf
                          ? 'border-accent-border bg-accent-soft text-accent-text'
                          : 'border-line bg-raised text-muted',
                      )}
                    >
                      {pdf ? 'PDF' : <FileText size={14} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-ink" title={file.name}>
                        {file.name}
                      </span>
                      {formatBytes(file.size) && (
                        <span className="block text-[11px] text-faint">{formatBytes(file.size)}</span>
                      )}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PreviewButton
                      file={file}
                      compact
                      onPreview={(f) => onPreviewFile(f, formatBytes(f.size) || undefined)}
                    />
                    <button
                      type="button"
                      aria-label={`${file.name} dosyasını kaldır`}
                      onClick={() => setQueue((prev) => prev.filter((_, i) => i !== index))}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint transition hover:bg-hover hover:text-ink"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <Button variant="primary" className="w-full" onClick={start}>
            {primaryLabel}
          </Button>
        </div>
      )}

      <p className="flex items-center justify-center gap-2 text-center text-label text-faint">
        <Lock size={12} className="shrink-0" />
        Başarılı ekstreler cihazda işlenir; okunamayan ekstreler biçim desteği için hesabına özel korumalı alanda saklanabilir (Ayarlar’dan kapatılabilir).
      </p>
    </div>
  )
}

export function FirstRun() {
  const [failedImports, setFailedImports] = useState<ImportOutcome[]>([])
  const [lastFiles, setLastFiles] = useState<readonly File[]>([])
  const [previewTarget, setPreviewTarget] = useState<{ file: File; subtitle?: string } | null>(null)
  const { openArchive, openAccount } = useSheets()
  const { cloudAvailable, authUser, authReady } = useStore()

  const fileForName = useCallback(
    (name: string) => lastFiles.find((f) => f.name === name),
    [lastFiles],
  )

  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-6">
      <div>
        <h1 className="text-display font-bold tracking-tight text-ink">Başlayalım</h1>
        <p className="mt-2 text-body leading-relaxed text-muted">
          Bankandan indirdiğin ekstre dosyasını bırak. Birkaç saniyede kategorilenir, analiz hazır olur.
        </p>
      </div>

      <Picker
        primaryLabel="Dosyaları incele"
        onPreviewFile={(file, subtitle) => setPreviewTarget({ file, subtitle })}
        onFinished={(outcomes, _cardId, files) => {
          setLastFiles(files)
          setFailedImports(outcomes.filter((outcome) => !outcome.ok))
        }}
      />

      {failedImports.length > 0 && (
        <FailedOutcomesPanel
          failed={failedImports}
          fileForName={fileForName}
          onPreview={(file, subtitle) => setPreviewTarget({ file, subtitle })}
        />
      )}

      <div className="rounded-[var(--radius)] border border-line bg-sunken px-4 py-3.5">
        <p className="text-label font-semibold text-ink">Tanıdığı ekstreler</p>
        <p className="mt-1 text-label leading-relaxed text-muted">
          Akbank Axess · Garanti BBVA Bonus · İş Bankası Maximum · QNB · Dünya Katılım Paraf · Halkbank Paraf · genel
          CSV. Bankanın internet şubesinden &quot;ekstre indir&quot; dediğinde gelen PDF doğrudan çalışır.
        </p>
      </div>

      <div className="flex flex-col items-start gap-1">
        {cloudAvailable && authReady && !authUser && (
          <button
            type="button"
            onClick={openAccount}
            className="min-h-[44px] text-left text-body font-medium text-accent-text underline-offset-4 hover:underline"
          >
            Başka bir cihazda hesabın var mı? Giriş yap
          </button>
        )}
        <button
          type="button"
          onClick={openArchive}
          className="min-h-[44px] text-left text-body font-medium text-accent-text underline-offset-4 hover:underline"
        >
          Daha önce aldığın bir yedek var mı? Geri yükle
        </button>
      </div>

      <PdfPreviewModal
        file={previewTarget?.file ?? null}
        subtitle={previewTarget?.subtitle}
        onClose={() => setPreviewTarget(null)}
      />
    </div>
  )
}

export function ImportSheet({
  open,
  onClose,
  initialCardId,
  sharedFiles,
  repairStatementId,
}: {
  open: boolean
  onClose: () => void
  initialCardId?: string
  sharedFiles?: File[]
  repairStatementId?: string
}) {
  const { state } = useStore()
  const { openStatement } = useSheets()
  const [result, setResult] = useState<ImportOutcome[] | null>(null)
  const [resultFiles, setResultFiles] = useState<readonly File[]>([])
  const [previewTarget, setPreviewTarget] = useState<{ file: File; subtitle?: string } | null>(null)
  const [dismissedOffers, setDismissedOffers] = useState<string[]>([])
  const [offeredStatements, setOfferedStatements] = useState<NonNullable<ImportOutcome['statement']>[]>([])
  const [reviewShared, setReviewShared] = useState(false)
  const [lastCardId, setLastCardId] = useState<string>()
  const [showAllDuplicates, setShowAllDuplicates] = useState(false)
  const resultHeading = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!open) {
      setResult(null)
      setResultFiles([])
      setPreviewTarget(null)
      setDismissedOffers([])
      setOfferedStatements([])
      setReviewShared(false)
      setLastCardId(undefined)
      setShowAllDuplicates(false)
    }
  }, [open])

  useEffect(() => {
    if (open && result) resultHeading.current?.focus({ preventScroll: true })
  }, [open, result])

  const fileForName = useCallback(
    (name: string) => resultFiles.find((f) => f.name === name),
    [resultFiles],
  )

  const added = result?.reduce((sum, o) => sum + o.added, 0) ?? 0
  const refreshed = result?.some((outcome) => Boolean(outcome.removed)) ?? false
  const failed = result?.filter((o) => !o.ok) ?? []
  const alreadyImportedOutcomes = result?.filter((o) => o.ok && o.alreadyImported) ?? []
  const newOutcomes = result?.filter((o) => o.ok && !o.alreadyImported) ?? []
  const hasEmptyStatement =
    result?.some((outcome) => outcome.ok && outcome.statement?.transactionCount === 0) ?? false
  const imported =
    result?.flatMap((outcome) =>
      outcome.ok && outcome.statement
        ? [state.statements.find((statement) => statement.id === outcome.statement!.id) ?? outcome.statement]
        : [],
    ) ?? []

  const offers = [
    ...new Map(
      offeredStatements
        .filter((statement) => !dismissedOffers.includes(statement.id))
        .map((statement) => [
          statement.cardId ?? legacyCardKey(statement.bank, statement.accountLabel ?? statement.bank),
          statement,
        ]),
    ).values(),
  ]

  const finished: OnFinished = (outcomes, cardId, files) => {
    setLastCardId(cardId)
    setResultFiles(files)
    setResult(outcomes)
    const savedIds = (state.profile.cards ?? []).map((card) => card.id)
    setOfferedStatements(
      outcomes.flatMap((outcome) =>
        outcome.ok &&
        outcome.statement &&
        importedCardDraft(outcome.statement, state.profile.archivedCards ?? [], savedIds)
          ? [outcome.statement]
          : [],
      ),
    )
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={sharedFiles ? 'Mizan’a gönderilen ekstre' : 'Ekstre yükle'}
        variant="sheet"
      >
        {result ? (
          <div className="space-y-4">
            {/* ── Status Hero Card ────────────────────────────────────────────── */}
            {(() => {
              const allFailed = failed.length === result.length
              const allOwnershipBlocked =
                allFailed && failed.every((o) => errorMeta(o.errorCode, o.error).isOwnership)
              const allAlready =
                alreadyImportedOutcomes.length === result.length && failed.length === 0
              const hasPartialError = failed.length > 0 && !allFailed
              const tone = allFailed
                ? 'negative'
                : hasPartialError
                  ? 'warning'
                  : added > 0 || refreshed || hasEmptyStatement
                    ? 'positive'
                    : 'neutral'

              const title = allOwnershipBlocked
                ? 'Başka bir kişiye ait ekstre engellendi'
                : allFailed
                  ? 'Dosyalar aktarılamadı'
                  : refreshed
                    ? 'Ekstre güncellendi'
                    : added > 0
                      ? `${count(added)} yeni işlem aktarıldı`
                      : hasEmptyStatement
                        ? 'Harcamasız ekstre kaydedildi'
                        : allAlready
                          ? 'Tüm dosyalar zaten güncel'
                          : 'Yeni işlem bulunamadı'

              const subtitle = allOwnershipBlocked
                ? 'Mizan yalnızca senin adına kayıtlı ekstreleri kabul eder.'
                : allFailed
                  ? 'Aşağıdaki dosyalardaki nedenleri inceleyip PDF önizleme ile kontrol edebilirsin.'
                  : allAlready
                    ? `${count(alreadyImportedOutcomes.length)} dosya daha önce Mizan’a eklenmiş; mükerrer kayıt oluşturulmadı.`
                    : hasEmptyStatement
                      ? 'Bu dönemde harcama yok. Ekstrenin kesim tarihi kayıtlara eklendi.'
                      : `${count(result.length)} dosya işlendi${alreadyImportedOutcomes.length > 0 ? ` · ${count(alreadyImportedOutcomes.length)} zaten yüklüydü` : ''}${failed.length > 0 ? ` · ${count(failed.length)} aktarılamadı` : ''}.`

              return (
                <div
                  className={clsx(
                    'space-y-3.5 rounded-[var(--radius-lg)] border p-4',
                    tone === 'positive' && 'border-accent-border bg-accent-soft/60',
                    tone === 'warning' && 'border-warning/30 bg-warning-soft/50',
                    tone === 'negative' && 'border-negative/30 bg-negative-soft/60',
                    tone === 'neutral' && 'border-line bg-sunken',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={clsx(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                        tone === 'positive' && 'border-accent-border bg-accent/15 text-accent-text',
                        tone === 'warning' && 'border-warning/30 bg-warning-soft text-warning',
                        tone === 'negative' && 'border-negative/30 bg-negative-soft text-negative',
                        tone === 'neutral' && 'border-line bg-raised text-accent-text',
                      )}
                    >
                      {allOwnershipBlocked ? (
                        <ShieldBan size={20} />
                      ) : tone === 'positive' ? (
                        <CheckCircle2 size={20} />
                      ) : tone === 'warning' ? (
                        <AlertTriangle size={20} />
                      ) : tone === 'negative' ? (
                        <XCircle size={20} />
                      ) : (
                        <CheckCheck size={20} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        ref={resultHeading}
                        tabIndex={-1}
                        className="text-title font-semibold text-ink focus:outline-none"
                      >
                        {title}
                      </p>
                      <p className="mt-0.5 text-label leading-relaxed text-muted">{subtitle}</p>
                    </div>
                  </div>

                  {/* 3-Column Compact Summary Strip */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="min-w-0 rounded-[var(--radius)] border border-line bg-raised px-2.5 py-2 sm:px-3">
                      <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-faint">
                        Yeni İşlem
                      </span>
                      <strong
                        className={clsx(
                          'num mt-0.5 block text-body font-semibold',
                          added > 0 ? 'text-positive' : 'text-ink',
                        )}
                      >
                        {count(added)}
                      </strong>
                    </div>
                    <div className="min-w-0 rounded-[var(--radius)] border border-line bg-raised px-2.5 py-2 sm:px-3">
                      <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-faint">
                        Zaten Yüklü
                      </span>
                      <strong className="num mt-0.5 block text-body font-semibold text-ink">
                        {count(alreadyImportedOutcomes.length)}
                      </strong>
                    </div>
                    <div className="min-w-0 rounded-[var(--radius)] border border-line bg-raised px-2.5 py-2 sm:px-3">
                      <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-faint">
                        Aktarılamayan
                      </span>
                      <strong
                        className={clsx(
                          'num mt-0.5 block text-body font-semibold',
                          failed.length > 0 ? 'text-negative' : 'text-muted',
                        )}
                      >
                        {count(failed.length)}
                      </strong>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* ── Newly Imported / Updated Statement Cards ────────────────────── */}
            {newOutcomes.length > 0 && (
              <ul className="space-y-2.5">
                {newOutcomes.map((outcome, index) => {
                  const file = fileForName(outcome.fileName)
                  return (
                    <li
                      key={index}
                      className="space-y-2.5 rounded-[var(--radius-lg)] border border-line bg-sunken p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {outcome.statement && (
                            <div className="mb-1.5 flex flex-wrap items-center gap-2">
                              <BankLogoBadge
                                bank={outcome.statement.bank}
                                accountLabel={outcome.statement.accountLabel}
                              />
                              {outcome.cardholderName && (
                                <Badge tone="positive">
                                  <UserCheck size={11} /> {outcome.cardholderName}
                                </Badge>
                              )}
                            </div>
                          )}
                          <p className="break-words text-body font-medium text-ink">
                            {outcome.statement?.label ?? outcome.fileName}
                          </p>
                          <p className="mt-0.5 text-label text-muted">
                            {count(outcome.added)} yeni işlem
                            {outcome.duplicates > 0 && ` · ${count(outcome.duplicates)} zaten vardı`}
                            {outcome.removed ? ` · ${count(outcome.removed)} eski kayıt güncellendi` : null}
                          </p>
                        </div>
                        {outcome.statement?.summary?.totalDebt != null && (
                          <div className="shrink-0 text-right">
                            <span className="block text-[11px] text-faint">Dönem borcu</span>
                            <strong className="num text-body font-semibold text-ink">
                              {money2(outcome.statement.summary.totalDebt)}
                            </strong>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                        <ReconciliationBadge reconciliation={outcome.statement?.reconciliation} />
                        <div className="flex items-center gap-2">
                          <PreviewButton
                            file={file}
                            compact
                            onPreview={(f) => setPreviewTarget({ file: f, subtitle: outcome.statement?.label })}
                          />
                          {outcome.statement && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                onClose()
                                openStatement(outcome.statement!.id)
                              }}
                            >
                              Ekstreyi aç <ArrowRight size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* ── Already Imported Files ──────────────────────────────────────── */}
            {alreadyImportedOutcomes.length > 0 && (
              <section className="space-y-2 rounded-[var(--radius-lg)] border border-line bg-sunken p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className="flex items-center gap-2 text-label font-medium text-ink">
                    <FileCheck2 size={15} className="text-accent-text" />
                    Daha önce eklenen dosyalar
                  </span>
                  <Badge tone="neutral">{count(alreadyImportedOutcomes.length)} dosya</Badge>
                </div>
                <ul className="divide-y divide-line rounded-[var(--radius)] border border-line bg-raised">
                  {(showAllDuplicates
                    ? alreadyImportedOutcomes
                    : alreadyImportedOutcomes.slice(0, 4)
                  ).map((outcome, index) => {
                    const file = fileForName(outcome.fileName)
                    return (
                      <li
                        key={`${outcome.fileName}-${index}`}
                        className="flex items-center justify-between gap-2.5 px-3 py-2.5 text-label"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText size={14} className="shrink-0 text-faint" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink" title={outcome.fileName}>
                              {outcome.fileName}
                            </span>
                            {outcome.existingMatchLabel && (
                              <span className="block truncate text-[11px] text-faint">
                                Eşleşen kayıt: {outcome.existingMatchLabel}
                              </span>
                            )}
                          </span>
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <PreviewButton
                            file={file}
                            compact
                            onPreview={(f) => setPreviewTarget({ file: f, subtitle: outcome.existingMatchLabel })}
                          />
                          <span className="rounded-md border border-line bg-sunken px-2 py-0.5 text-[11px] font-medium text-muted">
                            Zaten mevcut
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {alreadyImportedOutcomes.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setShowAllDuplicates((v) => !v)}
                    className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[var(--radius)] text-label font-medium text-accent-text hover:bg-hover"
                  >
                    {showAllDuplicates
                      ? 'Daha az göster'
                      : `Tüm ${count(alreadyImportedOutcomes.length)} dosyayı göster`}
                    <ChevronDown
                      size={15}
                      className={clsx('transition-transform duration-150', showAllDuplicates && 'rotate-180')}
                    />
                  </button>
                )}
              </section>
            )}

            {/* ── Failed / Blocked Files (Categorised Cards + PDF Preview) ────── */}
            <FailedOutcomesPanel
              failed={failed}
              fileForName={fileForName}
              onPreview={(file, subtitle) => setPreviewTarget({ file, subtitle })}
            />

            {offers.map((statement) => (
              <SaveImportedCardOffer
                key={statement.id}
                statement={statement}
                relatedStatements={imported.filter((item) =>
                  statement.cardId
                    ? item.cardId === statement.cardId
                    : !item.cardId &&
                      legacyCardKey(item.bank, item.accountLabel ?? item.bank) ===
                        legacyCardKey(statement.bank, statement.accountLabel ?? statement.bank),
                )}
                onFinished={() =>
                  setDismissedOffers((previous) => [
                    ...previous,
                    ...imported
                      .filter((item) =>
                        statement.cardId ? item.cardId === statement.cardId : item.id === statement.id,
                      )
                      .map((item) => item.id),
                  ])
                }
              />
            ))}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                className="flex-1"
                onClick={() => {
                  setReviewShared(true)
                  setResult(null)
                }}
              >
                <Upload size={15} /> Başka dosya yükle
              </Button>
              <Button variant="primary" className="flex-1" onClick={onClose}>
                Bitti
              </Button>
            </div>
          </div>
        ) : (
          <Picker
            primaryLabel="Dosyaları incele"
            onFinished={finished}
            onPreviewFile={(file, subtitle) => setPreviewTarget({ file, subtitle })}
            initialCardId={lastCardId ?? initialCardId}
            initialFiles={sharedFiles}
            autoStart={Boolean(sharedFiles?.length) && !reviewShared}
            repairStatementId={repairStatementId}
          />
        )}
      </Modal>

      <PdfPreviewModal
        file={previewTarget?.file ?? null}
        subtitle={previewTarget?.subtitle}
        onClose={() => setPreviewTarget(null)}
      />
    </>
  )
}
