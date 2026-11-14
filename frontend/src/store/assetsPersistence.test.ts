import { describe, expect, it } from 'vitest'
import { buildBackup, parseBackup, applyBackup } from './backup'
import { defaultProfile, defaultSettings } from './defaults'
import { initialState, toSnapshot } from './state'
import { migratePersisted, STATE_VERSION } from './migrate'
import { analyze } from '../analytics/engine'
import { applyChange, emptyChange, diffLocal } from '../sync/model'
import type { AssetHolding } from '../domain/assets'

const holding: AssetHolding = { id: 'usd-holding', instrument: 'usd', quantityMicros: 100_000_000, updatedAt: 100 }
const state = { ...initialState, hydrated: true, profile: { ...defaultProfile, assets: [holding] } }

describe('holdings preservation across existing storage boundaries', () => {
  it('round trips an asset-only portfolio through a real exported backup', () => {
    const backup = buildBackup({ state, overall: analyze([], state.profile), appVersion: '2.6.0' })
    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.backup.preview.assets).toBe(1)
    expect(parsed.backup.data.profile.assets).toEqual([holding])
    expect(applyBackup(initialState, parsed.backup.data, 'replace').profile.assets).toEqual([holding])
  })
  it('merges holdings by ID while retaining an edited local amount', () => {
    const incoming = { version: STATE_VERSION, transactions: [], statements: [], rules: [], settings: defaultSettings,
      profile: { ...defaultProfile, assets: [{ ...holding, quantityMicros: 1 }, { ...holding, id: 'second' }] } }
    expect(applyBackup(state, incoming, 'merge').profile.assets).toEqual([holding, { ...holding, id: 'second' }])
  })
  it('opens old snapshots without losing financial history or inventing holdings', () => {
    const { assets: _assets, ...oldProfile } = defaultProfile
    const migrated = migratePersisted({ version: 3, transactions: [], statements: [], rules: [], profile: oldProfile, settings: defaultSettings })
    expect(migrated?.state.profile.assets).toEqual([])
    expect(migrated?.state.transactions).toEqual([])
  })
  it('does not let a pre-assets client erase holdings by updating another profile field', () => {
    const { assets: _assets, ...legacy } = defaultProfile
    const change = { ...emptyChange(), profile: { ...legacy, spendingLimit: 2_000_000 } }
    expect(applyChange(toSnapshot(state), change).profile.assets).toEqual([holding])
    expect(applyChange(toSnapshot(state), change).profile.spendingLimit).toBe(2_000_000)
  })
  it('honors an explicit empty portfolio and filters malformed incoming rows', () => {
    expect(applyChange(toSnapshot(state), { ...emptyChange(), profile: { ...defaultProfile, assets: [] } }).profile.assets).toEqual([])
    expect(applyChange(toSnapshot(state), { ...emptyChange(), profile: { ...defaultProfile, assets: [{ ...holding, quantityMicros: -1 }] } }).profile.assets).toEqual([])
  })
  it('includes an asset-only profile in cloud writes instead of treating it as factory empty', () => {
    const result = diffLocal({}, toSnapshot(state), 200)
    expect(result.writes.some(write => write.kind === 'profile' && !write.deleted && (write.data as typeof state.profile).assets?.length === 1)).toBe(true)
  })
})
