import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { AlertCircle, ArrowRight, FileText, Lock, Upload, X } from 'lucide-react'
import { Button } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { ReconciliationBadge } from '../ui/statements'
import { useSheets } from './sheets'
import { useStore } from '../store/AppStore'
import { useImport } from '../hooks/useImport'
import { fullDayLabel } from '../core/date'
import { count, money2 } from '../core/money'
import type { ImportOutcome } from '../domain/types'
import { cardDisplayName } from '../domain/cards'
import { importCardChoices, importedCardDraft, legacyCardKey } from '../domain/cardLifecycle'
import { SaveImportedCardOffer } from './SaveImportedCardOffer'
import '../styles/cards.css'

/**
 * The picker serves local selection, a card-specific retry and native PDF sharing.
 */

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
}
const NEW_CARD = '__new__'

type OnFinished = (outcomes: ImportOutcome[], cardId: string) => void

function usePicker(onFinished?: OnFinished, initialCardId?: string, initialFiles: File[] = [], autoStart = false, repairStatementId?: string) {
  const { state } = useStore()
  const choices = importCardChoices(state.profile.cards ?? [], state.statements)
  const [cardId, setCardId] = useState(() => {
    if (initialCardId === NEW_CARD || initialCardId === '') return initialCardId
    if (initialCardId && choices.some(choice => choice.card.id === initialCardId)) return initialCardId
    return choices.length === 1 ? choices[0].card.id : ''
  })
  const { run, progress } = useImport()
  const [queue, setQueue] = useState<File[]>(initialFiles)
  const [rejected, setRejected] = useState(false)
  const autoStarted = useRef(false)
  const [reviewItems, setReviewItems] = useState<readonly ImportOutcome[] | null>(null)
  const pendingReview = useRef<((approved: boolean) => void) | null>(null)
  const requestReview = useCallback((items: readonly ImportOutcome[]) => new Promise<boolean>(resolve => {
    pendingReview.current = resolve
    setReviewItems(items)
  }), [])
  const finishReview = (approved: boolean) => {
    pendingReview.current?.(approved)
    pendingReview.current = null
    setReviewItems(null)
  }
  useEffect(() => () => { pendingReview.current?.(false) }, [])

  const onDrop = useCallback((accepted: File[], rejections: unknown[]) => {
    setRejected(rejections.length > 0)
    setQueue((prev) => {
      return [...prev, ...accepted]
    })
  }, [])

  const dropzone = useDropzone({ onDrop, accept: repairStatementId ? { 'application/pdf': ['.pdf'] } : ACCEPT, multiple: true, disabled: progress.running, noClick: true, noKeyboard: true })

  const start = useCallback(async () => {
    if (progress.running) return
    const outcomes = await run(queue, cardId === NEW_CARD ? undefined : cardId || undefined, cardId === NEW_CARD, repairStatementId, requestReview)
    if (outcomes) {
      setQueue([])
      onFinished?.(outcomes, cardId)
    }
  }, [run, queue, cardId, onFinished, progress.running, repairStatementId, requestReview])
  useEffect(() => {
    if (!autoStart || autoStarted.current || !queue.length) return
    // StrictMode can mount an effect twice. Cancel its first scheduled start.
    const timer = window.setTimeout(() => { autoStarted.current = true; void start() }, 0)
    return () => window.clearTimeout(timer)
  }, [autoStart, queue.length, start])

  return { dropzone, queue, setQueue, rejected, progress, start, choices, cardId, setCardId, reviewItems, finishReview }
}

/* ── The panel itself ────────────────────────────────────────────────────── */

