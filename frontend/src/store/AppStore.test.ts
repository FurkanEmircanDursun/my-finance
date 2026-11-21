import { createElement, type DependencyList, type EffectCallback } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialState, reducer, type AppState } from './state'
import type { Transaction } from '../domain/types'
import { dbReadFinancialState, dbWriteFinancialValue } from './db'
import { AppStoreProvider, useStore } from './AppStore'
import { watchDeviceDataChange } from './deviceDataSignal'

const lifecycle = vi.hoisted(() => ({
  state: null as AppState | null,
  effects: [] as { run: EffectCallback; dependencies: DependencyList | undefined }[],
  rawDispatch: vi.fn(),
  hookIndex: 0,
  hookValues: [] as unknown[],
  view: { sessionError: null as string | null, sessionBusy: false },
  deviceSignal: undefined as undefined | (() => void),
}))

// Capture actual provider effects without a browser or an additional DOM runtime.
// Keep state setters between renders so recoverable feedback can be verified;
// effects still run only when the test explicitly commits their boundary.
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useReducer: () => [lifecycle.state, lifecycle.rawDispatch],
  useState: (initial: unknown) => {
    const index = lifecycle.hookIndex++
    if (!(index in lifecycle.hookValues)) lifecycle.hookValues[index] = typeof initial === 'function' ? initial() : initial
    return [lifecycle.hookValues[index], (next: unknown) => {
      lifecycle.hookValues[index] = typeof next === 'function' ? next(lifecycle.hookValues[index]) : next
    }]
  },
  useEffect: (run: EffectCallback, dependencies?: DependencyList) => {
    lifecycle.effects.push({ run, dependencies })
  },
}))
vi.mock('./db', () => ({ dbReadFinancialState: vi.fn(), dbWriteFinancialValue: vi.fn().mockResolvedValue(true), dbResetFinancialState: vi.fn(), dbFinancialGenerationIsCurrent: vi.fn().mockResolvedValue(false), DeviceDataChangedError: class extends Error {} }))
vi.mock('./deviceDataSignal', () => ({ announceDeviceDataChange: vi.fn(), watchDeviceDataChange: vi.fn((callback: () => void) => { lifecycle.deviceSignal = callback; return () => {} }) }))
vi.mock('../firebase/available', () => ({ cloudAvailable: false }))

const expense: Transaction = {
  id: 'undo-expense', date: '2026-11-14', description: 'Arayüz kontrolü', merchant: 'arayuz kontrolu',
  amount: 12550, kind: 'expense', category: 'market', categoryLocked: true,
  bank: 'Manuel', accountLabel: 'Nakit', installment: null, source: 'manual',
}

function SessionProbe() {
  const { sessionError, sessionBusy } = useStore()
  lifecycle.view = { sessionError, sessionBusy }
  return null
}

