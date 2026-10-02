import { addMonths, monthDiff, monthLabel, monthOf, type MonthKey } from '../core/date'
import { displayMerchant } from '../core/text'
import type { Money } from '../core/money'
import { effectiveDate, type Transaction } from '../domain/types'
import type { CommitmentMonth, InstallmentPlan, RecurringPayment } from './types'

/**
 * Forward-looking obligations: what is already committed before any new
 * spending decision is made.
 *
 * Three rules keep the numbers honest:
 *
 * 1. An instalment that has already been billed is never scheduled again. The
 *    old projection started every plan at the transaction's own month and
 *    counted the instalment on the statement, double-billing the current month.
 *
 * 2. "Remaining" means remaining *after the data ends*. A plan last seen as 2/3
 *    on a July statement has its third instalment due in August; if the data
 *    already runs to the end of August without showing it, that instalment is
 *    not a future obligation and must not be counted as one. Reporting it in
 *    the outstanding total while omitting it from the month-by-month ladder is
 *    what made the two figures on screen contradict each other.
 *
 * 3. A plan stands where its *statement* says, not where its row's date says. An
 *    instalment row prints the date of the original purchase, so a 2/3 instalment
 *    bought on 23 August and billed on the September statement looked like it had
 *    been billed in August — which made the third instalment look overdue rather
 *    than upcoming, and dropped the whole instalment from the next month's commitments. The
 *    billed month is therefore passed in, taken from the statement.
 */

export interface CommitmentOptions {
  /** First month of the projection — the month after the data ends. */
  fromMonth: MonthKey
  horizonMonths: number
}

export function buildInstallmentPlans(
  transactions: readonly Transaction[],
  /** Last month covered by the data; anything due before it is history. */
  asOfMonth: MonthKey,
  /** The month a row was billed in. Defaults to its effective date's month. */
  billedMonthOf: (tx: Transaction) => MonthKey = (tx) => monthOf(effectiveDate(tx)),
): InstallmentPlan[] {
  // One statement line per instalment; the latest line describes the plan state.
  interface Draft {
    tx: Transaction
    current: number
    total: number
    billedMonth: MonthKey
  }

  const drafts = new Map<string, Draft>()

  for (const tx of transactions) {
    const inst = tx.installment
    if (!inst || tx.kind !== 'expense' || inst.total <= 1) continue

    // A plan is identified by merchant + monthly amount + length, which stays
    // stable across the statements the plan spans.
    const key = `${tx.merchant}|${tx.amount}|${inst.total}`
    const existing = drafts.get(key)

    if (!existing || inst.current > existing.current) {
      drafts.set(key, { tx, current: inst.current, total: inst.total, billedMonth: billedMonthOf(tx) })
    }
  }

  const plans: InstallmentPlan[] = []

  for (const [key, draft] of drafts) {
    const { tx, current, total, billedMonth } = draft

    // Instalments not yet billed on any statement we hold — the bank's own count
    // when the statement prints one, otherwise what the plan length implies.
    const stated = tx.installment?.remaining
    const unbilled = stated ? stated.count : Math.max(0, total - current)
    // Of those, the ones whose due month has already passed within our data.
    const elapsed = Math.max(0, monthDiff(billedMonth, asOfMonth))
    const remainingCount = Math.max(0, unbilled - elapsed)

    const startMonth = addMonths(billedMonth, -(current - 1))

    plans.push({
      id: key,
      merchant: tx.merchant,
      label: displayMerchant(tx.merchant),
      category: tx.category,
      monthlyAmount: tx.amount,
      paidCount: Math.min(total, current + elapsed),
      totalCount: total,
      remainingCount,
      // The bank's remaining figure is per instalment and can differ from the
      // billed one by a few kuruş (a last instalment absorbs the rounding).
      remainingAmount: (stated?.amount ?? tx.amount) * remainingCount,
      principal: tx.installment?.principal ?? null,
      startMonth,
      endMonth: addMonths(startMonth, total - 1),
      bank: tx.bank,
    })
  }

  return plans.sort((a, b) => b.remainingAmount - a.remainingAmount)
}

export function buildCommitmentLadder(
  plans: readonly InstallmentPlan[],
  recurring: readonly RecurringPayment[],
  options: CommitmentOptions,
): CommitmentMonth[] {
  const { fromMonth, horizonMonths } = options
  const ladder: CommitmentMonth[] = []

  const activeRecurring = recurring.filter((r) => r.status === 'active')
  const recurringMonthly: Money = activeRecurring.reduce((sum, r) => sum + r.monthlyEquivalent, 0)

  for (let i = 0; i < horizonMonths; i++) {
    const month = addMonths(fromMonth, i)

    let installments = 0
    for (const plan of plans) {
      // Remaining instalments are billed in consecutive months starting with
      // the first month of the projection, by the definition of `remainingCount`.
      if (i < plan.remainingCount) installments += plan.remainingAmount / Math.max(plan.remainingCount, 1)
    }

    ladder.push({
      month,
      label: monthLabel(month, true),
      installments: Math.round(installments),
      recurring: recurringMonthly,
      total: Math.round(installments) + recurringMonthly,
    })
  }

  return ladder
}
