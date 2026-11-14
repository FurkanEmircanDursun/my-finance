import { describe, expect, it } from 'vitest'
import { createManualAssetValuation } from '../domain/assetsHistory'
import { analyze } from '../analytics/engine'
import { applyChange, diffLocal, emptyChange, hasFinancialData } from '../sync/model'
import { applyBackup, buildBackup, parseBackup } from './backup'
import { defaultProfile, defaultSettings } from './defaults'
import { migratePersisted, STATE_VERSION } from './migrate'
import { initialState, toSnapshot } from './state'

const now = Date.parse('2026-11-14T12:00:00+03:00')
const observation = createManualAssetValuation('2026-10-31', 1_000_000, now)!
const state = { ...initialState, hydrated: true, profile: { ...defaultProfile, assetValuations: [observation] } }

describe('asset history persistence and compatibility', () => {
  it('round trips a history-only profile through export, validation and replacement', () => {
    const backup = buildBackup({ state, overall: analyze([], state.profile), appVersion: '2.6.0' })
    const parsed = parseBackup(JSON.stringify(backup))
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.backup.data.profile.assetValuations).toEqual([observation])
    expect(applyBackup(initialState, parsed.backup.data, 'replace').profile.assetValuations).toEqual([observation])
  })
  it('merges disjoint months and keeps the latest dated observation', () => {
    const september = createManualAssetValuation('2026-09-30', 900_000, now)!
    const oldOctober = createManualAssetValuation('2026-10-01', 500_000, now + 1000)!
    const incoming = { version: STATE_VERSION, transactions: [], statements: [], rules: [], settings: defaultSettings, profile: { ...defaultProfile, assetValuations: [september, oldOctober] } }
    expect(applyBackup(state, incoming, 'merge').profile.assetValuations).toEqual([september, observation])
  })
  it('normalizes legacy and malformed persisted histories without creating earlier data', () => {
    const { assetValuations: _history, ...legacy } = defaultProfile
    expect(migratePersisted({ version: 3, transactions: [], statements: [], rules: [], profile: legacy, settings: defaultSettings })?.state.profile.assetValuations).toEqual([])
    expect(migratePersisted({ version: 3, transactions: [], statements: [], rules: [], profile: { ...defaultProfile, assetValuations: [{ ...observation, totalMinor: -1 }] }, settings: defaultSettings })?.state.profile.assetValuations).toEqual([])
  })
  it('preserves history when an older remote profile omits it while honoring explicit clearing', () => {
    const { assetValuations: _history, ...legacy } = defaultProfile
    expect(applyChange(toSnapshot(state), { ...emptyChange(), profile: legacy }).profile.assetValuations).toEqual([observation])
    expect(applyChange(toSnapshot(state), { ...emptyChange(), profile: { ...defaultProfile, assetValuations: [] } }).profile.assetValuations).toEqual([])
  })
  it('recognizes history-only ownership and uploads it rather than treating it as factory data', () => {
    expect(hasFinancialData(toSnapshot(state))).toBe(true)
    expect(hasFinancialData(toSnapshot(initialState))).toBe(false)
    expect(diffLocal({}, toSnapshot(state), now).writes.some(write => write.kind === 'profile' && !write.deleted)).toBe(true)
  })
  it('converges disjoint device observations without dropping locally known months', () => {
    const september = createManualAssetValuation('2026-09-30', 900_000, now)!
    const incoming = { ...defaultProfile, assetValuations: [september] }
    expect(applyChange(toSnapshot(state), { ...emptyChange(), profile: incoming }).profile.assetValuations).toEqual([september, observation])
    expect(applyChange(toSnapshot(state), { ...emptyChange(), profile: { ...defaultProfile, assetValuations: [{ ...observation, totalMinor: -1 }] } }).profile.assetValuations).toEqual([observation])
  })
})
