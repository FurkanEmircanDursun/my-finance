import { describe, expect, it } from 'vitest'
import { SyncEngine, type SyncState } from './engine'
import { MemoryCloud, type MemoryDevice } from './memoryTransport'
import { memoryStorage } from './storage'
import { applyChange, docIdOf, type Prefs, type RemoteChange, type Snapshot } from './model'
import type { CommitOp, SyncTransport } from './transport'
import { defaultProfile } from '../store/defaults'
import type { CategoryRule, Statement, Transaction } from '../domain/types'

/**
 * Two or three devices, one cloud, and the things that go wrong between them:
 * one offline, one stale, one edited while the other deleted. The Firestore
 * adapter is a thin shell around the interface these run against.
 */

const UID = 'u1'

function tx(id: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id, date: '2026-09-01', description: id.toUpperCase(), merchant: id.toUpperCase(), amount: 10_000,
    kind: 'expense', category: 'other', categoryLocked: false, bank: 'Akbank', accountLabel: 'Akbank Axess',
    installment: null, source: 'statement', statementId: 'st-1', ...over,
  }
}

const statement = (id = 'st-1'): Statement => ({
  id, label: 'Akbank Axess · Eylül 2026', fileName: 'a.pdf', bank: 'Akbank', transactionCount: 2,
  skippedCount: 0, periodStart: '2026-08-29', periodEnd: '2026-09-26', dueDate: '2026-10-06',
  importedAt: 1, engine: 'pdf-ebcdic',
})

const rule = (merchant: string, category: CategoryRule['category'], id = `rule-${merchant}`): CategoryRule => ({
  id, merchant, category, createdAt: 1,
})

const PREFS: Prefs = { theme: 'system', periodGrouping: null }

/** A phone, a laptop: local state, a ledger, an engine, a connection. */
class Device {
  snapshot: Snapshot
  readonly storage = memoryStorage()
  readonly link: MemoryDevice
  readonly states: SyncState[] = []
  commits = 0
  engine!: SyncEngine
  replaced = 0

  constructor(
    readonly cloud: MemoryCloud,
    readonly name: string,
    initial: Partial<Snapshot> = {},
    private clock: { t: number },
    opts: { retryMs?: number[]; transport?: (inner: MemoryDevice) => SyncTransport } = {},
  ) {
    this.snapshot = {
      transactions: [], statements: [], rules: [], profile: defaultProfile, prefs: PREFS, ...initial,
    }
    this.link = cloud.device(name)
    const counted: SyncTransport = {
      listen: (uid, l) => this.link.listen(uid, l),
      commit: (uid, ops: CommitOp[]) => {
        this.commits++
        return this.link.commit(uid, ops)
      },
    }
    this.build(opts.transport ? opts.transport(this.link) : counted, opts.retryMs)
  }

  private build(transport: SyncTransport, retryMs: number[] = [1]) {
    this.engine = new SyncEngine({
      uid: UID,
      transport,
      storage: this.storage,
      getSnapshot: () => this.snapshot,
      apply: (change: RemoteChange) => {
        this.snapshot = applyChange(this.snapshot, change)
      },
      replaceLocal: () => {
        this.replaced++
        this.snapshot = { ...this.snapshot, transactions: [], statements: [], rules: [], profile: defaultProfile }
      },
      hasLocalData: () => this.snapshot.transactions.length > 0 || this.snapshot.statements.length > 0,
      onState: (s) => this.states.push(s),
      now: () => ++this.clock.t,
      debounceMs: 0,
      retryMs,
    })
  }

  async connect() {
    await this.engine.start()
    await settle()
  }

  /** Edit the local state the way the reducer would, then tell the engine. */
  async edit(fn: (s: Snapshot) => Snapshot) {
    this.snapshot = fn(this.snapshot)
    this.engine.notify()
    await settle()
  }

  get ids() {
    return this.snapshot.transactions.map((t) => t.id).sort()
  }

  get status() {
    return this.engine.getState().status
  }

  tx(id: string) {
    return this.snapshot.transactions.find((t) => t.id === id)
  }
}

/** Lets every queued microtask and callback run; no timers, so it is instant. */
async function settle(rounds = 20) {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r))
}

/** For the one behaviour that is about a timer: the retry after a failure. */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function world() {
  const cloud = new MemoryCloud()
  const clock = { t: 1_000 }
  const device = (name: string, initial: Partial<Snapshot> = {}, opts = {}) => new Device(cloud, name, initial, clock, opts)
  return { cloud, clock, device }
}

