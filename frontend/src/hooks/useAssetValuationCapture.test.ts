import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialState, reducer, type Action, type AppState } from '../store/state'
import { createManualAssetValuation } from '../domain/assetsHistory'
import type { AssetQuotes } from '../domain/assets'
import { useAssetValuationCapture } from './useAssetValuationCapture'

const harness = vi.hoisted(() => ({ state: null as AppState | null, dispatch: vi.fn(), effects: [] as (() => void)[] }))
vi.mock('../store/AppStore', () => ({ useStore: () => ({ state: harness.state, dispatch: harness.dispatch }) }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useEffect: (effect: () => void) => { harness.effects.push(effect) } }))

const now = Date.parse('2026-11-14T12:00:00+03:00')
const quotes: AssetQuotes = { usd: { instrument: 'usd', tryPerUnit: 40, asOf: now - 1000, source: 'truncgil', kind: 'market', cached: false } }
function Harness({ value }: { value: AssetQuotes }) { useAssetValuationCapture(value); return null }
function commit(value = quotes) {
  renderToStaticMarkup(createElement(Harness, { value }))
  const effects = harness.effects.splice(0)
  for (const effect of effects) effect()
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now)
  harness.effects = []; harness.dispatch.mockReset()
  harness.state = { ...initialState, hydrated: true, profile: { ...initialState.profile, assets: [{ id: 'usd', instrument: 'usd', quantityMicros: 1_000_000, updatedAt: now }] } }
  harness.dispatch.mockImplementation((action: Action) => { harness.state = reducer(harness.state!, action) })
})
afterEach(() => vi.restoreAllMocks())

describe('portfolio observation lifecycle', () => {
  it('captures the current complete valuation once and follows a quantity update', () => {
    commit(); commit()
    expect(harness.dispatch).toHaveBeenCalledTimes(1)
    expect(harness.state!.profile.assetValuations?.[0].totalMinor).toBe(4000)
    harness.state = { ...harness.state!, profile: { ...harness.state!.profile, assets: [{ id: 'usd', instrument: 'usd', quantityMicros: 2_000_000, updatedAt: now }] } }
    commit()
    expect(harness.state.profile.assetValuations?.[0].totalMinor).toBe(8000)
  })
  it('does not create a snapshot from missing or cached prices', () => {
    commit({}); commit({ usd: { ...quotes.usd!, cached: true } })
    expect(harness.dispatch).not.toHaveBeenCalled()
  })
  it('records explicit portfolio removal as zero but does not repopulate a reset device', () => {
    commit()
    harness.state = { ...harness.state!, profile: { ...harness.state!.profile, assets: [] } }
    commit()
    expect(harness.state.profile.assetValuations?.[0].totalMinor).toBe(0)
    harness.state = reducer(harness.state, { type: 'reset' })
    harness.dispatch.mockClear(); commit()
    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(harness.state.profile.assetValuations).toEqual([])
  })
  it('does not interpret a manually backfilled history as a known empty current portfolio', () => {
    harness.state = { ...initialState, hydrated: true, profile: { ...initialState.profile, assetValuations: [createManualAssetValuation('2026-10-31', 100_000, now)!] } }
    commit()
    expect(harness.dispatch).not.toHaveBeenCalled()
  })
})
