import {
  addMonths, daysInMonth, dayLabel, dayOfMonth, eachDay, eachMonth,
  monthLabel, monthOf, toEpochDay, weekdayIndex,
  WEEKDAY_LABELS, WEEKDAY_SHORT, type DayKey, type MonthKey,
} from '../core/date'
import { round, type Money } from '../core/money'
import { concentration, linearTrend, median } from '../core/stats'
import { displayMerchant } from '../core/text'
import { CATEGORIES, category, type CategoryId, type SpendNature } from '../domain/categories'
import { effectiveDate, type Profile, type Transaction } from '../domain/types'
import { detectAnomalies, detectDuplicates, detectHabits } from './anomaly'
import { buildBudgetProgress } from './budgets'
import { buildCommitmentLadder, buildInstallmentPlans } from './commitments'
import { computeCashFlowForecast } from './forecast'
import { computeGoalProgress } from './goal'
import { computeHealth } from './health'
import { buildInsights } from './insights'
import { detectRecurring } from './recurring'
import type {
  Analysis, BankStat, CategoryMover, CategoryStat, DailyPoint,
  MerchantStat, MonthlyPoint, NatureStat, Totals, TrendReport, WeekdayPoint,
} from './types'

const COMMITMENT_HORIZON = 12
const FORECAST_HORIZON_DAYS = 90

/**
 * How the analysis should group transactions into months.
 *
 * The filter bar can group by a statement's own billing period rather than by
 * calendar month (see `Settings.periodGrouping`). Without this the chips said
 * "Ağustos" while every chart, the month-over-month trend and the savings goal
 * underneath still counted calendar months — the same data reported two ways
 * on one screen.
 */
export interface AnalysisContext {
  /** The month a transaction belongs to; defaults to its calendar month. */
  monthOfTx?: (tx: Transaction) => MonthKey
  /** Whether a month's data is known to be incomplete; defaults to a day-of-month rule. */
  isPartialMonth?: (month: MonthKey) => boolean
  /**
   * How many days of a month the statements actually cover, used to scale
   * assumed income. Defaults to a whole month.
   */
  coverageDaysOf?: (month: MonthKey) => number | undefined
  /**
   * The month a row was billed in — its statement's month — used to place
   * instalment plans. Defaults to the row's effective date's month.
   */
  billedMonthOf?: (tx: Transaction) => MonthKey
  /** Memoisation key — must change whenever the functions above would behave differently. */
  key?: string
}

/**
 * One pass over the transactions fills every accumulator; the derived reports
 * then read from those maps instead of re-scanning the array.
 *
 * The old analyzer walked the full list seven times (categories, daily trend,
 * merchants, instalments, subscriptions, weekday, health — plus a second
 * category pass inside health) and did so again on every category edit.
 */
interface Accumulators {
  totals: Totals
  byDay: Map<DayKey, Money>
  byMonth: Map<MonthKey, { spend: Money; income: Money; refunds: Money; count: number; spendRows: number }>
  byCategory: Map<string, Transaction[]>
  byMerchant: Map<string, Transaction[]>
  byBank: Map<string, { total: Money; count: number }>
  byMonthCategory: Map<MonthKey, Map<CategoryId, Money>>
  weekday: Array<{ total: Money; count: number }>
  minDate: DayKey | null
  maxDate: DayKey | null
  spendCount: number
}