function Picker({
  onFinished,
  primaryLabel,
  initialCardId,
  initialFiles,
  autoStart,
  repairStatementId,
}: {
  onFinished?: OnFinished
  primaryLabel: string
  initialCardId?: string
  initialFiles?: File[]
  autoStart?: boolean
  repairStatementId?: string
}) {
  const { dropzone, queue, setQueue, rejected, progress, start, choices, cardId, setCardId, reviewItems, finishReview } = usePicker(onFinished, initialCardId, initialFiles, autoStart, repairStatementId)
  const { getRootProps, getInputProps, isDragActive } = dropzone
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (reviewItems) reviewHeading.current?.focus() }, [reviewItems])

  if (reviewItems) {
    return (
      <section aria-labelledby="import-review-heading" className="space-y-4">
        <h2 id="import-review-heading" ref={reviewHeading} tabIndex={-1} className="text-title font-semibold text-ink">Kaydetmeden önce kontrol et</h2>
        <p className="text-body text-muted">Dosyanın sana ve seçili karta ait olduğunu PDF üzerinden kontrol et. Uygulama kart sahibini doğrulayamaz.</p>
        {repairStatementId && <p className="text-body text-muted">Onayladığında bu ekstrenin işlem listesi PDF’deki doğrulanmış işlemlerle güncellenir.</p>}
        <ul className="space-y-2">
          {reviewItems.map(({ fileName, statement, error, reportedCardLast4 }, index) => (
            <li key={index} className="break-words rounded-[var(--radius)] bg-sunken px-3 py-2.5 text-body">
              <p className="font-semibold text-ink">{fileName}</p>
              {statement ? <>
                <p className="text-muted">{statement.bank} · {statement.accountLabel || 'Genel hareketler'}{statement.periodEnd && ` · ${fullDayLabel(statement.periodEnd)}`}</p>
                {reportedCardLast4 && <p className="text-muted">PDF’deki kart · •••• {reportedCardLast4}</p>}
                <p className="text-muted">{count(statement.transactionCount)} işlem{statement.summary?.totalDebt != null && ` · Dönem borcu ${money2(statement.summary.totalDebt)}`}</p>
              </> : <p className={error ? 'text-negative' : 'text-muted'}>{error ?? 'Daha önce eklenmiş.'}</p>}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => finishReview(false)}>Dosyalara dön</Button>
          <Button type="button" variant="primary" onClick={() => finishReview(true)}>{repairStatementId ? 'Onayla ve güncelle' : 'Onayla ve kaydet'}</Button>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      {choices.length > 0 && <label className="block">
        <span className="mb-2 block text-body text-muted">Bu ekstre hangi karta ait?</span>
        <select value={cardId} onChange={(event) => setCardId(event.target.value)} disabled={progress.running} className="h-11 w-full rounded-[var(--radius)] border border-line bg-raised px-3 text-body text-ink">
          <option value="">Kart seç (genel CSV için boş bırak)</option>
          {choices.map(({ card, saved, fileName }, index) => <option key={card.id} value={card.id}>{cardDisplayName(card)}{!saved && ` · Ekstre ${index + 1}: ${fileName} (kart kaydedilmedi)`}</option>)}
          <option value={NEW_CARD}>Yeni / farklı kart</option>
        </select>
        <span className="mt-1.5 block text-label text-muted">Aynı bankadaki kartlarını ayırmak için ilgili kartı seç. Farklı kartların dosyalarını ayrı aktar.</span>
      </label>}
      <div {...getRootProps({ className: 'import-dropzone', 'data-dragging': isDragActive || undefined })}>
        <input {...getInputProps({ 'aria-label': 'Ekstre dosyası' })} />
        {progress.running ? <div className="import-progress" role="status">
          <strong>{progress.fileName}</strong>
          <span>{progress.message}</span>
          {progress.total > 1 && <span>Dosya {progress.done + 1} / {progress.total}</span>}
        </div> : <>
          <Button type="button" onClick={dropzone.open}><Upload size={18} /> Dosya seç</Button>
          <p className="text-body text-muted">{isDragActive ? 'Ekstreni şimdi bırak' : repairStatementId ? 'Bankanın özgün PDF ekstresi' : 'PDF, TXT veya CSV'}</p>
        </>}
      </div>

      {/* Only shown once a file has actually been refused. Listing the
          supported banks up front asks people to check whether they are
          welcome before they have tried anything. */}
      {rejected && (
        <p className="flex items-center gap-2 text-body text-negative">
          <AlertCircle size={16} className="shrink-0" />
          {repairStatementId ? 'Bu adımda yalnızca PDF seçebilirsin.' : 'Yalnızca PDF, TXT ve CSV okunabilir.'}
        </p>
      )}

      {queue.length > 0 && !progress.running && (
        <div className="space-y-2">
          {queue.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 rounded-[var(--radius)] bg-sunken px-3 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <FileText size={16} className="shrink-0 text-faint" />
                <span className="truncate text-body text-ink">{file.name}</span>
              </span>
              <button
                type="button"
                aria-label={`${file.name} dosyasını kaldır`}
                onClick={() => setQueue((prev) => prev.filter((f) => f !== file))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-faint hover:bg-hover hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
          ))}

          <Button variant="primary" className="w-full" onClick={start}>
            {primaryLabel}
          </Button>
        </div>
      )}

      <p className="flex items-center justify-center gap-2 text-label text-faint">
        <Lock size={12} />
        Dosyalar cihazından çıkmaz.
      </p>
    </div>
  )
}

/* ── First run ───────────────────────────────────────────────────────────── */

/**
 * The empty state of an app that has a shape — the tab bar and header are
 * already there around it, so this is one screen's worth of content rather
 * than a separate pre-app.
 *
 * Still one action. The intro has just made the pitch; repeating it here would
 * be the app talking to itself instead of getting on with the job. What it
 * does add is the answer to the only question left at this point: which
 * statements does it understand, and where do I get the file.
 */
export function FirstRun() {
  const [failedImports, setFailedImports] = useState<ImportOutcome[]>([])
  const { openArchive, openAccount } = useSheets()
  const { cloudAvailable, authUser, authReady } = useStore()

  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-6">
      <div>
        <h1 className="text-display font-semibold tracking-tight text-ink">Başlayalım</h1>
        <p className="mt-2 text-body leading-relaxed text-muted">
          Bankandan indirdiğin ekstre dosyasını bırak. Birkaç saniyede kategorilenir, analiz hazır olur.
        </p>
      </div>

      <Picker primaryLabel="Dosyaları incele" onFinished={outcomes => setFailedImports(outcomes.filter(outcome => !outcome.ok))} />
      {failedImports.map(outcome => (
        <p key={outcome.fileName} role="alert" className="text-body text-negative">{outcome.fileName} · {outcome.error}</p>
      ))}

      <div className="rounded-[var(--radius)] bg-sunken px-4 py-3">
        <p className="text-label font-semibold text-muted">Tanıdığı ekstreler</p>
        <p className="mt-1 text-label leading-relaxed text-faint">
          Akbank Axess · Garanti BBVA Bonus · genel CSV. Bankanın internet şubesinden "ekstre indir"
          dediğinde gelen PDF doğrudan çalışır.
        </p>
      </div>

      {/* Two ways back to data that already exists somewhere else: a signed-in
          account (another device, an earlier install) and a backup file. */}
      <div className="flex flex-col items-start gap-1">
        {cloudAvailable && authReady && !authUser && (
          <button
            type="button"
            onClick={openAccount}
            className="min-h-[44px] text-left text-body text-accent underline-offset-4 hover:underline"
          >
            Başka bir cihazda hesabın var mı? Giriş yap
          </button>
        )}
        <button
          type="button"
          onClick={openArchive}
          className="min-h-[44px] text-left text-body text-accent underline-offset-4 hover:underline"
        >
          Daha önce aldığın bir yedek var mı? Geri yükle
        </button>
      </div>
    </div>
  )
}

