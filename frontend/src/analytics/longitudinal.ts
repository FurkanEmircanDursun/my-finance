import { addMonths, daysInMonth, eachDay, eachMonth, monthLabel, monthOf, toEpochDay, weekdayIndex, type DayKey, type MonthKey } from '../core/date'
import { median } from '../core/stats'
import { CATEGORIES, type CategoryId } from '../domain/categories'
import { ASSET_INSTRUMENTS, portfolioValue, type AssetHolding, type AssetQuotes } from '../domain/assets'
import { monthlyAssetValuations, type AssetValuationSnapshot } from '../domain/assetsHistory'
import { effectiveDate, type Statement, type Transaction } from '../domain/types'

export type MonthCoverage = 'complete' | 'current' | 'partial' | 'unverified' | 'missing'
export interface LongitudinalMonth {
  month: MonthKey
  label: string
  income: number
  grossSpend: number
  refunds: number
  netSpend: number
  /** Recorded income minus recorded net spending, not a verified balance or investment return. */
  recordedSurplus: number
  payments: number
  purchaseCount: number
  statementCount: number
  coverageDays: number
  elapsedDays: number
  status: MonthCoverage
  hasRecords: boolean
  hasIncome: boolean
  hasSpendingEvidence: boolean
  categories: Partial<Record<CategoryId, number>>
}
export interface LongitudinalCategory {
  id: CategoryId; label: string; color: string
  gross: number; refunds: number; net: number
  /** Pie charts cannot express credits. Signed net remains available separately. */
  pieValue: number; share: number; count: number
}
export interface LongitudinalMerchant {
  merchant: string; label: string; count: number
  gross: number; refunds: number; net: number; averageTicket: number | null
  firstSeen: DayKey; lastSeen: DayKey; months: number
}
export interface CategoryChange {
  id: CategoryId; label: string; color: string
  previous: number; current: number; delta: number; deltaPct: number | null
}
export interface MonthlyComparison {
  previousMonth: MonthKey; currentMonth: MonthKey
  previous: number; current: number; delta: number; deltaPct: number | null
  /** Even a mathematically correct change needs an incomplete-coverage warning. */
  partial: boolean
}
export interface AssetHistoryPoint {
  month: MonthKey; day: DayKey; totalMinor: number; observedAt: number
  origin: AssetValuationSnapshot['origin']
  /** Change between real adjacent monthly observations, including quantity changes. */
  deltaMinor: number | null; deltaPct: number | null
}
export interface LongitudinalInput {
  transactions: readonly Transaction[]
  statements: readonly Statement[]
  asOf: DayKey
  fromMonth?: MonthKey
  toMonth?: MonthKey
  holdings?: readonly AssetHolding[]
  quotes?: AssetQuotes
  assetValuations?: readonly AssetValuationSnapshot[]
}

interface MonthBucket {
  income: number; grossSpend: number; refunds: number; payments: number
  purchaseCount: number; refundCount: number; incomeCount: number; rowCount: number
  categories: Partial<Record<CategoryId, number>>
}
const emptyBucket = (): MonthBucket => ({ income: 0, grossSpend: 0, refunds: 0, payments: 0, purchaseCount: 0, refundCount: 0, incomeCount: 0, rowCount: 0, categories: {} })
const CATEGORY_MAP = new Map(CATEGORIES.map(category => [category.id, category]))
const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

function sum(...values: number[]): number {
  const total = values.reduce((amount, value) => amount + BigInt(value), 0n)
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError('Financial total exceeds safe integer range')
  return Number(total)
}
function validMonth(value: string): boolean { return /^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value) }
function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && validMonth(monthOf(value)) && Number(value.slice(8)) >= 1 && Number(value.slice(8)) <= daysInMonth(monthOf(value))
}
function validFinancialRow(transaction: Transaction): boolean {
  return validDay(effectiveDate(transaction)) && Number.isSafeInteger(transaction.amount) && transaction.amount > 0 && ['income', 'expense', 'refund', 'payment'].includes(transaction.kind)
}
function percentChange(previous: number, current: number): number | null { return previous > 0 ? sum(current, -previous) / previous * 100 : null }

