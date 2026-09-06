import { Search, X } from 'lucide-react'
import { clsx } from 'clsx'
import { monthLabel } from '../core/date'
import { count } from '../core/money'
import { useStore } from '../store/AppStore'
import { availableBanks, availableMonths, availableStatementMonths, hasActiveFilters } from '../store/selectors'

/**
 * One filter bar drives every view. Views read `analysis`, which is already
 * computed from the filtered set, so no view re-implements filtering.
 *
 * The period chip row has two sources, decided by `settings.periodGrouping`:
 * calendar months, or the months statements are themselves named after (see
 * `availableStatementMonths`). Both bind to the same `filters.month` field —
 * one chip per month, covering every bank that has a statement for it, so
 * picking "Ağustos 2026" in statement mode shows Akbank's and Garanti's
 * August charges together rather than as two separate chips.
 */
export function FilterBar() {
  const { state, dispatch, visible } = useStore()
  const { filters, transactions, statements, settings } = state

  const months =
    settings.periodGrouping === 'statement' ? availableStatementMonths(statements) : availableMonths(transactions)
  const banks = availableBanks(transactions)
  const active = hasActiveFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none">
        <Chip
          active={filters.month === 'all'}
          onClick={() => dispatch({ type: 'setFilters', filters: { month: 'all' } })}
        >
          Tüm dönemler
        </Chip>
        {months.map((month) => (
          <Chip
            key={month}
            active={filters.month === month}
            onClick={() => dispatch({ type: 'setFilters', filters: { month } })}
          >
            {monthLabel(month, true)}
          </Chip>
        ))}

        {banks.length > 1 && <span className="mx-1 h-4 w-px shrink-0 bg-line" />}
        {banks.length > 1 &&
          banks.map((bank) => {
            const selected = filters.banks.includes(bank)
            return (
              <Chip
                key={bank}
                active={selected}
                onClick={() =>
                  dispatch({
                    type: 'setFilters',
                    filters: {
                      banks: selected ? filters.banks.filter((b) => b !== bank) : [...filters.banks, bank],
                    },
                  })
                }
              >
                {bank}
              </Chip>
            )
          })}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden text-2xs text-faint sm:inline">{count(visible.length)} işlem</span>

        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => dispatch({ type: 'setFilters', filters: { query: e.target.value } })}
            placeholder="İşyeri ara"
            aria-label="İşlem ara"
            className="h-8 w-36 rounded border border-line bg-raised pl-7 pr-2 text-2xs text-ink placeholder:text-faint focus:w-52 focus:border-accent focus:outline-none sm:w-44"
          />
        </div>

        {active && (
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'setFilters',
                filters: { month: 'all', categories: [], banks: [], query: '' },
              })
            }
            className="inline-flex h-8 items-center gap-1 rounded border border-line bg-raised px-2 text-2xs text-muted hover:text-ink"
          >
            <X size={11} />
            Sıfırla
          </button>
        )}
      </div>
    </div>
  )
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'h-7 shrink-0 rounded border px-2.5 text-2xs font-medium transition-colors',
        active
          ? 'border-transparent bg-ink text-inverse'
          : 'border-line bg-raised text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
