import type { AssetHolding } from './assets'
import type { AssetValuationSnapshot } from './assetsHistory'
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
  /**
   * What the bank says is still to come, as printed in the "Kalan Borç / Taksit"
   * column ("900.00x1" = one more instalment of 900,00). When the statement
   * states it, it is the authority; counting `total − current` is the fallback.
   */
  remaining?: { count: number; amount: Money }
}

/**
 * What a foreign-currency purchase originally cost, as the statement prints it
 * ("orjinal tutar 3.99 $"). `Transaction.amount` stays the TL figure billed.
 */
export interface ForeignAmount {
  /** Minor units of `currency` — 3.99 USD is 399. */
  amount: Money
  /** ISO 4217 code. */
  currency: string
}

export interface Transaction {
  /**
   * Stable content hash — deduplicates re-imports of the same statement. Built
   * by `ingest/identity.ts`; the instalment index and the bank are part of it,
   * so successive instalments of one purchase are distinct rows.
   */
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
  /** User-managed card, when explicitly selected during import. */
  cardId?: string
  installment: Installment | null
  source: TxSource
  /**
   * An instalment row prints the date of the *original purchase*, which can be
   * months before the statement that bills it. `billedOn` is the day it was
   * actually charged (the statement's cut date) and is what time-based analysis
   * — the daily rhythm, calendar months, "from … to …" — has to use; `date`
   * stays as printed. Absent when the two are the same.
   */
  billedOn?: DayKey
  /** The statement this row was imported from; absent on hand-entered rows. */
  statementId?: string
  /** Original foreign-currency price, when the statement discloses one. */
  foreign?: ForeignAmount
  /** Bonus / chip-para this purchase earned, in the programme's minor units. */
  reward?: Money
  raw?: string
}

