import type { Money } from '../core/money'
import { monthOf, type DayKey, type MonthKey } from '../core/date'
import type { CategoryId } from './categories'

// ─── Transactions ─────────────────────────────────────────────────────────────

export type TxKind =
  | 'expense' // money left the account
  | 'refund' // merchant returned money (reduces spend of its own category)
  | 'income' // salary, transfer in, statement-level credit
  | 'payment' // card debt payment — cash movement, never a spend

export type TxSource = 'statement' | 'manual' | 'csv'

export interface Installment {
  /** 1-based index of the instalment billed on this statement. */
  current: number
  total: number
  /** Original purchase price when the statement discloses it. */
  principal?: Money
}

export interface Transaction {
  /** Stable content hash — deduplicates re-imports of the same statement. */
  id: string
  date: DayKey
  /** Description as printed on the statement. */
  description: string
  /** Normalised grouping key, see core/text.ts. */
  merchant: string
  /** Always positive; direction is carried by `kind`. */
  amount: Money
  kind: TxKind
  category: CategoryId
  /** True when the user (or a learned rule) overrode the automatic category. */
  categoryLocked: boolean
  bank: string
  accountLabel: string
  installment: Installment | null
  source: TxSource
  raw?: string
}

/** Signed amount in "cash-flow" terms: expenses negative, income positive. */
export function signedAmount(tx: Transaction): Money {
  return tx.kind === 'expense' ? -tx.amount : tx.amount
}

/** Amount that counts towards spend analysis (refunds net out). */
export function spendAmount(tx: Transaction): Money {
  if (tx.kind === 'expense') return tx.amount
  if (tx.kind === 'refund') return -tx.amount
  return 0
}

export function isSpendKind(kind: TxKind): boolean {
  return kind === 'expense' || kind === 'refund'
}

// ─── Statements ───────────────────────────────────────────────────────────────

export interface Statement {
  id: string
  /** Display name, e.g. "Garanti BBVA · Ağustos 2026". */
  label: string
  fileName: string
  bank: string
  transactionCount: number
  /** Rows the parser saw but rejected — surfaced so coverage is auditable. */
  skippedCount: number
  periodStart: DayKey | null
  periodEnd: DayKey | null
  dueDate: DayKey | null
  importedAt: number
  engine: string
}

/**
 * True when a statement's own period crosses a calendar-month boundary — the
 * usual case, since a card cycle runs roughly "27th to 26th" rather than
 * matching the calendar. When this is true, "this month" and "this statement"
 * disagree about which transactions belong together, which is the ambiguity
 * `Settings.periodGrouping` resolves.
 */
export function statementSpansMonths(statement: Statement): boolean {
  if (!statement.periodStart || !statement.periodEnd) return false
  return monthOf(statement.periodStart) !== monthOf(statement.periodEnd)
}

// ─── User configuration ───────────────────────────────────────────────────────

export interface CategoryRule {
  id: string
  /** Normalised merchant key this rule binds to. */
  merchant: string
  category: CategoryId
  createdAt: number
}

export interface Budget {
  category: CategoryId
  /** Monthly ceiling in minor units. */
  limit: Money
}

/**
 * A savings target with a deadline, not just a monthly number. `startMonth`
 * anchors the trajectory chart — usually "now", but a user six months into
 * saving can set it in the past so the chart shows their real progress from
 * where they actually started, not from the day they opened Ayarlar.
 */
export interface SavingsGoal {
  targetAmount: Money
  targetMonth: MonthKey
  startMonth: MonthKey
  /** Already-saved amount at `startMonth`; 0 if starting from scratch. */
  startingAmount: Money
}

export interface Profile {
  monthlyIncome: Money
  /** Global monthly spend ceiling; 0 disables the pace widgets. */
  spendingLimit: Money
  /**
   * Cash on hand today. 0 means "not told", and the cash-flow forecast then
   * runs relative to today instead of as an absolute balance — the difference
   * between "you will spend ₺19.000 before payday" (true of most households)
   * and "you will run out of money", which are not the same warning.
   */
  currentBalance: Money
  budgets: Budget[]
  goal: SavingsGoal | null
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  /** Contact the local OCR service for scanned PDFs. */
  useLocalOcr: boolean
  ocrEndpoint: string
  /**
   * How the period chips and "this period" language group transactions.
   * `null` means the user has not been asked yet — the app still behaves as
   * `'calendar'` until they answer, so nothing changes for anyone who never
   * hits the ambiguity (statements that stay inside one calendar month).
   *
   *   'calendar'  — group by calendar month (1–30/31), splitting a statement
   *                 that crosses a month boundary across two periods.
   *   'statement' — group by each imported statement's own billing period,
   *                 keeping one statement's charges together even though they
   *                 span two calendar months.
   */
  periodGrouping: 'calendar' | 'statement' | null
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface Filters {
  /**
   * 'all' or a MonthKey. What "month" means depends on `Settings.periodGrouping`:
   * a calendar month in 'calendar' mode, or a statement's own billing month in
   * 'statement' mode (see `store/selectors.ts` `applyFilters`). One field
   * serves both so switching modes never leaves a second, invisible filter
   * from the other mode silently ANDed against it.
   */
  month: MonthKey | 'all'
  categories: CategoryId[]
  banks: string[]
  query: string
  /** Include payments/income rows in the transaction table. */
  includeNonSpend: boolean
}

export const emptyFilters: Filters = {
  month: 'all',
  categories: [],
  banks: [],
  query: '',
  includeNonSpend: true,
}

// ─── Ingestion results ────────────────────────────────────────────────────────

export interface ParseResult {
  bank: string
  engine: string
  transactions: Transaction[]
  skipped: number
  periodStart: DayKey | null
  periodEnd: DayKey | null
  dueDate: DayKey | null
  label: string
}

export interface ImportOutcome {
  fileName: string
  ok: boolean
  added: number
  duplicates: number
  error?: string
  statement?: Statement
}
