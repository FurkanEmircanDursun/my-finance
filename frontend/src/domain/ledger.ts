import { hash } from '../core/hash'
import { monthOf, type MonthKey } from '../core/date'
import { normalizeMerchant } from '../core/text'
import type { Money } from '../core/money'
import type { CategoryId } from './categories'
import type { Transaction, TxKind } from './types'

/**
 * Monthly entries — the money a card statement never shows.
 *
 * A statement knows what was spent on the card and nothing else: no salary, no
 * rent, no cash. Without those the app can only ever answer "where did the card
 * money go", not "did I end the month up or down". Entries added here fill that
 * gap, and they are stored as ordinary manual `Transaction`s rather than as a
 * parallel structure, so every existing calculation — categories, the savings
 * goal, the cash-flow forecast, recurring detection — picks them up with no
 * special handling.
 *
 * They are dated to the first of their month. Rent and salary land near the
 * start of a month, and a fixed day keeps a re-entered row landing in the same
 * place rather than drifting.
 */

export interface LedgerDraft {
  month: MonthKey
  label: string
  amount: Money
  kind: Extract<TxKind, 'income' | 'expense'>
  category: CategoryId
}

export function ledgerDay(month: MonthKey): string {
  return `${month}-01`
}

export function buildLedgerTransaction(draft: LedgerDraft, seed = Date.now()): Transaction {
  const date = ledgerDay(draft.month)
  const label = draft.label.trim()
  const merchant = normalizeMerchant(label)

  return {
    id: hash(`ledger|${date}|${draft.amount}|${merchant}|${draft.kind}|${seed}`),
    date,
    description: label,
    merchant,
    amount: Math.abs(draft.amount),
    kind: draft.kind,
    // Hand-entered rows are never re-categorised by the automatic classifier:
    // the person entering "Kira" knows better than a keyword table does.
    category: draft.category,
    categoryLocked: true,
    bank: 'Manuel',
    accountLabel: draft.kind === 'income' ? 'Aylık gelir' : 'Aylık gider',
    installment: null,
    source: 'manual',
  }
}

/** One transaction per month, for an item that repeats — rent, salary, a loan instalment. */
export function buildLedgerSeries(draft: Omit<LedgerDraft, 'month'>, months: readonly MonthKey[]): Transaction[] {
  return months.map((month, index) => buildLedgerTransaction({ ...draft, month }, Date.now() + index))
}

export interface MonthLedger {
  month: MonthKey
  /** Income rows entered by hand. */
  income: Money
  /** Spending that came off a statement. */
  statementSpend: Money
  /** Spending entered by hand — rent, cash, anything off-card. */
  manualSpend: Money
  net: Money
  entries: Transaction[]
}

/**
 * Groups the hand-entered rows by month and pairs them with that month's
 * statement spending, which is what "tüm gelir, tüm gider, net" needs in one
 * row per month.
 */
export function buildMonthLedgers(
  transactions: readonly Transaction[],
  months: readonly MonthKey[],
): MonthLedger[] {
  const empty = () => ({ income: 0, statementSpend: 0, manualSpend: 0, entries: [] as Transaction[] })
  const byMonth = new Map<MonthKey, ReturnType<typeof empty>>()
  for (const month of months) byMonth.set(month, empty())

  for (const tx of transactions) {
    const bucket = byMonth.get(monthOf(tx.date))
    if (!bucket) continue

    const manual = tx.source === 'manual'
    if (manual) bucket.entries.push(tx)

    if (tx.kind === 'income') bucket.income += tx.amount
    else if (tx.kind === 'expense') {
      if (manual) bucket.manualSpend += tx.amount
      else bucket.statementSpend += tx.amount
    } else if (tx.kind === 'refund') {
      // A refund reduces the side it came back to, so the net stays honest.
      if (manual) bucket.manualSpend -= tx.amount
      else bucket.statementSpend -= tx.amount
    }
    // Card payments move money between the user's own accounts; counting them
    // would double the spending they settle.
  }

  return months.map((month) => {
    const bucket = byMonth.get(month) ?? empty()
    return {
      month,
      income: bucket.income,
      statementSpend: bucket.statementSpend,
      manualSpend: bucket.manualSpend,
      net: bucket.income - bucket.statementSpend - bucket.manualSpend,
      entries: bucket.entries.sort((a, b) => b.amount - a.amount),
    }
  })
}

/** Months of `year`, oldest first, stopping at `upTo` so future months are not offered for entry. */
export function monthsOfYear(year: number, upTo: MonthKey): MonthKey[] {
  const out: MonthKey[] = []
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    if (key > upTo) break
    out.push(key)
  }
  return out
}