describe('recovering a terminated snapshot listener', () => {
  it('reattaches after an initial listener failure and keeps remote data', async () => {
    const { device } = world()
    const seeded = device('seed', { transactions: [tx('remote')] })
    await seeded.connect()
    seeded.engine.stop()
    let attempts = 0
    const a = device('retrying', { transactions: [tx('local')] }, {
      retryMs: [60_000],
      transport: (inner: MemoryDevice): SyncTransport => ({
        commit: (uid, ops) => inner.commit(uid, ops),
        listen: (uid, listener) => {
          attempts++
          if (attempts === 1) {
            queueMicrotask(() => listener.onError(new Error('permission temporarily unavailable')))
            return () => undefined
          }
          return inner.listen(uid, listener)
        },
      }),
    })
    await a.connect()
    expect(a.status).toBe('error')
    a.engine.syncNow()
    await settle()
    expect(attempts).toBe(2)
    expect(a.ids).toEqual(['local', 'remote'])
    expect(a.status).toBe('synced')
    a.engine.stop()
  })
})

/* ── Getting data up, and down ────────────────────────────────────────────── */

describe('a first device', () => {
  it('uploads what it has and says it is synced', async () => {
    const { cloud, device } = world()
    const a = device('phone', { transactions: [tx('a'), tx('b')], statements: [statement()] })
    await a.connect()

    expect(cloud.contents(UID).map((d) => `${d.kind}/${d.id}`).sort()).toEqual([
      'statements/st-1', 'transactions/a', 'transactions/b',
    ])
    expect(a.status).toBe('synced')
    expect(a.engine.getState().pending).toBe(0)
    expect(a.engine.getState().lastSyncedAt).not.toBeNull()
  })

  it('stamps every document, so the cloud can tell new from old', async () => {
    const { cloud, device } = world()
    await device('phone', { transactions: [tx('a')] }).connect()
    expect(cloud.contents(UID)[0].u).toBeGreaterThan(0)
  })
})

describe('a second device', () => {
  it('receives the first one’s data, and has nothing left to send', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a'), tx('b')], statements: [statement()] })
    await a.connect()

    const b = device('laptop')
    await b.connect()

    expect(b.ids).toEqual(['a', 'b'])
    expect(b.snapshot.statements).toHaveLength(1)
    expect(b.commits).toBe(0)
  })

  it('and then hears about later changes without being asked', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()

    await a.edit((s) => ({ ...s, transactions: [...s.transactions, tx('later')] }))
    expect(b.ids).toEqual(['a', 'later'])
  })
})

describe('edits', () => {
  it('travel: a category corrected on one device is corrected on the other', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()

    await a.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === 'a' ? { ...t, category: 'market', categoryLocked: true } : t)) }))

    expect(b.tx('a')).toMatchObject({ category: 'market', categoryLocked: true })
  })

  it('do not echo: once everyone agrees, nothing more is sent', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()
    await a.edit((s) => ({ ...s, transactions: s.transactions.map((t) => ({ ...t, category: 'market' as const })) }))

    const before = [a.commits, b.commits]
    a.engine.syncNow()
    b.engine.syncNow()
    await settle()
    expect([a.commits, b.commits]).toEqual(before)
  })
})

/* ── Deleting safely ──────────────────────────────────────────────────────── */

