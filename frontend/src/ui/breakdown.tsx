import { count, money2 } from '../core/money'
import type { Money } from '../core/money'
import type { CategoryStat } from '../analytics/types'

/**
 * The foot of a category list: whatever the rows above do not show, and the total
 * they add up to.
 *
 * A list that stops at five rows, or that leaves out the refunds a category could
 * not absorb, will not add up to the figure above it — and a reader who adds it
 * up (this is a finance app; they do) concludes something is wrong. So the list
 * says what it left out, and the total is the headline figure itself, which the
 * rows now provably sum to:
 *
 *   Σ categories − refunds no category absorbed = net spending
 */
export function BreakdownFooter({
  categories,
  shown,
  refundsOutside,
  netSpend,
  onOpenRefunds,
}: {
  categories: readonly CategoryStat[]
  /** How many of `categories` the list above displays. */
  shown: number
  /** Refunds and discounts larger than the spending in their own category. */
  refundsOutside: Money
  netSpend: Money
  onOpenRefunds?: () => void
}) {
  const rest = categories.slice(shown)
  const restTotal = rest.reduce((sum, c) => sum + c.total, 0)
  const restCount = rest.reduce((sum, c) => sum + c.count, 0)

  return (
    <div className="mt-2 space-y-1 border-t border-line pt-3">
      {rest.length > 0 && (
        <Line
          label={`Diğer ${count(rest.length)} kategori`}
          note={`${count(restCount)} işlem`}
          value={money2(restTotal)}
        />
      )}
      {refundsOutside > 0 && (
        <Line
          label="İade ve indirimler"
          note="kategorisiz"
          value={money2(-refundsOutside)}
          onClick={onOpenRefunds}
        />
      )}
      <Line label="Toplam" value={money2(netSpend)} strong />
    </div>
  )
}

function Line({
  label,
  note,
  value,
  strong,
  onClick,
}: {
  label: string
  note?: string
  value: string
  strong?: boolean
  onClick?: () => void
}) {
  const body = (
    <>
      <span className={strong ? 'text-body font-semibold text-ink' : 'text-body text-muted'}>
        {label}
        {note && <span className="ml-2 text-label font-normal text-faint">{note}</span>}
      </span>
      <span className={`num shrink-0 text-body ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>{value}</span>
    </>
  )
  const base = 'flex min-h-[36px] items-baseline justify-between gap-3 rounded-[var(--radius)] px-2'
  if (!onClick) return <div className={base}>{body}</div>
  return (
    <button type="button" onClick={onClick} className={`${base} w-full text-left transition-colors duration-200 hover:bg-hover`}>
      {body}
    </button>
  )
}
