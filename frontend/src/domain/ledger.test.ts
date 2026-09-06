import { describe, expect, it } from 'vitest'
import { buildLedgerSeries, buildLedgerTransaction, buildMonthLedgers, monthsOfYear } from './ledger'
import { toMinor } from '../core/money'
import type { Transaction } from './types'

function statementTx(date: string, amount: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `s-${date}-${amount}`,
    date,
    description: 'MIGROS',
    merchant: 'MIGROS',
    amount: toMinor(amount),
    kind: 'expense',
    category: 'market',
    categoryLocked: false,
    bank: 'Akbank',
    accountLabel: 'Axess',
    installment: null,
    source: 'statement',
    ...overrides,
  }
}

describe('buildLedgerTransaction', () => {
  it('dates the row to the first of its month and locks the chosen category', () => {
    const tx = buildLedgerTransaction({
      month: '2026-03',
      label: 'Kira',
      amount: toMinor(15_000),
      kind: 'expense',
      category: 'rent',
    })

    expect(tx.date).toBe('2026-03-01')
    expect(tx.amount).toBe(toMinor(15_000))
    expect(tx.category).toBe('rent')
    expect(tx.categoryLocked).toBe(true)
    expect(tx.source).toBe('manual')
  })

  it('gives every month of a repeating item its own row and its own id', () => {
    const rows = buildLedgerSeries(
      { label: 'Maaş', amount: toMinor(30_000), kind: 'income', category: 'other' },
      ['2026-01', '2026-02', '2026-03'],
    )

    expect(rows.map((r) => r.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(new Set(rows.map((r) => r.id)).size).toBe(3)
  })
})

describe('buildMonthLedgers', () => {
  const transactions: Transaction[] = [
    statementTx('2026-01-15', 4000),
    statementTx('2026-01-20', 1000, { kind: 'refund', description: 'IADE' }),
    // Card debt settlement: real money moving, but not a new expense.
    statementTx('2026-01-25', 5000, { kind: 'payment', description: 'KART BORCU' }),
    buildLedgerTransaction({ month: '2026-01', label: 'Maaş', amount: toMinor(30_000), kind: 'income', category: 'other' }),
    buildLedgerTransaction({ month: '2026-01', label: 'Kira', amount: toMinor(15_000), kind: 'expense', category: 'rent' }),
  ]

  it('separates statement spending from hand-entered spending', () => {
    const [january] = buildMonthLedgers(transactions, ['2026-01'])

    expect(january.income).toBe(toMinor(30_000))
    expect(january.statementSpend).toBe(toMinor(3000)) // 4.000 spent − 1.000 refunded
    expect(january.manualSpend).toBe(toMinor(15_000))
  })

  it('nets income against both kinds of spending, ignoring card payments', () => {
    const [january] = buildMonthLedgers(transactions, ['2026-01'])
    // 30.000 − 3.000 − 15.000. The 5.000 card payment settles spending already
    // counted, so including it would double-count.
    expect(january.net).toBe(toMinor(12_000))
  })

  it('returns a row for every requested month, empty ones included', () => {
    const rows = buildMonthLedgers(transactions, ['2026-01', '2026-02'])
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ month: '2026-02', income: 0, net: 0, entries: [] })
  })

  it('lists only hand-entered rows as editable entries', () => {
    const [january] = buildMonthLedgers(transactions, ['2026-01'])
    expect(january.entries.map((e) => e.description).sort()).toEqual(['Kira', 'Maaş'])
  })
})

describe('monthsOfYear', () => {
  it('stops at the current month rather than offering the future', () => {
    expect(monthsOfYear(2026, '2026-03')).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('returns the whole year once it is behind us', () => {
    expect(monthsOfYear(2025, '2026-03')).toHaveLength(12)
  })

  it('returns nothing for a year that has not started', () => {
    expect(monthsOfYear(2027, '2026-03')).toEqual([])
  })
})
