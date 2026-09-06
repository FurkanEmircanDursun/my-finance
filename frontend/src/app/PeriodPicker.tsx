import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { Modal } from '../ui/Modal'
import { Row } from '../ui/primitives'
import { useStore } from '../store/AppStore'
import { monthLabel } from '../core/date'
import { availableMonths, availableStatementMonths } from '../store/selectors'
import type { MonthKey } from '../core/date'

/**
 * The whole period control, in one button.
 *
 * It replaces a horizontally scrolling strip of month chips, a set of bank
 * chips, a live transaction counter, a search box and a reset button — five
 * controls that sat above every screen and, on the screens where they did not
 * apply, quietly disappeared. A control that is sometimes there and sometimes
 * not teaches people that the rules change from page to page.
 *
 * Bank filtering is gone entirely: nobody asks "what did I spend at Garanti",
 * they ask "what did I spend on food". The bank is still a column in the
 * transaction list, which is where that question actually gets asked.
 */
export function PeriodButton() {
  const { state } = useStore()
  const [open, setOpen] = useState(false)

  const label = state.filters.month === 'all' ? 'Tüm dönemler' : monthLabel(state.filters.month)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-2 flex h-11 items-center gap-1.5 rounded-[var(--radius)] px-2 text-title font-semibold text-ink transition-colors duration-200 hover:bg-hover"
      >
        {label}
        <ChevronDown size={17} className="text-faint" />
      </button>

      <PeriodSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function PeriodSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const { filters, transactions, statements, settings } = state

  const months =
    settings.periodGrouping === 'statement'
      ? availableStatementMonths(statements)
      : availableMonths(transactions)

  const choose = (month: MonthKey | 'all') => {
    dispatch({ type: 'setFilters', filters: { month } })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Dönem" size="sm">
      <div className="-mx-2">
        {(['all', ...months] as Array<MonthKey | 'all'>).map((month) => {
          const selected = filters.month === month
          return (
            <Row key={month} onClick={() => choose(month)} active={selected}>
              <span className={clsx('flex-1 text-body', selected ? 'font-semibold text-ink' : 'text-muted')}>
                {month === 'all' ? 'Tüm dönemler' : monthLabel(month)}
              </span>
              {selected && <Check size={17} className="shrink-0 text-accent" />}
            </Row>
          )
        })}
      </div>
    </Modal>
  )
}