function accumulate(
  transactions: readonly Transaction[],
  monthOfTx: (tx: Transaction) => MonthKey,
): Accumulators {
  const acc: Accumulators = {
    totals: {
      spend: 0, refunds: 0, netSpend: 0, income: 0, payments: 0, net: 0,
      incomeBasis: 0, savings: 0, incomeAssumed: false, unallocatedRefunds: 0,
    },
    byDay: new Map(),
    byMonth: new Map(),
    byCategory: new Map(),
    byMerchant: new Map(),
    byBank: new Map(),
    byMonthCategory: new Map(),
    weekday: Array.from({ length: 7 }, () => ({ total: 0, count: 0 })),
    minDate: null,
    maxDate: null,
    spendCount: 0,
  }

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i]
    const month = monthOfTx(tx)
    // The day it was charged, not the day an instalment's purchase was made.
    const day = effectiveDate(tx)

    if (!acc.minDate || day < acc.minDate) acc.minDate = day
    if (!acc.maxDate || day > acc.maxDate) acc.maxDate = day

    let monthBucket = acc.byMonth.get(month)
    if (!monthBucket) {
      monthBucket = { spend: 0, income: 0, refunds: 0, count: 0, spendRows: 0 }
      acc.byMonth.set(month, monthBucket)
    }
    monthBucket.count++
    if (tx.kind === 'expense' || tx.kind === 'refund') monthBucket.spendRows++

    switch (tx.kind) {
      case 'expense': {
        acc.totals.spend += tx.amount
        acc.spendCount++
        monthBucket.spend += tx.amount

        acc.byDay.set(day, (acc.byDay.get(day) ?? 0) + tx.amount)

        const wd = acc.weekday[weekdayIndex(day)]
        wd.total += tx.amount
        wd.count++

        const bank = acc.byBank.get(tx.bank)
        if (bank) {
          bank.total += tx.amount
          bank.count++
        } else {
          acc.byBank.set(tx.bank, { total: tx.amount, count: 1 })
        }

        let monthCats = acc.byMonthCategory.get(month)
        if (!monthCats) {
          monthCats = new Map()
          acc.byMonthCategory.set(month, monthCats)
        }
        monthCats.set(tx.category, (monthCats.get(tx.category) ?? 0) + tx.amount)
        break
      }
      case 'refund': {
        acc.totals.refunds += tx.amount
        monthBucket.refunds += tx.amount

        // A refund comes off the category and bank it was spent in, so the
        // breakdowns describe what the money actually cost. Left alone they
        // summed to the gross while the headline said net, and a return made
        // the two disagree on every screen that showed both.
        let monthCats = acc.byMonthCategory.get(month)
        if (!monthCats) {
          monthCats = new Map()
          acc.byMonthCategory.set(month, monthCats)
        }
        monthCats.set(tx.category, (monthCats.get(tx.category) ?? 0) - tx.amount)

        const bank = acc.byBank.get(tx.bank)
        if (bank) bank.total -= tx.amount
        else acc.byBank.set(tx.bank, { total: -tx.amount, count: 0 })
        break
      }
      case 'income':
        acc.totals.income += tx.amount
        monthBucket.income += tx.amount
        break
      case 'payment':
        acc.totals.payments += tx.amount
        break
    }

    // Category and merchant buckets keep every kind: the recurring detector and
    // the anomaly detector filter to what they need.
    const catBucket = acc.byCategory.get(tx.category)
    if (catBucket) catBucket.push(tx)
    else acc.byCategory.set(tx.category, [tx])

    const merchBucket = acc.byMerchant.get(tx.merchant)
    if (merchBucket) merchBucket.push(tx)
    else acc.byMerchant.set(tx.merchant, [tx])
  }

  acc.totals.netSpend = acc.totals.spend - acc.totals.refunds
  acc.totals.net = acc.totals.income - acc.totals.netSpend
  return acc
}

interface CategoryBreakdown {
  stats: CategoryStat[]
  /**
   * Refunds that exceed what was spent in their category within the data —
   * typically a return in a later period than the purchase, or a card credit
   * such as chip-para. They still reduce `netSpend`; this is how much of that
   * reduction the category list cannot show.
   */
  unallocatedRefunds: Money
}

