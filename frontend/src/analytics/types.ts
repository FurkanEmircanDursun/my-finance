import type { Money } from '../core/money'
import type { DayKey, MonthKey } from '../core/date'
import type { CategoryId, SpendNature } from '../domain/categories'
import type { Transaction } from '../domain/types'
import type { BudgetProgress } from './budgets'
import type { CashFlowForecast } from './forecast'
import type { GoalProgress } from './goal'

export interface CategoryStat {
  id: CategoryId
  label: string
  color: string
  nature: SpendNature
  /** Net of refunds booked in this category — what the category actually cost. */
  total: Money
  /** Purchases before refunds. */
  gross: Money
  /** Refunds credited back to this category (never more than `gross`). */
  refunded: Money
  /** Share of all category totals, so the list always adds up to 100%. */
  share: number
  /** Number of purchases. */
  count: number
  /** Median ticket — resistant to one large purchase. */
  median: Money
  monthlyAverage: Money
}

export interface NatureStat {
  nature: SpendNature
  total: Money
  share: number
}

export interface MerchantStat {
  merchant: string
  label: string
  category: CategoryId
  total: Money
  count: number
  median: Money
  firstSeen: DayKey
  lastSeen: DayKey
  share: number
}

export interface DailyPoint {
  date: DayKey
  label: string
  amount: Money
  /** Centred 7-day mean; flat ends are extended rather than truncated. */
  trend: Money
  weekend: boolean
}

export interface MonthlyPoint {
  month: MonthKey
  label: string
  /** Net spending in the month (expenses less refunds, floored at zero). */
  spend: Money
  /** Income actually present as rows in the data — usually zero on a card statement. */
  income: Money
  refunds: Money
  /** income − netSpend, from rows alone. */
  net: Money
  count: number
  /** Partial months are flagged so charts can dim them. */
  partial: boolean
  /**
   * True when a statement actually covers this month, i.e. it has at least one
   * spend or refund row. A month that only carries a manually entered salary
   * is *not* covered: it has no spending data, so treating it as a month where
   * everything was saved would be an artefact of missing statements.
   */
  covered: boolean
  /**
   * The income savings maths should use: the month's own income rows when it
   * has any, otherwise the profile's stated monthly income.
   *
   * A card statement never lists a salary, so reading income straight off the
   * rows made every month look like a total loss and produced alarming
   * savings-goal figures for anyone who had not hand-entered a salary row per
   * month — while the health score, which does read the profile, called the
   * same months healthy.
   */
  incomeBasis: Money
  /** True when `incomeBasis` came from the profile rather than from real rows. */
  incomeAssumed: boolean
  /** incomeBasis − netSpend. The number savings and goal maths run on. */
  savings: Money
}

export interface WeekdayPoint {
  index: number
  label: string
  short: string
  total: Money
  count: number
  average: Money
  share: number
}

export interface BankStat {
  bank: string
  total: Money
  count: number
  share: number
}

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual' | 'irregular'

export interface RecurringPayment {
  merchant: string
  label: string
  category: CategoryId
  cadence: Cadence
  cadenceLabel: string
  /** Median days between charges. */
  intervalDays: number
  occurrences: number
  lastAmount: Money
  medianAmount: Money
  /** Amount normalised to a calendar month, for comparing weekly vs annual. */
  monthlyEquivalent: Money
  annualCost: Money
  firstSeen: DayKey
  lastSeen: DayKey
  nextExpected: DayKey
  /** Percentage change between the first and the latest charge. */
  priceChangePct: number | null
  /** 0-1; only entries above the acceptance threshold are returned. */
  confidence: number
  status: 'active' | 'lapsed'
  transactionIds: string[]
}

export interface InstallmentPlan {
  id: string
  merchant: string
  label: string
  category: CategoryId
  monthlyAmount: Money
  paidCount: number
  totalCount: number
  remainingCount: number
  remainingAmount: Money
  principal: Money | null
  startMonth: MonthKey
  endMonth: MonthKey
  bank: string
}

export interface CommitmentMonth {
  month: MonthKey
  label: string
  installments: Money
  recurring: Money
  total: Money
}

export type AnomalyReason = 'category-outlier' | 'merchant-outlier' | 'first-time-large'

export interface Anomaly {
  transaction: Transaction
  reason: AnomalyReason
  /** Robust z-score against the comparison group. */
  score: number
  /** Median of the comparison group, for the "normally ₺X" phrasing. */
  baseline: Money
  note: string
}

