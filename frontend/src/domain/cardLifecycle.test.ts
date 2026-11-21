import { describe, expect, it } from 'vitest'
import { buildCardPeriods, cardCutoffDate, importCardChoices, importedCardDraft, legacyCardKey, linkImportedCard, resolveImportCard } from './cardLifecycle'
import type { CreditCard, Statement, Transaction } from './types'
import { parseStatementText } from '../ingest/pipeline'
import { AKBANK_COLUMNS } from '../ingest/fixtures'
import { assignResultCard } from './cards'

const card: CreditCard = { id: 'card-one', bank: 'akbank', name: 'Ev kartım', statementDay: 20, entryDay: 21, remindersEnabled: true }
const statement: Statement = { id: 'st-one', bank: 'Akbank', accountLabel: 'Ev kartım', cardId: card.id, label: 'Ev kartım', fileName: 'sample.txt', periodStart: '2026-09-21', periodEnd: '2026-10-20', dueDate: '2026-10-30', transactionCount: 1, skippedCount: 0, importedAt: 1, engine: 'text' }
const tx: Transaction = { id: 'tx-one', bank: 'Akbank', accountLabel: 'Ev kartım', cardId: card.id, date: '2026-10-03', description: 'Market', merchant: 'market', category: 'market', categoryLocked: false, kind: 'expense', amount: 12345, source: 'statement', installment: null, statementId: statement.id }
const periods = (options: Partial<Parameters<typeof buildCardPeriods>[0]> = {}) => buildCardPeriods({ cards: [card], statements: [], transactions: [], month: '2026-10', today: '2026-11-14', ...options })

describe('monthly physical-card lifecycle', () => {
  it('marks a passed cutoff with no document missing, including months without transactions', () => {
    expect(periods()[0]).toMatchObject({ id: card.id, status: 'missing', cutoff: '2026-10-20', netSpend: 0 })
    expect(periods({ month: '2026-11' })[0].status).toBe('upcoming')
    expect(periods({ today: '2026-10-20' })[0].status).toBe('upcoming')
    expect(periods({ month: 'all' })[0].status).toBe('untracked')
  })
  it('clamps cutoff dates in short months and leap years', () => {
    expect(cardCutoffDate('2026-02', 31)).toBe('2026-02-28')
    expect(cardCutoffDate('2028-02', 31)).toBe('2028-02-29')
  })
  it('keeps card identity distinct within the same bank and excludes manual income', () => {
    const other = { ...card, id: 'card-two', name: 'İş kartım' }
    const result = periods({ cards: [card, other], statements: [statement], transactions: [tx, { ...tx, id: 'tx-two', cardId: other.id, amount: 20000 }, { ...tx, id: 'manual-income', source: 'manual', kind: 'income', amount: 100000 }] })
    expect(result.find(row => row.id === card.id)).toMatchObject({ status: 'ready', netSpend: 12345 })
    expect(result.find(row => row.id === other.id)).toMatchObject({ status: 'missing', netSpend: 20000 })
  })
  it('uses effective calendar dates for rows and document cutoff month for statement presence', () => {
    const result = periods({ statements: [statement], transactions: [{ ...tx, date: '2026-06-01', billedOn: '2026-10-20' }, { ...tx, id: 'previous', date: '2026-09-30' }] })[0]
    expect(result.transactions.map(row => row.id)).toEqual([tx.id])
    expect(result.status).toBe('ready')
    expect(periods({ month: '2026-09', statements: [statement], transactions: [{ ...tx, date: '2026-09-30' }] })[0]).toMatchObject({ status: 'missing', netSpend: 12345 })
  })
  it('nets refunds and excludes card debt repayments', () => {
    const result = periods({ transactions: [tx, { ...tx, id: 'refund', kind: 'refund', amount: 2345 }, { ...tx, id: 'payment', kind: 'payment', amount: 40000 }] })[0]
    expect(result.netSpend).toBe(10000)
  })
  it('includes a removed card only when selected-period history exists', () => {
    expect(periods({ cards: [], archivedCards: [card] })).toEqual([])
    expect(periods({ cards: [], archivedCards: [card], statements: [statement], transactions: [tx] })[0]).toMatchObject({ archived: true, status: 'ready', netSpend: 12345 })
  })
  it('attaches an unambiguous legacy label, never a label shared by two physical cards', () => {
    const unlinked = { ...statement, cardId: undefined }
    expect(periods({ statements: [unlinked], transactions: [{ ...tx, cardId: undefined }] })[0].id).toBe(card.id)
    const result = periods({ cards: [{ ...card, last4: '1111' }, { ...card, id: 'card-two', last4: '2222' }], statements: [unlinked], transactions: [{ ...tx, cardId: undefined }] })
    expect(result.find(row => row.id === legacyCardKey('Akbank', card.name))?.netSpend).toBe(12345)
    expect(result.filter(row => row.card).every(row => row.netSpend === 0)).toBe(true)
  })
  it('shows legacy statement cards with stable keys without modifying records', () => {
    const unlinked = { ...statement, cardId: undefined, accountLabel: 'Axess Platinum' }
    const result = periods({ cards: [], statements: [unlinked], transactions: [{ ...tx, cardId: undefined }] })[0]
    expect(result.id).toBe(legacyCardKey('Akbank', 'Axess Platinum'))
    expect(result.transactions[0].id).toBe(tx.id)
  })
})