function persistenceEffect(state: AppState) {
  lifecycle.state = state
  lifecycle.effects = []
  lifecycle.hookIndex = 0
  renderToStaticMarkup(createElement(AppStoreProvider, { children: createElement(SessionProbe) }))
  const effect = lifecycle.effects.find(({ dependencies }) =>
    dependencies?.includes(state.transactions) && dependencies.includes(state.profile) && dependencies.includes(state.settings),
  )
  if (!effect) throw new Error('Durable-state persistence effect was not registered')
  return effect
}

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers()
  vi.mocked(dbWriteFinancialValue).mockResolvedValue(true)
  lifecycle.hookValues = []; lifecycle.hookIndex = 0; lifecycle.deviceSignal = undefined
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('local persistence commit boundary', () => {
  it('surfaces failed device writes, retains in-memory records, and clears that warning after recovery', async () => {
    const saved = reducer({ ...initialState, hydrated: true }, { type: 'addManual', transaction: expense })
    vi.mocked(dbWriteFinancialValue).mockResolvedValueOnce(false)
    persistenceEffect(saved).run()
    await Promise.resolve(); await Promise.resolve()
    const recovered = persistenceEffect(saved)
    expect(lifecycle.view.sessionError).toContain('bu cihazda kaydedilemedi')
    expect(lifecycle.state?.transactions).toEqual([expense])
    expect(lifecycle.rawDispatch).not.toHaveBeenCalled()
    recovered.run()
    await Promise.resolve(); await Promise.resolve()
    persistenceEffect(saved)
    expect(lifecycle.view.sessionError).toBeNull()
  })

  it('does not clear an unrelated session error when a later device write succeeds', async () => {
    vi.mocked(dbReadFinancialState).mockResolvedValueOnce({ version: 999 })
    persistenceEffect(initialState); lifecycle.effects[0].run()
    await Promise.resolve(); await Promise.resolve()
    const saved = { ...initialState, hydrated: true }
    vi.mocked(dbWriteFinancialValue).mockResolvedValueOnce(false)
    persistenceEffect(saved).run()
    await Promise.resolve(); await Promise.resolve()
    const retry = persistenceEffect(saved)
    expect(lifecycle.view.sessionError).toContain('bu sürümde okunamıyor')
    expect(lifecycle.view.sessionError).toContain('bu cihazda kaydedilemedi')
    retry.run()
    await Promise.resolve(); await Promise.resolve()
    persistenceEffect(saved)
    expect(lifecycle.view.sessionError).toContain('bu sürümde okunamıyor')
    expect(lifecycle.view.sessionError).not.toContain('bu cihazda kaydedilemedi')
  })

  it('surfaces non-generation persistence exceptions without exposing raw error contents', async () => {
    vi.mocked(dbWriteFinancialValue).mockRejectedValueOnce(new Error('private storage failure details'))
    const saved = { ...initialState, hydrated: true }
    persistenceEffect(saved).run()
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    persistenceEffect(saved)
    expect(lifecycle.view.sessionError).toContain('bu cihazda kaydedilemedi')
    expect(lifecycle.view.sessionError).not.toContain('private')
  })

  it('reports lifecycle flush failures and ignores older write completions after a newer retry succeeds', async () => {
    const host = new EventTarget(), document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    vi.stubGlobal('window', host); vi.stubGlobal('document', document)
    const saved = { ...initialState, hydrated: true }
    persistenceEffect(saved)
    const effect = lifecycle.effects.find(({ dependencies }) => dependencies?.length === 0)!
    const cleanup = effect.run()
    let finishOlder!: (result: boolean) => void
    vi.mocked(dbWriteFinancialValue).mockImplementationOnce(() => new Promise(resolve => { finishOlder = resolve }))
    host.dispatchEvent(new Event('pagehide'))
    vi.mocked(dbWriteFinancialValue).mockResolvedValueOnce(false)
    host.dispatchEvent(new Event('pagehide'))
    await Promise.resolve(); await Promise.resolve()
    persistenceEffect(saved)
    expect(lifecycle.view.sessionError).toContain('bu cihazda kaydedilemedi')
    host.dispatchEvent(new Event('pagehide'))
    await Promise.resolve(); await Promise.resolve()
    finishOlder(false)
    await Promise.resolve(); await Promise.resolve()
    persistenceEffect(saved)
    expect(lifecycle.view.sessionError).toBeNull()
    if (typeof cleanup === 'function') cleanup()
    vi.unstubAllGlobals()
  })

  it('refuses an unreadable peer generation instead of hydrating and persisting an empty replacement', async () => {
    const saved = reducer({ ...initialState, hydrated: true }, { type: 'addManual', transaction: expense })
    vi.mocked(dbReadFinancialState).mockResolvedValueOnce(undefined)
    persistenceEffect(saved)
    for (const effect of lifecycle.effects.filter(({ dependencies }) => dependencies?.length === 1)) effect.run()
    await Promise.resolve(); await Promise.resolve()
    expect(watchDeviceDataChange).toHaveBeenCalledOnce()
    vi.clearAllMocks()
    vi.mocked(dbReadFinancialState).mockResolvedValueOnce({ version: 999, transactions: [{ id: 'new-generation-money' }] })
    lifecycle.deviceSignal?.()
    for (let i = 0; i < 8; i++) await Promise.resolve()
    persistenceEffect(saved)
    expect(lifecycle.rawDispatch).toHaveBeenCalledWith({ type: 'clearData' })
    expect(lifecycle.rawDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'hydrate' }))
    expect(dbWriteFinancialValue).not.toHaveBeenCalled()
    expect(lifecycle.view.sessionBusy).toBe(true)
    expect(lifecycle.view.sessionError).toContain('bu sürümde okunamıyor')
  })
  it('does not replace an unreadable future snapshot with empty financial data', async () => {
    vi.mocked(dbReadFinancialState).mockResolvedValueOnce({ version: 999, transactions: [{ id: 'valuable-record' }] })
    persistenceEffect(initialState)
    lifecycle.effects[0].run()
    await Promise.resolve(); await Promise.resolve()
    expect(lifecycle.rawDispatch).not.toHaveBeenCalled()
    expect(dbWriteFinancialValue).not.toHaveBeenCalled()
  })

  it('hydrates an empty state only when there is no saved snapshot', async () => {
    vi.mocked(dbReadFinancialState).mockResolvedValueOnce(undefined)
    persistenceEffect(initialState)
    lifecycle.effects[0].run()
    await Promise.resolve(); await Promise.resolve()
    expect(lifecycle.rawDispatch).toHaveBeenCalledWith({ type: 'hydrate', payload: {} })
  })

  it('keeps the financial app unhydrated when another version blocks the device database', async () => {
    vi.mocked(dbReadFinancialState).mockRejectedValueOnce(new Error('blocked legacy connection'))
    persistenceEffect(initialState)
    lifecycle.effects[0].run()
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    persistenceEffect(initialState)
    expect(lifecycle.rawDispatch).not.toHaveBeenCalled()
    expect(dbWriteFinancialValue).not.toHaveBeenCalled()
    expect(lifecycle.view.sessionError).toContain('Mizan sekmelerini kapatıp yeniden yükle')
    expect(lifecycle.view.sessionError).not.toContain('legacy')
  })
  it('queues the undone snapshot immediately, before a reload can beat a debounce', () => {
    const hydrated = { ...initialState, hydrated: true }
    const saved = reducer(hydrated, { type: 'addManual', transaction: expense })
    persistenceEffect(saved).run()
    expect(dbWriteFinancialValue).toHaveBeenLastCalledWith('state', expect.objectContaining({ transactions: [expense] }))

    const undone = reducer(saved, { type: 'deleteTransactions', ids: [expense.id] })
    persistenceEffect(undone).run()

    // No timer advancement, pagehide or visibilitychange is needed to save Undo.
    expect(dbWriteFinancialValue).toHaveBeenCalledTimes(2)
    expect(dbWriteFinancialValue).toHaveBeenLastCalledWith('state', expect.objectContaining({ transactions: [] }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not persist the empty initial state before hydration', () => {
    persistenceEffect(initialState).run()
    expect(dbWriteFinancialValue).not.toHaveBeenCalled()
  })

  it('keeps persistence dependencies unchanged for transient search and notices', () => {
    const hydrated = { ...initialState, hydrated: true, notices: ['Kontrol'] }
    const searched = reducer(hydrated, { type: 'setFilters', filters: { query: 'market' } })
    const dismissed = reducer(searched, { type: 'dismissNotices' })
    expect(persistenceEffect(searched).dependencies).toEqual(persistenceEffect(hydrated).dependencies)
    expect(persistenceEffect(dismissed).dependencies).toEqual(persistenceEffect(hydrated).dependencies)
  })
})