/** The day a row counts towards in any analysis over time. */
export function effectiveDate(tx: Pick<Transaction, 'date' | 'billedOn'>): DayKey {
  return tx.billedOn ?? tx.date
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

/**
 * A statement line that was read and deliberately *not* counted as money — a
 * bonus earned, bonus spent, a campaign credit. Kept rather than dropped so the
 * person can see exactly what was left out and why.
 */
export type IgnoredReason = 'reward-earned' | 'reward-spent' | 'campaign'

export interface IgnoredRow {
  date: DayKey
  description: string
  /** Magnitude of the loyalty figure, in the programme's own minor units. */
  amount: Money
  reason: IgnoredReason
  raw: string
}

/**
 * Figures the bank prints on the statement cover. They are never used to
 * compute anything the person sees as their own spending — only to check that
 * the parsed rows add up to what the bank says (see `Reconciliation`) and to
 * keep the cover's facts (limit, next due date, interest rate) with the data.
 */
export interface StatementSummary {
  /** "Dönem Borcu" — what the bank says is owed at the cut date. */
  totalDebt: Money | null
  /** The balance carried in from the previous statement. */
  previousBalance: Money | null
  minPayment: Money | null
  creditLimit: Money | null
  availableLimit: Money | null
  cashAdvanceLimit: Money | null
  /** Monthly contractual interest rate, in percent (3.75 means %3,75). */
  interestMonthly: number | null
  previousCutDate: DayKey | null
  nextCutDate: DayKey | null
  nextDueDate: DayKey | null
  /** Bonus / chip-para programme balances. */
  loyalty: {
    programme: string
    earned: Money | null
    spent: Money | null
    balance: Money | null
  } | null
}

/**
 * Does the parse agree with the bank's own arithmetic?
 *
 *   debt = previous balance − payments + charges
 *   ⇒ charges the bank expects = printed debt − previous balance + payments
 *
 * `delta` is parsed − expected, in kuruş. Zero confirms the net total.
 */
export interface Reconciliation {
  status: 'match' | 'mismatch' | 'unverified'
  printedDebt: Money | null
  previousBalance: Money | null
  /** Card-debt payments found in the rows. */
  payments: Money
  /** Σ expense − Σ refund over the parsed rows. */
  parsedCharges: Money
  expectedCharges: Money | null
  delta: Money | null
}

export interface Statement {
  id: string
  /** Display name, e.g. "Garanti BBVA · Ağustos 2026". */
  label: string
  fileName: string
  /** SHA-256 of the original PDF bytes, scoped to the owning account. */
  pdfSha256?: string
  /** Cardholder name printed on the statement cover, when reliably detected. */
  cardholderName?: string
  bank: string
  /** "Akbank Axess", "Garanti Bonus Platinum" — as printed. */
  accountLabel?: string
  cardId?: string
  transactionCount: number
  /** Rows the parser saw but rejected — surfaced so coverage is auditable. */
  skippedCount: number
  periodStart: DayKey | null
  periodEnd: DayKey | null
  dueDate: DayKey | null
  importedAt: number
  engine: string
  summary?: StatementSummary
  reconciliation?: Reconciliation
  /** Loyalty and campaign lines that were read but not counted as money. */
  ignored?: IgnoredRow[]
}

export function emptySummary(): StatementSummary {
  return {
    totalDebt: null,
    previousBalance: null,
    minPayment: null,
    creditLimit: null,
    availableLimit: null,
    cashAdvanceLimit: null,
    interestMonthly: null,
    previousCutDate: null,
    nextCutDate: null,
    nextDueDate: null,
    loyalty: null,
  }
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

export type { CardBank } from './banks'

export interface CreditCard {
  id: string
  bank: import('./banks').CardBank
  name: string
  /** Last four digits only; the full card number is never requested. */
  last4?: string
  /** Optional custom card color preset ID; defaults to the bank's signature color when omitted. */
  color?: string
  statementDay: number
  entryDay: number
  remindersEnabled: boolean
}

export interface Profile {
  /** Optional so older backups and clients remain readable. */
  assets?: AssetHolding[]
  /** Genuine observed totals; older profiles do not contain a valuation history. */
  assetValuations?: AssetValuationSnapshot[]
  /** Optional for compatibility with older backups and synced profiles. */
  cards?: CreditCard[]
  /** Removed configurations retained so re-adding a card preserves import identity. */
  archivedCards?: CreditCard[]
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
  reminders?: import('./reminders').ReminderPreferences
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
  /**
   * A 4-digit app lock, salted and hashed (see `core/pin.ts`) — never the PIN
   * itself, since this object is exactly what cloud sync pushes to Firestore.
   * Both null or both set; never one without the other.
   */
  lockPinHash: string | null
  lockPinSalt: string | null
  /**
   * Whether the intro has been through once. Kept in settings rather than in
   * component state so it survives a reload, and so "Tanıtımı tekrar göster"
   * in Ayarlar is a single flag flip rather than a special route.
   */
  onboardingSeen: boolean
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
  /**
   * Cards, by `cardOf` — "Akbank Axess", "Garanti Bonus Platinum". A card and a
   * month name exactly one statement, which is the unit the bank's own totals
   * are printed for, so this is what lets every figure be checked against paper.
   */
  cards: string[]
  query: string
  /** Include payments/income rows in the transaction table. */
  includeNonSpend: boolean
}

export const emptyFilters: Filters = {
  month: 'all',
  categories: [],
  cards: [],
  query: '',
  includeNonSpend: true,
}

/** The card a row belongs to: the printed card name, or the bank when none was printed. */
export function cardOf(row: { accountLabel?: string; bank: string }): string {
  return row.accountLabel?.trim() || row.bank
}

// ─── Ingestion results ────────────────────────────────────────────────────────

export interface ParseResult {
  bank: string
  engine: string
  reportedCardLast4?: string
  cardholderName?: string
  accountLabel: string
  transactions: Transaction[]
  skipped: number
  periodStart: DayKey | null
  periodEnd: DayKey | null
  dueDate: DayKey | null
  label: string
  summary: StatementSummary
  reconciliation: Reconciliation
  printedTotalsMismatch?: boolean
  ignored: IgnoredRow[]
}

export type ImportErrorCode =
  | 'different_holder'
  | 'unsupported_bank'
  | 'reconciliation'
  | 'unreadable'
  | 'duplicate_cycle'
  | 'other'

export interface ImportOutcome {
  alreadyImported?: boolean
  existingMatchLabel?: string
  reportedCardLast4?: string
  cardholderName?: string
  warnings?: import('../ingest/ownership').ImportReviewWarning[]
  diagnosticReport?: { reportId: string; ext: 'pdf' | 'csv' | 'txt' }
  fileName: string
  ok: boolean
  added: number
  duplicates: number
  removed?: number
  error?: string
  errorCode?: ImportErrorCode
  statement?: Statement
}
