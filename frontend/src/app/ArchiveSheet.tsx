import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight, ChevronDown, Copy, FileJson, FileSpreadsheet, Trash2, Upload,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Empty, Segmented } from '../ui/primitives'
import { ConfirmDialog, Modal } from '../ui/Modal'
import {
  ReconciliationBadge, ReconciliationTable, SummaryFacts, worstStatus, type ReconStatus,
} from '../ui/statements'
import { count, money, money2 } from '../core/money'
import { dayLabel, fullDayLabel, monthLabel, todayKey, type MonthKey } from '../core/date'
import { copyText, readTextFile, saveTextFile, type SaveOutcome } from '../platform/files'
import {
  applyBackup, backupFileName, buildBackup, buildCsv, parseBackup, summarizePeriod,
  type ParsedBackup, type PeriodSummary, type RestoreMode,
} from '../store/backup'
import { buildStatementMonthIndex, periodMonthOf } from '../store/selectors'
import { useStore } from '../store/AppStore'
import { effectiveDate, type Statement, type Transaction } from '../domain/types'

/**
 * Geçmiş ve veri — everything that has ever been imported, and the way out.
 *
 * It answers the two questions that come with keeping a year of statements in an
 * app: "is what it holds right?" and "can I take it with me?". Each period opens
 * onto its statements, each statement onto the arithmetic that says whether it
 * was read correctly, and each of those onto the exact lines that were left out.
 * Nothing is shown that the person did not ask to open.
 */

interface PeriodEntry {
  key: MonthKey
  summary: PeriodSummary
  statements: Statement[]
  transactions: Transaction[]
  status: ReconStatus | null
}

