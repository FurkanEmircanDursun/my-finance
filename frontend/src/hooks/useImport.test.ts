import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initialState, reducer, type AppState } from '../store/state'
import type { Action } from '../store/state'
import { parseStatementText } from '../ingest/pipeline'
import { AKBANK_COLUMNS, AKBANK_NO_ACTIVITY } from '../ingest/fixtures'
import { buildCardPeriods, importCardChoices, importedCardDraft, linkImportedCard } from '../domain/cardLifecycle'
import type { CreditCard, ParseResult, Statement } from '../domain/types'
import { useImport } from './useImport'

const harness = vi.hoisted(() => ({ state: null as AppState | null, dispatch: vi.fn(), parseFile: vi.fn() }))
vi.mock('../store/AppStore', () => ({ useStore: () => ({ state: harness.state, dispatch: harness.dispatch }) }))
vi.mock('../ingest/pipeline', async original => ({ ...await original<typeof import('../ingest/pipeline')>(), parseFile: harness.parseFile }))
vi.mock('../platform/analytics', () => ({ trackProductEvent: vi.fn().mockResolvedValue(undefined) }))

const parsed: ParseResult = parseStatementText(AKBANK_COLUMNS, { rules: [], engine: 'text', fileName: 'statement.txt' })
const file = { name: 'statement.txt', size: 100 } as File
let importer: ReturnType<typeof useImport>
function Harness() { importer = useImport(); return null }
function render() { renderToStaticMarkup(createElement(Harness)); return importer }

beforeEach(() => {
  vi.clearAllMocks()
  harness.state = { ...initialState, hydrated: true }
  harness.dispatch.mockImplementation((action: Action) => { harness.state = reducer(harness.state!, action) })
  harness.parseFile.mockResolvedValue(parsed)
})