describe('statement save-card offer', () => {
  it('derives the cutoff from the cover and keeps unknown dates unset', () => {
    expect(importedCardDraft({ ...statement, cardId: undefined })).toMatchObject({ bank: 'akbank', name: card.name, statementDay: 20, entryDay: 21 })
    expect(importedCardDraft({ ...statement, cardId: undefined, periodEnd: null })).toMatchObject({ statementDay: 0, entryDay: 0 })
    expect(importedCardDraft(statement)).toBeNull()
    expect(importedCardDraft({ ...statement, cardId: undefined, bank: 'Genel CSV' })).toBeNull()
  })
  it('restores only an explicitly identified archive and links only the document metadata', () => {
    const unlinked = { ...statement, cardId: undefined }
    expect(importedCardDraft(unlinked, [card])?.id).not.toBe(card.id)
    expect(importedCardDraft({ ...statement, cardId: 'different-physical-card' }, [card], [])?.id).toBe('different-physical-card')
    expect(importedCardDraft(statement, [card], [])?.id).toBe(card.id)
    expect(linkImportedCard(unlinked, card)).toMatchObject({ id: statement.id, cardId: card.id, accountLabel: card.name, periodEnd: statement.periodEnd })
  })
  it('offers a provisional imported identity until its configuration is saved', () => {
    expect(importedCardDraft(statement, [], [])?.id).toBe(card.id)
    expect(importedCardDraft(statement, [], [card.id])).toBeNull()
  })
})

describe('import reservation before transaction deduplication', () => {
  const parsed = parseStatementText(AKBANK_COLUMNS, { rules: [], engine: 'text', fileName: 'statement.txt' })
  it('keeps identical purchases on explicitly different physical cards', () => {
    const first = resolveImportCard(parsed, { cards: [], statements: [], reservations: new Map() })!
    const second = resolveImportCard(parsed, { cards: [first], statements: [], newCard: true, reservations: new Map() })!
    expect(first.id).not.toBe(second.id)
    const a = assignResultCard(parsed, first)
    const b = assignResultCard(parsed, second)
    expect(new Set([...a.transactions, ...b.transactions].map(row => row.id)).size).toBe(parsed.transactions.length * 2)
  })
  it('reuses a known provisional identity on repeat and one reservation across monthly files', () => {
    const reservations = new Map<string, CreditCard>()
    const first = resolveImportCard(parsed, { cards: [], statements: [], reservations })!
    const otherMonth = resolveImportCard({ ...parsed, periodEnd: '2026-10-31' }, { cards: [], statements: [], reservations })!
    expect(otherMonth.id).toBe(first.id)
    const repeated = resolveImportCard(parsed, { cards: [], statements: [{ ...statement, cardId: first.id, accountLabel: parsed.accountLabel, periodEnd: parsed.periodEnd }], reservations: new Map() })!
    expect(repeated.id).toBe(first.id)
  })
  it('requires an explicit known-card or new-card choice when a bank already has saved cards', () => {
    expect(() => resolveImportCard(parsed, { cards: [card], statements: [], reservations: new Map() })).toThrow('Yeni / farklı kart')
    expect(resolveImportCard(parsed, { selectedId: card.id, cards: [card], statements: [], reservations: new Map() })).toBe(card)
  })
  it('exposes unsaved statement identities and refuses to guess between two matching physical cards', () => {
    const first = { ...statement, cardId: 'unsaved-one', accountLabel: parsed.accountLabel, periodEnd: parsed.periodEnd }
    const second = { ...first, id: 'st-two', cardId: 'unsaved-two', fileName: 'second.txt' }
    const choices = importCardChoices([], [first, second])
    expect(choices.map(choice => choice.card.id)).toEqual(['unsaved-one', 'unsaved-two'])
    expect(choices.every(choice => !choice.saved)).toBe(true)
    expect(resolveImportCard(parsed, { selectedId: second.cardId, cards: [], statements: [first, second], reservations: new Map() })?.id).toBe(second.cardId)
    expect(() => resolveImportCard(parsed, { cards: [], statements: [first, second], reservations: new Map() })).toThrow('birden fazla kart')
  })
})
