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
  // One statement line per instalment; refunds of the same plan cancel matching
  // instalment steps so returned/cancelled plans do not create phantom obligations.
  interface StepDraft {
    tx: Transaction
    current: number
    billedMonth: MonthKey
  }
  interface PlanBucket {
    id: string
    merchant: string
    amount: Money
    total: number
    netByStep: Map<number, number>
    draftByStep: Map<number, StepDraft>
    maxSeenStep: number
  }

  const buckets: PlanBucket[] = []

  for (const tx of transactions) {
    const inst = tx.installment
    if (!inst || inst.total <= 1 || (tx.kind !== 'expense' && tx.kind !== 'refund')) continue

    // A plan is identified by merchant + monthly amount + length. Allow a few
    // kuruş of rounding variance because banks absorb division remainders on
    // the final instalment (e.g. 349,33 / 349,33 / 349,34 for a ₺1.048 / 3 plan).
    const tolerance = Math.max(5, inst.total)
    let bucket = buckets.find(
      (b) => b.merchant === tx.merchant && b.total === inst.total && Math.abs(b.amount - tx.amount) <= tolerance,
    )
    if (!bucket) {
      bucket = {
        id: `${tx.merchant}|${tx.amount}|${inst.total}`,
        merchant: tx.merchant,
        amount: tx.amount,
        total: inst.total,
        netByStep: new Map(),
        draftByStep: new Map(),
        maxSeenStep: 0,
      }
      buckets.push(bucket)
    }

    const delta = tx.kind === 'expense' ? 1 : -1
    bucket.netByStep.set(inst.current, (bucket.netByStep.get(inst.current) ?? 0) + delta)
    if (inst.current > bucket.maxSeenStep) bucket.maxSeenStep = inst.current

    if (tx.kind === 'expense') {
      const billedMonth = billedMonthOf(tx)
      const prev = bucket.draftByStep.get(inst.current)
      if (!prev || billedMonth >= prev.billedMonth) {
        bucket.draftByStep.set(inst.current, { tx, current: inst.current, billedMonth })
      }
    }
  }

  const plans: InstallmentPlan[] = []

  for (const bucket of buckets) {
    const key = bucket.id
    // Pick the highest un-refunded instalment step; if every billed step was
    // cancelled/refunded (e.g. accelerated 1/5..5/5 return), omit the plan.
    let draft: StepDraft | null = null
    for (const [step, net] of bucket.netByStep) {
      if (net <= 0) continue
      const candidate = bucket.draftByStep.get(step)
      if (candidate && (!draft || step > draft.current)) draft = candidate
    }
    if (!draft) continue

    const { tx, current, billedMonth } = draft
    const total = bucket.total
    // When later steps of the same plan were billed and cancelled/refunded
    // (e.g. 1/4 paid, then 2/4..4/4 cancelled), no further instalments remain.
    const cancelledAfter =
      bucket.maxSeenStep > current && (bucket.netByStep.get(bucket.maxSeenStep) ?? 0) <= 0

    // Instalments not yet billed on any statement we hold — the bank's own count
    // when the statement prints one, otherwise what the plan length implies.
    const stated = tx.installment?.remaining
    const unbilled = cancelledAfter ? 0 : (stated ? stated.count : Math.max(0, total - current))
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
      paidCount: cancelledAfter ? current : Math.min(total, current + elapsed),
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
