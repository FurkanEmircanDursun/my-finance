import { describe, expect, it } from 'vitest'
import { reducer, initialState } from './state'
import { emptyFilters } from '../domain/types'

describe('setSettings clears the period filter on mode switch', () => {
  it('resets month when periodGrouping changes', () => {
    // filters.month means a different thing in each mode (calendar month vs
    // statement-group month, see Filters.month) — a selection from the old
    // mode must not be read as if it were valid in the new one.
    const withMonthFilter = reducer(initialState, {
      type: 'setFilters',
      filters: { month: '2026-08' },
    })

    const afterSwitch = reducer(withMonthFilter, {
      type: 'setSettings',
      settings: { periodGrouping: 'statement' },
    })

    expect(afterSwitch.filters.month).toBe('all')
  })

  it('leaves the period filter alone when periodGrouping is not part of the update', () => {
    const withMonthFilter = reducer(initialState, {
      type: 'setFilters',
      filters: { month: '2026-08' },
    })

    const afterUnrelatedChange = reducer(withMonthFilter, {
      type: 'setSettings',
      settings: { theme: 'dark' },
    })

    expect(afterUnrelatedChange.filters.month).toBe('2026-08')
  })

  it('leaves the period filter alone when periodGrouping is set to its current value', () => {
    // initialState.settings.periodGrouping is null; re-affirming null must not
    // wipe filters a caller set moments earlier.
    const withMonthFilter = reducer(initialState, {
      type: 'setFilters',
      filters: { month: '2026-08' },
    })

    const afterNoopSet = reducer(withMonthFilter, {
      type: 'setSettings',
      settings: { periodGrouping: null },
    })

    expect(afterNoopSet.filters.month).toBe('2026-08')
  })

  it('other filter fields survive a period-mode switch', () => {
    const withQuery = reducer(
      { ...initialState, filters: { ...emptyFilters, query: 'migros', banks: ['Akbank'] } },
      { type: 'setSettings', settings: { periodGrouping: 'statement' } },
    )

    expect(withQuery.filters.query).toBe('migros')
    expect(withQuery.filters.banks).toEqual(['Akbank'])
  })
})

describe('removeStatement', () => {
  it('drops the statement and its transactions without touching filters', () => {
    const stateWithData = {
      ...initialState,
      statements: [
        { id: 'st-1', label: 'Test', fileName: 'a.pdf', bank: 'Akbank', transactionCount: 1, skippedCount: 0, periodStart: '2026-08-01', periodEnd: '2026-08-28', dueDate: null, importedAt: 0, engine: 'pdf-text' },
      ],
      transactions: [
        { id: 't1', date: '2026-08-05', description: 'X', merchant: 'X', amount: 100, kind: 'expense' as const, category: 'other' as const, categoryLocked: false, bank: 'Akbank', accountLabel: 'Akbank', installment: null, source: 'statement' as const, statementId: 'st-1' },
      ],
      filters: { ...emptyFilters, month: '2026-08' },
    }

    const after = reducer(stateWithData, { type: 'removeStatement', statementId: 'st-1' })

    expect(after.statements).toHaveLength(0)
    expect(after.transactions).toHaveLength(0)
    // The month selection is a calendar/statement-group key, not a reference
    // to this statement's id, so it is left exactly as the user set it.
    expect(after.filters.month).toBe('2026-08')
  })

  it('is a no-op for an unknown id', () => {
    const after = reducer(initialState, { type: 'removeStatement', statementId: 'missing' })
    expect(after).toBe(initialState)
  })
})
