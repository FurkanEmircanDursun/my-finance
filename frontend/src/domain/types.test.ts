import { describe, expect, it } from 'vitest'
import { statementSpansMonths, type Statement } from './types'

function statement(periodStart: string | null, periodEnd: string | null): Statement {
  return {
    id: 's1',
    label: 'Test',
    fileName: 'test.pdf',
    bank: 'Test',
    transactionCount: 1,
    skippedCount: 0,
    periodStart,
    periodEnd,
    dueDate: null,
    importedAt: 0,
    engine: 'pdf-text',
  }
}

describe('statementSpansMonths', () => {
  it('is true when the period crosses a calendar-month boundary', () => {
    // The common case: a card cycle runs "27th to 26th", not month to month.
    expect(statementSpansMonths(statement('2026-07-27', '2026-08-26'))).toBe(true)
  })

  it('is false when the period stays inside one calendar month', () => {
    expect(statementSpansMonths(statement('2026-08-01', '2026-08-26'))).toBe(false)
  })

  it('is false at an exact month boundary with no actual overlap', () => {
    expect(statementSpansMonths(statement('2026-08-01', '2026-08-31'))).toBe(false)
  })

  it('is false when either date is missing', () => {
    expect(statementSpansMonths(statement(null, '2026-08-26'))).toBe(false)
    expect(statementSpansMonths(statement('2026-07-27', null))).toBe(false)
    expect(statementSpansMonths(statement(null, null))).toBe(false)
  })
})
