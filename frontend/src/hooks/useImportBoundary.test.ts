import { createElement, type EffectCallback } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initialState, reducer, type Action, type AppState } from '../store/state'
import { parseStatementText, ParseError } from '../ingest/pipeline'
import { StatementValidationError } from '../ingest/validation'
import { UserFacingError } from '../core/errors'
import { AKBANK_COLUMNS } from '../ingest/fixtures'
import type { ParseResult } from '../domain/types'
import { useImport } from './useImport'

const harness = vi.hoisted(() => ({
  state: null as AppState | null,
  effects: [] as EffectCallback[],
  dispatch: vi.fn(),
  parseFile: vi.fn(),
  analytics: vi.fn(),
}))

// Commit the real hook's lifecycle boundary explicitly while keeping React's
// own refs and callback closures, without introducing a DOM test runtime.
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: EffectCallback) => { harness.effects.push(effect) },
}))
vi.mock('../store/AppStore', () => ({ useStore: () => ({ state: harness.state, dispatch: harness.dispatch, getCurrentState: () => harness.state }) }))
vi.mock('../ingest/pipeline', async original => ({ ...await original<typeof import('../ingest/pipeline')>(), parseFile: harness.parseFile }))
vi.mock('../platform/analytics', () => ({ trackProductEvent: harness.analytics }))
vi.mock('../platform/diagnostics', () => ({ measureOperation: (_name: string, operation: () => Promise<unknown>) => operation() }))

const parsed = parseStatementText(AKBANK_COLUMNS, { rules: [], engine: 'text', fileName: 'statement.txt' })
const first = { name: 'first.pdf', size: 100 } as File
const second = { name: 'second.pdf', size: 100 } as File
const third = { name: 'third.pdf', size: 100 } as File
let importer: ReturnType<typeof useImport>
function Harness() { importer = useImport(); return null }
function mount() {
  harness.effects = []
  renderToStaticMarkup(createElement(Harness))
  const cleanups = harness.effects.map(effect => effect())
  return {
    ...importer,
    unmount: () => { for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup() },
  }
}
function pendingParse() {
  let resolve!: (result: ParseResult) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<ParseResult>((done, failed) => { resolve = done; reject = failed })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  harness.state = { ...initialState, hydrated: true }
  harness.dispatch.mockImplementation((action: Action) => { harness.state = reducer(harness.state!, action) })
  harness.parseFile.mockReset().mockResolvedValue(parsed)
  harness.analytics.mockResolvedValue(undefined)
})

describe('import session lifetime boundary', () => {
  it('ignores a second start while the first batch is still reading', async () => {
    const pending = pendingParse()
    harness.parseFile.mockReturnValueOnce(pending.promise)
    const session = mount()
    const operation = session.run([first])
    await expect(session.run([second])).resolves.toBeUndefined()
    expect(harness.parseFile).toHaveBeenCalledOnce()
    pending.resolve(parsed)
    await expect(operation).resolves.toEqual([expect.objectContaining({ fileName: first.name, ok: true })])
    expect(harness.dispatch).toHaveBeenCalledOnce()
    session.unmount()
  })

  it('ignores a pending successful parse after cleanup and never starts the next queued file', async () => {
    const pending = pendingParse()
    harness.parseFile.mockReturnValueOnce(pending.promise)
    const session = mount()
    const operation = session.run([first, second])
    expect(harness.parseFile).toHaveBeenCalledOnce()
    session.unmount()
    pending.resolve(parsed)
    await expect(operation).resolves.toBeUndefined()
    expect(harness.parseFile).toHaveBeenCalledOnce()
    expect(harness.parseFile.mock.calls[0][0]).toBe(first)
    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(harness.analytics).not.toHaveBeenCalled()
    expect(harness.state!.transactions).toEqual([])
    expect(harness.state!.statements).toEqual([])
  })

  it('ignores a pending parse failure after cleanup without recording stale outcomes or starting the next file', async () => {
    const pending = pendingParse()
    harness.parseFile.mockReturnValueOnce(pending.promise)
    const session = mount()
    const operation = session.run([first, second])
    session.unmount()
    pending.reject(new StatementValidationError('not_statement'))
    await expect(operation).resolves.toBeUndefined()
    expect(harness.parseFile).toHaveBeenCalledOnce()
    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(harness.analytics).not.toHaveBeenCalled()
    expect(harness.state!.lastImport).toEqual([])
  })

  it('discards previously collected rows when cleanup occurs during a later parse in the same batch', async () => {
    const pending = pendingParse()
    harness.parseFile.mockResolvedValueOnce(parsed).mockReturnValueOnce(pending.promise)
    const session = mount()
    const operation = session.run([first, second, third])
    await Promise.resolve()
    expect(harness.parseFile).toHaveBeenCalledTimes(2)
    session.unmount()
    pending.resolve(parsed)
    await expect(operation).resolves.toBeUndefined()
    expect(harness.parseFile).toHaveBeenCalledTimes(2)
    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(harness.analytics).not.toHaveBeenCalled()
    expect(harness.state!.transactions).toEqual([])
    expect(harness.state!.statements).toEqual([])
  })

  it('keeps an old parse completion isolated from a newly mounted importer', async () => {
    const pending = pendingParse()
    harness.parseFile.mockReturnValueOnce(pending.promise)
    const oldSession = mount()
    const oldOperation = oldSession.run([first, second])
    oldSession.unmount()
    const currentSession = mount()
    const outcomes = await currentSession.run([third])
    expect(outcomes).toEqual([expect.objectContaining({ fileName: third.name, ok: true })])
    const committedTransactions = harness.state!.transactions
    const committedStatements = harness.state!.statements
    pending.resolve(parsed)
    await expect(oldOperation).resolves.toBeUndefined()
    expect(harness.parseFile).toHaveBeenCalledTimes(2)
    expect(harness.dispatch).toHaveBeenCalledOnce()
    expect(harness.analytics).toHaveBeenCalledOnce()
    expect(harness.analytics).toHaveBeenCalledWith('statement_imported')
    expect(harness.state!.transactions).toBe(committedTransactions)
    expect(harness.state!.statements).toBe(committedStatements)
    expect(harness.state!.statements[0].fileName).toBe(third.name)
    currentSession.unmount()
  })
})

