import { describe, expect, it, vi } from 'vitest'
import { SyncEngine } from './engine'
import { memoryStorage } from './storage'
import { defaultProfile } from '../store/defaults'
import type { Snapshot } from './model'
import type { Listener } from './transport'

const empty = (): Snapshot => ({ transactions: [], statements: [], rules: [], profile: defaultProfile, prefs: { theme: 'system', periodGrouping: null } })
const tick = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)) }
describe('stopped session isolation', () => {
  it('ignores a listener already awaiting local ownership after logout begins', async () => {
    const storage = memoryStorage()
    let release!: (owner: string) => void
    storage.getOwner = () => new Promise(resolve => { release = resolve })
    let listener!: Listener
    const apply = vi.fn(), commit = vi.fn(async () => {})
    const engine = new SyncEngine({ uid: 'owner', storage, getSnapshot: empty, hasLocalData: () => false, apply,
      replaceLocal: vi.fn(), onState: vi.fn(), transport: { listen: (_uid, next) => { listener = next; return vi.fn() }, commit } })
    await engine.start()
    listener.onSnapshot({ docs: [], full: true, fromCache: false })
    await tick()
    const drained = engine.stopAndDrain()
    release('owner'); await drained
    expect(apply).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    expect(storage.owner).toBe(null)
  })

  it('does not send remaining batches or recreate a cleared ledger after an inflight commit completes', async () => {
    const storage = memoryStorage()
    const local = empty()
    local.transactions = Array.from({ length: 401 }, (_, i) => ({ id: `t-${i}`, date: '2026-11-14', description: 'Test', merchant: 'Test', amount: 100,
      kind: 'expense' as const, category: 'other' as const, categoryLocked: false, bank: 'Manuel', accountLabel: 'Nakit', installment: null, source: 'manual' as const }))
    let listener!: Listener, release!: () => void
    const commit = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
    const engine = new SyncEngine({ uid: 'owner', storage, getSnapshot: () => local, hasLocalData: () => true, apply: vi.fn(),
      replaceLocal: vi.fn(), onState: vi.fn(), transport: { listen: (_uid, next) => { listener = next; return vi.fn() }, commit } })
    await engine.start(); listener.onSnapshot({ docs: [], full: true, fromCache: false }); await tick()
    expect(commit).toHaveBeenCalledTimes(1)
    await engine.stopAndDrain()
    delete storage.ledgers.owner
    release(); await tick()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(storage.ledgers.owner).toBeUndefined()
  })
})