/* ── Sheet ───────────────────────────────────────────────────────────────── */

export function ImportSheet({ open, onClose, initialCardId, sharedFiles, repairStatementId }: { open: boolean; onClose: () => void; initialCardId?: string; sharedFiles?: File[]; repairStatementId?: string }) {
  const { state } = useStore()
  const { openStatement } = useSheets()
  const [result, setResult] = useState<ImportOutcome[] | null>(null)
  const [dismissedOffers, setDismissedOffers] = useState<string[]>([])
  const [offeredStatements, setOfferedStatements] = useState<NonNullable<ImportOutcome['statement']>[]>([])
  const [reviewShared, setReviewShared] = useState(false)
  const [lastCardId, setLastCardId] = useState<string>()
  const resultHeading = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!open) { setResult(null); setDismissedOffers([]); setOfferedStatements([]); setReviewShared(false); setLastCardId(undefined) }
  }, [open])
  useEffect(() => { if (open && result) resultHeading.current?.focus({ preventScroll: true }) }, [open, result])

  const added = result?.reduce((sum, o) => sum + o.added, 0) ?? 0
  const refreshed = result?.some(outcome => Boolean(outcome.removed)) ?? false
  const failed = result?.filter((o) => !o.ok) ?? []
  const hasEmptyStatement = result?.some(outcome => outcome.ok && outcome.statement?.transactionCount === 0) ?? false
  const imported = result?.flatMap(outcome => outcome.ok && outcome.statement ? [state.statements.find(statement => statement.id === outcome.statement!.id) ?? outcome.statement] : []) ?? []
  const offers = [...new Map(offeredStatements.filter(statement => !dismissedOffers.includes(statement.id)).map(statement => [statement.cardId ?? legacyCardKey(statement.bank, statement.accountLabel ?? statement.bank), statement])).values()]
  const finished: OnFinished = (outcomes, cardId) => {
    setLastCardId(cardId)
    setResult(outcomes)
    const savedIds = (state.profile.cards ?? []).map(card => card.id)
    setOfferedStatements(outcomes.flatMap(outcome => outcome.ok && outcome.statement && importedCardDraft(outcome.statement, state.profile.archivedCards ?? [], savedIds) ? [outcome.statement] : []))
  }

  return (
    <Modal open={open} onClose={onClose} title={sharedFiles ? 'Mizan’a gönderilen ekstre' : 'Ekstre yükle'} variant="sheet">
      {result ? (
        <div className="space-y-5">
          <div>
            <p ref={resultHeading} tabIndex={-1} className="text-title font-semibold text-ink">
              {failed.length === result.length ? 'Dosya eklenemedi' : refreshed ? 'Ekstre güncellendi' : added > 0 ? `${count(added)} işlem eklendi` : hasEmptyStatement ? 'Harcamasız ekstre hazır' : 'Yeni işlem yok'}
            </p>
            {added === 0 && failed.length === 0 && !refreshed && (
              <p className="mt-1 text-body text-muted">{hasEmptyStatement ? 'Bu dönemde işlem yok. Ekstrenin kesim tarihi kaydedildi.' : 'Bu ekstre zaten yüklüydü.'}</p>
            )}
          </div>

          {/* The check that matters most, shown at the moment it can still be
              acted on: did the parse agree with the bank's own total? */}
          <ul className="space-y-3">
            {result
              .filter((outcome) => outcome.ok)
              .map((outcome, index) => outcome.alreadyImported ? (
                <li key={index} className="text-body text-muted">{outcome.fileName} · Bu PDF daha önce eklenmiş.</li>
              ) : (
                <li key={index} className="rounded-[var(--radius-lg)] bg-sunken p-4">
                  <p className="break-words text-body font-semibold text-ink">
                    {outcome.statement?.label ?? outcome.fileName}
                  </p>
                  <p className="mt-0.5 text-label text-faint">
                    {count(outcome.added)} yeni
                    {outcome.duplicates > 0 && ` · ${count(outcome.duplicates)} zaten vardı`}
                    {outcome.removed ? ` · ${count(outcome.removed)} eski kayıt kaldırıldı` : null}
                  </p>
                  <div className="mt-2">
                    <ReconciliationBadge reconciliation={outcome.statement?.reconciliation} />
                  </div>
                  {outcome.statement && <button type="button" className="text-button" onClick={() => {
                    onClose()
                    openStatement(outcome.statement!.id)
                  }}>Ekstreyi aç <ArrowRight size={16} /></button>}
                </li>
              ))}
          </ul>

          {failed.map((outcome) => (
            <p key={outcome.fileName} role="alert" className="text-body text-negative">
              {outcome.fileName}: {outcome.error}
            </p>
          ))}
          {failed.length > 0 && <Button className="w-full" onClick={() => { setReviewShared(true); setResult(null) }}>{sharedFiles ? 'Kartı veya dosyaları kontrol et' : 'Yeniden dosya seç'}</Button>}

          {offers.map(statement => <SaveImportedCardOffer key={statement.id} statement={statement} relatedStatements={imported.filter(item => statement.cardId ? item.cardId === statement.cardId : !item.cardId && legacyCardKey(item.bank, item.accountLabel ?? item.bank) === legacyCardKey(statement.bank, statement.accountLabel ?? statement.bank))} onFinished={() => setDismissedOffers(previous => [...previous, ...imported.filter(item => statement.cardId ? item.cardId === statement.cardId : item.id === statement.id).map(item => item.id)])} />)}

          <Button variant="primary" className="w-full" onClick={onClose}>
            Bitti
          </Button>
        </div>
      ) : (
        <Picker primaryLabel="Dosyaları incele" onFinished={finished} initialCardId={lastCardId ?? initialCardId} initialFiles={sharedFiles} autoStart={Boolean(sharedFiles?.length) && !reviewShared} repairStatementId={repairStatementId} />
      )}
    </Modal>
  )
}