export function ArchiveSheet({
  open,
  onClose,
  onShowPeriod,
}: {
  open: boolean
  onClose: () => void
  /** Called after a period has been chosen, so the shell can show its overview. */
  onShowPeriod: () => void
}) {
  const { state, dispatch, overall } = useStore()
  const { transactions, statements, settings } = state

  const grouping = settings.periodGrouping === 'statement' ? 'statement' : 'calendar'
  const statementMonths = useMemo(() => buildStatementMonthIndex(statements), [statements])

  const periods = useMemo<PeriodEntry[]>(() => {
    const buckets = new Map<MonthKey, Transaction[]>()
    for (const tx of transactions) {
      const key = periodMonthOf(tx, grouping, statementMonths)
      const bucket = buckets.get(key)
      if (bucket) bucket.push(tx)
      else buckets.set(key, [tx])
    }

    return [...buckets.keys()]
      .sort()
      .reverse()
      .map((key) => {
        const txs = buckets.get(key) ?? []
        const summary = summarizePeriod(key, txs, statements)
        const inPeriod = statements.filter((s) =>
          grouping === 'statement' ? statementMonths.get(s.id) === key : summary.statementIds.includes(s.id),
        )
        return {
          key,
          summary,
          statements: inPeriod,
          transactions: txs,
          status: worstStatus(inPeriod.map((s) => s.reconciliation?.status ?? 'unverified')),
        }
      })
  }, [transactions, statements, grouping, statementMonths])

  const [openKey, setOpenKey] = useState<MonthKey | null>(null)
  const [message, setMessage] = useState<{ text: string; fallback?: string } | null>(null)
  const [deleting, setDeleting] = useState<Statement | null>(null)

  const range = useMemo(() => {
    let from: string | null = null
    let to: string | null = null
    // The days things were charged, not an instalment's original purchase date —
    // which would stretch a one-month history back to the spring.
    for (const tx of transactions) {
      const day = effectiveDate(tx)
      if (!from || day < from) from = day
      if (!to || day > to) to = day
    }
    return { from, to }
  }, [transactions])

  /* ── Export ──────────────────────────────────────────────────────────────── */

  const report = (outcome: SaveOutcome, name: string, text: string) => {
    if (outcome === 'cancelled') return setMessage(null)
    if (outcome === 'failed') {
      return setMessage({
        text: 'Bu cihaz dosyayı doğrudan kaydedemedi. İçeriği panoya kopyalayıp bir not ya da dosyaya yapıştırabilirsin.',
        fallback: text,
      })
    }
    setMessage({ text: outcome === 'shared' ? `${name} paylaşıma hazırlandı.` : `${name} indirildi.` })
  }

  const exportJson = async (period: MonthKey | 'all') => {
    const backup = buildBackup({ state, overall, appVersion: __APP_VERSION__, period })
    const text = JSON.stringify(backup, null, 2)
    const name = backupFileName(period, todayKey())
    report(await saveTextFile(name, text, 'application/json'), name, text)
  }

  const exportCsv = async (period: MonthKey | 'all') => {
    const scoped = period === 'all' ? transactions : periods.find((p) => p.key === period)?.transactions ?? []
    const text = buildCsv(scoped, statements, (tx) => periodMonthOf(tx, grouping, statementMonths))
    const name = period === 'all' ? `mizan-islemler-${todayKey()}.csv` : `mizan-${period}-${todayKey()}.csv`
    report(await saveTextFile(name, text, 'text/csv;charset=utf-8'), name, text)
  }

  const hasData = transactions.length > 0 || statements.length > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Geçmiş ve veri"
      description={
        hasData && range.from && range.to
          ? `${count(transactions.length)} işlem · ${count(statements.length)} ekstre · ${fullDayLabel(range.from)} – ${fullDayLabel(range.to)}`
          : 'Henüz veri yok'
      }
      variant="sheet"
    >
      <div className="space-y-8">
        {/* ── Take it with you ──────────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!hasData} onClick={() => exportJson('all')}>
              <FileJson size={16} />
              Tümünü JSON indir
            </Button>
            <Button disabled={!hasData} onClick={() => exportCsv('all')}>
              <FileSpreadsheet size={16} />
              CSV
            </Button>
          </div>
          <p className="text-label leading-relaxed text-faint">
            JSON, her işlemi ham satırıyla, her ekstreyi özeti ve mutabakatıyla, öğrenilen kuralları ve dönem
            özetlerini içerir. Kuruş cinsindendir ve geri yüklenebilir. Uygulama kilidi PIN&apos;i dosyaya girmez.
          </p>
          {message && (
            <div className="rounded-[var(--radius)] bg-sunken px-3 py-2.5">
              <p className="text-label text-muted">{message.text}</p>
              {message.fallback && (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={async () => {
                    const ok = await copyText(message.fallback!)
                    setMessage({ text: ok ? 'Panoya kopyalandı.' : 'Pano erişimi reddedildi.' })
                  }}
                >
                  <Copy size={14} />
                  Panoya kopyala
                </Button>
              )}
            </div>
          )}
        </section>

        <Restore />

        {/* ── The history ───────────────────────────────────────────────────── */}
        {hasData ? (
          <section>
            <h3 className="mb-2 text-title font-semibold text-ink">Dönemler</h3>
            <ul className="-mx-2">
              {periods.map((period) => (
                <PeriodRow
                  key={period.key}
                  period={period}
                  open={openKey === period.key}
                  onToggle={() => setOpenKey((k) => (k === period.key ? null : period.key))}
                  onShow={() => {
                    dispatch({ type: 'setFilters', filters: { month: period.key } })
                    onShowPeriod()
                  }}
                  onJson={() => exportJson(period.key)}
                  onCsv={() => exportCsv(period.key)}
                  onDelete={setDeleting}
                />
              ))}
            </ul>
          </section>
        ) : (
          <Empty compact title="Henüz ekstre yok" description="Ekstre eklediğinde dönemler burada listelenir." />
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="Ekstreyi sil"
        message={`${deleting?.label ?? ''} ve bu ekstreden gelen ${count(deleting?.transactionCount ?? 0)} işlem silinir. Önce JSON yedeği almak iyi olur.`}
        confirmLabel="Ekstreyi sil"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) dispatch({ type: 'removeStatement', statementId: deleting.id })
          setDeleting(null)
        }}
      />
    </Modal>
  )
}

/* ── One period ──────────────────────────────────────────────────────────── */

