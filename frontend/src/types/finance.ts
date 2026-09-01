// ─── Transaction (Raw & Categorized) ─────────────────────────────────────────

export interface Transaction {
  id: string
  type: 'expense' | 'income'
  isManual?: boolean
  bank: string
  date: string
  description: string
  amount: number
  installment: string | null
  category: string
  raw_line?: string
}

// ─── Upload Response ──────────────────────────────────────────────────────────

export interface UploadResponse {
  bank: string
  transaction_count: number
  transactions: Transaction[]
}

// ─── Analysis Types ───────────────────────────────────────────────────────────

export interface CategoryTotal {
  name: string
  total: number
  percentage: number
  color: string
}

export interface DailyPoint {
  date: string
  label: string
  amount: number
  moving_avg: number
}

export interface Merchant {
  name: string
  total: number
  count: number
  category: string
}

export interface InstallmentMonth {
  month: string
  label: string
  total: number
  breakdown: Record<string, number>
}

export interface Subscription {
  merchant: string
  monthly_amount: number
  annual_cost: number
  payment_count: number
  category: string
  price_increase_pct: number | null
  last_payment_date: string
}

export interface WeekdayPoint {
  day: string
  dayIndex: number
  total: number
  count: number
  avg: number
}

export interface HealthScore {
  score: number
  label: string
  color: 'green' | 'yellow' | 'red' | 'gray'
  breakdown: Array<{ rule: string; points: number }>
}

export interface Summary {
  total_spending: number
  transaction_count: number
  top_category: CategoryTotal
  health_score: HealthScore
}

export interface AnalysisResult {
  summary: Summary
  category_totals: CategoryTotal[]
  daily_trend: DailyPoint[]
  top_merchants: Merchant[]
  installment_projection: InstallmentMonth[]
  subscriptions: Subscription[]
  weekday_heatmap: WeekdayPoint[]
}

// ─── App State ────────────────────────────────────────────────────────────────

export type AppView = 'upload' | 'processing' | 'dashboard'

export interface FinancialProfile {
  monthlyIncome: number
  spendingLimit: number
  savingsGoal: number
}
