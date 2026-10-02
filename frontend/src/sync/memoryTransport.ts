import { isPurge, type CommitOp, type Listener, type RemoteSnapshot, type SyncTransport } from './transport'
import { keyOf, type RemoteDoc } from './model'

/**
 * A cloud that lives in memory, with the two behaviours that matter about the
 * real one: every device sees every other device's writes, and a device that is
 * offline queues its writes and catches up when it comes back.
 *
 * It is used by the test-suite, and — behind `import.meta.env.DEV` — by the
 * running app when no Firestore is reachable, so the interface can be exercised
 * on a laptop with nothing configured.
 */

interface Stored {
  doc: RemoteDoc
  rev: number
  legacy: boolean
}

export class MemoryCloud {
  private accounts = new Map<string, Map<string, Stored>>()
  private rev = 0
  private devices = new Set<MemoryDevice>()

  /** A new device connected to this cloud. */
  device(name = 'device'): MemoryDevice {
    const device = new MemoryDevice(this, name)
    this.devices.add(device)
    return device
  }

  /** Seeds a document exactly as an older version of the app would have left it. */
  seedLegacy(uid: string, doc: Omit<RemoteDoc, 'u' | 'deleted'>): void {
    this.docs(uid).set(keyOf(doc.kind, doc.id), { doc: { ...doc, u: 0, deleted: false }, rev: ++this.rev, legacy: true })
  }

  /** What is stored, for assertions. */
  contents(uid: string): RemoteDoc[] {
    return [...this.docs(uid).values()].map((s) => s.doc)
  }

  has(uid: string, kind: string, id: string): boolean {
    return this.docs(uid).has(`${kind}/${id}`)
  }

  /** @internal */
  docs(uid: string): Map<string, Stored> {
    let map = this.accounts.get(uid)
    if (!map) {
      map = new Map()
      this.accounts.set(uid, map)
    }
    return map
  }

  /** @internal */
  apply(uid: string, ops: CommitOp[]): void {
    const docs = this.docs(uid)
    for (const op of ops) {
      if (isPurge(op)) {
        docs.delete(`${op.kind}/${op.id}`)
        continue
      }
      const key = keyOf(op.kind, op.id)
      const current = docs.get(key)
      // The server keeps whichever version is newer, as a rule would not — but a
      // device only ever writes a stamp it has just minted, so this never rejects
      // a real write; it just makes the stand-in idempotent.
      if (current && current.doc.u > op.u) continue
      docs.set(key, {
        doc: { kind: op.kind, id: op.id, u: op.u, deleted: op.deleted, data: op.deleted ? undefined : op.data },
        rev: ++this.rev,
        legacy: false,
      })
    }
    for (const device of this.devices) device.deliver(uid)
  }

  /** @internal */
  revision(): number {
    return this.rev
  }
}

interface Subscription {
  uid: string
  listener: Listener
  lastRev: number
  first: boolean
}

export class MemoryDevice implements SyncTransport {
  online = true
  /** Writes made while offline, in order, with the promises waiting on them. */
  private queued: Array<{ uid: string; ops: CommitOp[]; resolve: () => void }> = []
  private subs = new Set<Subscription>()

  constructor(
    private cloud: MemoryCloud,
    readonly name: string,
  ) {}

  listen(uid: string, listener: Listener): () => void {
    const sub: Subscription = { uid, listener, lastRev: 0, first: true }
    this.subs.add(sub)
    // Delivered asynchronously, like the real thing.
    queueMicrotask(() => this.deliverTo(sub))
    return () => this.subs.delete(sub)
  }

  commit(uid: string, ops: CommitOp[]): Promise<void> {
    return new Promise((resolve) => {
      if (this.online) {
        this.cloud.apply(uid, ops)
        resolve()
      } else {
        this.queued.push({ uid, ops, resolve })
      }
    })
  }

  /** Cuts or restores the connection. Coming back flushes the queue and catches up. */
  setOnline(online: boolean): void {
    this.online = online
    if (!online) return
    const queued = this.queued
    this.queued = []
    for (const q of queued) {
      this.cloud.apply(q.uid, q.ops)
      q.resolve()
    }
    for (const sub of this.subs) this.deliverTo(sub)
  }

  /** @internal */
  deliver(uid: string): void {
    for (const sub of this.subs) if (sub.uid === uid) this.deliverTo(sub)
  }

  private deliverTo(sub: Subscription): void {
    if (!this.online) return
    const docs = this.cloud.docs(sub.uid)
    const changed = [...docs.values()].filter((s) => s.rev > sub.lastRev)
    const full = sub.first
    if (!full && changed.length === 0) return

    sub.first = false
    sub.lastRev = this.cloud.revision()

    const snapshot: RemoteSnapshot = {
      full,
      fromCache: false,
      docs: changed.map((s) => ({ ...s.doc, ...(s.legacy ? { legacy: true } : {}) })),
    }
    sub.listener.onSnapshot(snapshot)
  }
}

