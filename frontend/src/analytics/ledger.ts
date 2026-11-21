import type { Money } from '../core/money'
import { reconcile } from '../ingest/reconcile'
import {
  cardOf, emptySummary, type Reconciliation, type Statement, type StatementSummary, type Transaction,
} from '../domain/types'

/**
 * A statement, laid out the way the bank lays it out, so that every figure the
 * app shows can be held up against the paper.
 *
 *   dönem borcu = önceki bakiye − ödemeler + dönem harcamaları
 *
 * and "dönem harcamaları" is, line by line, what the sections below add up to:
 * purchases, instalments, interest and fees, minus refunds. Payments are shown
 * beside them but are not spending — they settle last month's debt, which is why
 * a period's spending equals its closing debt only when last month was paid in
 * full, and why the equation is printed rather than assumed.
 *
 * Everything here is recomputed from the rows the app holds *now*, not from the
 * check made at import: delete a line and the statement says it no longer adds up.
 */

export type SectionId = 'purchases' | 'instalments' | 'fees' | 'refunds' | 'payments'

export interface LedgerSection {
  id: SectionId
  label: string
  /** Magnitude. Whether it adds to or comes off the charges is `sign`. */
  total: Money
  count: number
  /** +1 adds to the period's spending, −1 comes off it, 0 is not spending. */
  sign: 1 | -1 | 0
  rows: Transaction[]
}

export interface StatementLedger {
  statement: Statement
  card: string
  previousBalance: Money | null
  /** Card-debt payments among the rows. */
  payments: Money
  /** Purchases + instalments + fees − refunds, from the rows. */
  charges: Money
  printedDebt: Money | null
  /** printed debt − previous balance + payments: what the bank must have booked. */
  expectedCharges: Money | null
  /** charges − expectedCharges. Zero confirms the net total. */
  delta: Money | null
  status: Reconciliation['status']
  sections: LedgerSection[]
  rowCount: number
}

export interface LedgerTotals {
  charges: Money
  printedDebt: Money | null
  previousBalance: Money | null
  payments: Money
  rowCount: number
  /** The worst status among the statements, or null when there are none. */
  status: Reconciliation['status'] | null
}

const SECTIONS: Array<Pick<LedgerSection, 'id' | 'label' | 'sign'>> = [
  { id: 'purchases', label: 'Alışverişler', sign: 1 },
  { id: 'instalments', label: 'Taksitler', sign: 1 },
  { id: 'fees', label: 'Faiz ve ücretler', sign: 1 },
  { id: 'refunds', label: 'İade ve indirimler', sign: -1 },
  { id: 'payments', label: 'Kart borcu ödemeleri', sign: 0 },
]

function sectionOf(tx: Transaction): SectionId | null {
  if (tx.kind === 'refund') return 'refunds'
  if (tx.kind === 'payment') return 'payments'
  if (tx.kind !== 'expense') return null
  if (tx.category === 'fees') return 'fees'
  return tx.installment ? 'instalments' : 'purchases'
}

/** The cover figures the check needs, from the summary or — for older data — the stored check. */
function coverOf(statement: Statement): StatementSummary {
  const summary = statement.summary ?? emptySummary()
  const stored = statement.reconciliation
  return {
    ...summary,
    totalDebt: summary.totalDebt ?? stored?.printedDebt ?? null,
    previousBalance: summary.previousBalance ?? stored?.previousBalance ?? null,
  }
}

export function buildLedger(statement: Statement, transactions: readonly Transaction[]): StatementLedger {
  const rows = transactions.filter((tx) => tx.statementId === statement.id)
  const check = reconcile(rows, coverOf(statement))

  const sections: LedgerSection[] = SECTIONS.map((def) => ({ ...def, total: 0, count: 0, rows: [] }))
  const byId = new Map(sections.map((section) => [section.id, section]))

  for (const tx of rows) {
    const id = sectionOf(tx)
    const section = id ? byId.get(id) : undefined
    if (!section) continue
    section.rows.push(tx)
    section.total += tx.amount
    section.count += 1
  }

  for (const section of sections) {
    // Oldest first: the order a statement is read in, and the order a running
    // total makes sense in.
    section.rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }

  return {
    statement,
    card: cardOf(statement),
    previousBalance: check.previousBalance,
    payments: check.payments,
    charges: check.parsedCharges,
    printedDebt: check.printedDebt,
    expectedCharges: check.expectedCharges,
    delta: check.delta,
    status: check.status,
    sections: sections.filter((section) => section.count > 0),
    rowCount: rows.length,
  }
}

const RANK: Record<Reconciliation['status'], number> = { mismatch: 2, unverified: 1, match: 0 }

export function buildLedgers(
  statements: readonly Statement[],
  transactions: readonly Transaction[],
): { ledgers: StatementLedger[]; totals: LedgerTotals } {
  const ledgers = statements.map((statement) => buildLedger(statement, transactions))

  let charges = 0
  let payments = 0
  let rowCount = 0
  let printedDebt: Money | null = null
  let previousBalance: Money | null = null
  let status: Reconciliation['status'] | null = null

  for (const ledger of ledgers) {
    charges += ledger.charges
    payments += ledger.payments
    rowCount += ledger.rowCount
    if (ledger.printedDebt !== null) printedDebt = (printedDebt ?? 0) + ledger.printedDebt
    if (ledger.previousBalance !== null) previousBalance = (previousBalance ?? 0) + ledger.previousBalance
    if (status === null || RANK[ledger.status] > RANK[status]) status = ledger.status
  }

  return { ledgers, totals: { charges, printedDebt, previousBalance, payments, rowCount, status } }
}