export function dailyNetSpending(transactions: readonly Transaction[], month: MonthKey, asOf: DayKey, category: CategoryId | 'all') {
  if (!validMonth(month) || month > monthOf(asOf)) return []
  const lastDay = month === monthOf(asOf) ? asOf : `${month}-${daysInMonth(month)}`
  const days = new Map(eachDay(`${month}-01`, lastDay).map(date => [
    date, { date, net: 0n, count: 0 },
  ]))
  for (const row of transactions) {
    const bucket = days.get(effectiveDate(row))
    if (!bucket || !validFinancialRow(row) || (row.kind !== 'expense' && row.kind !== 'refund')) continue
    const id = CATEGORY_MAP.has(row.category) ? row.category : 'other'
    if (category !== 'all' && category !== id) continue
    bucket.net += BigInt(row.kind === 'refund' ? -row.amount : row.amount)
    bucket.count++
  }
  return [...days.values()].map(({ date, net, count }) => ({
    date, count, net: net <= BigInt(Number.MAX_SAFE_INTEGER) && net >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(net) : null,
  }))
}

export function compareMonthlySpending(months: readonly LongitudinalMonth[], month: MonthKey, category: CategoryId | 'all') {
  const focus = months.find(row => row.month === month && row.hasSpendingEvidence)
  if (!focus) return null
  const getAmount = (row: LongitudinalMonth) => category === 'all' ? row.netSpend : row.categories[category] ?? 0
  const history = months.filter(row => row.month < month && row.hasSpendingEvidence)
  const previous = history.find(row => row.month === addMonths(month, -1))
  const current = getAmount(focus)
  const average = history.length ? Number(history.reduce((total, row) => total + BigInt(getAmount(row)), 0n)) / history.length : null
  const baseline = (value: number | null) => ({
    value,
    percent: value !== null && value > 0 ? (current - value) / value * 100 : null,
  })
  return { current, previous: baseline(previous ? getAmount(previous) : null), average: baseline(average), historyCount: history.length }
}

/** Coverage is the union of actual statement day ranges, never an inferred span between purchases. */
function statementCoverage(statements: readonly Statement[], asOf: DayKey) {
  const intervals = new Map<MonthKey, [number, number][]>()
  const counts = new Map<MonthKey, number>()
  for (const statement of statements) {
    const start = statement.periodStart ?? statement.periodEnd
    const end = statement.periodEnd ?? statement.periodStart
    if (!start || !end || !validDay(start) || !validDay(end) || end < start || end > asOf) continue
    const anchor = monthOf(end)
    counts.set(anchor, (counts.get(anchor) ?? 0) + 1)
    for (const month of eachMonth(monthOf(start), anchor)) {
      const first = start > `${month}-01` ? start : `${month}-01`
      const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
      const last = end < lastDay ? end : lastDay
      const bucket = intervals.get(month) ?? []
      bucket.push([toEpochDay(first), toEpochDay(last)])
      intervals.set(month, bucket)
    }
  }
  const days = new Map<MonthKey, number>()
  for (const [month, ranges] of intervals) {
    ranges.sort((a, b) => a[0] - b[0])
    let total = 0, first = ranges[0][0], last = ranges[0][1]
    for (const range of ranges.slice(1)) {
      if (range[0] <= last + 1) last = Math.max(last, range[1])
      else { total += last - first + 1; [first, last] = range }
    }
    days.set(month, total + last - first + 1)
  }
  return { days, counts }
}

