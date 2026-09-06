import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  AlertCircle, CheckCircle2, FileText, Loader2, Lock, Trash2, Upload, X,
} from 'lucide-react'
import { Badge, Button, Card, Empty, Section } from '../ui/primitives'
import { ConfirmDialog } from '../ui/Modal'
import { useStore } from '../store/AppStore'
import { useImport } from '../hooks/useImport'
import { fullDayLabel } from '../core/date'
import { count } from '../core/money'

const ENGINE_LABEL: Record<string, string> = {
  text: 'Metin',
  'pdf-text': 'PDF metin katmanı',
  'pdf-ebcdic': 'PDF metin katmanı (EBCDIC çözüldü)',
  'ocr-service': 'Yerel OCR',
  'ocr-browser': 'Tarayıcı OCR',
}

export function ImportView({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useStore()
  const { run, progress } = useImport()
  const [queue, setQueue] = useState<File[]>([])
  const [rejected, setRejected] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const onDrop = useCallback((accepted: File[], rejections: unknown[]) => {
    setRejected(rejections.length ? 'Yalnızca PDF, TXT ve CSV dosyaları okunabilir.' : null)
    setQueue((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`))
      return [...prev, ...accepted.filter((f) => !seen.has(`${f.name}:${f.size}`))]
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
    },
    multiple: true,
    disabled: progress.running,
  })

  const start = async () => {
    const outcomes = await run(queue)
    setQueue([])
    if (outcomes?.some((o) => o.ok && o.added > 0)) onDone()
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Card>
        <div
          {...getRootProps()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center transition-colors ${
            isDragActive ? 'border-accent bg-accent-soft' : 'border-line-strong bg-sunken hover:border-accent'
          } ${progress.running ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-raised text-muted">
            {progress.running ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          </div>

          {progress.running ? (
            <div className="space-y-1">
              <p className="text-[13px] font-medium text-ink">{progress.fileName}</p>
              <p className="text-2xs text-muted">{progress.message}</p>
              <p className="text-2xs text-faint">
                {progress.done + 1} / {progress.total} dosya
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-[13px] font-medium text-ink">
                {isDragActive ? 'Bırakın, okumaya başlayalım' : 'Ekstrenizi buraya sürükleyin'}
              </p>
              <p className="text-2xs text-muted">PDF, TXT veya CSV · birden fazla dosya seçebilirsiniz</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            <Badge>Akbank</Badge>
            <Badge>Garanti BBVA</Badge>
            <Badge>Genel CSV</Badge>
          </div>
        </div>

        {rejected && (
          <div className="mt-3 flex items-center gap-2 rounded border border-line bg-negative-soft px-3 py-2 text-2xs text-negative">
            <AlertCircle size={13} />
            {rejected}
          </div>
        )}

        {queue.length > 0 && !progress.running && (
          <div className="mt-4 space-y-2">
            {queue.map((file) => (
              <div
                key={`${file.name}:${file.size}`}
                className="flex items-center justify-between gap-3 rounded border border-line bg-sunken px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileText size={14} className="shrink-0 text-faint" />
                  <div className="min-w-0">
                    <p className="truncate text-2xs font-medium text-ink">{file.name}</p>
                    <p className="text-2xs text-faint">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`${file.name} dosyasını kaldır`}
                  onClick={() => setQueue((prev) => prev.filter((f) => f !== file))}
                  className="rounded p-1 text-faint hover:bg-hover hover:text-ink"
                >
                  <X size={13} />
                </button>
              </div>
            ))}

            <Button variant="primary" className="w-full" onClick={start}>
              {state.transactions.length > 0 ? 'Ekle ve analiz et' : 'Analizi başlat'}
            </Button>
          </div>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-2xs text-faint">
          <Lock size={11} />
          Dosyalar tarayıcınızdan çıkmaz. Analiz cihazınızda çalışır.
        </p>
      </Card>

      {state.lastImport.length > 0 && (
        <Section
          title="Son içe aktarma"
          actions={
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'clearImportLog' })}>
              Temizle
            </Button>
          }
        >
          <div className="space-y-2">
            {state.lastImport.map((outcome) => (
              <div
                key={outcome.fileName}
                className="flex items-start gap-2.5 rounded border border-line bg-sunken px-3 py-2"
              >
                {outcome.ok ? (
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-positive" />
                ) : (
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-negative" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-2xs font-medium text-ink">{outcome.fileName}</p>
                  <p className="text-2xs text-muted">
                    {outcome.ok
                      ? `${count(outcome.added)} işlem eklendi${
                          outcome.duplicates ? ` · ${count(outcome.duplicates)} yinelenen atlandı` : ''
                        }${
                          outcome.statement?.skippedCount
                            ? ` · ${count(outcome.statement.skippedCount)} satır okunamadı`
                            : ''
                        }`
                      : outcome.error}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Yüklenen ekstreler" description={`${state.statements.length} kaynak`}>
        {state.statements.length === 0 ? (
          <Empty
            compact
            title="Henüz ekstre yok"
            description="Bir dosya yükleyin; analiz anında hazırlanır."
          />
        ) : (
          <div className="space-y-2">
            {[...state.statements]
              .sort((a, b) => b.importedAt - a.importedAt)
              .map((statement) => (
                <div
                  key={statement.id}
                  className="flex items-center justify-between gap-3 rounded border border-line bg-sunken px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-2xs font-medium text-ink">{statement.label}</p>
                      <Badge tone="accent">{statement.bank}</Badge>
                    </div>
                    <p className="mt-0.5 text-2xs text-faint">
                      {count(statement.transactionCount)} işlem
                      {statement.periodEnd ? ` · ${fullDayLabel(statement.periodEnd)}` : ''}
                      {' · '}
                      {ENGINE_LABEL[statement.engine] ?? statement.engine}
                      {statement.dueDate ? ` · son ödeme ${fullDayLabel(statement.dueDate)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`${statement.label} kaydını sil`}
                    onClick={() => setRemoving(statement.id)}
                    className="rounded p-1.5 text-faint hover:bg-hover hover:text-negative"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={removing !== null}
        title="Ekstreyi kaldır"
        message="Bu ekstreyle gelen tüm işlemler analizden çıkarılır. Dosyayı yeniden yükleyerek geri alabilirsiniz."
        confirmLabel="Kaldır"
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) dispatch({ type: 'removeStatement', statementId: removing })
          setRemoving(null)
        }}
      />
    </div>
  )
}