describe('physical card import and explicit save lifecycle', () => {
  it('reserves identity before dedupe, imports rows, and does not save card preferences without consent', async () => {
    const outcomes = await render().run([file])
    const statement = outcomes![0].statement!
    expect(outcomes![0].added).toBe(parsed.transactions.length)
    expect(statement.cardId).toBeTruthy()
    expect(harness.state!.transactions.every(row => row.cardId === statement.cardId)).toBe(true)
    expect(harness.state!.profile.cards).toEqual([])
    expect(importedCardDraft(statement, [], [])?.id).toBe(statement.cardId)
  })
  it('re-imports a declined-save card without duplicating its purchases', async () => {
    const first = await render().run([file])
    const ids = harness.state!.transactions.map(row => row.id)
    const second = await render().run([file])
    expect(second![0].statement!.cardId).toBe(first![0].statement!.cardId)
    expect(second![0].added).toBe(0)
    expect(second![0].duplicates).toBe(parsed.transactions.length)
    expect(harness.state!.transactions.map(row => row.id)).toEqual(ids)
  })
  it('keeps identical purchases from a second physical card when the user selects new card', async () => {
    const first = await render().run([file])
    const card = importedCardDraft(first![0].statement!, [], [])!
    harness.dispatch({ type: 'upsertCard', card })
    const second = await render().run([file], undefined, true)
    expect(second![0].ok).toBe(true)
    expect(second![0].added).toBe(parsed.transactions.length)
    expect(second![0].statement!.cardId).not.toBe(card.id)
    expect(harness.state!.transactions).toHaveLength(parsed.transactions.length * 2)
    expect(harness.state!.profile.cards).toHaveLength(1)
  })
  it('keeps two declined-save physical cards distinct and lets either identity be selected for reimport', async () => {
    const first = (await render().run([file]))![0].statement!
    const second = (await render().run([file], undefined, true))![0].statement!
    expect(second.cardId).not.toBe(first.cardId)
    expect(harness.state!.profile.cards).toEqual([])
    expect(harness.state!.transactions).toHaveLength(parsed.transactions.length * 2)
    expect(importCardChoices([], harness.state!.statements).map(choice => choice.card.id).sort()).toEqual([first.cardId, second.cardId].sort())
    const ambiguous = (await render().run([file]))![0]
    expect(ambiguous.ok).toBe(false)
    for (const statement of [first, second]) {
      const repeated = (await render().run([file], statement.cardId))![0]
      expect(repeated).toMatchObject({ ok: true, added: 0, duplicates: parsed.transactions.length })
      expect(repeated.statement!.id).toBe(statement.id)
    }
    expect(harness.state!.transactions).toHaveLength(parsed.transactions.length * 2)
  })
  it('preserves the new imported identity across save and reimport even when its name matches an archived card', async () => {
    const oldStatement = (await render().run([file]))![0].statement!
    const oldCard = importedCardDraft(oldStatement, [], [])!
    harness.dispatch({ type: 'upsertCard', card: oldCard })
    harness.dispatch({ type: 'removeCard', cardId: oldCard.id })
    const oldIds = harness.state!.transactions.map(row => row.id).sort()
    const fresh = (await render().run([file], undefined, true))![0].statement!
    const newCard = importedCardDraft(fresh, [oldCard], [])!
    expect(newCard.id).not.toBe(oldCard.id)
    harness.dispatch({ type: 'upsertCard', card: newCard })
    harness.dispatch({ type: 'import', transactions: [], outcomes: [], statements: [linkImportedCard(fresh, newCard)] })
    expect(harness.state!.profile.cards).toEqual([newCard])
    expect(harness.state!.profile.archivedCards).toEqual([oldCard])
    const repeated = (await render().run([file], newCard.id))![0]
    expect(repeated).toMatchObject({ ok: true, added: 0, duplicates: parsed.transactions.length })
    expect(repeated.statement!.cardId).toBe(newCard.id)
    expect(harness.state!.transactions.filter(row => row.cardId === oldCard.id).map(row => row.id).sort()).toEqual(oldIds)
    expect(harness.state!.transactions).toHaveLength(parsed.transactions.length * 2)
  })
  it('persists a verified empty cycle and clears the matching missing-statement state', async () => {
    const empty = parseStatementText(AKBANK_NO_ACTIVITY, { rules: [], engine: 'text', fileName: 'empty.txt' })
    const card: CreditCard = { id: 'no-activity', bank: 'akbank', name: 'Axess', statementDay: 26, entryDay: 27, remindersEnabled: true }
    harness.dispatch({ type: 'upsertCard', card })
    harness.parseFile.mockResolvedValue(empty)
    const options = () => ({ cards: [card], statements: harness.state!.statements, transactions: harness.state!.transactions, month: '2026-09' as const, today: '2026-11-14' as const })
    expect(buildCardPeriods(options())[0].status).toBe('missing')
    const first = (await render().run([file], card.id))![0]
    expect(first).toMatchObject({ ok: true, added: 0, duplicates: 0 })
    expect(harness.state!.statements).toHaveLength(1)
    expect(buildCardPeriods(options())[0]).toMatchObject({ status: 'ready', netSpend: 0 })
    expect(harness.state!.transactions).toEqual([])
    const repeated = (await render().run([file], card.id))![0]
    expect(repeated.statement!.id).toBe(first.statement!.id)
    expect(harness.state!.statements).toHaveLength(1)
  })
  it('links legacy imports while retaining their original transaction IDs and totals', async () => {
    const statement: Statement = { id: 'legacy', bank: parsed.bank, accountLabel: parsed.accountLabel, label: parsed.label, fileName: file.name,
      periodStart: parsed.periodStart, periodEnd: parsed.periodEnd, dueDate: parsed.dueDate, importedAt: 1, engine: 'text', skippedCount: 0, transactionCount: parsed.transactions.length }
    harness.state = { ...initialState, hydrated: true, statements: [statement], transactions: parsed.transactions.map(row => ({ ...row, statementId: statement.id })) }
    const ids = harness.state.transactions.map(row => row.id).sort()
    const total = harness.state.transactions.reduce((sum, row) => sum + row.amount, 0)
    const outcomes = await render().run([file])
    expect(outcomes![0].added).toBe(0)
    expect(harness.state.transactions.map(row => row.id).sort()).toEqual(ids)
    expect(harness.state.transactions.reduce((sum, row) => sum + row.amount, 0)).toBe(total)
    expect(harness.state.transactions.every(row => row.cardId === outcomes![0].statement!.cardId)).toBe(true)
  })
  it('never attaches another selected physical card to an unrelated unlinked legacy statement', async () => {
    const legacy: Statement = { id: 'legacy-other-card', bank: parsed.bank, accountLabel: parsed.accountLabel, label: parsed.label, fileName: file.name,
      periodStart: parsed.periodStart, periodEnd: parsed.periodEnd, dueDate: parsed.dueDate, importedAt: 1, engine: 'text', skippedCount: 0, transactionCount: parsed.transactions.length }
    harness.state = { ...initialState, hydrated: true, statements: [legacy], transactions: parsed.transactions.map(row => ({ ...row, statementId: legacy.id })) }
    const fresh = (await render().run([file], undefined, true))![0].statement!
    const repeated = (await render().run([file], fresh.cardId))![0]
    expect(repeated).toMatchObject({ ok: true, added: 0, duplicates: parsed.transactions.length })
    expect(repeated.statement!.id).toBe(fresh.id)
    expect(harness.state!.statements.find(statement => statement.id === legacy.id)?.cardId).toBeUndefined()
    expect(harness.state!.transactions.filter(row => row.statementId === legacy.id).every(row => !row.cardId)).toBe(true)
    expect(harness.state!.transactions).toHaveLength(parsed.transactions.length * 2)
  })
  it('rejects a wrong-bank card selection without adding any financial records', async () => {
    const card: CreditCard = { id: 'wrong-bank', bank: 'garanti', name: 'Bonus', statementDay: 20, entryDay: 21, remindersEnabled: true }
    harness.dispatch({ type: 'upsertCard', card })
    const outcomes = await render().run([file], card.id)
    expect(outcomes![0].ok).toBe(false)
    expect(outcomes![0].error).toContain('ait değil')
    expect(harness.state!.transactions).toEqual([])
    expect(harness.state!.statements).toEqual([])
  })
})