function buildCategoryStats(acc: Accumulators, monthsCovered: number): CategoryBreakdown {
  const rows: Array<Omit<CategoryStat, 'share'>> = []
  let unallocatedRefunds = 0

  for (const [id, txs] of acc.byCategory) {
    const spendTxs = txs.filter((t) => t.kind === 'expense')
    const refunded = txs.reduce((sum, t) => (t.kind === 'refund' ? sum + t.amount : sum), 0)

    if (!spendTxs.length) {
      unallocatedRefunds += refunded
      continue
    }

    const def = category(id as CategoryId)
    const gross = spendTxs.reduce((s, t) => s + t.amount, 0)
    const net = Math.max(0, gross - refunded)
    unallocatedRefunds += Math.max(0, refunded - gross)

    rows.push({
      id: def.id,
      label: def.label,
      color: def.color,
      nature: def.nature,
      total: net,
      gross,
      refunded: Math.min(refunded, gross),
      count: spendTxs.length,
      median: median(spendTxs.map((t) => t.amount)),
      monthlyAverage: Math.round(net / Math.max(monthsCovered, 1)),
    })
  }

  const base = rows.reduce((sum, r) => sum + r.total, 0)
  const stats = rows
    .map((r) => ({ ...r, share: base ? r.total / base : 0 }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)

  return { stats, unallocatedRefunds }
}

function buildNatureStats(categories: readonly CategoryStat[]): NatureStat[] {
  const spend = categories.reduce((sum, c) => sum + c.total, 0)
  const totals = new Map<SpendNature, Money>()
  for (const c of categories) totals.set(c.nature, (totals.get(c.nature) ?? 0) + c.total)

  const order: SpendNature[] = ['need', 'mixed', 'want', 'neutral']
  return order
    .map((nature) => ({
      nature,
      total: totals.get(nature) ?? 0,
      share: spend ? (totals.get(nature) ?? 0) / spend : 0,
    }))
    .filter((n) => n.total > 0)
}

function buildMerchantStats(acc: Accumulators, limit = 40): MerchantStat[] {
  const rows: Array<Omit<MerchantStat, 'share'>> = []

  for (const [merchant, txs] of acc.byMerchant) {
    const spendTxs = txs.filter((t) => t.kind === 'expense')
    if (!spendTxs.length) continue

    const refunded = txs.reduce((sum, t) => (t.kind === 'refund' ? sum + t.amount : sum), 0)
    const amounts = spendTxs.map((t) => t.amount)
    const gross = amounts.reduce((a, b) => a + b, 0)
    const total = Math.max(0, gross - refunded)
    if (total === 0) continue // bought and fully returned: nothing was spent here

    let first = spendTxs[0].date
    let last = spendTxs[0].date
    for (const tx of spendTxs) {
      if (tx.date < first) first = tx.date
      if (tx.date > last) last = tx.date
    }

    rows.push({
      merchant,
      label: displayMerchant(merchant),
      category: spendTxs[0].category,
      total,
      count: spendTxs.length,
      median: median(amounts),
      firstSeen: first,
      lastSeen: last,
    })
  }

  const base = rows.reduce((sum, r) => sum + r.total, 0)
  return rows
    .map((r) => ({ ...r, share: base ? r.total / base : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

/** A month's per-category totals with refunds applied, never below zero. */
function netCategoryMap(map: Map<CategoryId, Money> | undefined): Map<CategoryId, Money> {
  const out = new Map<CategoryId, Money>()
  for (const [id, value] of map ?? []) if (value > 0) out.set(id, value)
  return out
}

/** Gap-filled daily series with a centred 7-day mean. */
function buildDaily(acc: Accumulators): DailyPoint[] {
  if (!acc.minDate || !acc.maxDate) return []

  const days = eachDay(acc.minDate, acc.maxDate)
  const amounts = days.map((d) => acc.byDay.get(d) ?? 0)

  const window = 7
  const half = window >> 1
  const trend: number[] = new Array(days.length)

  // Prefix sums keep the moving average O(n) regardless of window size.
  const prefix: number[] = new Array(amounts.length + 1)
  prefix[0] = 0
  for (let i = 0; i < amounts.length; i++) prefix[i + 1] = prefix[i] + amounts[i]

  for (let i = 0; i < amounts.length; i++) {
    const lo = Math.max(0, i - half)
    const hi = Math.min(amounts.length - 1, i + half)
    trend[i] = Math.round((prefix[hi + 1] - prefix[lo]) / (hi - lo + 1))
  }

  return days.map((date, i) => ({
    date,
    label: dayLabel(date),
    amount: amounts[i],
    trend: trend[i],
    weekend: weekdayIndex(date) >= 5,
  }))
}

const DAYS_PER_MONTH = 30.44

function buildMonthly(
  acc: Accumulators,
  monthlyIncome: Money,
  isPartialMonth?: (month: MonthKey) => boolean,
  coverageDaysOf?: (month: MonthKey) => number | undefined,
): MonthlyPoint[] {
  if (!acc.minDate || !acc.maxDate || acc.byMonth.size === 0) return []

  // The span comes from the bucket keys, not from the dates: under statement
  // grouping a transaction's month is the statement's name, which need not be
  // the calendar month its date falls in.
  const keys = [...acc.byMonth.keys()].sort()
  const firstMonth = keys[0]
  const lastMonth = keys[keys.length - 1]
  const months = eachMonth(firstMonth, lastMonth)

  return months.map((month) => {
    const bucket = acc.byMonth.get(month) ?? { spend: 0, income: 0, refunds: 0, count: 0, spendRows: 0 }
    const partial = isPartialMonth
      ? isPartialMonth(month)
      : (month === firstMonth && dayOfMonth(acc.minDate!) > 3) ||
        (month === lastMonth && dayOfMonth(acc.maxDate!) < daysInMonth(month) - 2)

    const netSpend = bucket.spend - bucket.refunds
    const covered = bucket.spendRows > 0
    const incomeAssumed = bucket.income === 0 && monthlyIncome > 0
    // Assumed income is prorated to the days the statements actually cover, so
    // a 55-day opening statement is credited with the ~1.8 months of salary
    // that really arrived during it rather than a single month's worth.
    const coverageDays = coverageDaysOf?.(month)
    const assumedIncome = coverageDays
      ? Math.round((monthlyIncome * coverageDays) / DAYS_PER_MONTH)
      : monthlyIncome
    const incomeBasis = bucket.income > 0 ? bucket.income : assumedIncome

    return {
      month,
      label: monthLabel(month, true),
      spend: bucket.spend,
      income: bucket.income,
      refunds: bucket.refunds,
      net: bucket.income - netSpend,
      count: bucket.count,
      partial,
      covered,
      incomeBasis,
      incomeAssumed,
      savings: incomeBasis - netSpend,
    }
  })
}

function buildWeekday(acc: Accumulators): WeekdayPoint[] {
  return acc.weekday.map((bucket, index) => ({
    index,
    label: WEEKDAY_LABELS[index],
    short: WEEKDAY_SHORT[index],
    total: bucket.total,
    count: bucket.count,
    average: bucket.count ? Math.round(bucket.total / bucket.count) : 0,
    share: acc.totals.spend ? bucket.total / acc.totals.spend : 0,
  }))
}

function buildBanks(acc: Accumulators): BankStat[] {
  const rows = [...acc.byBank.entries()].map(([bank, b]) => ({ bank, total: Math.max(0, b.total), count: b.count }))
  const base = rows.reduce((sum, r) => sum + r.total, 0)
  return rows
    .map((r) => ({ ...r, share: base ? r.total / base : 0 }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}

function buildTrend(
  acc: Accumulators,
  monthly: readonly MonthlyPoint[],
  calendarMonths: boolean,
  /** Days of real coverage; the daily average divides by these, not by the raw span. */
  coveredDays: number,
): TrendReport {
  const full = monthly.filter((m) => !m.partial)
  const series = full.map((m) => m.spend)

  const latest = monthly[monthly.length - 1]
  const previous = monthly[monthly.length - 2]

  let momPct: number | null = null
  if (full.length >= 2) {
    const a = full[full.length - 2].spend
    const b = full[full.length - 1].spend
    momPct = a > 0 ? round(((b - a) / a) * 100, 1) : null
  }

  // Movers compare the two most recent months present in the data, whether or
  // not they are complete — the labels say which months they are.
  const movers: CategoryMover[] = []
  if (latest && previous) {
    const currentMap = acc.byMonthCategory.get(latest.month) ?? new Map()
    const previousMap = acc.byMonthCategory.get(previous.month) ?? new Map()
    const ids = new Set<CategoryId>([...currentMap.keys(), ...previousMap.keys()])

    for (const id of ids) {
      const current = Math.max(0, currentMap.get(id) ?? 0)
      const prev = Math.max(0, previousMap.get(id) ?? 0)
      if (current === 0 && prev === 0) continue
      const def = category(id)
      movers.push({
        id,
        label: def.label,
        color: def.color,
        previous: prev,
        current,
        delta: current - prev,
        deltaPct: prev > 0 ? round(((current - prev) / prev) * 100, 1) : null,
      })
    }
    movers.sort((a, b) => b.delta - a.delta)
  }

  // A month-end projection is only meaningful when the month in progress
  // actually has spending in it. Statement data routinely ends a few days into
  // a month that no statement covers yet, and extrapolating from those empty
  // days produced a confident "ay sonu tahmini ₺0" on the overview.
  //
  // It is also strictly a calendar-month idea: under statement grouping the
  // "month" runs from one billing date to the next, so "ay sonu" has no fixed
  // day to extrapolate to and the tile falls back to the monthly average.
  const MIN_PROJECTION_ROWS = 5
  let projectedMonthEnd: Money | null = null
  let projectionBasisDays = 0
  if (calendarMonths && latest && latest.partial && latest.covered && acc.maxDate && monthOf(acc.maxDate) === latest.month) {
    const rows = acc.byMonth.get(latest.month)?.spendRows ?? 0
    const elapsed = dayOfMonth(acc.maxDate)
    projectionBasisDays = elapsed
    if (elapsed >= 5 && rows >= MIN_PROJECTION_ROWS) {
      projectedMonthEnd = Math.round((latest.spend / elapsed) * daysInMonth(latest.month))
    }
  }

  const spanDays =
    acc.minDate && acc.maxDate ? toEpochDay(acc.maxDate) - toEpochDay(acc.minDate) + 1 : 0
  const totalDays = coveredDays > 0 ? coveredDays : spanDays
  const fit = linearTrend(series)

  return {
    momPct,
    movers,
    projectedMonthEnd,
    projectionBasisDays,
    averageDailySpend: totalDays ? Math.round(acc.totals.netSpend / totalDays) : 0,
    slopePerMonth: Math.round(fit.slope),
    trendFit: round(fit.r2, 2),
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function analyze(
  transactions: readonly Transaction[],
  profile: Profile,
  context: AnalysisContext = {},
): Analysis {
  const calendarMonths = !context.monthOfTx
  const acc = accumulate(transactions, context.monthOfTx ?? ((tx) => monthOf(effectiveDate(tx))))

  const monthly = buildMonthly(acc, profile.monthlyIncome, context.isPartialMonth, context.coverageDaysOf)

  // Months with no spending rows are outside what the statements cover, and a
  // covered month is only worth the days actually covered. Both corrections
  // matter: without the first an empty trailing month halves every "per month"
  // figure, and without the second a long opening statement doubles it.
  const coveredMonths = monthly.filter((m) => m.covered)
  const coveredDays = coveredMonths.reduce(
    (sum, m) => sum + (context.coverageDaysOf?.(m.month) ?? daysInMonth(m.month)),
    0,
  )
  const monthsEquivalent = coveredDays > 0 ? coveredDays / DAYS_PER_MONTH : Math.max(coveredMonths.length, 1)
  const monthsCovered = Math.max(monthsEquivalent, 1)

  // The period's cash result on the same basis the goal runs on, so the two
  // never disagree about whether the period was a saving one.
  acc.totals.incomeBasis = coveredMonths.reduce((sum, m) => sum + m.incomeBasis, 0)
  acc.totals.savings = acc.totals.incomeBasis - acc.totals.netSpend
  acc.totals.incomeAssumed = coveredMonths.some((m) => m.incomeAssumed)

  const { stats: categories, unallocatedRefunds } = buildCategoryStats(acc, monthsCovered)
  acc.totals.unallocatedRefunds = unallocatedRefunds
  const natures = buildNatureStats(categories)
  const merchants = buildMerchantStats(acc)
  const daily = buildDaily(acc)
  const weekday = buildWeekday(acc)
  const banks = buildBanks(acc)
  const trend = buildTrend(acc, monthly, calendarMonths, coveredDays)

  const asOf: DayKey = acc.maxDate ?? '1970-01-01'
  const recurring = detectRecurring(acc.byMerchant, { asOf, kind: 'expense' })
  const recurringIncome = detectRecurring(acc.byMerchant, { asOf, kind: 'income' })
  const recurringMerchants = new Set(recurring.map((r) => r.merchant))

  // Plans advance one step per *statement*, so "where are we" is the newest month
  // any statement was billed in — not the newest date printed on a row, which an
  // instalment pushes months into the past.
  const billedMonthOf = context.billedMonthOf ?? ((tx: Transaction) => monthOf(effectiveDate(tx)))
  let asOfMonth = monthOf(asOf)
  for (const tx of transactions) {
    if (tx.source === 'manual') continue
    const billed = billedMonthOf(tx)
    if (billed > asOfMonth) asOfMonth = billed
  }
  const installments = buildInstallmentPlans(transactions, asOfMonth, billedMonthOf)
  const commitments = buildCommitmentLadder(installments, recurring, {
    fromMonth: addMonths(asOfMonth, 1),
    horizonMonths: COMMITMENT_HORIZON,
  })

  const forecast = computeCashFlowForecast({
    asOf,
    horizonDays: FORECAST_HORIZON_DAYS,
    monthlyIncome: profile.monthlyIncome,
    averageDailySpend: trend.averageDailySpend,
    activeRecurringExpense: recurring.filter((r) => r.status === 'active'),
    activeRecurringIncome: recurringIncome.filter((r) => r.status === 'active'),
    commitments,
    openingBalance: profile.currentBalance,
  })

  const anomalies = detectAnomalies(acc.byCategory, acc.byMerchant)
  const duplicates = detectDuplicates(acc.byMerchant, recurringMerchants)
  const habits = detectHabits(acc.byMerchant, monthsCovered)

  const otherTotal = categories.find((c) => c.id === 'other')?.total ?? 0
  const categorised = categories.reduce((sum, c) => sum + c.total, 0)
  const classifiedShare = categorised ? 1 - otherTotal / categorised : 1

  const discretionary = natures.find((n) => n.nature === 'want')?.share ?? 0
  const merchantConcentration = concentration(merchants.map((m) => m.total))

  // Progress is measured as of the last month a statement covers, not the last
  // month that holds any row at all: a lone manual salary entry dated after the
  // newest statement would otherwise count as a fully saved month.
  const lastCoveredMonth = [...monthly].reverse().find((m) => m.covered)?.month ?? asOfMonth
  const goal = profile.goal
    ? computeGoalProgress(profile.goal, monthly, lastCoveredMonth, profile.monthlyIncome)
    : null

  // Elapsed-day pacing is a calendar-month idea (see the month-end projection
  // above) — under statement grouping, or once the month is fully behind the
  // data, budgets still show spent-vs-limit, just without an extrapolation.
  const budgetElapsedDays =
    calendarMonths && acc.maxDate && monthOf(acc.maxDate) === lastCoveredMonth
      ? dayOfMonth(acc.maxDate)
      : null
  const budgets = {
    month: lastCoveredMonth,
    items: buildBudgetProgress(profile.budgets, netCategoryMap(acc.byMonthCategory.get(lastCoveredMonth)), {
      month: lastCoveredMonth,
      elapsedDays: budgetElapsedDays,
    }),
  }

  const health = computeHealth({
    netSpend: acc.totals.netSpend,
    monthlyIncome: profile.monthlyIncome,
    monthlySpend: Math.round(acc.totals.netSpend / monthsCovered),
    committedMonthly: commitments[0]?.total ?? 0,
    discretionaryShare: discretionary,
    monthlySeries: monthly.filter((m) => !m.partial).map((m) => m.spend),
    classifiedShare,
    concentration: merchantConcentration,
  })

  const partial: Omit<Analysis, 'insights'> = {
    meta: {
      transactionCount: transactions.length,
      spendCount: acc.spendCount,
      from: acc.minDate,
      to: acc.maxDate,
      days: acc.minDate && acc.maxDate ? toEpochDay(acc.maxDate) - toEpochDay(acc.minDate) + 1 : 0,
      months: monthly.map((m) => m.month),
      coveredDays,
      monthsEquivalent: round(monthsEquivalent, 2),
      classifiedShare: round(classifiedShare, 3),
    },
    totals: acc.totals,
    categories,
    natures,
    merchants,
    daily,
    monthly,
    weekday,
    banks,
    recurring,
    recurringIncome,
    installments,
    commitments,
    anomalies,
    duplicates,
    habits,
    trend,
    merchantConcentration: round(merchantConcentration, 3),
    health,
    goal,
    forecast,
    budgets,
  }

  return { ...partial, insights: buildInsights(partial, profile) }
}

// ─── Memoisation ──────────────────────────────────────────────────────────────

/**
 * Analysis is pure in (transactions, profile). Views re-render for reasons that
 * touch neither, so the result is cached against the transaction array identity
 * plus a profile signature. Category edits produce a new array and correctly
 * miss the cache.
 */
const cache = new WeakMap<readonly Transaction[], Map<string, Analysis>>()

function profileKey(profile: Profile): string {
  const g = profile.goal
  return [
    profile.monthlyIncome,
    profile.spendingLimit,
    profile.currentBalance,
    g ? `${g.targetAmount}:${g.targetMonth}:${g.startMonth}:${g.startingAmount}` : 'none',
    profile.budgets.map((b) => `${b.category}:${b.limit}`).join(','),
  ].join('|')
}

export function analyzeMemo(
  transactions: readonly Transaction[],
  profile: Profile,
  context: AnalysisContext = {},
): Analysis {
  let byProfile = cache.get(transactions)
  if (!byProfile) {
    byProfile = new Map()
    cache.set(transactions, byProfile)
  }

  const key = `${profileKey(profile)}|${context.key ?? 'calendar'}`
  const hit = byProfile.get(key)
  if (hit) return hit

  const result = analyze(transactions, profile, context)
  byProfile.set(key, result)
  return result
}

export const EMPTY_ANALYSIS_CATEGORIES = CATEGORIES