export interface DuplicateGroup {
  merchant: string
  label: string
  amount: Money
  transactions: Transaction[]
  spanDays: number
  /** `high` is worth checking against the statement; `low` is probably a habit. */
  likelihood: 'high' | 'low'
}

export interface HabitStat {
  merchant: string
  label: string
  category: CategoryId
  count: number
  medianAmount: Money
  total: Money
  perMonth: number
  annualProjection: Money
}

export interface CategoryMover {
  id: CategoryId
  label: string
  color: string
  previous: Money
  current: Money
  delta: Money
  deltaPct: number | null
}

export interface TrendReport {
  /** Month-over-month change of total spend, latest full month vs the one before. */
  momPct: number | null
  movers: CategoryMover[]
  /** Projection for the latest (possibly partial) month. */
  projectedMonthEnd: Money | null
  projectionBasisDays: number
  averageDailySpend: Money
  slopePerMonth: Money
  /** Explained variance of the linear fit; low values mean "no real trend". */
  trendFit: number
}

export interface HealthComponent {
  id: string
  label: string
  /** 0-100, higher is better. */
  score: number
  weight: number
  detail: string
}

export interface HealthReport {
  score: number
  band: 'strong' | 'fair' | 'weak'
  label: string
  components: HealthComponent[]
}

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'positive'

export interface Insight {
  id: string
  severity: InsightSeverity
  title: string
  body: string
  /** Sorting weight; higher surfaces first. */
  weight: number
  /** Optional deep link target handled by the shell. */
  action?: { view: string; label: string }
}

export interface Totals {
  /** Gross spending before refunds. */
  spend: Money
  refunds: Money
  netSpend: Money
  /** Income actually present as rows — usually zero on a card statement. */
  income: Money
  payments: Money
  /** income − netSpend, from rows alone. */
  net: Money
  /**
   * Income for the covered period on the same basis the savings and goal maths
   * use: real rows where they exist, the profile's monthly income prorated to
   * the days covered where they do not.
   */
  incomeBasis: Money
  /** incomeBasis − netSpend: what was actually put aside over the covered period. */
  savings: Money
  /** True when any covered month had to assume income rather than read it. */
  incomeAssumed: boolean
  /**
   * Refunds the category list cannot absorb — a return in a later period than its
   * purchase, or a card credit like chip-para. `netSpend` already includes their
   * effect; Σ category totals − unallocatedRefunds = netSpend.
   */
  unallocatedRefunds: Money
}

export interface AnalysisMeta {
  transactionCount: number
  spendCount: number
  from: DayKey | null
  to: DayKey | null
  days: number
  months: MonthKey[]
  /**
   * Days of real statement coverage behind these figures — the union of the
   * imported statements' own periods, not the span between the first and last
   * transaction (which would include tails no statement covers).
   */
  coveredDays: number
  /**
   * `coveredDays` expressed in months, and the only divisor anything "per
   * month" should use. Counting buckets instead broke both ways: a 55-day
   * opening statement counted as one month made spending look double, and an
   * empty trailing month counted as a month made it look half.
   */
  monthsEquivalent: number
  /** Share of spend that landed in a real category rather than "Diğer". */
  classifiedShare: number
}

export interface Analysis {
  meta: AnalysisMeta
  totals: Totals
  categories: CategoryStat[]
  natures: NatureStat[]
  merchants: MerchantStat[]
  daily: DailyPoint[]
  monthly: MonthlyPoint[]
  weekday: WeekdayPoint[]
  banks: BankStat[]
  recurring: RecurringPayment[]
  /** Recurring income patterns (salary, rent income, …), detected the same way as recurring expenses. */
  recurringIncome: RecurringPayment[]
  installments: InstallmentPlan[]
  commitments: CommitmentMonth[]
  anomalies: Anomaly[]
  duplicates: DuplicateGroup[]
  habits: HabitStat[]
  trend: TrendReport
  merchantConcentration: number
  health: HealthReport
  /** Null when the user has not set a savings goal in Ayarlar. */
  goal: GoalProgress | null
  /** 90-day forward projection; views slice it down to 30/60/90 as needed. */
  forecast: CashFlowForecast
  /** Per-category progress against the limits set in Ayarlar, for the month the data currently covers. `items` is empty when no budgets are set. */
  budgets: { month: MonthKey; items: BudgetProgress[] }
  insights: Insight[]
}
