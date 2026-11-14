import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button, Chip } from '../ui/primitives'
import { LedgerStatus } from '../ui/ledger'
import { useStore } from '../store/AppStore'
import { monthLabel, monthOf, todayKey } from '../core/date'
import { money2 } from '../core/money'
import { buildLedgers } from '../analytics/ledger'
import {
  availableCards, availableMonths, availableStatementMonths, statementsInScope,
} from '../store/selectors'
import type { MonthKey } from '../core/date'

/**
 * Which statement is on screen — the one control above every page.
 *
 * A statement is a card in a month, so choosing one is two taps: a period and a
 * card (or "all"). Everything below — the headline, the categories, the
 * transactions — is then exactly that statement's, which is what makes it
 * possible to hold the screen up against the paper. With a single card the card
 * row is not shown at all: there is nothing to choose.
 *
 * The button says both halves, because "Eylül 2026" alone leaves out whose.
 */
export function ScopeButton() {
  const { state } = useStore()
  const [open, setOpen] = useState(false)

  const cards = useMemo(() => availableCards(state.statements), [state.statements])
  const { month, cards: chosen } = state.filters

  const title = month === 'all' ? 'Tüm dönemler' : monthLabel(month)
  const subtitle =
    cards.length < 2 ? null : chosen.length === 0 ? 'Tüm hesaplar' : chosen.length === 1 ? chosen[0] : `${chosen.length} kart`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Dönem seç: ${title}${subtitle ? `, ${subtitle}` : ''}`}
        className="-ml-2 flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-[var(--radius)] px-2 py-1 text-left transition-colors duration-200 hover:bg-hover"
      >
        <span className="min-w-0">
          <span className="block truncate text-title font-semibold leading-tight text-ink">{title}</span>
          {subtitle && <span className="block truncate text-label leading-tight text-muted">{subtitle}</span>}
        </span>
        <ChevronDown size={17} className="shrink-0 text-faint" />
      </button>

      <ScopeSheet open={open} onClose={() => setOpen(false)} cards={cards} />
    </>
  )
}

function ScopeSheet({ open, onClose, cards }: { open: boolean; onClose: () => void; cards: string[] }) {
  const { state, dispatch } = useStore()
  const { filters, statements, transactions } = state

  const months: MonthKey[] = [...new Set([monthOf(todayKey()), ...availableMonths(transactions), ...availableStatementMonths(statements)])].sort().reverse()

  const inScope = useMemo(() => statementsInScope(statements, filters), [statements, filters])
  const { ledgers, totals } = useMemo(() => buildLedgers(inScope, transactions), [inScope, transactions])

  const pickMonth = (month: MonthKey | 'all') => dispatch({ type: 'setFilters', filters: { month } })
  const pickCard = (card: string | null) => dispatch({ type: 'setFilters', filters: { cards: card ? [card] : [] } })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Dönem ve hesap"
      description="Aylık analiz işlem tarihine göre hesaplanır. Ekstre kontrolü belgenin tamamını kapsar."
      footer={
        <Button variant="primary" onClick={onClose}>
          Tamam
        </Button>
      }
    >
      <div className="space-y-6">
        <section aria-labelledby="scope-period">
          <h3 id="scope-period" className="mb-2 text-label font-semibold uppercase tracking-wide text-faint">
            Dönem
          </h3>
          <div className="flex flex-wrap gap-2">
            <Chip selected={filters.month === 'all'} onClick={() => pickMonth('all')}>
              Tümü
            </Chip>
            {months.map((month) => (
              <Chip key={month} selected={filters.month === month} onClick={() => pickMonth(month)}>
                {monthLabel(month)}
              </Chip>
            ))}
          </div>
        </section>

        {cards.length > 1 && (
          <section aria-labelledby="scope-card">
            <h3 id="scope-card" className="mb-2 text-label font-semibold uppercase tracking-wide text-faint">
              Kart
            </h3>
            <div className="flex flex-wrap gap-2">
              <Chip selected={filters.cards.length === 0} onClick={() => pickCard(null)}>
                Tüm hesaplar
              </Chip>
              {cards.map((card) => (
                <Chip key={card} selected={filters.cards.includes(card)} onClick={() => pickCard(card)}>
                  {card}
                </Chip>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="scope-result" className="rounded-[var(--radius-lg)] bg-sunken p-4">
          <h3 id="scope-result" className="mb-3 text-label font-semibold uppercase tracking-wide text-faint">
            Bu ay kesilen ekstreler (tam belge)
          </h3>

          {ledgers.length === 0 ? (
            <p className="text-body text-muted">Bu dönemde bu karta ait ekstre yok.</p>
          ) : (
            <ul className="space-y-3">
              {ledgers.map((ledger) => (
                <li key={ledger.statement.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-body text-ink">{ledger.statement.label}</span>
                    <span className="block">
                      <LedgerStatus status={ledger.status} delta={ledger.delta} compact />
                    </span>
                  </span>
                  <span className="num shrink-0 text-body font-semibold text-ink">
                    {ledger.printedDebt === null ? money2(ledger.charges) : money2(ledger.printedDebt)}
                  </span>
                </li>
              ))}
              {ledgers.length > 1 && totals.printedDebt !== null && (
                <li className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                  <span className="text-body font-semibold text-ink">Toplam dönem borcu</span>
                  <span className="num text-body font-semibold text-ink">{money2(totals.printedDebt)}</span>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}