describe('import feedback only exposes application-authored messages', () => {
  const unknownErrors = [
    new Error('private-internal-firebase-sdk-detail'),
    { code: 'permission-denied', message: 'private-internal-firestore-path', stack: 'private-stack' },
    'private-internal-string-rejection',
    Object.assign(new Error('private-internal-name-spoof'), { name: 'StatementValidationError', hint: 'private-internal-hint', code: 'not_statement' }),
    { name: 'UserFacingError', message: 'private-internal-user-facing-spoof' },
    null,
  ]

  it.each(unknownErrors)('replaces unknown Error and SDK-shaped failures with safe guidance', async error => {
    harness.parseFile.mockRejectedValueOnce(error)
    const session = mount()
    const outcomes = await session.run([first])
    expect(outcomes).toEqual([{
      fileName: first.name, ok: false, added: 0, duplicates: 0,
      error: 'Dosya eklenemedi. Bankandan özgün ekstre PDF’sini indirip yeniden dene.',
    }])
    expect(JSON.stringify(harness.dispatch.mock.calls)).not.toContain('private-internal')
    expect(harness.state!.transactions).toEqual([])
    expect(harness.state!.statements).toEqual([])
    expect(harness.analytics).not.toHaveBeenCalled()
    session.unmount()
  })

  it('preserves the static message and hint from a typed statement-validation error', async () => {
    const error = new StatementValidationError('unsupported_bank')
    harness.parseFile.mockRejectedValueOnce(error)
    const session = mount()
    const outcomes = await session.run([first])
    expect(outcomes![0]).toMatchObject({ ok: false, error: `${error.message} ${error.hint}` })
    expect(outcomes![0].error).toContain('Akbank/Axess')
    expect(harness.state!.transactions).toEqual([])
    expect(harness.state!.statements).toEqual([])
    session.unmount()
  })

  it('preserves actionable parser guidance and explicit user-facing messages', async () => {
    const parserError = new ParseError('Dosyada işlem satırı bulunamadı.', 'Ekstreyi bankandan yeniden indir.')
    const authoredError = new UserFacingError('Seçilen kart bulunamadı. Kartını yeniden seç.')
    harness.parseFile.mockRejectedValueOnce(parserError).mockRejectedValueOnce(authoredError)
    const session = mount()
    const outcomes = await session.run([first, second])
    expect(outcomes!.map(outcome => outcome.error)).toEqual([
      `${parserError.message} ${parserError.hint}`,
      authoredError.message,
    ])
    expect(harness.state!.transactions).toEqual([])
    expect(harness.state!.statements).toEqual([])
    expect(harness.analytics).not.toHaveBeenCalled()
    session.unmount()
  })
})

