import { describe, expect, it } from 'vitest'
import { contentHash, type RemoteDoc } from '../sync/model'
import type { Transaction } from '../domain/types'
import { prepareLegacyState } from './legacyCloudMigration'
import { initialState, reducer } from './state'

const transaction: Transaction = {
  id: 'legacy-expense', date: '2026-11-14', description: 'Market', merchant: 'market',
  amount: 12550, kind: 'expense', category: 'market', categoryLocked: true,
  bank: 'Manuel', accountLabel: 'Nakit', installment: null, source: 'manual',
}
const state = { ...initialState, transactions: [transaction] }
const migrated = { state, notes: [], migratedFrom: null }
const key = 'transactions/legacy-expense'
const remote: RemoteDoc = { kind: 'transactions', id: transaction.id, u: 25, deleted: false, data: transaction }

describe('legacy device to account migration', () => {
  it('retains local-only rows and separates the staged records from the ready workspace', () => {
    const seed = prepareLegacyState(migrated, {}, [])
    expect(seed.state.transactions).toEqual([transaction])
    const staged = reducer(initialState, { type: 'seedSession', payload: seed.state })
    expect(staged.hydrated).toBe(false)
    expect(reducer(staged, { type: 'resetSession' })).toEqual(initialState)
  })

  it('preserves a cloud transaction and tombstone when there is no shared baseline', () => {
    expect(prepareLegacyState(migrated, {}, [remote]).state.transactions).toEqual([])
    expect(prepareLegacyState(migrated, {}, [{ ...remote, deleted: true }]).state.transactions).toEqual([])
  })

  it('replays an edit against its unchanged baseline and defers to a later cloud update', () => {
    const ledger = { [key]: { h: contentHash({ ...transaction, amount: 50 }), u: 25 } }
    expect(prepareLegacyState(migrated, ledger, [remote]).state.transactions).toEqual([transaction])
    expect(prepareLegacyState(migrated, ledger, [{ ...remote, u: 26 }]).state.transactions).toEqual([])
  })

  it('replays only still outstanding removals and leaves remote hard deletes absent', () => {
    const deletion = { h: '', u: 26, p: true, d: true } as const
    expect(prepareLegacyState(migrated, { [key]: deletion }, [remote]).pendingDeletions).toEqual({ [key]: deletion })
    expect(prepareLegacyState(migrated, { [key]: deletion }, [{ ...remote, u: 27 }]).pendingDeletions).toEqual({})
    expect(prepareLegacyState(migrated, { [key]: { h: contentHash(transaction), u: 25 } }, []).state.transactions).toEqual([])
  })

  it('preserves the account theme and moves reminder settings without moving PIN credentials', () => {
    const settings = { ...state.settings, reminders: { enabled: true, hour: 9 }, lockPinHash: 'secret', lockPinSalt: 'salt' }
    const seed = prepareLegacyState({ ...migrated, state: { ...state, settings } }, {}, [{
      kind: 'prefs', id: 'prefs', u: 25, deleted: false, data: { theme: 'dark', periodGrouping: 'calendar' },
    }])
    expect(seed.state.settings).toMatchObject({ theme: 'dark', reminders: { enabled: true, hour: 9 }, lockPinHash: null, lockPinSalt: null })
  })
})
