import { describe, expect, it } from 'vitest'
import { buildLongitudinalAnalysis } from './longitudinal'
import type { Transaction, Statement } from '../domain/types'
import type { AssetValuationSnapshot } from '../domain/assetsHistory'

let sequence = 0
function tx(date: string, amount: number, overrides: Partial<Transaction> = {}): Transaction {
  return { id: `t${sequence++}`, date, amount, description: 'Market', merchant: 'MARKET', kind: 'expense', category: 'market', categoryLocked: false,
    bank: 'Test', accountLabel: 'Test', source: 'statement', installment: null, ...overrides }
}
function statement(start: string | null, end: string | null, overrides: Partial<Statement> = {}): Statement {
  return { id: `s${sequence++}`, label: 'Test', fileName: 'test.pdf', bank: 'Test', transactionCount: 0, skippedCount: 0, periodStart: start, periodEnd: end,
    dueDate: null, importedAt: 0, engine: 'pdf-text', ...overrides }
}
function snapshot(day: string, totalMinor: number, overrides: Partial<AssetValuationSnapshot> = {}): AssetValuationSnapshot {
  return { id: `valuation-${day.slice(0, 7)}`, day, totalMinor, observedAt: Date.parse('2026-04-01T12:00:00Z'), origin: 'manual', rows: [], ...overrides }
}
const build = (transactions: Transaction[], statements: Statement[] = []) => buildLongitudinalAnalysis({ transactions, statements, asOf: '2026-03-31' })