describe('deleting', () => {
  it('reaches the other device as a deletion, and the cloud keeps a tombstone', async () => {
    const { cloud, device } = world()
    const a = device('phone', { transactions: [tx('a'), tx('b')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()

    await a.edit((s) => ({ ...s, transactions: s.transactions.filter((t) => t.id !== 'a') }))

    expect(b.ids).toEqual(['b'])
    expect(cloud.contents(UID).find((d) => d.id === 'a')).toMatchObject({ deleted: true })
  })

  it('removing a whole statement removes its rows everywhere', async () => {
    const { device } = world()
    const a = device('phone', { statements: [statement()], transactions: [tx('a'), tx('b')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()

    await a.edit((s) => ({ ...s, statements: [], transactions: [] }))
    expect(b.snapshot.statements).toHaveLength(0)
    expect(b.ids).toEqual([])
  })

  it('never lets a stale device wipe what another added — the bug the old scheme had', async () => {
    const { cloud, device } = world()
    const a = device('phone', { transactions: [tx('a')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()

    // The laptop drops off the network. The phone adds a statement's worth of rows.
    b.link.setOnline(false)
    await a.edit((s) => ({ ...s, transactions: [...s.transactions, tx('x1'), tx('x2')] }))

    // While away the laptop saves something of its own…
    await b.edit((s) => ({ ...s, transactions: [...s.transactions, tx('laptop-only')] }))

    // …and when it is back, nothing is lost on either side.
    b.link.setOnline(true)
    await settle()

    expect(a.ids).toEqual(['a', 'laptop-only', 'x1', 'x2'])
    expect(b.ids).toEqual(['a', 'laptop-only', 'x1', 'x2'])
    expect(cloud.contents(UID).filter((d) => !d.deleted)).toHaveLength(4)
  })

  it('lets a re-added row win over the tombstone that deleted it', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()

    await a.edit((s) => ({ ...s, transactions: [] }))
    expect(b.ids).toEqual([])

    // The same statement is imported again: same id, newer stamp.
    await a.edit((s) => ({ ...s, transactions: [tx('a')] }))
    expect(b.ids).toEqual(['a'])
    expect(a.ids).toEqual(['a'])
  })

  it('tells a device that was away that a row it still holds was deleted', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a'), tx('b')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()

    b.link.setOnline(false)
    await a.edit((s) => ({ ...s, transactions: s.transactions.filter((t) => t.id !== 'a') }))
    b.link.setOnline(true)
    await settle()

    expect(b.ids).toEqual(['b'])
  })
})

/* ── Concurrent edits ─────────────────────────────────────────────────────── */

describe('edits made at the same time', () => {
  it('to different rows both survive', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a'), tx('b')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()

    b.link.setOnline(false)
    await a.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === 'a' ? { ...t, category: 'market' as const } : t)) }))
    await b.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === 'b' ? { ...t, category: 'dining' as const } : t)) }))
    b.link.setOnline(true)
    await settle()

    for (const d of [a, b]) {
      expect(d.tx('a')?.category).toBe('market')
      expect(d.tx('b')?.category).toBe('dining')
    }
  })

  it('to the same row keep the later one, on both devices', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()

    b.link.setOnline(false)
    await a.edit((s) => ({ ...s, transactions: s.transactions.map((t) => ({ ...t, category: 'market' as const })) }))
    // The laptop edits after the phone did, so its stamp is newer.
    await b.edit((s) => ({ ...s, transactions: s.transactions.map((t) => ({ ...t, category: 'health' as const })) }))
    b.link.setOnline(true)
    await settle()

    expect(a.tx('a')?.category).toBe('health')
    expect(b.tx('a')?.category).toBe('health')
  })

  it('an edit still waiting out its pause is not overwritten by a change that arrives first', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()

    // The laptop has been edited but has not sent yet (no notify: the pause has
    // not run out). Then the phone's change to the same row reaches it.
    b.snapshot = { ...b.snapshot, transactions: b.snapshot.transactions.map((t) => ({ ...t, category: 'health' as const })) }
    await a.edit((s) => ({ ...s, transactions: s.transactions.map((t) => ({ ...t, category: 'market' as const })) }))
    b.engine.syncNow()
    await settle()

    // The laptop's edit is the newer one; it must not be silently replaced.
    expect(b.tx('a')?.category).toBe('health')
    expect(a.tx('a')?.category).toBe('health')
  })

  it('an edit made offline survives meeting an older copy', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a')] })
    await a.connect()
    const b = device('laptop')
    await b.connect()

    b.link.setOnline(false)
    await b.edit((s) => ({ ...s, transactions: s.transactions.map((t) => ({ ...t, category: 'education' as const })) }))
    b.link.setOnline(true)
    await settle()

    expect(a.tx('a')?.category).toBe('education')
  })
})

/* ── Rules, profile, preferences ──────────────────────────────────────────── */

