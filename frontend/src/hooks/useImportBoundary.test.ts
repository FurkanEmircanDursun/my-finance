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
vi.mock('../store/AppStore', () => ({ useStore: () => ({ state: harness.state, dispatch: harness.dispatch }) }))
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
