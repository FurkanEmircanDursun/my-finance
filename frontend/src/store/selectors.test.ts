import { describe, expect, it } from 'vitest'
import { applyFilters, availableStatementMonths, coverageDaysByMonth } from './selectors'
import { emptyFilters, type Statement } from '../domain/types'
import type { TransactionWithStatement } from './state'
import type { Transaction } from '../domain/types'

function statement(overrides: Partial<Statement>): Statement {
  return {
    id: 's1',
    label: 'Test',
    fileName: 'test.pdf',
    bank: 'Test',
    transactionCount: 1,
    skippedCount: 0,
    periodStart: null,
    periodEnd: null,
    dueDate: null,
    importedAt: 0,
    engine: 'pdf-text',
    ...overrides,
  }
}

function tx(overrides: Partial<TransactionWithStatement>): TransactionWithStatement {
  const base: Transaction = {
    id: 't1',
    date: '2026-08-05',
    description: 'X',
    merchant: 'X',
    amount: 100,
    kind: 'expense',
    category: 'other',
    categoryLocked: false,
    bank: 'Test',
    accountLabel: 'Test',
    installment: null,
    source: 'statement',
  }
  return { ...base, statementId: '', ...overrides } as TransactionWithStatement
}

describe('availableStatementMonths', () => {
  it('groups two banks statements from the same billing month into one entry', () => {
    // The exact scenario reported: Akbank's and Garanti's August statements
    // previously showed up as two separate chips instead of one "Ağustos".
    const statements = [
      statement({ id: 'akbank', bank: 'Akbank', periodStart: '2026-07-27', periodEnd: '2026-08-28' }),
      statement({ id: 'garanti', bank: 'Garanti BBVA', periodStart: '2026-08-01', periodEnd: '2026-08-30' }),
    ]
    expect(availableStatementMonths(statements)).toEqual(['2026-08'])
  })

  it('names the month after the statement cut-off, not the period start', () => {
    // A card cycle running "27 Jul – 26 Aug" is the August statement, even
    // though most of its transactions happened in July.
    const statements = [statement({ periodStart: '2026-07-27', periodEnd: '2026-08-26' })]
    expect(availableStatementMonths(statements)).toEqual(['2026-08'])
  })

  it('falls back to periodStart when periodEnd is missing', () => {
    const statements = [statement({ periodStart: '2026-05-01', periodEnd: null })]
    expect(availableStatementMonths(statements)).toEqual(['2026-05'])
  })

  it('skips a statement with no dates at all', () => {
    expect(availableStatementMonths([statement({})])).toEqual([])
  })
})

describe('applyFilters — statement-mode grouping', () => {
  const statements = [
    statement({ id: 'akbank-aug', bank: 'Akbank', periodStart: '2026-07-27', periodEnd: '2026-08-28' }),
    statement({ id: 'garanti-aug', bank: 'Garanti BBVA', periodStart: '2026-08-01', periodEnd: '2026-08-30' }),
  ]

  // Akbank charge dated in July, but the statement is named August — this is
  // exactly the row that used to fall out of an "Ağustos" filter.
  const akbankTailCharge = tx({ id: 'a1', date: '2026-07-28', bank: 'Akbank', statementId: 'akbank-aug' })
  const garantiCharge = tx({ id: 'g1', date: '2026-08-05', bank: 'Garanti BBVA', statementId: 'garanti-aug' })
  const manualEntry = tx({ id: 'm1', date: '2026-08-10', bank: 'Manuel', statementId: '', source: 'manual' })
  const transactions = [akbankTailCharge, garantiCharge, manualEntry]

  it('groups both banks under the statement month, including a tail-end charge from the prior calendar month', () => {
    const result = applyFilters(
      transactions,
      { ...emptyFilters, month: '2026-08' },
      { periodGrouping: 'statement', statements },
    )
    expect(result.map((t) => t.id).sort()).toEqual(['a1', 'g1', 'm1'])
  })

  it('falls back to the transaction date for rows with no statement (manual entries)', () => {
    const julyOnly = applyFilters(
      transactions,
      { ...emptyFilters, month: '2026-07' },
      { periodGrouping: 'statement', statements },
    )
    // The manual entry is dated in August, so a July filter must not catch it
    // just because some other statement's tail end lands in July.
    expect(julyOnly.map((t) => t.id)).toEqual([])
  })

  it('reads by the transaction own calendar month in calendar mode, ignoring the statement', () => {
    const result = applyFilters(
      transactions,
      { ...emptyFilters, month: '2026-07' },
      { periodGrouping: 'calendar', statements },
    )
    // In calendar mode the Akbank tail charge counts as July, on its own date.
    expect(result.map((t) => t.id)).toEqual(['a1'])
  })

  it('behaves like calendar mode when periodGrouping is null (not yet chosen)', () => {
    const result = applyFilters(
      transactions,
      { ...emptyFilters, month: '2026-08' },
      { periodGrouping: null, statements },
    )
    expect(result.map((t) => t.id).sort()).toEqual(['g1', 'm1'])
  })
})

describe('coverageDaysByMonth', () => {
  const akbank = statement({
    id: 'ak',
    periodStart: '2026-07-05',
    periodEnd: '2026-08-28',
  })
  const garanti = statement({
    id: 'ga',
    periodStart: '2026-07-28',
    periodEnd: '2026-08-30',
  })

  it('splits a period across the calendar months it spans', () => {
    const days = coverageDaysByMonth([akbank], 'calendar')
    expect(days.get('2026-07')).toBe(27) // 5–31 July
    expect(days.get('2026-08')).toBe(28) // 1–28 August
  })

  it('counts overlapping statements once, not twice', () => {
    const days = coverageDaysByMonth([akbank, garanti], 'calendar')
    expect(days.get('2026-07')).toBe(27) // Garanti's 28–31 July already counted
    expect(days.get('2026-08')).toBe(30) // 1–30 August
  })

  it('gives the whole period to the named month under statement grouping', () => {
    const days = coverageDaysByMonth([akbank, garanti], 'statement')
    // Both are "August" statements; their union runs 5 July – 30 August.
    expect(days.get('2026-08')).toBe(57)
    expect(days.has('2026-07')).toBe(false)
  })

  it('agrees between the two groupings on the total days covered', () => {
    const calendar = [...coverageDaysByMonth([akbank, garanti], 'calendar').values()]
    const statementMode = [...coverageDaysByMonth([akbank, garanti], 'statement').values()]
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

    // The same days are covered either way, so prorated income — and therefore
    // total savings — comes out the same whichever grouping is selected.
    expect(sum(calendar)).toBe(sum(statementMode))
  })

  it('ignores statements with no usable period', () => {
    expect(coverageDaysByMonth([statement({ id: 'x' })], 'calendar').size).toBe(0)
  })
})
