import { AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react'
import { clsx } from 'clsx'
import { money2 } from '../core/money'
import type { Reconciliation, StatementSummary } from '../domain/types'

/**
 * How a parsed statement stands against the bank's own arithmetic, in the three
 * words a person can act on: it matches, it is off by this much, or there was
 * nothing printed to check it against.
 *
 * The number is the point. "Kontrol edilemedi" is honest and unalarming;
 * "₺120 fark" is a specific claim the person can go and look for.
 */

export type ReconStatus = Reconciliation['status']

const STATUS_RANK: Record<ReconStatus, number> = { mismatch: 2, unverified: 1, match: 0 }

/** The worst status among several statements — one bad one taints a period. */
export function worstStatus(statuses: readonly ReconStatus[]): ReconStatus | null {
  if (!statuses.length) return null
  return statuses.reduce((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst))
}

export function ReconciliationBadge({
  reconciliation,
  compact,
}: {
  reconciliation?: Reconciliation
  compact?: boolean
}) {
  const status: ReconStatus = reconciliation?.status ?? 'unverified'
  const delta = reconciliation?.delta ?? null

  if (status === 'match') {
    return (
      <span className="inline-flex items-center gap-1.5 text-label font-semibold text-positive">
        <CheckCircle2 size={14} className="shrink-0" />
        {compact ? 'Tutuyor' : 'Ekstreyle kuruşu kuruşuna tutuyor'}
      </span>
    )
  }

  if (status === 'mismatch' && delta !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-label font-semibold text-negative">
        <AlertTriangle size={14} className="shrink-0" />
        {money2(Math.abs(delta))} {delta > 0 ? 'fazla okundu' : 'eksik okundu'}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-label text-faint">
      <CircleHelp size={14} className="shrink-0" />
      {compact ? 'Kontrol edilemedi' : 'Karşılaştırılacak toplam yok'}
    </span>
  )
}

/** The arithmetic behind the badge, for the person who wants to see it. */
export function ReconciliationTable({ reconciliation }: { reconciliation: Reconciliation }) {
  const rows: Array<[string, number | null, string?]> = [
    ['Ekstredeki dönem borcu', reconciliation.printedDebt],
    ['Önceki dönemden devir', reconciliation.previousBalance, '−'],
    ['Karttan ödenen (satırlarda)', reconciliation.payments, '+'],
    ['Bankanın kaydettiği harcama', reconciliation.expectedCharges, '='],
    ['Okunan harcama (alışveriş − iade)', reconciliation.parsedCharges],
  ]

  return (
    <dl className="space-y-1">
      {rows.map(([label, value, sign]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="text-label text-muted">
            {sign && <span className="mr-1.5 inline-block w-3 text-faint">{sign}</span>}
            {label}
          </dt>
          <dd className="num text-label text-ink">{value === null ? '—' : money2(value)}</dd>
        </div>
      ))}
      {reconciliation.delta !== null && (
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1">
          <dt className="text-label font-semibold text-ink">Fark</dt>
          <dd
            className={clsx(
              'num text-label font-semibold',
              reconciliation.delta === 0 ? 'text-positive' : 'text-negative',
            )}
          >
            {money2(reconciliation.delta)}
          </dd>
        </div>
      )}
    </dl>
  )
}

/** Cover facts the bank prints, shown only where it printed them. */
export function SummaryFacts({ summary }: { summary: StatementSummary }) {
  const facts: Array<[string, string | null]> = [
    ['Asgari ödeme', summary.minPayment !== null ? money2(summary.minPayment) : null],
    ['Kart limiti', summary.creditLimit !== null ? money2(summary.creditLimit) : null],
    ['Kullanılabilir limit', summary.availableLimit !== null ? money2(summary.availableLimit) : null],
    ['Aylık akdi faiz', summary.interestMonthly !== null ? `%${String(summary.interestMonthly).replace('.', ',')}` : null],
  ]
  const shown = facts.filter((f): f is [string, string] => f[1] !== null)

  if (!shown.length && !summary.loyalty) return null

  return (
    <dl className="space-y-1">
      {shown.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="text-label text-muted">{label}</dt>
          <dd className="num text-label text-ink">{value}</dd>
        </div>
      ))}
      {summary.loyalty && (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-label text-muted">{summary.loyalty.programme}</dt>
          <dd className="num text-label text-ink">
            {[
              summary.loyalty.earned !== null ? `+${money2(summary.loyalty.earned)}` : null,
              summary.loyalty.spent !== null ? `−${money2(summary.loyalty.spent)}` : null,
              summary.loyalty.balance !== null ? `kalan ${money2(summary.loyalty.balance)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </dd>
        </div>
      )}
    </dl>
  )
}
