import { daysInMonth, eachDay, eachMonth, monthOf, type DayKey, type MonthKey } from '../core/date'
import { fold } from '../core/text'
import type { Filters, Settings, Statement, Transaction } from '../domain/types'
import type { TransactionWithStatement } from './state'

export interface FilterContext {
  periodGrouping: Settings['periodGrouping']
  statements: readonly Statement[]
}

/**
 * Maps each statement to the calendar month it is "named" after — its own
 * cut-off date, not the transaction dates inside it. A statement running
 * 27 Jul–26 Aug is "the August statement" even though most of its charges
 * happened in July; `periodEnd` is what a bank prints on the cover page, so
 * it is the more recognisable anchor than `periodStart`.
 */
export function buildStatementMonthIndex(statements: readonly Statement[]): Map<string, MonthKey> {
  const index = new Map<string, MonthKey>()
  for (const statement of statements) {
    const anchor = statement.periodEnd ?? statement.periodStart
    if (anchor) index.set(statement.id, monthOf(anchor))
  }
  return index
}

/**
 * Which calendar month a transaction counts under, given the active mode.
 *
 * In 'statement' mode this deliberately does *not* use the transaction's own
 * date: the whole point of the mode is that every charge on one statement —
 * including the handful from the tail end of the previous calendar month —
 * groups under that statement's month. A manual entry has no `statementId`,
 * so it always falls back to its own date.
 */
export function periodMonthOf(
  tx: Transaction,
  periodGrouping: Settings['periodGrouping'],
  statementMonths: Map<string, MonthKey>,
): MonthKey {
  if (periodGrouping === 'statement') {
    const statementId = (tx as TransactionWithStatement).statementId
    const grouped = statementId ? statementMonths.get(statementId) : undefined
    if (grouped) return grouped
  }
  return monthOf(tx.date)
}

/**
 * Filtering runs on every keystroke in the search box, so it is written as one
 * pass with the cheap predicates first and the folded query precomputed.
 */
export function applyFilters(
  transactions: readonly Transaction[],
  filters: Filters,
  context: FilterContext,
): Transaction[] {
  const { month, categories, banks, query, includeNonSpend } = filters
  const { periodGrouping, statements } = context

  const categorySet = categories.length ? new Set(categories) : null
  const bankSet = banks.length ? new Set(banks) : null
  const foldedQuery = query.trim() ? fold(query.trim()) : ''
  const statementMonths = month !== 'all' && periodGrouping === 'statement' ? buildStatementMonthIndex(statements) : null

  const out: Transaction[] = []

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i]

    if (!includeNonSpend && tx.kind !== 'expense' && tx.kind !== 'refund') continue
    if (month !== 'all' && periodMonthOf(tx, periodGrouping, statementMonths ?? EMPTY_MAP) !== month) continue
    if (categorySet && !categorySet.has(tx.category)) continue
    if (bankSet && !bankSet.has(tx.bank)) continue
    if (foldedQuery && !fold(tx.description).includes(foldedQuery) && !tx.merchant.includes(foldedQuery)) continue

    out.push(tx)
  }

  return out
}

const EMPTY_MAP = new Map<string, MonthKey>()

/** Calendar months present in the data, for the calendar-mode chip row. */
export function availableMonths(transactions: readonly Transaction[]): MonthKey[] {
  const months = new Set<MonthKey>()
  for (const tx of transactions) months.add(monthOf(tx.date))
  return [...months].sort().reverse()
}

/**
 * Statement-named months for the statement-mode chip row. One chip per month
 * covers every bank's statement for that month — picking "Ağustos 2026" shows
 * Akbank's and Garanti's August charges together, which is the reason this
 * mode exists (see `Settings.periodGrouping`).
 */
export function availableStatementMonths(statements: readonly Statement[]): MonthKey[] {
  const months = new Set<MonthKey>()
  for (const statement of statements) {
    const anchor = statement.periodEnd ?? statement.periodStart
    if (anchor) months.add(monthOf(anchor))
  }
  return [...months].sort().reverse()
}

/**
 * How many days of each month the imported statements actually cover.
 *
 * Assumed income has to be scaled by this. A first statement often spans far
 * more than a month (one here ran 5 Jul–28 Aug), and crediting it with a
 * single month's salary while charging it with two months of spending made
 * savings look catastrophic. Scaling also makes the calendar and statement
 * groupings agree on the same total instead of contradicting each other.
 */
export function coverageDaysByMonth(
  statements: readonly Statement[],
  periodGrouping: Settings['periodGrouping'],
): Map<MonthKey, number> {
  const days = new Map<MonthKey, Set<DayKey>>()

  const add = (month: MonthKey, from: DayKey, to: DayKey) => {
    let set = days.get(month)
    if (!set) {
      set = new Set()
      days.set(month, set)
    }
    for (const day of eachDay(from, to)) set.add(day)
  }

  for (const statement of statements) {
    const start = statement.periodStart ?? statement.periodEnd
    const end = statement.periodEnd ?? statement.periodStart
    if (!start || !end || end < start) continue

    if (periodGrouping === 'statement') {
      // The whole period counts towards the month the statement is named after.
      const anchor = monthOf(statement.periodEnd ?? start)
      add(anchor, start, end)
    } else {
      // Each calendar month gets only the slice of the period that falls in it.
      for (const month of eachMonth(monthOf(start), monthOf(end))) {
        const from = month === monthOf(start) ? start : `${month}-01`
        const to = month === monthOf(end) ? end : `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
        add(month, from, to)
      }
    }
  }

  const out = new Map<MonthKey, number>()
  for (const [month, set] of days) out.set(month, set.size)
  return out
}

export function availableBanks(transactions: readonly Transaction[]): string[] {
  const banks = new Set<string>()
  for (const tx of transactions) banks.add(tx.bank)
  return [...banks].sort()
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.month !== 'all' ||
    filters.categories.length > 0 ||
    filters.banks.length > 0 ||
    filters.query.trim() !== ''
  )
}