describe('long-term calendar ledger', () => {
  it('keeps integer kuruş and excludes card debt payments from spending and recorded surplus', () => {
    const result = build([tx('2026-01-01', 10001), tx('2026-01-02', 50), tx('2026-01-03', 500, { kind: 'refund' }),
      tx('2026-01-04', 30000, { kind: 'income', source: 'manual' }), tx('2026-01-05', 90000, { kind: 'payment' })])
    expect(result.totals).toMatchObject({ grossSpend: 10051, refunds: 500, netSpend: 9551, income: 30000, recordedSurplus: 20449, payments: 90000, purchases: 2 })
    expect(result.monthly[0]).toMatchObject({ netSpend: 9551, recordedSurplus: 20449, status: 'unverified' })
    expect(result.categories[0]).toMatchObject({ net: 9551, pieValue: 9551, count: 2, share: 1 })
    expect(result.habits.medianTicket).toBe(5026)
  })
  it('books an old installment purchase in its effective billed month and excludes future plans', () => {
    const result = build([tx('2025-10-02', 10000, { billedOn: '2026-02-28' }), tx('2026-04-01', 30000, { kind: 'income' })])
    expect(result.availableMonths).toEqual(['2026-02'])
    expect(result.monthly[0]).toMatchObject({ month: '2026-02', netSpend: 10000, income: 0, recordedSurplus: -10000 })
    expect(result.excludedFutureTransactions).toBe(1)
  })
  it('marks missing months rather than assuming an unrecorded month cost zero', () => {
    const result = build([tx('2026-01-05', 1000), tx('2026-03-01', 2000)])
    expect(result.monthly.map(month => month.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(result.monthly[1]).toMatchObject({ status: 'missing', hasRecords: false, hasSpendingEvidence: false })
    expect(result.totals).toMatchObject({ observedMonths: 2, missingMonths: 1, spendingMonths: 2, averageObservedMonthSpend: 1500 })
    expect(result.comparison).toBeNull()
    expect(result.categoryMovers).toEqual([])
  })
  it('does not count income-only months as proof of no spending', () => {
    const result = build([tx('2026-01-05', 1000), tx('2026-02-01', 10000, { kind: 'income' })])
    expect(result.monthly[1]).toMatchObject({ hasIncome: true, hasSpendingEvidence: false, status: 'unverified', recordedSurplus: 10000 })
    expect(result.totals.averageObservedMonthSpend).toBe(1000)
    expect(result.comparison).toBeNull()
  })
  it('uses only the selected range while preserving real available month choices', () => {
    const result = buildLongitudinalAnalysis({ transactions: [tx('2025-12-01', 1000), tx('2026-01-01', 2000), tx('2026-03-01', 3000)], statements: [], asOf: '2026-03-31', fromMonth: '2026-01', toMonth: '2026-02' })
    expect(result.availableMonths).toEqual(['2025-12', '2026-01', '2026-03'])
    expect(result.monthly.map(month => month.month)).toEqual(['2026-01', '2026-02'])
    expect(result.totals.netSpend).toBe(2000)
  })
  it('does not extend selected analysis into future months', () => {
    const result = buildLongitudinalAnalysis({ transactions: [tx('2026-03-01', 1000)], statements: [], asOf: '2026-03-15', fromMonth: '2026-03', toMonth: '2027-01' })
    expect(result.monthly).toHaveLength(1)
    expect(result.monthly[0]).toMatchObject({ month: '2026-03', elapsedDays: 15, status: 'current' })
  })
  it('returns an honest empty history and no percentage or ticket when no records exist', () => {
    const result = build([])
    expect(result.monthly).toEqual([])
    expect(result.range).toMatchObject({ fromMonth: null, toMonth: null })
    expect(result.totals.averageObservedMonthSpend).toBeNull()
    expect(result.habits).toMatchObject({ medianTicket: null, averageTicket: null, weekendShare: null })
    expect(result.comparison).toBeNull()
  })
  it('refuses unsafe monetary totals instead of displaying a rounded balance', () => {
    expect(() => build([tx('2026-01-01', Number.MAX_SAFE_INTEGER), tx('2026-01-02', 1)])).toThrow(RangeError)
  })
  it('excludes malformed financial rows and exposes their count', () => {
    const result = build([tx('2026-02-30', 1000), tx('2026-02-01', Number.NaN), tx('2026-02-01', 500, { kind: 'unexpected' as never }), tx('2026-02-02', 100)])
    expect(result.excludedInvalidTransactions).toBe(3)
    expect(result.totals.netSpend).toBe(100)
    expect(() => buildLongitudinalAnalysis({ transactions: [], statements: [], asOf: '2026-02-30' })).toThrow(RangeError)
  })
})

describe('coverage and change analysis', () => {
  it('unions overlapping card coverage and identifies a verified no-activity month', () => {
    const result = build([], [statement('2026-01-01', '2026-01-25'), statement('2026-01-10', '2026-01-31')])
    expect(result.monthly[0]).toMatchObject({ month: '2026-01', coverageDays: 31, elapsedDays: 31, statementCount: 2, status: 'complete', hasRecords: true, hasSpendingEvidence: true, netSpend: 0 })
    expect(result.totals.coverageDays).toBe(31)
  })
  it('splits cross-year coverage without counting a future or reversed cover', () => {
    const result = build([], [statement('2025-12-28', '2026-01-05'), statement('2026-03-01', '2026-04-01'), statement('2026-02-20', '2026-02-01')])
    expect(result.monthly.map(month => [month.month, month.coverageDays, month.status])).toEqual([['2025-12', 4, 'partial'], ['2026-01', 5, 'partial']])
  })
  it('compares adjacent observed months and retains signed category credits outside a pie', () => {
    const result = build([tx('2026-01-05', 10000), tx('2026-02-05', 20000), tx('2026-02-08', 5000, { category: 'dining', kind: 'refund' })],
      [statement('2026-01-01', '2026-01-31'), statement('2026-02-01', '2026-02-28')])
    expect(result.comparison).toMatchObject({ previousMonth: '2026-01', currentMonth: '2026-02', previous: 10000, current: 15000, delta: 5000, deltaPct: 50, partial: false })
    expect(result.categoryMovers.find(category => category.id === 'market')).toMatchObject({ previous: 10000, current: 20000, deltaPct: 100 })
    expect(result.categories.find(category => category.id === 'dining')).toMatchObject({ net: -5000, pieValue: 0, share: 0 })
    expect(result.categoryRefundCredit).toBe(5000)
    expect(result.categories.reduce((total, category) => total + category.net, 0)).toBe(result.totals.netSpend)
    expect(result.categories.reduce((total, category) => total + category.share, 0)).toBe(1)
  })
  it('never divides by a zero previous month or treats partial comparison as complete', () => {
    const result = build([tx('2026-02-05', 1000)], [statement('2026-01-01', '2026-01-31')])
    expect(result.comparison).toMatchObject({ previous: 0, current: 1000, deltaPct: null, partial: true })
    expect(result.categoryMovers[0].deltaPct).toBeNull()
  })
  it('compares the latest spending pair even when asset or income observations extend the timeline', () => {
    const result = buildLongitudinalAnalysis({
      transactions: [tx('2026-01-05', 10000), tx('2026-02-05', 20000), tx('2026-03-01', 50000, { kind: 'income' })],
      statements: [], asOf: '2026-03-31', assetValuations: [snapshot('2026-03-20', 90000)],
    })
    expect(result.monthly.map(month => month.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(result.comparison).toMatchObject({ previousMonth: '2026-01', currentMonth: '2026-02', delta: 10000, deltaPct: 100 })
    expect(result.categoryMovers[0]).toMatchObject({ id: 'market', previous: 10000, current: 20000, delta: 10000 })
  })
  it('does not bridge an earlier missing spending month when later asset observations exist', () => {
    const result = buildLongitudinalAnalysis({
      transactions: [tx('2026-01-05', 10000), tx('2026-03-05', 20000)], statements: [], asOf: '2026-04-30',
      assetValuations: [snapshot('2026-04-01', 90000)],
    })
    expect(result.comparison).toBeNull()
    expect(result.categoryMovers).toEqual([])
  })
  it('preserves net refunds below zero instead of flooring the ledger', () => {
    const result = build([tx('2026-01-05', 100), tx('2026-01-06', 300, { kind: 'refund' })])
    expect(result.totals).toMatchObject({ netSpend: -200, recordedSurplus: 200 })
    expect(result.categories[0]).toMatchObject({ net: -200, pieValue: 0, share: 0 })
    expect(result.categoryRefundCredit).toBe(200)
  })
  it('keeps purchase habits independent of refunds, salary and debt repayment', () => {
    const result = build([tx('2026-01-03', 1000), tx('2026-01-04', 3000), tx('2026-01-05', 500, { kind: 'refund' }),
      tx('2026-01-06', 100000, { kind: 'income' }), tx('2026-01-07', 100000, { kind: 'payment' })])
    expect(result.habits).toMatchObject({ medianTicket: 2000, averageTicket: 2000, activeDays: 2, weekendShare: 1, repeatMerchants: 1 })
    expect(result.merchants).toHaveLength(1)
    expect(result.merchants[0]).toMatchObject({ count: 2, gross: 4000, refunds: 500, net: 3500, averageTicket: 2000 })
    expect(result.weekday.reduce((total, day) => total + day.net, 0)).toBe(3500)
    expect(result.monthly[0].categories).toEqual({ market: 3500 })
  })
})

describe('observed portfolio history', () => {
  it('supports asset-only history and computes only adjacent actual observation changes', () => {
    const result = buildLongitudinalAnalysis({ transactions: [], statements: [], asOf: '2026-03-31', assetValuations: [snapshot('2025-12-31', 10000), snapshot('2026-01-31', 12000), snapshot('2026-03-20', 15000)] })
    expect(result.availableMonths).toEqual(['2025-12', '2026-01', '2026-03'])
    expect(result.assetHistory.map(point => [point.month, point.totalMinor, point.deltaMinor, point.deltaPct])).toEqual([
      ['2025-12', 10000, null, null], ['2026-01', 12000, 2000, 20], ['2026-03', 15000, null, null],
    ])
    expect(result.assetHistory[0].origin).toBe('manual')
    expect(result.monthly.every(month => month.status === 'missing')).toBe(true)
    expect(result.totals.income).toBe(0)
  })
  it('uses the latest real observation within a month, with no prehistory or invented initial value', () => {
    const result = buildLongitudinalAnalysis({ transactions: [], statements: [], asOf: '2026-03-31', assetValuations: [snapshot('2026-02-10', 10000), snapshot('2026-02-28', 12000)] })
    expect(result.assetHistory).toHaveLength(1)
    expect(result.assetHistory[0]).toMatchObject({ day: '2026-02-28', totalMinor: 12000, deltaMinor: null })
    expect(result.monthly.map(month => month.month)).toEqual(['2026-02'])
  })
  it('values current holdings separately and preserves missing prices', () => {
    const result = buildLongitudinalAnalysis({ transactions: [], statements: [], asOf: '2026-03-31',
      holdings: [{ id: 'usd', instrument: 'usd', quantityMicros: 2000000, updatedAt: 0 }, { id: 'gold', instrument: 'gold-gram', quantityMicros: 1000000, updatedAt: 0 }],
      quotes: { usd: { instrument: 'usd', tryPerUnit: 40, asOf: 0, source: 'truncgil', kind: 'market', cached: false } } })
    expect(result.portfolio).toMatchObject({ total: null, knownValue: 8000, missing: 1 })
    expect(result.portfolio.composition.find(row => row.id === 'usd')).toMatchObject({ valueMinor: 8000, unpriced: 0, share: null })
    expect(result.portfolio.composition.find(row => row.id === 'gold-gram')).toMatchObject({ unpriced: 1, share: null })
    expect(result.monthly).toEqual([])
    expect(result.totals.income).toBe(0)
  })
})