describe('the rest of the account', () => {
  it('a rule taught on one device is known on the other', async () => {
    const { device } = world()
    const a = device('phone', { rules: [rule('GITHUB', 'subscription')] })
    const b = device('laptop')
    await a.connect()
    await b.connect()
    expect(b.snapshot.rules.map((r) => r.merchant)).toEqual(['GITHUB'])
  })

  it('one rule per merchant, however many devices teach it', async () => {
    const { cloud, device } = world()
    const a = device('phone', { rules: [rule('GITHUB', 'subscription', 'rule-from-phone')] })
    const b = device('laptop', { rules: [rule('GITHUB', 'subscription', 'rule-from-laptop')] })
    await a.connect()
    await b.connect()
    expect(cloud.contents(UID).filter((d) => d.kind === 'rules')).toHaveLength(1)
    expect(docIdOf('rules', { id: 'x', merchant: 'GITHUB' })).toBe(docIdOf('rules', { id: 'y', merchant: 'GITHUB' }))
  })

  it('a fresh device adopts the account’s profile instead of overwriting it with nothing', async () => {
    const { device } = world()
    const profile = { ...defaultProfile, monthlyIncome: 5_000_000 }
    const a = device('phone', { profile })
    await a.connect()

    const b = device('laptop')
    await b.connect()
    expect(b.snapshot.profile.monthlyIncome).toBe(5_000_000)
    expect(a.snapshot.profile.monthlyIncome).toBe(5_000_000)
  })

  it('a profile changed on one device reaches the other', async () => {
    const { device } = world()
    const a = device('phone', { profile: { ...defaultProfile, monthlyIncome: 100 } })
    const b = device('laptop')
    await a.connect()
    await b.connect()
    await a.edit((s) => ({ ...s, profile: { ...s.profile, spendingLimit: 777 } }))
    expect(b.snapshot.profile.spendingLimit).toBe(777)
  })

  it('preferences travel; nothing about a PIN is even representable', async () => {
    const { cloud, device } = world()
    const a = device('phone', { prefs: { theme: 'dark', periodGrouping: 'statement' } })
    const b = device('laptop')
    await a.connect()
    await b.connect()
    expect(b.snapshot.prefs).toEqual({ theme: 'dark', periodGrouping: 'statement' })

    const prefsDoc = cloud.contents(UID).find((d) => d.kind === 'prefs')!
    expect(Object.keys(prefsDoc.data as object).sort()).toEqual(['periodGrouping', 'theme'])
  })
})

/* ── Leaving, coming back, failing ────────────────────────────────────────── */

describe('restarting', () => {
  it('a device that closed with unsent edits sends them next time', async () => {
    const { cloud, device } = world()
    const a = device('phone', { transactions: [tx('a')] })
    await a.connect()

    // Offline edit; the commit never completes before the app is closed.
    a.link.setOnline(false)
    await a.edit((s) => ({ ...s, transactions: [...s.transactions, tx('unsent')] }))
    a.engine.stop()

    // Next session, same storage, back online.
    a.link.setOnline(true)
    const again = device('phone-2', { transactions: a.snapshot.transactions })
    Object.assign(again.storage, { ledgers: a.storage.ledgers, owner: a.storage.owner })
    await again.connect()

    expect(cloud.has(UID, 'transactions', 'unsent')).toBe(true)
  })

  it('does not take a wiped cloud for a request to wipe the device', async () => {
    const { cloud, device } = world()
    const a = device('phone', { transactions: [tx('a'), tx('b')] })
    await a.connect()

    // Someone clears the cloud copy (an account reset); the phone still has its data.
    for (const d of cloud.contents(UID)) cloud.docs(UID).delete(`${d.kind}/${d.id}`)

    a.engine.stop()
    const again = device('phone-2', { transactions: a.snapshot.transactions })
    Object.assign(again.storage, { ledgers: a.storage.ledgers, owner: a.storage.owner })
    await again.connect()

    expect(again.ids).toEqual(['a', 'b'])
    expect(cloud.has(UID, 'transactions', 'a')).toBe(true)
  })
})

describe('trouble', () => {
  it('retries by itself after a failed send, and the data was never at risk', async () => {
    const { cloud, device } = world()
    let failures = 1
    const a = device('phone', { transactions: [tx('a')] }, {
      retryMs: [1],
      transport: (inner: MemoryDevice): SyncTransport => ({
        listen: (uid, l) => inner.listen(uid, l),
        commit: (uid, ops) => (failures-- > 0 ? Promise.reject(new Error('unavailable')) : inner.commit(uid, ops)),
      }),
    })
    await a.connect()
    await wait(40)
    await settle()

    expect(a.states.some((s) => s.status === 'error')).toBe(true)
    expect(a.status).toBe('synced')
    expect(cloud.has(UID, 'transactions', 'a')).toBe(true)
  })

  it('does not queue the same edit twice while the first is still in flight', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a')] })
    await a.connect()

    a.link.setOnline(false)
    await a.edit((s) => ({ ...s, transactions: s.transactions.map((t) => ({ ...t, category: 'market' as const })) }))
    const afterEdit = a.commits
    for (let i = 0; i < 5; i++) {
      a.engine.syncNow()
      await settle(3)
    }
    expect(a.commits).toBe(afterEdit)
  })

  it('reports being offline rather than failing', async () => {
    const { device } = world()
    const a = device('phone', { transactions: [tx('a')] })
    await a.connect()
    a.engine.setOnline(false)
    expect(a.status).toBe('offline')
    a.engine.setOnline(true)
    await settle()
    expect(a.status).toBe('synced')
  })
})