describe('PDF fingerprints', () => {
  const pdf = (name: string, content = '%PDF-1.7 identical content') =>
    new File([content], name, { type: 'application/pdf' })

  it('blocks a different card number and omits the printed suffix from saved records', async () => {
    const card = { id: 'mine', name: 'Kartım', bank: 'akbank' as const, last4: '1234', statementDay: 26, entryDay: 27, remindersEnabled: true }
    harness.state = { ...harness.state!, profile: { ...harness.state!.profile, cards: [card] } }
    harness.parseFile.mockResolvedValueOnce({ ...parsed, reportedCardLast4: '9876' })
    const session = mount()
    const review = vi.fn(async () => true)
    expect((await session.run([pdf('other.pdf')], card.id, false, undefined, review))?.[0]).toMatchObject({
      ok: false, error: expect.stringContaining('son dört hanesi'),
    })
    expect(review).not.toHaveBeenCalled()
    expect(harness.state!.statements).toEqual([])
    session.unmount()

    harness.parseFile.mockResolvedValueOnce({ ...parsed, reportedCardLast4: card.last4 })
    const retry = mount()
    const outcomes = await retry.run([pdf('mine.pdf')], card.id, false, undefined, async items => {
      expect(items[0].reportedCardLast4).toBe(card.last4)
      return true
    })
    expect(outcomes?.[0].reportedCardLast4).toBeUndefined()
    expect(harness.state!.statements[0]).not.toHaveProperty('reportedCardLast4')
    retry.unmount()
  })

  it('completes an interrupted PDF when movements reached the server before its statement', async () => {
    const original = mount()
    await original.run([pdf('original.pdf')])
    original.unmount()
    const expected = harness.state!
    const existing = { ...expected.transactions[0], category: 'market' as const, categoryLocked: true }
    harness.state = { ...expected, statements: [], transactions: [existing] }

    const retry = mount()
    const outcome = (await retry.run([pdf('renamed.pdf')]))?.[0]
    expect(outcome).toMatchObject({
      ok: true, added: expected.transactions.length - 1, duplicates: 1,
      statement: { id: expected.statements[0].id, cardId: expected.statements[0].cardId },
    })
    expect(harness.state!.transactions.find(row => row.id === existing.id)).toMatchObject(existing)
    expect(harness.state!.transactions.map(row => row.id).sort()).toEqual(expected.transactions.map(row => row.id).sort())
    retry.unmount()
  })

  it('skips the same bytes in a batch and in a later session after renaming', async () => {
    const first = mount()
    const outcomes = await first.run([pdf('first.pdf'), pdf('renamed.pdf')])
    expect(outcomes?.[0].statement?.pdfSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(outcomes?.[1]).toMatchObject({ alreadyImported: true, added: 0 })
    expect(harness.parseFile).toHaveBeenCalledOnce()
    first.unmount()

    const previousRows = harness.state!.transactions
    const previousStatements = harness.state!.statements
    const next = mount()
    expect(await next.run([pdf('third-name.pdf')])).toEqual([
      expect.objectContaining({ alreadyImported: true, added: 0 }),
    ])
    expect(harness.parseFile).toHaveBeenCalledOnce()
    expect(harness.state!.transactions).toBe(previousRows)
    expect(harness.state!.statements).toBe(previousStatements)
    next.unmount()
  })

  it('requires explicit repair to replace a same-cycle PDF with different bytes', async () => {
    const first = mount()
    const original = (await first.run([pdf('statement.pdf')]))?.[0].statement
    first.unmount()
    const next = mount()
    const revisedFile = pdf('statement.pdf', '%PDF-1.7 revised content')
    const before = harness.state!
    expect(await next.run([revisedFile])).toEqual([expect.objectContaining({ ok: false, error: expect.stringContaining('ekstre detayından') })])
    expect(harness.state!.transactions).toBe(before.transactions)
    expect(harness.state!.statements).toBe(before.statements)
    next.unmount()
    const repair = mount()
    const revised = (await repair.run([revisedFile], original?.cardId, false, original?.id))?.[0].statement
    expect(harness.parseFile).toHaveBeenCalledTimes(3)
    expect(revised?.id).toBe(original?.id)
    expect(revised?.pdfSha256).not.toBe(original?.pdfSha256)
    expect(harness.state!.statements).toHaveLength(1)
    repair.unmount()
  })

  it('does not write the preview on cancel or when synced data changed before confirmation', async () => {
    const session = mount()
    const cancelled = vi.fn(async () => false)
    await expect(session.run([pdf('statement.pdf')], undefined, false, undefined, cancelled)).resolves.toBeUndefined()
    expect(cancelled).toHaveBeenCalledOnce()
    expect(harness.dispatch).not.toHaveBeenCalled()
    const approvesStalePreview = async () => {
      harness.state = { ...harness.state!, transactions: [...harness.state!.transactions] }
      return true
    }
    const outcome = await session.run([pdf('statement.pdf')], undefined, false, undefined, approvesStalePreview)
    expect(outcome?.[0]).toMatchObject({ ok: false, error: expect.stringContaining('değişti') })
    expect(harness.dispatch).not.toHaveBeenCalled()
    session.unmount()
  })

  it('restores a missing statement receipt when all its movements already synced', async () => {
    const original = mount()
    const statement = (await original.run([pdf('statement.pdf')]))?.[0].statement
    original.unmount()
    harness.state = { ...harness.state!, statements: [] }
    const retry = mount()
    expect((await retry.run([pdf('renamed.pdf')]))?.[0]).toMatchObject({
      ok: true, added: 0, duplicates: parsed.transactions.length, statement: { id: statement?.id },
    })
    expect(harness.state!.statements).toHaveLength(1)
    retry.unmount()
  })

  it('allows the original bytes when explicitly repairing their statement', async () => {
    const first = mount()
    const original = (await first.run([pdf('original.pdf')]))?.[0].statement
    first.unmount()
    const next = mount()
    const repaired = await next.run([pdf('renamed.pdf')], undefined, false, original?.id)
    expect(repaired?.[0]).toMatchObject({ ok: true, statement: { id: original?.id } })
    expect(harness.parseFile).toHaveBeenCalledTimes(2)
    next.unmount()
  })
})