/** All amounts are integer kuruş. Future plans and card debt payments do not become actual spending. */
export function buildLongitudinalAnalysis(input: LongitudinalInput) {
  if (!validDay(input.asOf)) throw new RangeError('Invalid analysis date')
  const asOfMonth = monthOf(input.asOf)
  const dated = input.transactions.filter(transaction => validFinancialRow(transaction) && effectiveDate(transaction) <= input.asOf)
  const coverage = statementCoverage(input.statements, input.asOf)
  const observations = monthlyAssetValuations(input.assetValuations ?? []).filter(snapshot => snapshot.day <= input.asOf)
  const availableMonths = [...new Set([...dated.map(transaction => monthOf(effectiveDate(transaction))), ...coverage.days.keys(), ...observations.map(snapshot => monthOf(snapshot.day))])].sort()
  const requestedFrom = input.fromMonth && validMonth(input.fromMonth) ? input.fromMonth : undefined
  const requestedTo = input.toMonth && validMonth(input.toMonth) ? input.toMonth : undefined
  const fromMonth = requestedFrom ?? availableMonths[0] ?? null
  const toMonth = requestedTo ? (requestedTo < asOfMonth ? requestedTo : asOfMonth) : availableMonths[availableMonths.length - 1] ?? null
  const months = fromMonth && toMonth && fromMonth <= toMonth ? eachMonth(fromMonth, toMonth) : []
  const selectedMonths = new Set(months)
  const scoped = dated.filter(transaction => selectedMonths.has(monthOf(effectiveDate(transaction))))
  const buckets = new Map<MonthKey, MonthBucket>()
  const categoryBuckets = new Map<CategoryId, { gross: number; refunds: number; count: number }>()
  const merchantBuckets = new Map<string, { label: string; count: number; gross: number; refunds: number; firstSeen: DayKey; lastSeen: DayKey; months: Set<MonthKey> }>()
  const weekday = WEEKDAYS.map((label, index) => ({ index, label, gross: 0, refunds: 0, net: 0, count: 0, share: 0 }))
  const tickets: number[] = []
  const purchaseDays = new Set<DayKey>()
  let largestPurchase: Pick<Transaction, 'id' | 'description' | 'amount'> & { date: DayKey } | null = null

  for (const transaction of scoped) {
    const date = effectiveDate(transaction), month = monthOf(date)
    const bucket = buckets.get(month) ?? emptyBucket()
    buckets.set(month, bucket); bucket.rowCount++
    if (transaction.kind === 'income') { bucket.income = sum(bucket.income, transaction.amount); bucket.incomeCount++; continue }
    if (transaction.kind === 'payment') { bucket.payments = sum(bucket.payments, transaction.amount); continue }
    const category = CATEGORY_MAP.has(transaction.category) ? transaction.category : 'other'
    const signed = transaction.kind === 'refund' ? -transaction.amount : transaction.amount
    bucket.categories[category] = sum(bucket.categories[category] ?? 0, signed)
    const categoryBucket = categoryBuckets.get(category) ?? { gross: 0, refunds: 0, count: 0 }
    const merchantKey = transaction.merchant.trim() || transaction.description.trim() || 'Diğer'
    const merchant = merchantBuckets.get(merchantKey) ?? { label: transaction.description || merchantKey, count: 0, gross: 0, refunds: 0, firstSeen: date, lastSeen: date, months: new Set<MonthKey>() }
    merchant.firstSeen = date < merchant.firstSeen ? date : merchant.firstSeen
    merchant.lastSeen = date > merchant.lastSeen ? date : merchant.lastSeen
    merchant.months.add(month)
    const dayBucket = weekday[weekdayIndex(date)]
    if (transaction.kind === 'refund') {
      bucket.refunds = sum(bucket.refunds, transaction.amount); bucket.refundCount++
      categoryBucket.refunds = sum(categoryBucket.refunds, transaction.amount)
      merchant.refunds = sum(merchant.refunds, transaction.amount)
      dayBucket.refunds = sum(dayBucket.refunds, transaction.amount)
    } else {
      bucket.grossSpend = sum(bucket.grossSpend, transaction.amount); bucket.purchaseCount++
      categoryBucket.gross = sum(categoryBucket.gross, transaction.amount); categoryBucket.count++
      merchant.gross = sum(merchant.gross, transaction.amount); merchant.count++
      dayBucket.gross = sum(dayBucket.gross, transaction.amount); dayBucket.count++
      tickets.push(transaction.amount); purchaseDays.add(date)
      if (!largestPurchase || transaction.amount > largestPurchase.amount) largestPurchase = { id: transaction.id, description: transaction.description, amount: transaction.amount, date }
    }
    categoryBuckets.set(category, categoryBucket); merchantBuckets.set(merchantKey, merchant)
  }

  const monthly: LongitudinalMonth[] = months.map(month => {
    const bucket = buckets.get(month) ?? emptyBucket()
    const coverageDays = coverage.days.get(month) ?? 0
    const elapsedDays = month === asOfMonth ? Number(input.asOf.slice(8)) : daysInMonth(month)
    const hasRecords = bucket.rowCount > 0 || coverageDays > 0
    const netSpend = sum(bucket.grossSpend, -bucket.refunds)
    const status: MonthCoverage = !hasRecords ? 'missing' : month === asOfMonth ? 'current' : coverageDays >= elapsedDays ? 'complete' : coverageDays ? 'partial' : 'unverified'
    return { month, label: monthLabel(month), income: bucket.income, grossSpend: bucket.grossSpend, refunds: bucket.refunds, netSpend,
      recordedSurplus: sum(bucket.income, -netSpend), payments: bucket.payments, purchaseCount: bucket.purchaseCount,
      statementCount: coverage.counts.get(month) ?? 0, coverageDays, elapsedDays, status, hasRecords,
      hasIncome: bucket.incomeCount > 0, hasSpendingEvidence: bucket.purchaseCount + bucket.refundCount > 0 || coverageDays > 0, categories: bucket.categories }
  })
  const grossSpend = sum(...monthly.map(month => month.grossSpend)), refunds = sum(...monthly.map(month => month.refunds))
  const netSpend = sum(grossSpend, -refunds), income = sum(...monthly.map(month => month.income))
  const positiveCategoryTotal = sum(...[...categoryBuckets.values()].map(bucket => Math.max(0, sum(bucket.gross, -bucket.refunds))))
  const categories: LongitudinalCategory[] = [...categoryBuckets].map(([id, bucket]) => {
    const category = CATEGORY_MAP.get(id)!, net = sum(bucket.gross, -bucket.refunds), pieValue = Math.max(0, net)
    return { id, label: category.label, color: category.color, gross: bucket.gross, refunds: bucket.refunds, net, pieValue, share: positiveCategoryTotal ? pieValue / positiveCategoryTotal : 0, count: bucket.count }
  }).sort((a, b) => b.net - a.net)
  // Asset observations and income-only rows may extend the visible timeline.
  // Compare the latest actual spending evidence, without skipping its prior
  // calendar month when that month has no spending evidence.
  let comparisonIndex = monthly.length - 1
  while (comparisonIndex >= 0 && !monthly[comparisonIndex].hasSpendingEvidence) comparisonIndex--
  const current = monthly[comparisonIndex], previous = monthly[comparisonIndex - 1]
  const comparable = current?.hasSpendingEvidence && previous?.hasSpendingEvidence
  const comparison: MonthlyComparison | null = comparable ? {
    previousMonth: previous.month, currentMonth: current.month, previous: previous.netSpend, current: current.netSpend,
    delta: sum(current.netSpend, -previous.netSpend), deltaPct: percentChange(previous.netSpend, current.netSpend), partial: previous.status !== 'complete' || current.status !== 'complete',
  } : null
  const categoryMovers: CategoryChange[] = comparable ? CATEGORIES.map(category => {
    const before = previous.categories[category.id] ?? 0, after = current.categories[category.id] ?? 0
    return { id: category.id, label: category.label, color: category.color, previous: before, current: after, delta: sum(after, -before), deltaPct: percentChange(before, after) }
  }).filter(change => change.current !== 0 || change.previous !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) : []
  const merchants: LongitudinalMerchant[] = [...merchantBuckets].map(([merchant, bucket]) => ({ merchant, label: bucket.label, count: bucket.count, gross: bucket.gross, refunds: bucket.refunds,
    net: sum(bucket.gross, -bucket.refunds), averageTicket: bucket.count ? Math.round(bucket.gross / bucket.count) : null, firstSeen: bucket.firstSeen, lastSeen: bucket.lastSeen, months: bucket.months.size })).sort((a, b) => b.net - a.net || b.count - a.count)
  const spendingMonths = monthly.filter(month => month.hasSpendingEvidence).length
  for (const day of weekday) { day.net = sum(day.gross, -day.refunds); day.share = grossSpend ? day.gross / grossSpend : 0 }
  const assetHistory: AssetHistoryPoint[] = observations.filter(snapshot => selectedMonths.has(monthOf(snapshot.day))).map((snapshot, index, snapshots) => {
    const last = snapshots[index - 1]
    const adjacent = last && addMonths(monthOf(last.day), 1) === monthOf(snapshot.day)
    return { month: monthOf(snapshot.day), day: snapshot.day, totalMinor: snapshot.totalMinor, observedAt: snapshot.observedAt, origin: snapshot.origin,
      deltaMinor: adjacent ? sum(snapshot.totalMinor, -last.totalMinor) : null, deltaPct: adjacent ? percentChange(last.totalMinor, snapshot.totalMinor) : null }
  })
  const portfolio = portfolioValue(input.holdings ?? [], input.quotes ?? {})
  const composition = ASSET_INSTRUMENTS.map(instrument => ({ ...instrument,
    valueMinor: sum(...portfolio.rows.filter(row => row.holding.instrument === instrument.id).map(row => row.value ?? 0)),
    unpriced: portfolio.rows.filter(row => row.holding.instrument === instrument.id && row.value === null).length,
    holdingCount: portfolio.rows.filter(row => row.holding.instrument === instrument.id).length,
  })).filter(row => row.holdingCount > 0).map(row => ({ ...row, share: portfolio.total && row.unpriced === 0 ? row.valueMinor / portfolio.total : null }))

  return {
    range: { fromMonth, toMonth, asOf: input.asOf }, availableMonths, monthly,
    totals: { income, grossSpend, refunds, netSpend, recordedSurplus: sum(income, -netSpend), payments: sum(...monthly.map(month => month.payments)),
      purchases: tickets.length, observedMonths: monthly.filter(month => month.hasRecords).length, missingMonths: monthly.filter(month => !month.hasRecords).length,
      spendingMonths, coverageDays: monthly.reduce((days, month) => days + month.coverageDays, 0),
      averageObservedMonthSpend: spendingMonths ? Math.round(netSpend / spendingMonths) : null },
    categories, categoryRefundCredit: sum(positiveCategoryTotal, -netSpend), categoryMovers, comparison, merchants, weekday,
    habits: { medianTicket: tickets.length ? Math.round(median(tickets)) : null, averageTicket: tickets.length ? Math.round(grossSpend / tickets.length) : null,
      activeDays: purchaseDays.size, averageActiveDaySpend: purchaseDays.size ? Math.round(grossSpend / purchaseDays.size) : null,
      purchaseFrequencyPerObservedMonth: spendingMonths ? tickets.length / spendingMonths : null,
      weekendShare: grossSpend ? sum(weekday[5].gross, weekday[6].gross) / grossSpend : null,
      repeatMerchants: merchants.filter(merchant => merchant.count >= 2).length, largestPurchase },
    assetHistory, portfolio: { ...portfolio, composition },
    excludedFutureTransactions: input.transactions.filter(transaction => validDay(effectiveDate(transaction)) && effectiveDate(transaction) > input.asOf).length,
    excludedInvalidTransactions: input.transactions.filter(transaction => !validFinancialRow(transaction)).length,
  }
}

export type LongitudinalAnalysis = ReturnType<typeof buildLongitudinalAnalysis>