/* ── Someone else's data ──────────────────────────────────────────────────── */

describe('signing in on a device that holds another account’s data', () => {
  async function scenario() {
    const w = world()
    const owner = w.device('phone', { transactions: [tx('mine-1')] })
    await owner.connect()

    // A device last used by a different account, with its own rows, signs in.
    const shared = w.device('shared-pc', { transactions: [tx('theirs-1'), tx('theirs-2')] })
    await shared.storage.setOwner('someone-else')
    await shared.engine.start()
    await settle()
    return { ...w, owner, shared }
  }

  it('stops and asks instead of mixing two people’s money', async () => {
    const { shared, cloud } = await scenario()
    expect(shared.status).toBe('decision')
    expect(cloud.has(UID, 'transactions', 'theirs-1')).toBe(false)
    expect(shared.ids).toEqual(['theirs-1', 'theirs-2'])
  })

  it('“replace” clears the device and loads the account’s data, uploading none of the old', async () => {
    const { shared, cloud } = await scenario()
    shared.engine.resolve('replace')
    await settle()

    expect(shared.replaced).toBe(1)
    expect(shared.ids).toEqual(['mine-1'])
    expect(cloud.has(UID, 'transactions', 'theirs-1')).toBe(false)
    expect(shared.status).toBe('synced')
  })

  it('“merge” keeps both, on purpose', async () => {
    const { shared, owner, cloud } = await scenario()
    shared.engine.resolve('merge')
    await settle()

    expect(shared.ids).toEqual(['mine-1', 'theirs-1', 'theirs-2'])
    expect(owner.ids).toEqual(['mine-1', 'theirs-1', 'theirs-2'])
    expect(cloud.has(UID, 'transactions', 'theirs-2')).toBe(true)
  })

  it('does not ask when the device was already this account’s', async () => {
    const w = world()
    const a = w.device('phone', { transactions: [tx('a')] })
    await a.storage.setOwner(UID)
    await a.connect()
    expect(a.status).toBe('synced')
  })
})

/* ── What an older version left behind ────────────────────────────────────── */

describe('documents written by an older version', () => {
  it('are migrated into the device, replaced by stamped copies, and purged', async () => {
    const { cloud, device } = world()
    const old = tx('legacy-1', { statementId: 'st-old', description: 'YEREL MARKET', merchant: 'YEREL MARKET' })
    cloud.seedLegacy(UID, { kind: 'transactions', id: old.id, data: old })
    cloud.seedLegacy(UID, { kind: 'statements', id: 'st-old', data: statement('st-old') })
    cloud.seedLegacy(UID, { kind: 'settings', id: 'settings', data: { lockPinHash: 'deadbeef', lockPinSalt: 'salt' } })

    const a = device('phone')
    await a.connect()

    // Brought in under the id the current importer would give it…
    expect(a.snapshot.transactions).toHaveLength(1)
    expect(a.snapshot.statements.map((s) => s.id)).toEqual(['st-old'])
    const migratedId = a.snapshot.transactions[0].id
    expect(migratedId).not.toBe('legacy-1')

    // …the old documents are gone, the PIN hash with them, and stamped copies took their place.
    expect(cloud.has(UID, 'transactions', 'legacy-1')).toBe(false)
    expect(cloud.has(UID, 'settings', 'settings')).toBe(false)
    expect(JSON.stringify(cloud.contents(UID))).not.toMatch(/deadbeef|lockPin/)
    expect(cloud.contents(UID).find((d) => d.id === migratedId)?.u).toBeGreaterThan(0)
  })

  it('reach a second device only once, in their migrated form', async () => {
    const { cloud, device } = world()
    const old = tx('legacy-1', { statementId: 'st-old' })
    cloud.seedLegacy(UID, { kind: 'transactions', id: old.id, data: old })

    await device('phone').connect()
    const b = device('laptop')
    await b.connect()

    expect(b.snapshot.transactions).toHaveLength(1)
    expect(b.snapshot.transactions[0].id).not.toBe('legacy-1')
  })
})
