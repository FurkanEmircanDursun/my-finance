import { AlertTriangle, CheckCircle2, ChevronRight, CircleHelp } from 'lucide-react'
import { clsx } from 'clsx'
import { count, money2 } from '../core/money'
import type { Money } from '../core/money'
import type { LedgerTotals, StatementLedger } from '../analytics/ledger'

/**
 * The statement's own arithmetic, in the words the paper uses.
 *
 * "Harcamam neden dönem borcuma eşit değil?" is the question every number on the
 * overview invites, and the honest answer is a sum: the debt is last month's
 * balance, less what was paid, plus this month's spending. So the sum is printed,
 * with the bank's figures and the app's side by side, and one sentence says what
 * the gap between spending and debt is made of.
 */

type Status = StatementLedger['status']

export function LedgerStatus({
  status,
  delta,
  compact,
}: {
  status: Status
  delta: Money | null
  compact?: boolean
}) {
  if (status === 'match') {
    return (
      <span className="inline-flex items-center gap-1.5 text-label font-medium text-positive">
        <CheckCircle2 size={14} className="shrink-0" />
        {compact ? 'Tutuyor' : 'Ekstreyle kuruşu kuruşuna tutuyor'}
      </span>
    )
  }
  if (status === 'mismatch' && delta !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-label font-medium text-negative">
        <AlertTriangle size={14} className="shrink-0" />
        {money2(Math.abs(delta))} {delta > 0 ? 'fazla okundu' : 'eksik okundu'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-label text-muted">
      <CircleHelp size={14} className="shrink-0" />
      {compact ? 'Kontrol edilemedi' : 'Ekstrede karşılaştırılacak toplam yok'}
    </span>
  )
}

/**
 * What separates spending from debt, in one sentence. `carried` is the previous
 * balance less the payments — the part of last month's debt still standing.
 */
export function carriedSentence(previousBalance: Money | null, payments: Money): string | null {
  if (previousBalance === null) return null
  const carried = previousBalance - payments
  if (carried === 0) {
    return 'Önceki dönemin borcu tamamen ödenmiş; bu yüzden dönem borcu, dönem harcamasına eşit.'
  }
  if (carried > 0) {
    return `Önceki dönemden ${money2(carried)} ödenmeden devretti; dönem borcu bu yüzden harcamadan ${money2(carried)} fazla.`
  }
  return `Önceki borçtan ${money2(-carried)} fazla ödeme yapılmış; dönem borcu bu yüzden harcamadan ${money2(-carried)} az.`
}

interface EquationProps {
  previousBalance: Money | null
  payments: Money
  charges: Money
  printedDebt: Money | null
  rowCount?: number
}

/** previous balance − payments + charges = debt, one line each. */
export function LedgerEquation({ previousBalance, payments, charges, printedDebt, rowCount }: EquationProps) {
  const lines: Array<{ sign: string; label: string; value: Money | null; note?: string; strong?: boolean }> = [
    { sign: '', label: 'Önceki bakiye', value: previousBalance },
    { sign: '−', label: 'Ödemeler', value: payments },
    { sign: '+', label: 'Dönem harcamaları', value: charges, note: rowCount ? `${count(rowCount)} satır` : undefined },
    { sign: '=', label: 'Dönem borcu', value: printedDebt, strong: true, note: 'ekstrede yazan' },
  ]

  return (
    <dl className="space-y-1.5">
      {lines.map((line) => (
        <div
          key={line.label}
          className={clsx(
            'flex items-baseline justify-between gap-3',
            line.strong && 'mt-1 border-t border-line pt-2',
          )}
        >
          <dt className={clsx('min-w-0 text-body', line.strong ? 'font-semibold text-ink' : 'text-muted')}>
            <span className="mr-2 inline-block w-3 text-faint" aria-hidden>
              {line.sign}
            </span>
            {line.label}
            {line.note && <span className="ml-2 text-label font-normal text-faint">{line.note}</span>}
          </dt>
          <dd className={clsx('num shrink-0 text-body', line.strong ? 'font-semibold text-ink' : 'text-ink')}>
            {line.value === null ? '—' : money2(line.value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The overview's block: one statement shows its whole equation; several show one
 * line each and a total, because three equations stacked answer nothing.
 */
export function LedgerSummary({
  ledgers,
  totals,
  manual,
  onOpen,
}: {
  ledgers: StatementLedger[]
  totals: LedgerTotals
  /** Spending on screen that belongs to no statement (hand-entered rows). */
  manual: Money
  onOpen: (statementId: string) => void
}) {
  if (ledgers.length === 0) return null

  if (ledgers.length === 1) {
    const ledger = ledgers[0]
    const sentence = carriedSentence(ledger.previousBalance, ledger.payments)
    return (
      <div className="space-y-4">
        <LedgerEquation
          previousBalance={ledger.previousBalance}
          payments={ledger.payments}
          charges={ledger.charges}
          printedDebt={ledger.printedDebt}
          rowCount={ledger.rowCount}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <LedgerStatus status={ledger.status} delta={ledger.delta} />
          <button
            type="button"
            onClick={() => onOpen(ledger.statement.id)}
            className="inline-flex min-h-[44px] items-center gap-1 text-body font-medium text-accent hover:underline"
          >
            Tüm satırları gör
            <ChevronRight size={16} />
          </button>
        </div>
        {sentence && <p className="text-label text-muted">{sentence}</p>}
        <Manual value={manual} />
      </div>
    )
  }

  const sentence = carriedSentence(totals.previousBalance, totals.payments)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-2.5 gap-y-0 text-label text-faint sm:gap-x-4">
        <span>Ekstre</span>
        <span className="text-right">Harcama</span>
        <span className="text-right">Dönem borcu</span>
      </div>

      <ul className="-mx-2">
        {ledgers.map((ledger) => (
          <li key={ledger.statement.id}>
            <button
              type="button"
              onClick={() => onOpen(ledger.statement.id)}
              className="grid min-h-[56px] w-full grid-cols-[1fr_auto_auto] items-center gap-x-2.5 rounded-[var(--radius)] px-2 py-2 text-left transition-colors duration-200 hover:bg-hover sm:gap-x-4"
            >
              <span className="min-w-0">
                <span className="block break-words text-body text-ink">{ledger.statement.label}</span>
                <span className="mt-0.5 block">
                  <LedgerStatus status={ledger.status} delta={ledger.delta} compact />
                </span>
              </span>
              <span className="num text-right text-body text-ink">{money2(ledger.charges)}</span>
              <span className="num text-right text-body text-muted">
                {ledger.printedDebt === null ? '—' : money2(ledger.printedDebt)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-2.5 border-t border-line pt-3 sm:gap-x-4">
        <span className="text-body font-medium text-ink">Toplam</span>
        <span className="num text-right text-body font-semibold text-ink">{money2(totals.charges)}</span>
        <span className="num text-right text-body font-semibold text-muted">
          {totals.printedDebt === null ? '—' : money2(totals.printedDebt)}
        </span>
      </div>

      {sentence && <p className="text-label text-muted">{sentence}</p>}
      <Manual value={manual} />
    </div>
  )
}

function Manual({ value }: { value: Money }) {
  if (value === 0) return null
  return (
    <p className="text-label text-muted">
      Üstteki rakama ekstre dışı, elle eklenen işlemler de dahil: <span className="num font-semibold text-ink">{money2(value, { sign: true })}</span>.
    </p>
  )
}
