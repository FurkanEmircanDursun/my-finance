import { useMemo } from 'react'
import { clsx } from 'clsx'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/primitives'
import { LedgerEquation, LedgerStatus, carriedSentence } from '../ui/ledger'
import { RewardsCard } from '../ui/rewards'
import { SummaryFacts } from '../ui/statements'
import { count, money2 } from '../core/money'
import { dayLabel, fullDayLabel } from '../core/date'
import { categoryColor, categoryLabel } from '../domain/categories'
import { buildLedger, type LedgerSection } from '../analytics/ledger'
import { buildRewards } from '../analytics/rewards'
import { useStore } from '../store/AppStore'
import type { Transaction } from '../domain/types'

/**
 * One statement, every line of it, added up the way the bank adds it.
 *
 * This is the page to hold next to the paper: the equation at the top, then each
 * kind of line with its own subtotal, then the one figure those subtotals make.
 * Nothing here is estimated or rounded to the lira; a number is either the bank's
 * or a sum of numbers that are on this page.
 */
export function StatementSheet({
  open,
  onClose,
  statementId,
}: {
  open: boolean
  onClose: () => void
  statementId: string
}) {
  const { state } = useStore()
  const statement = state.statements.find((s) => s.id === statementId)

  const ledger = useMemo(
    () => (statement ? buildLedger(statement, state.transactions) : null),
    [statement, state.transactions],
  )
  const rewards = useMemo(
    () => (statement ? buildRewards({ statements: [statement], transactions: state.transactions }) : null),
    [statement, state.transactions],
  )

  if (!statement || !ledger) return null

  const range =
    statement.periodStart && statement.periodEnd
      ? `${dayLabel(statement.periodStart)} – ${fullDayLabel(statement.periodEnd)}`
      : null
  const due = statement.dueDate ? `son ödeme ${fullDayLabel(statement.dueDate)}` : null
  const sentence = carriedSentence(ledger.previousBalance, ledger.payments)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={statement.label}
      description={[range, due].filter(Boolean).join(' · ') || undefined}
      variant="sheet"
    >
      <div className="space-y-8">
        <section className="space-y-3">
          <LedgerEquation
            previousBalance={ledger.previousBalance}
            payments={ledger.payments}
            charges={ledger.charges}
            printedDebt={ledger.printedDebt}
            rowCount={ledger.rowCount}
          />
          <LedgerStatus status={ledger.status} delta={ledger.delta} />
          {sentence && <p className="text-label text-muted">{sentence}</p>}
        </section>

        <section className="space-y-6" aria-label="Satırlar">
          {ledger.sections.map((section) => (
            <Section key={section.id} section={section} />
          ))}

          <div className="border-t border-line pt-3">
            <div className="flex items-baseline justify-between gap-3 px-2">
              <span className="text-body font-semibold text-ink">
                Dönem harcamaları
                <span className="ml-2 text-label font-normal text-faint">
                  {ledger.sections
                    .filter((s) => s.sign !== 0)
                    .map((s) => `${s.sign > 0 ? '+' : '−'} ${s.label.toLocaleLowerCase('tr')}`)
                    .join(' ')
                    .replace(/^\+ /, '')}
                </span>
              </span>
              <span className="num shrink-0 text-body font-semibold text-ink">{money2(ledger.charges)}</span>
            </div>
          </div>
        </section>

        {rewards && rewards.programmes.length > 0 && (
          <section className="space-y-4 rounded-[var(--radius-lg)] border border-line p-4">
            <p className="text-label text-muted">
              Aşağıdaki bonus/puan hareketleri borcunu etkilemez; yukarıdaki harcamaya katılmaz.
            </p>
            {rewards.programmes.map((programme) => (
              <RewardsCard key={`${programme.bank}|${programme.programme}`} programme={programme} />
            ))}
          </section>
        )}

        {statement.summary && (
          <section className="space-y-2">
            <h3 className="text-label font-semibold uppercase tracking-wide text-faint">Ekstre bilgileri</h3>
            <SummaryFacts summary={statement.summary} showLoyalty={false} />
          </section>
        )}
      </div>
    </Modal>
  )
}

function Section({ section }: { section: LedgerSection }) {
  const prefix = section.sign > 0 ? '+' : section.sign < 0 ? '−' : ''
  return (
    <div>
      <header className="flex items-baseline justify-between gap-3 px-2 pb-1">
        <h3 className="text-title font-semibold text-ink">
          {section.label}
          <span className="ml-2 text-label font-normal text-faint">{count(section.count)} satır</span>
        </h3>
        <span className="num shrink-0 text-title font-semibold text-ink">
          {prefix}
          {money2(section.total)}
        </span>
      </header>
      {section.sign === 0 && (
        <p className="px-2 pb-1 text-label text-faint">Önceki dönemin borcunu kapatır; harcama sayılmaz.</p>
      )}
      <ul>
        {section.rows.map((tx) => (
          <Row key={tx.id} tx={tx} sign={section.sign} />
        ))}
      </ul>
    </div>
  )
}

function Row({ tx, sign }: { tx: Transaction; sign: 1 | -1 | 0 }) {
  return (
    <li className="flex min-h-[48px] items-center gap-3 rounded-[var(--radius)] px-2 py-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: categoryColor(tx.category) }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-ink">{tx.description}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-label text-faint">
          <span>{dayLabel(tx.date)}</span>
          <span>{categoryLabel(tx.category)}</span>
          {tx.installment && (
            <Badge>
              taksit {tx.installment.current}/{tx.installment.total}
            </Badge>
          )}
          {tx.reward ? <span>+{money2(tx.reward)} bonus</span> : null}
        </span>
      </span>
      <span
        className={clsx(
          'num shrink-0 text-body font-semibold',
          sign < 0 ? 'text-positive' : sign === 0 ? 'text-muted' : 'text-ink',
        )}
      >
        {sign < 0 ? '−' : ''}
        {money2(tx.amount)}
      </span>
    </li>
  )
}
