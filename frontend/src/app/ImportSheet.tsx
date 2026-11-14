import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { AlertCircle, FileText, Loader2, Lock, Upload, X } from 'lucide-react'
import { Button } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { ReconciliationBadge } from '../ui/statements'
import { useSheets } from './sheets'
import { useStore } from '../store/AppStore'
import { useImport } from '../hooks/useImport'
import { count } from '../core/money'
import type { ImportOutcome } from '../domain/types'
import { cardDisplayName } from '../domain/cards'
import { importCardChoices, importedCardDraft, legacyCardKey } from '../domain/cardLifecycle'
import { SaveImportedCardOffer } from './SaveImportedCardOffer'
import '../styles/cards.css'

/**
 * Importing a statement is an action, not a place, so it no longer has a tab.
 * The same panel serves the two moments it is needed: the very first run, where
 * it is the whole screen, and every time afterwards, where it is a sheet.
 *
 * The list of already-imported statements moved to Ayarlar → Veri. It is
 * housekeeping, and housekeeping does not belong on the path of the thing
 * someone actually came to do.
 */

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
}

function usePicker(onFinished?: (outcomes: ImportOutcome[]) => void, initialCardId?: string, initialFiles: File[] = [], autoStart = false) {
  const { state } = useStore()
  const choices = importCardChoices(state.profile.cards ?? [], state.statements)
  const [cardId, setCardId] = useState(initialCardId && choices.some(choice => choice.card.id === initialCardId) ? initialCardId : choices.length === 1 ? choices[0].card.id : '')
  const { run, progress } = useImport()
  const [queue, setQueue] = useState<File[]>(initialFiles)
  const [rejected, setRejected] = useState(false)
  const autoStarted = useRef(false)

  const onDrop = useCallback((accepted: File[], rejections: unknown[]) => {
    setRejected(rejections.length > 0)
    setQueue((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`))
      return [...prev, ...accepted.filter((f) => !seen.has(`${f.name}:${f.size}`))]
    })
  }, [])

  const dropzone = useDropzone({ onDrop, accept: ACCEPT, multiple: true, disabled: progress.running })

  const start = useCallback(async () => {
    if (progress.running) return
    const outcomes = await run(queue, cardId === '__new__' ? undefined : cardId || undefined, cardId === '__new__')
    setQueue([])
    if (outcomes) onFinished?.(outcomes)
  }, [run, queue, cardId, onFinished, progress.running])
  useEffect(() => {
    if (!autoStart || autoStarted.current || !queue.length) return
    // StrictMode can mount an effect twice. Cancel its first scheduled start.
    const timer = window.setTimeout(() => { autoStarted.current = true; void start() }, 0)
    return () => window.clearTimeout(timer)
  }, [autoStart, queue.length, start])

  return { dropzone, queue, setQueue, rejected, progress, start, choices, cardId, setCardId }
}

/* ── The panel itself ────────────────────────────────────────────────────── */

function Picker({
  onFinished,
  primaryLabel,
  initialCardId,
  initialFiles,
  autoStart,
}: {
  onFinished?: (outcomes: ImportOutcome[]) => void
  primaryLabel: string
  initialCardId?: string
  initialFiles?: File[]
  autoStart?: boolean
}) {
  const { dropzone, queue, setQueue, rejected, progress, start, choices, cardId, setCardId } = usePicker(onFinished, initialCardId, initialFiles, autoStart)
  const { getRootProps, getInputProps, isDragActive } = dropzone

  return (
    <div className="space-y-4">
      {choices.length > 0 && <label className="block">
        <span className="mb-2 block text-body text-muted">Bu ekstre hangi karta ait?</span>
        <select value={cardId} onChange={(event) => setCardId(event.target.value)} disabled={progress.running} className="h-11 w-full rounded-[var(--radius)] border border-line bg-raised px-3 text-body text-ink">
          <option value="">Kart seç (genel CSV için boş bırak)</option>
          {choices.map(({ card, saved, fileName }, index) => <option key={card.id} value={card.id}>{cardDisplayName(card)}{!saved && ` · Ekstre ${index + 1}: ${fileName} (kart kaydedilmedi)`}</option>)}
          <option value="__new__">Yeni / farklı kart</option>
        </select>
        <span className="mt-1.5 block text-label text-muted">Aynı bankadaki kartlarını ayırmak için ilgili kartı seç. Farklı kartların dosyalarını ayrı aktar.</span>
      </label>}
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-dashed px-6 py-14 text-center transition-colors duration-200 ${
          isDragActive ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-accent'
        } ${progress.running ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-muted">
          {progress.running ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
        </div>

        {progress.running ? (
          <div>
            <p className="text-title font-semibold text-ink">{progress.fileName}</p>
            <p className="mt-1 text-body text-muted">{progress.message}</p>
            <p className="mt-1 text-label text-faint">
              {progress.done + 1} / {progress.total}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-title font-semibold text-ink">
              {isDragActive ? 'Bırak' : 'Ekstreni buraya bırak'}
            </p>
            <p className="mt-1 text-body text-muted">PDF, TXT veya CSV</p>
          </div>
        )}
      </div>

      {/* Only shown once a file has actually been refused. Listing the
          supported banks up front asks people to check whether they are
          welcome before they have tried anything. */}
      {rejected && (
        <p className="flex items-center gap-2 text-body text-negative">
          <AlertCircle size={16} className="shrink-0" />
          Yalnızca PDF, TXT ve CSV okunabilir.
        </p>
      )}

      {queue.length > 0 && !progress.running && (
        <div className="space-y-2">
          {queue.map((file) => (
            <div
              key={`${file.name}:${file.size}`}
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

      <Picker primaryLabel="Analizi başlat" />

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

export function ImportSheet({ open, onClose, initialCardId, sharedFiles }: { open: boolean; onClose: () => void; initialCardId?: string; sharedFiles?: File[] }) {
  const { state } = useStore()
  const [result, setResult] = useState<ImportOutcome[] | null>(null)
  const [dismissedOffers, setDismissedOffers] = useState<string[]>([])
  const [offeredStatements, setOfferedStatements] = useState<NonNullable<ImportOutcome['statement']>[]>([])
  const [reviewShared, setReviewShared] = useState(false)

  useEffect(() => {
    if (!open) { setResult(null); setDismissedOffers([]); setOfferedStatements([]); setReviewShared(false) }
  }, [open])

  const added = result?.reduce((sum, o) => sum + o.added, 0) ?? 0
  const failed = result?.filter((o) => !o.ok) ?? []
  const hasEmptyStatement = result?.some(outcome => outcome.ok && outcome.statement?.transactionCount === 0) ?? false
  const imported = result?.flatMap(outcome => outcome.ok && outcome.statement ? [state.statements.find(statement => statement.id === outcome.statement!.id) ?? outcome.statement] : []) ?? []
  const offers = [...new Map(offeredStatements.filter(statement => !dismissedOffers.includes(statement.id)).map(statement => [statement.cardId ?? legacyCardKey(statement.bank, statement.accountLabel ?? statement.bank), statement])).values()]
  const finished = (outcomes: ImportOutcome[]) => {
    setResult(outcomes)
    const savedIds = (state.profile.cards ?? []).map(card => card.id)
    setOfferedStatements(outcomes.flatMap(outcome => outcome.ok && outcome.statement && importedCardDraft(outcome.statement, state.profile.archivedCards ?? [], savedIds) ? [outcome.statement] : []))
  }

  return (
    <Modal open={open} onClose={onClose} title={sharedFiles ? 'Mizan’a gönderilen ekstre' : 'Ekstre ekle'} description={sharedFiles ? 'PDF cihazında kontrol edilir. Desteklenen ekstreler doğrudan eklenir.' : undefined}>
      {result ? (
        <div className="space-y-5">
          <div>
            <p className="text-title font-semibold text-ink">
              {failed.length === result.length ? 'Dosya eklenemedi' : added > 0 ? `${count(added)} işlem eklendi` : hasEmptyStatement ? 'Harcamasız ekstre hazır' : 'Yeni işlem yok'}
            </p>
            {added === 0 && failed.length === 0 && (
              <p className="mt-1 text-body text-muted">{hasEmptyStatement ? 'Bu dönemde işlem yok. Ekstrenin kesim tarihi kaydedildi.' : 'Bu ekstre zaten yüklüydü.'}</p>
            )}
          </div>

          {/* The check that matters most, shown at the moment it can still be
              acted on: did the parse agree with the bank's own total? */}
          <ul className="space-y-3">
            {result
              .filter((outcome) => outcome.ok)
              .map((outcome) => (
                <li key={outcome.fileName} className="rounded-[var(--radius-lg)] bg-sunken p-4">
                  <p className="truncate text-body font-semibold text-ink">
                    {outcome.statement?.label ?? outcome.fileName}
                  </p>
                  <p className="mt-0.5 text-label text-faint">
                    {count(outcome.added)} yeni
                    {outcome.duplicates > 0 && ` · ${count(outcome.duplicates)} zaten vardı`}
                  </p>
                  <div className="mt-2">
                    <ReconciliationBadge reconciliation={outcome.statement?.reconciliation} />
                  </div>
                </li>
              ))}
          </ul>

          {failed.map((outcome) => (
            <p key={outcome.fileName} role="alert" className="text-body text-negative">
              {outcome.fileName}: {outcome.error}
            </p>
          ))}
          {sharedFiles && failed.length > 0 && <Button className="w-full" onClick={() => { setReviewShared(true); setResult(null) }}>Kartı veya dosyaları kontrol edip yeniden dene</Button>}

          {offers.map(statement => <SaveImportedCardOffer key={statement.id} statement={statement} relatedStatements={imported.filter(item => statement.cardId ? item.cardId === statement.cardId : !item.cardId && legacyCardKey(item.bank, item.accountLabel ?? item.bank) === legacyCardKey(statement.bank, statement.accountLabel ?? statement.bank))} onFinished={() => setDismissedOffers(previous => [...previous, ...imported.filter(item => statement.cardId ? item.cardId === statement.cardId : item.id === statement.id).map(item => item.id)])} />)}

          <Button variant="primary" className="w-full" onClick={onClose}>
            Bitti
          </Button>
        </div>
      ) : (
        <Picker primaryLabel="Ekle ve analiz et" onFinished={finished} initialCardId={initialCardId} initialFiles={sharedFiles} autoStart={Boolean(sharedFiles?.length) && !reviewShared} />
      )}
    </Modal>
  )
}
