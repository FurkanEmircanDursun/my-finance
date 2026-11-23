import { describe, expect, it } from 'vitest'
import { reducer, initialState } from './state'
import { emptyFilters, type Statement, type Transaction } from '../domain/types'

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
    // Re-affirming the default calendar mode must not
    // wipe filters a caller set moments earlier.
    const withMonthFilter = reducer(initialState, {
      type: 'setFilters',
      filters: { month: '2026-08' },
    })

    const afterNoopSet = reducer(withMonthFilter, {
      type: 'setSettings',
      settings: { periodGrouping: 'calendar' },
    })

    expect(afterNoopSet.filters.month).toBe('2026-08')
  })

  it('other filter fields survive a period-mode switch', () => {
    const withQuery = reducer(
      { ...initialState, filters: { ...emptyFilters, query: 'migros', cards: ['Akbank Axess'] } },
      { type: 'setSettings', settings: { periodGrouping: 'statement' } },
    )

    expect(withQuery.filters.query).toBe('migros')
    expect(withQuery.filters.cards).toEqual(['Akbank Axess'])
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
    const restored = reducer(after, { type: 'restoreStatement', statement: stateWithData.statements[0], transactions: stateWithData.transactions })
    expect(restored).toEqual(stateWithData)
    const reimported = { ...after, statements: [{ ...stateWithData.statements[0], id: 'replacement' }] }
    expect(reducer(reimported, { type: 'restoreStatement', statement: stateWithData.statements[0], transactions: stateWithData.transactions })).toBe(reimported)
  })

  it('is a no-op for an unknown id', () => {
    const after = reducer(initialState, { type: 'removeStatement', statementId: 'missing' })
    expect(after).toBe(initialState)
  })
})

describe('import', () => {
  const statement = (over: Partial<Statement> = {}): Statement => ({
    id: 'st-1', label: 'Akbank Axess · Eylül 2026', fileName: 'a.pdf', bank: 'Akbank', transactionCount: 1,
    skippedCount: 0, periodStart: '2026-08-29', periodEnd: '2026-09-26', dueDate: '2026-10-06',
    importedAt: 1, engine: 'pdf-ebcdic', ...over,
  })
  const row = (id: string, date: string): Transaction => ({
    id, date, description: 'X', merchant: 'X', amount: 100, kind: 'expense', category: 'other',
    categoryLocked: false, bank: 'Akbank', accountLabel: 'Akbank Axess', installment: null,
    source: 'statement', statementId: 'st-1',
  })

  it('adds new rows and skips ones already held', () => {
    const first = reducer(initialState, { type: 'import', transactions: [row('a', '2026-09-01')], statements: [statement()], outcomes: [] })
    const second = reducer(first, {
      type: 'import',
      transactions: [row('a', '2026-09-01'), row('b', '2026-09-02')],
      statements: [],
      outcomes: [],
    })
    expect(second.transactions.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('refreshes a statement that arrives again under the same id, rather than listing it twice', () => {
    // Re-importing a file refreshes its cover summary and reconciliation.
    const first = reducer(initialState, { type: 'import', transactions: [], statements: [statement()], outcomes: [] })
    const refreshed = statement({ transactionCount: 5, reconciliation: { status: 'match', printedDebt: 1, previousBalance: 0, payments: 0, parsedCharges: 1, expectedCharges: 1, delta: 0 } })
    const second = reducer(first, { type: 'import', transactions: [], statements: [refreshed], outcomes: [] })

    expect(second.statements).toHaveLength(1)
    expect(second.statements[0].transactionCount).toBe(5)
    expect(second.statements[0].reconciliation?.status).toBe('match')
  })
})

describe('notices', () => {
  it('are dropped once dismissed, and a second dismissal changes nothing', () => {
    const withNotice = { ...initialState, notices: ['bilgi'] }
    const cleared = reducer(withNotice, { type: 'dismissNotices' })
    expect(cleared.notices).toEqual([])
    expect(reducer(cleared, { type: 'dismissNotices' })).toBe(cleared)
  })
})