function PeriodRow({
  period,
  open,
  onToggle,
  onShow,
  onJson,
  onCsv,
  onDelete,
}: {
  period: PeriodEntry
  open: boolean
  onToggle: () => void
  onShow: () => void
  onJson: () => void
  onCsv: () => void
  onDelete: (statement: Statement) => void
}) {
  const { summary, statements, status } = period
  const top = summary.categories.filter((c) => c.net > 0).slice(0, 4)

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2 py-3 text-left transition-colors duration-200 hover:bg-hover"
      >
        <ChevronDown size={16} className={clsx('shrink-0 text-faint transition-transform duration-200', open && 'rotate-180')} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-ink">{monthLabel(period.key)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-label text-faint">
            <span>
              {count(summary.counts.total)} işlem · {count(statements.length)} ekstre
            </span>
            {status && statements.length > 0 && <StatusDot status={status} />}
          </span>
        </span>
        <span className="num shrink-0 text-body font-semibold text-ink">{money(summary.totals.netSpend)}</span>
      </button>

      {open && (
        <div className="rise-in space-y-5 px-2 pb-5 pl-9">
          {top.length > 0 && (
            <p className="text-label leading-relaxed text-muted">
              {top.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ' · '}
                  {c.label} <span className="num text-ink">{money(c.net)}</span>
                </span>
              ))}
            </p>
          )}

          {statements.map((statement) => (
            <StatementCard key={statement.id} statement={statement} onDelete={() => onDelete(statement)} />
          ))}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={onShow}>
              Bu dönemi aç
              <ArrowRight size={14} />
            </Button>
            <Button size="sm" onClick={onJson}>
              <FileJson size={14} />
              JSON
            </Button>
            <Button size="sm" onClick={onCsv}>
              <FileSpreadsheet size={14} />
              CSV
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

function StatusDot({ status }: { status: ReconStatus }) {
  if (status === 'match') return <span className="font-semibold text-positive">✓ tutuyor</span>
  if (status === 'mismatch') return <span className="font-semibold text-negative">⚠ fark var</span>
  return <span>kontrol edilemedi</span>
}

/* ── One statement ───────────────────────────────────────────────────────── */

