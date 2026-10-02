import { describe, expect, it } from 'vitest'
import { initialState, reducer, type AppState } from './state'
import { applyFilters, availableStatementMonths, buildStatementMonthIndex, billedMonthOf, coverageDaysByMonth, periodMonthOf } from './selectors'
import { buildBackup, parseBackup } from './backup'
import { analyze } from '../analytics/engine'
import { parseStatementText } from '../ingest/pipeline'
import { instalmentStatement } from '../ingest/fixtures'
import { defaultProfile } from './defaults'
import { toMinor } from '../core/money'
import type { Statement, Transaction } from '../domain/types'

/**
 * A history, not a statement: three consecutive monthly statements imported one
 * after another, the way a person catches up on a year. The failure this exists
 * for was silent — every instalment after the first month hashed to the first
 * month's id and was dropped as a duplicate — and it only shows up with more
 * than one statement.
 */

function importStatement(state: AppState, index: 1 | 2 | 3): AppState {
  const result = parseStatementText(instalmentStatement(index), { rules: [], engine: 'pdf-ebcdic', fileName: `m${index}.pdf` })
  const id = `st-${index}`

  const statement: Statement = {
    id, label: result.label, fileName: `m${index}.pdf`, bank: result.bank, accountLabel: result.accountLabel,
    transactionCount: result.transactions.length, skippedCount: 0, periodStart: result.periodStart,
    periodEnd: result.periodEnd, dueDate: result.dueDate, importedAt: index, engine: 'pdf-ebcdic',
    summary: result.summary, reconciliation: result.reconciliation, ignored: result.ignored,
  }
  const known = new Set(state.transactions.map((t) => t.id))
  const transactions = result.transactions.filter((t) => !known.has(t.id)).map((t): Transaction => ({ ...t, statementId: id }))

  return reducer(state, { type: 'import', transactions, statements: [statement], outcomes: [] })
}

const history = [1, 2, 3].reduce<AppState>((s, n) => importStatement(s, n as 1 | 2 | 3), { ...initialState, hydrated: true })

describe('three months of one instalment plan', () => {
  it('keeps every month of the plan', () => {
    // Before the fix: 1. Imports 2 and 3 were thrown away as duplicates.
    const plan = history.transactions.filter((t) => t.installment)
    expect(plan.map((t) => t.installment!.current).sort()).toEqual([1, 2, 3])
  })

  it('keeps every row of every statement', () => {
    expect(history.transactions).toHaveLength(9)
    expect(history.statements.map((s) => s.transactionCount)).toEqual([3, 3, 3])
  })

  it('importing the same statement again changes nothing', () => {
    const again = importStatement(history, 2)
    expect(again.transactions).toHaveLength(9)
  })

  it('is read back in the order of the cycles', () => {
    expect(availableStatementMonths(history.statements)).toEqual(['2026-09', '2026-08', '2026-07'])
  })
})

describe('analysing that history', () => {
  const grouping = 'statement' as const
  const months = buildStatementMonthIndex(history.statements)
  const coverage = coverageDaysByMonth(history.statements, grouping)
  const result = analyze(history.transactions, defaultProfile, {
    monthOfTx: (tx) => periodMonthOf(tx, grouping, months),
    isPartialMonth: () => false,
    coverageDaysOf: (m) => coverage.get(m),
    billedMonthOf: (tx) => billedMonthOf(tx, months),
    key: 'history',
  })

  it('spends the same in each cycle: the instalment plus two market runs', () => {
    expect(result.monthly.map((m) => [m.month, m.spend])).toEqual([
      ['2026-07', toMinor(705)],
      ['2026-08', toMinor(705)],
      ['2026-09', toMinor(705)],
    ])
    expect(result.trend.momPct).toBe(0)
  })

  it('sees the plan as finished, and nothing owed', () => {
    const [plan] = result.installments
    expect(plan).toMatchObject({ paidCount: 3, totalCount: 3, remainingCount: 0 })
    // What next month still holds is the two recurring market runs, no instalment.
    expect(result.commitments[0].installments).toBe(0)
    expect(result.commitments[0].recurring).toBeGreaterThan(0)
  })

  it('finds the monthly market run as recurring, and the plan as not', () => {
    // Three 200s on the 15th is a rhythm; three 355s of one instalment plan is
    // one commitment already counted as a plan.
    const labels = result.recurring.map((r) => r.merchant)
    expect(labels).toContain('YEREL MARKET')
    expect(labels).not.toContain('TRENDYOL')
  })

  it('dates the instalment by the cycle that billed it, not the day of purchase', () => {
    const second = history.transactions.find((t) => t.installment?.current === 2)!
    expect(second.date).toBe('2026-05-05')
    expect(second.billedOn).toBe('2026-08-27')
    // The first thing charged is the 15 July market run — not the 5 May purchase.
    expect(result.meta.from).toBe('2026-07-15')
  })

  it('filters by statement month and finds all three rows of that month', () => {
    const august = applyFilters(
      history.transactions,
      { ...initialState.filters, month: '2026-08' },
      { periodGrouping: 'statement', statements: history.statements },
    )
    expect(august.map((t) => t.statementId)).toEqual(['st-2', 'st-2', 'st-2'])
    expect(august).toHaveLength(3)
  })
})

describe('exporting the whole history and bringing it back', () => {
  const months = buildStatementMonthIndex(history.statements)
  const overall = analyze(history.transactions, defaultProfile, { billedMonthOf: (tx) => billedMonthOf(tx, months) })
  const state = { ...history, settings: { ...history.settings, periodGrouping: 'statement' as const } }
  const backup = buildBackup({ state, overall, appVersion: '1', now: new Date('2026-10-03T00:00:00Z') })

  it('has a summary for every month, newest first', () => {
    expect(backup.derived.periods.map((p) => p.period)).toEqual(['2026-09', '2026-08', '2026-07'])
    expect(backup.derived.periods.every((p) => p.totals.netSpend === toMinor(705))).toBe(true)
  })

  it('has every month in the data, to the last row', () => {
    expect(backup.data.transactions).toHaveLength(9)
    expect(backup.scope.months).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('restores onto an empty install to the same history', () => {
    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const restored = reducer({ ...initialState, hydrated: true }, { type: 'restore', backup: parsed.backup.data, mode: 'replace' })
    expect(restored.transactions.map((t) => t.id).sort()).toEqual(history.transactions.map((t) => t.id).sort())
    expect(restored.statements).toHaveLength(3)
  })

  it('and importing the PDFs again afterwards adds nothing, because the ids still agree', () => {
    const parsed = parseBackup(JSON.stringify(backup))
    if (!parsed.ok) throw new Error('backup must parse')
    const restored = reducer({ ...initialState, hydrated: true }, { type: 'restore', backup: parsed.backup.data, mode: 'replace' })
    expect(importStatement(restored, 1).transactions).toHaveLength(9)
    expect(importStatement(restored, 3).transactions).toHaveLength(9)
  })
})
