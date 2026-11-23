import { describe, expect, it, vi } from 'vitest'
import { SyncEngine } from './engine'
import { memoryStorage } from './storage'
import { defaultProfile } from '../store/defaults'
import type { Snapshot } from './model'
import type { CommitOp, Listener } from './transport'

const empty = (): Snapshot => ({ transactions: [], statements: [], rules: [], profile: defaultProfile, prefs: { theme: 'system', periodGrouping: null } })
const tick = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)) }
describe('stopped session isolation', () => {
  it('reuses an open listener during startup retry and recreates it after an actual listener error', async () => {
    let listener!: Listener
    const listen = vi.fn((_uid, next: Listener) => { listener = next; return vi.fn() })
    const engine = new SyncEngine({
      uid: 'owner', storage: memoryStorage(), getSnapshot: empty, hasLocalData: () => false,
      apply: vi.fn(), replaceLocal: vi.fn(), onState: vi.fn(),
      transport: { listen, commit: vi.fn(async () => {}) },
    })
    try {
      await engine.start()
      engine.syncNow()
      await tick()
      expect(listen).toHaveBeenCalledTimes(1)
      listener.onError({ code: 'unavailable' })
      engine.syncNow()
      await tick()
      expect(listen).toHaveBeenCalledTimes(2)
    } finally { engine.stop() }
  })

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

  it('orders undo writes after an in-flight deletion and skips older pending tombstones', async () => {
    const original = empty()
    original.transactions = Array.from({ length: 401 }, (_, i) => ({
      id: `t-${i}`, date: '2026-11-14', description: 'Sample', merchant: 'SAMPLE', amount: 100,
      kind: 'expense', category: 'other', categoryLocked: true, bank: 'Akbank',
      accountLabel: 'Sample', installment: null, source: 'statement', statementId: 'st-1',
    }))
    original.statements = [{
      id: 'st-1', label: 'Sample', fileName: 'sample.pdf', bank: 'Akbank',
      transactionCount: 401, skippedCount: 0, periodStart: null, periodEnd: '2026-11-15',
      dueDate: null, importedAt: 1, engine: 'pdf-text',
    }]
    let local = original
    let listener!: Listener
    let finishDelete!: () => void
    const commit = vi.fn(async (_uid: string, _ops: CommitOp[]) => {})
    const engine = new SyncEngine({
      uid: 'owner', storage: memoryStorage(), getSnapshot: () => local, hasLocalData: () => true,
      apply: vi.fn(), replaceLocal: vi.fn(), onState: vi.fn(),
      transport: { listen: (_uid, next) => { listener = next; return vi.fn() }, commit },
    })
    try {
      await engine.start()
      listener.onSnapshot({ docs: [], full: true, fromCache: false })
      await tick()
      commit.mockClear().mockImplementationOnce(() => new Promise<void>(resolve => { finishDelete = resolve }))
      local = empty()
      engine.syncNow()
      await tick()
      expect(commit).toHaveBeenCalledOnce()
      expect(commit.mock.calls[0][1]).toHaveLength(400)
      expect(commit.mock.calls[0][1].every(op => 'deleted' in op && op.deleted)).toBe(true)
      local = original
      engine.syncNow()
      await tick()
      expect(commit).toHaveBeenCalledOnce()
      finishDelete()
      await tick()
      const restored = commit.mock.calls.slice(1).flatMap(([, ops]) => ops)
      expect(restored).toHaveLength(402)
      expect(restored.every(op => 'deleted' in op && !op.deleted)).toBe(true)
      expect(restored).toContainEqual(expect.objectContaining({ kind: 'statements', id: 'st-1' }))
      expect(engine.getState()).toMatchObject({ status: 'synced', pending: 0 })
    } finally { engine.stop() }
  })

  it('retries only the failed group after a large statement import', async () => {
    const local = empty()
    local.transactions = Array.from({ length: 401 }, (_, i) => ({ id: `t-${i}`, date: '2026-11-14',
      description: 'Sample', merchant: 'SAMPLE', amount: 100, kind: 'expense' as const,
      category: 'other' as const, categoryLocked: false, bank: 'Manuel', accountLabel: 'Nakit',
      installment: null, source: 'manual' as const,
    }))
    let listener!: Listener
    const commit = vi.fn(async () => {}).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('retry'))
    const engine = new SyncEngine({
      uid: 'owner', storage: memoryStorage(), getSnapshot: () => local, hasLocalData: () => true,
      apply: vi.fn(), replaceLocal: vi.fn(), onState: vi.fn(), retryMs: [60_000],
      transport: { listen: (_uid, next) => { listener = next; return vi.fn() }, commit },
    })
    try {
      await engine.start()
      listener.onSnapshot({ docs: [], full: true, fromCache: false })
      await tick()
      expect(engine.getState()).toMatchObject({ status: 'error', pending: 1 })
      engine.syncNow()
      await tick()
      expect(commit).toHaveBeenCalledTimes(3)
      expect(commit.mock.calls[2]).toEqual(commit.mock.calls[1])
      expect(engine.getState()).toMatchObject({ status: 'synced', pending: 0 })
    } finally { engine.stop() }
  })
})
