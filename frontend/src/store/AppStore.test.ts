import { createElement, type DependencyList, type EffectCallback } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialState, reducer, type AppState } from './state'
import type { Transaction } from '../domain/types'
import { dbSet } from './db'
import { AppStoreProvider } from './AppStore'

const lifecycle = vi.hoisted(() => ({
  state: null as AppState | null,
  effects: [] as { run: EffectCallback; dependencies: DependencyList | undefined }[],
}))

// Capture actual provider effects without a browser or an additional DOM runtime.
// All other hooks use React's server renderer; only the reducer fixture and the
// effect commit boundary are supplied by this harness.
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useReducer: () => [lifecycle.state, vi.fn()],
  useEffect: (run: EffectCallback, dependencies?: DependencyList) => {
    lifecycle.effects.push({ run, dependencies })
  },
}))
vi.mock('./db', () => ({ dbGet: vi.fn(), dbSet: vi.fn().mockResolvedValue(true) }))
vi.mock('../firebase/available', () => ({ cloudAvailable: false }))

const expense: Transaction = {
  id: 'undo-expense', date: '2026-11-14', description: 'Arayüz kontrolü', merchant: 'arayuz kontrolu',
  amount: 12550, kind: 'expense', category: 'market', categoryLocked: true,
  bank: 'Manuel', accountLabel: 'Nakit', installment: null, source: 'manual',
}

function persistenceEffect(state: AppState) {
  lifecycle.state = state
  lifecycle.effects = []
  renderToStaticMarkup(createElement(AppStoreProvider))
  const effect = lifecycle.effects.find(({ dependencies }) =>
    dependencies?.includes(state.transactions) && dependencies.includes(state.profile) && dependencies.includes(state.settings),
  )
  if (!effect) throw new Error('Durable-state persistence effect was not registered')
  return effect
}

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('local persistence commit boundary', () => {
  it('queues the undone snapshot immediately, before a reload can beat a debounce', () => {
    const hydrated = { ...initialState, hydrated: true }
    const saved = reducer(hydrated, { type: 'addManual', transaction: expense })
    persistenceEffect(saved).run()
    expect(dbSet).toHaveBeenLastCalledWith('state', expect.objectContaining({ transactions: [expense] }))

    const undone = reducer(saved, { type: 'deleteTransactions', ids: [expense.id] })
    persistenceEffect(undone).run()

    // No timer advancement, pagehide or visibilitychange is needed to save Undo.
    expect(dbSet).toHaveBeenCalledTimes(2)
    expect(dbSet).toHaveBeenLastCalledWith('state', expect.objectContaining({ transactions: [] }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not persist the empty initial state before hydration', () => {
    persistenceEffect(initialState).run()
    expect(dbSet).not.toHaveBeenCalled()
  })

  it('keeps persistence dependencies unchanged for transient search and notices', () => {
    const hydrated = { ...initialState, hydrated: true, notices: ['Kontrol'] }
    const searched = reducer(hydrated, { type: 'setFilters', filters: { query: 'market' } })
    const dismissed = reducer(searched, { type: 'dismissNotices' })
    expect(persistenceEffect(searched).dependencies).toEqual(persistenceEffect(hydrated).dependencies)
    expect(persistenceEffect(dismissed).dependencies).toEqual(persistenceEffect(hydrated).dependencies)
  })
})