function StatementCard({ statement, onDelete }: { statement: Statement; onDelete: () => void }) {
  const [detail, setDetail] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
  const { reconciliation, summary, ignored = [] } = statement

  return (
    <div className="rounded-[var(--radius-lg)] bg-sunken p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-ink">{statement.accountLabel ?? statement.bank}</p>
          <p className="mt-0.5 text-label text-faint">
            {statement.periodStart && statement.periodEnd
              ? `${dayLabel(statement.periodStart)} – ${dayLabel(statement.periodEnd)}`
              : statement.fileName}
            {statement.dueDate && ` · son ödeme ${dayLabel(statement.dueDate)}`}
          </p>
        </div>
        {summary?.totalDebt != null && (
          <span className="num shrink-0 text-body font-semibold text-ink">{money2(summary.totalDebt)}</span>
        )}
      </div>

      <div className="mt-3">
        <ReconciliationBadge reconciliation={reconciliation} />
      </div>

      {(reconciliation || summary || ignored.length > 0) && (
        <button
          type="button"
          onClick={() => setDetail((v) => !v)}
          aria-expanded={detail}
          className="mt-3 flex h-9 items-center gap-1.5 text-label font-semibold text-muted transition-colors duration-200 hover:text-ink"
        >
          Ayrıntı
          <ChevronDown size={14} className={clsx('transition-transform duration-200', detail && 'rotate-180')} />
        </button>
      )}

      {detail && (
        <div className="rise-in mt-2 space-y-4">
          {reconciliation && reconciliation.status !== 'unverified' && (
            <Block title="Mutabakat">
              <ReconciliationTable reconciliation={reconciliation} />
            </Block>
          )}

          {summary && (
            <Block title="Ekstre kapağı">
              <SummaryFacts summary={summary} />
            </Block>
          )}

          {ignored.length > 0 && (
            <Block title="Sayılmayan satırlar">
              <p className="text-label leading-relaxed text-faint">
                Bonus ve kampanya satırları para hareketi değildir; harcamaya katılmaz, ama burada durur.
              </p>
              <button
                type="button"
                onClick={() => setShowIgnored((v) => !v)}
                className="mt-1 text-label font-semibold text-accent hover:underline"
              >
                {showIgnored ? 'Gizle' : `${count(ignored.length)} satırı göster`}
              </button>
              {showIgnored && (
                <ul className="mt-2 space-y-1">
                  {ignored.map((row, i) => (
                    <li key={`${row.date}-${i}`} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-label text-muted">
                        {dayLabel(row.date)} · {row.description}
                      </span>
                      <span className="num flex shrink-0 items-center gap-1.5 text-label text-ink">
                        <Badge tone={row.reason === 'reward-spent' ? 'warning' : 'positive'}>
                          {row.reason === 'reward-spent' ? 'harcandı' : 'kazanıldı'}
                        </Badge>
                        {money2(row.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
          )}

          <p className="text-label text-faint">
            {statement.fileName} · {statement.engine} · {count(statement.transactionCount)} işlem
            {statement.skippedCount > 0 && ` · ${count(statement.skippedCount)} satır okunamadı`}
          </p>

          <Button size="sm" variant="danger" onClick={onDelete}>
            <Trash2 size={14} />
            Ekstreyi sil
          </Button>
        </div>
      )}
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-label font-semibold text-ink">{title}</p>
      {children}
    </div>
  )
}

/* ── Restore ─────────────────────────────────────────────────────────────── */

function Restore() {
  const { state, dispatch } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ParsedBackup | null>(null)
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  const choose = async (file: File | undefined) => {
    setError(null)
    setDone(null)
    setPending(null)
    if (!file) return

    try {
      const result = parseBackup(await readTextFile(file))
      if (!result.ok) return setError(result.error)
      setPending(result.backup)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dosya okunamadı.')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const apply = () => {
    if (!pending) return
    const result = applyBackup(state, pending.data, mode)
    dispatch({ type: 'restore', backup: pending.data, mode })
    setDone(
      mode === 'merge'
        ? `${count(result.added.transactions)} yeni işlem, ${count(result.added.statements)} ekstre eklendi; mevcut verin olduğu gibi kaldı.`
        : `Veri yedekle değiştirildi: ${count(result.added.transactions)} işlem, ${count(result.added.statements)} ekstre.`,
    )
    setPending(null)
    setConfirm(false)
  }

  const preview = pending?.preview

  return (
    <section className="space-y-3">
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => void choose(e.target.files?.[0])}
      />

      {!pending && (
        <Button onClick={() => input.current?.click()}>
          <Upload size={16} />
          Yedekten geri yükle
        </Button>
      )}

      {error && <p className="text-body text-negative">{error}</p>}
      {done && <p className="text-body text-positive">{done}</p>}

      {pending && preview && (
        <div className="space-y-4 rounded-[var(--radius-lg)] bg-sunken p-4">
          <div>
            <p className="text-body font-semibold text-ink">
              {count(preview.transactions)} işlem · {count(preview.statements)} ekstre · {count(preview.rules)} kural
            </p>
            <p className="mt-0.5 text-label text-faint">
              {preview.from && preview.to ? `${fullDayLabel(preview.from)} – ${fullDayLabel(preview.to)}` : 'Tarih yok'}
              {preview.exportedAt && ` · ${preview.exportedAt.slice(0, 10)} tarihli`}
              {preview.appVersion && ` · v${preview.appVersion}`}
            </p>
          </div>

          {preview.rejected > 0 && (
            <p className="text-label text-warning">
              {count(preview.rejected)} satır geçersiz olduğu için atlanacak.
            </p>
          )}
          {pending.notes.map((note) => (
            <p key={note} className="text-label text-muted">
              {note}
            </p>
          ))}

          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'merge', label: 'Birleştir' },
              { value: 'replace', label: 'Değiştir' },
            ]}
          />
          <p className="text-label leading-relaxed text-faint">
            {mode === 'merge'
              ? 'Eksik olanları ekler, var olana dokunmaz. Düzelttiğin kategoriler geri alınmaz.'
              : 'Bu cihazdaki ekstreler, işlemler, kurallar ve profil silinip yedeğin içeriğiyle değiştirilir.'}
          </p>

          <div className="flex gap-2">
            <Button variant="primary" onClick={() => (mode === 'replace' ? setConfirm(true) : apply())}>
              Geri yükle
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title="Mevcut veriyi değiştir"
        message="Bu cihazdaki tüm ekstreler, işlemler, kurallar ve profil yedeğin içeriğiyle değiştirilecek. Geri alınamaz."
        confirmLabel="Değiştir"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={apply}
      />
    </section>
  )
}
