import { describe, expect, it } from 'vitest'
import { assignResultCard, nextCardDate, sanitizeCards } from './cards'
import type { CreditCard } from './types'
import { parseStatementText } from '../ingest/pipeline'
import { AKBANK_COLUMNS } from '../ingest/fixtures'
import { initialState, reducer, toSnapshot } from '../store/state'
import { applyBackup, buildBackup, parseBackup } from '../store/backup'
import { migratePersisted, STATE_VERSION } from '../store/migrate'
import { analyze } from '../analytics/engine'
import { diffLocal } from '../sync/model'

const card: CreditCard = { id: 'card-1', bank: 'akbank', name: 'Ev kartım', last4: '1234', statementDay: 31, entryDay: 1, remindersEnabled: true }

describe('card dates', () => {
  it('clamps February and preserves the chosen day in March', () => {
    expect(nextCardDate(31, new Date(2026, 1, 1))).toEqual(new Date(2026, 1, 28, 9))
    expect(nextCardDate(31, new Date(2026, 2, 1))).toEqual(new Date(2026, 2, 31, 9))
  })
  it('handles leap years and the December boundary', () => {
    expect(nextCardDate(31, new Date(2028, 1, 1))).toEqual(new Date(2028, 1, 29, 9))
    expect(nextCardDate(1, new Date(2026, 11, 31))).toEqual(new Date(2027, 0, 1, 9))
  })
  it('includes today independently of the notification hour', () => {
    expect(nextCardDate(7, new Date(2026, 10, 7, 8))).toEqual(new Date(2026, 10, 7, 9))
    expect(nextCardDate(7, new Date(2026, 10, 7, 23))).toEqual(new Date(2026, 10, 7, 9))
    expect(() => nextCardDate(32)).toThrow(RangeError)
  })
})

describe('physical card import identity', () => {
  const parsed = parseStatementText(AKBANK_COLUMNS, { rules: [], engine: 'text', fileName: 'test.txt' })
  it('retains identical purchases on two cards from the same bank and deduplicates a repeat on one card', () => {
    const first = assignResultCard(parsed, card)
    const second = assignResultCard(parsed, { ...card, id: 'card-2', name: 'Diğer kartım' })
    const ids = new Set([...first.transactions, ...second.transactions].map((tx) => tx.id))
    expect(ids.size).toBe(parsed.transactions.length * 2)
    expect(assignResultCard(parsed, card).transactions.map((tx) => tx.id)).toEqual(first.transactions.map((tx) => tx.id))
    expect(first.transactions.map((tx) => tx.amount)).toEqual(parsed.transactions.map((tx) => tx.amount))
    expect(first.reconciliation).toEqual(parsed.reconciliation)
  })
  it('rejects accidentally importing an Akbank file into a Garanti card', () => {
    expect(() => assignResultCard(parsed, { ...card, bank: 'garanti' })).toThrow('ait değil')
  })
})

describe('card persistence', () => {
  it('migrates existing profiles without cards, preserving financial data', () => {
    const old = { ...initialState, profile: { monthlyIncome: 100, currentBalance: 0, spendingLimit: 200, goal: null, budgets: [] }, version: STATE_VERSION }
    const restored = migratePersisted(old)!.state
    expect(restored.profile.cards).toEqual([])
    expect(restored.profile.monthlyIncome).toBe(100)
  })
  it('rejects malformed card configurations at the storage boundary', () => {
    expect(sanitizeCards([card, card, { ...card, id: 'bad', statementDay: 0 }, { ...card, id: 'foreign', bank: 'other' }])).toEqual([card])
  })
  it('saves two cards of the same bank, edits dates, and retains history when removing a card', () => {
    const parsed = parseStatementText(AKBANK_COLUMNS, { rules: [], engine: 'text', fileName: 'test.txt' })
    const tx = { ...assignResultCard(parsed, card).transactions[0], statementId: 'st-1' }
    let state = reducer({ ...initialState, transactions: [tx] }, { type: 'upsertCard', card })
    state = reducer(state, { type: 'upsertCard', card: { ...card, id: 'card-2', name: 'İş kartım' } })
    expect(state.profile.cards).toHaveLength(2)
    state = reducer(state, { type: 'upsertCard', card: { ...card, statementDay: 14 } })
    expect(state.profile.cards?.[0].statementDay).toBe(14)
    state = reducer(state, { type: 'removeCard', cardId: card.id })
    expect(state.profile.cards).toHaveLength(1)
    expect(state.transactions).toEqual([tx])
  })
  it('exports/restores cards and merges missing cards without overwriting local edits', () => {
    const state = reducer(initialState, { type: 'upsertCard', card })
    const backup = buildBackup({ state, overall: analyze([], state.profile), appVersion: '2.4.0', now: new Date(2026, 10, 7) })
    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.data.profile.cards).toEqual([card])
    const current = reducer(initialState, { type: 'upsertCard', card: { ...card, id: 'card-2', name: 'İş kartım' } })
    const merged = applyBackup(current, parsed.backup.data, 'merge')
    expect(merged.profile.cards?.map((item) => item.id)).toEqual(['card-2', 'card-1'])
  })
  it('syncs a card-only profile as meaningful user data', () => {
    const state = reducer(initialState, { type: 'upsertCard', card })
    const diff = diffLocal({}, toSnapshot(state), 10)
    expect(diff.writes.some((write) => write.kind === 'profile')).toBe(true)
  })
  it('links an existing unassigned statement without adding or re-keying its transactions', () => {
    const parsed = parseStatementText(AKBANK_COLUMNS, { rules: [], engine: 'text', fileName: 'test.txt' })
    const transactions = parsed.transactions.map((tx) => ({ ...tx, statementId: 'st-old' }))
    const statement = {
      id: 'st-old', label: 'Ev kartım · Eylül', accountLabel: 'Ev kartım', cardId: card.id,
      fileName: 'test.txt', bank: parsed.bank, transactionCount: transactions.length, skippedCount: 0,
      periodStart: parsed.periodStart, periodEnd: parsed.periodEnd, dueDate: null, importedAt: 1, engine: 'text',
    }
    const linked = reducer({ ...initialState, transactions }, { type: 'import', transactions: [], statements: [statement], outcomes: [] })
    expect(linked.transactions.map((tx) => tx.id).sort()).toEqual(transactions.map((tx) => tx.id).sort())
    expect(Object.fromEntries(linked.transactions.map((tx) => [tx.id, tx.amount]))).toEqual(Object.fromEntries(transactions.map((tx) => [tx.id, tx.amount])))
    expect(linked.transactions.every((tx) => tx.cardId === card.id && tx.accountLabel === statement.accountLabel)).toBe(true)
  })
  it('preserves card identity when restoring a removed card, even when re-added through the new-card form', () => {
    let state = reducer(initialState, { type: 'upsertCard', card })
    state = reducer(state, { type: 'removeCard', cardId: card.id })
    expect(state.profile.archivedCards).toEqual([card])
    state = reducer(state, { type: 'upsertCard', card: { ...card, id: 'new-generated-id' } })
    expect(state.profile.cards).toEqual([card])
    expect(state.profile.archivedCards).toEqual([])
  })
  it('keeps a selected card filter valid when the card is renamed', () => {
    let state = reducer(initialState, { type: 'upsertCard', card })
    state = reducer(state, { type: 'setFilters', filters: { cards: ['Ev kartım · 1234'] } })
    state = reducer(state, { type: 'upsertCard', card: { ...card, name: 'Yeni ad' } })
    expect(state.filters.cards).toEqual(['Yeni ad · 1234'])
  })
})
