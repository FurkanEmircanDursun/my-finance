import type { Money } from '../core/money'
import type { Reconciliation, StatementSummary, TxKind } from '../domain/types'

/**
 * Checks the parsed rows against the bank's own arithmetic.
 *
 * A card statement is a ledger that must balance:
 *
 *   debt at the cut date = previous balance − payments + charges
 *
 * The cover prints the debt and the previous balance, and the payments are rows
 * we parse, so the charges the bank *must* have booked fall out:
 *
 *   expected charges = printed debt − previous balance + payments
 *
 * Whatever the parser counted as spending (purchases minus refunds, interest
 * included) has to equal that to the kuruş. When it does, every row was read,
 * every sign was right and nothing was counted that the bank does not count.
 * When it does not, the difference is the size of the mistake — which is how
 * a few bonus-column rows turned out to be thousands of lira of phantom spending.
 *
 * It is a check, never a correction: nothing here changes a row.
 */
export function reconcile(
  rows: ReadonlyArray<{ kind: TxKind; amount: Money }>,
  summary: StatementSummary,
): Reconciliation {
  let expenses = 0
  let refunds = 0
  let payments = 0
  for (const row of rows) {
    if (row.kind === 'expense') expenses += row.amount
    else if (row.kind === 'refund') refunds += row.amount
    else if (row.kind === 'payment') payments += row.amount
  }

  const parsedCharges = expenses - refunds
  const { totalDebt, previousBalance } = summary

  // Without both cover figures there is nothing to compare against.
  if (totalDebt === null || previousBalance === null) {
    return {
      status: 'unverified',
      printedDebt: totalDebt,
      previousBalance,
      payments,
      parsedCharges,
      expectedCharges: null,
      delta: null,
    }
  }

  const expectedCharges = totalDebt - previousBalance + payments
  const delta = parsedCharges - expectedCharges

  return {
    status: delta === 0 ? 'match' : 'mismatch',
    printedDebt: totalDebt,
    previousBalance,
    payments,
    parsedCharges,
    expectedCharges,
    delta,
  }
}
