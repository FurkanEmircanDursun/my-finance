import {
  acknowledge, applyChange, applyRemote, diffLocal, docIdOf, emptyChange, isEmptyChange, keyOf,
  pendingWrites, KINDS, isDefaultProfile,
  type Kind, type Ledger, type RemoteChange, type RemoteDoc, type Snapshot, type Write,
} from './model'
import type { CommitOp, Purge, RemoteSnapshot, SyncTransport } from './transport'
import type { SyncStorage } from './storage'
import { migratePersisted } from '../store/migrate'
import { defaultProfile, defaultSettings } from '../store/defaults'
import { initialSyncState, type SyncState } from './status'
import { firebaseErrorMessage } from '../firebase/errors'

export { initialSyncState, type SyncState, type SyncStatus } from './status'

export interface EngineOptions {
  uid: string
  transport: SyncTransport
  storage: SyncStorage
  /** Always the newest state, including actions dispatched a moment ago. */
  getSnapshot: () => Snapshot
  /** Applies what arrived from the cloud to the app's state. */
  apply: (change: RemoteChange) => void
  /** Clears this device's financial data (not its settings), ahead of loading an account's. */
  replaceLocal: () => void
  hasLocalData: () => boolean
  onState: (state: SyncState) => void
  now?: () => number
  /** How long to wait after the last edit before sending. */
  debounceMs?: number
  retryMs?: readonly number[]
}

const BATCH = 400

/**
 * Keeps this device and the cloud saying the same thing.
 *
 * Everything the engine does goes through one queue, so a snapshot arriving
 * while a flush is mid-flight cannot interleave with it and see a half-updated
 * ledger. What it must never do is *wait* inside that queue for the network: a
 * `commit` that stays pending while offline would otherwise freeze every later
 * snapshot behind it. Commits are therefore sent and acknowledged out of band.
 *
 * Failure is a state, not an exception: the person's data is safe on the device
 * the whole time, and the engine retries on its own — on a timer, and the moment
 * the browser reports the network is back.
 */
export class SyncEngine {
  private ledger: Ledger = {}
  private unlisten: (() => void) | null = null
  private chain: Promise<void> = Promise.resolve()
  private timer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryIndex = 0
  private stopped = false
  private firstDone = false
  private listenFailed = false
  private held: RemoteSnapshot | null = null
  private inflight = new Set<string>()
  private online = typeof navigator === 'undefined' ? true : navigator.onLine !== false
  private state: SyncState = initialSyncState

  constructor(private readonly o: EngineOptions) {}

  private clock = () => (this.o.now ?? Date.now)()

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.ledger = await this.o.storage.loadLedger(this.o.uid)
    if (this.stopped) return

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline)
      window.addEventListener('offline', this.onOffline)
    }

    // Starting without a network is "çevrimdışı", not an endless "bağlanıyor".
    if (!this.online) this.setState({ status: 'offline' })

    this.subscribe()
  }

  stop(): void {
    this.stopped = true
    this.unlisten?.()
    if (this.timer) clearTimeout(this.timer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline)
      window.removeEventListener('offline', this.onOffline)
    }
  }

  /** Detach now, then finish local bookkeeping without waiting on network commits. */
  async stopAndDrain(checkpoint = false): Promise<void> {
    this.stop()
    await this.chain
    if (checkpoint && this.firstDone) {
      this.ledger = diffLocal(this.ledger, this.o.getSnapshot(), this.clock()).ledger
      await this.save()
    }
  }

  getState(): SyncState {
    return this.state
  }

  /** The app's state changed; send what is new after a short pause. */
  notify(): void {
    if (this.stopped || !this.firstDone) return
    if (this.timer) clearTimeout(this.timer)
    const wait = this.o.debounceMs ?? 800
    if (wait <= 0) {
      this.enqueue(() => this.flush())
      return
    }
    this.timer = setTimeout(() => this.enqueue(() => this.flush()), wait)
  }

  /** Send everything now, retrying whatever failed. */
  syncNow(): void {
    if (this.stopped) return
    this.enqueue(async () => {
      // Firestore snapshot listeners stop after an error. A retry must attach
      // a new listener; flushing alone cannot recover an initial failure.
      if ((this.listenFailed || !this.firstDone) && !this.held) this.subscribe()
      await this.flush()
    })
  }

  private subscribe(): void {
    this.unlisten?.()
    this.listenFailed = false
    if (!this.firstDone) this.setState({ status: this.online ? 'connecting' : 'offline' })
    try {
      this.unlisten = this.o.transport.listen(this.o.uid, {
        onSnapshot: (snapshot) => this.enqueue(() => this.handle(snapshot)),
        onError: (error) => {
          this.listenFailed = true
          this.fail(error)
        },
      })
    } catch (error) {
      this.listenFailed = true
      this.fail(error)
    }
  }

  /** The person's answer to "this device holds someone else's data". */
  resolve(choice: 'merge' | 'replace'): void {
    const held = this.held
    if (!held) return
    this.held = null
    this.enqueue(async () => {
      if (choice === 'replace') {
        this.ledger = {}
        const current = this.o.getSnapshot()
        const empty: Snapshot = {
          transactions: [], statements: [], rules: [], profile: defaultProfile, prefs: current.prefs,
        }
        this.o.replaceLocal()
        await this.reconcile(held, true, empty)
      } else {
        await this.reconcile(held, true, null)
      }
    })
  }

  // ── The queue ───────────────────────────────────────────────────────────────

  private enqueue(task: () => Promise<void>): void {
    this.chain = this.chain.then(() => this.stopped ? undefined : task()).catch((error) => this.fail(error))
  }

  private setState(patch: Partial<SyncState>): void {
    if (this.stopped) return
    this.state = { ...this.state, ...patch }
    this.o.onState(this.state)
  }

  private pendingCount(): number {
    let n = 0
    for (const entry of Object.values(this.ledger)) if (entry.p) n++
    return n
  }

  private async save(): Promise<void> {
    await this.o.storage.saveLedger(this.o.uid, this.ledger)
  }

  // ── What arrives ────────────────────────────────────────────────────────────

  private async handle(snapshot: RemoteSnapshot): Promise<void> {
    if (this.stopped) return
    const first = !this.firstDone

    if (first) {
      const owner = await this.o.storage.getOwner()
      if (this.stopped) return
      // A device that held one account's money and is now signed in to another's
      // must not quietly pour one into the other.
      if (owner && owner !== this.o.uid && this.o.hasLocalData()) {
        this.held = snapshot
        this.setState({ status: 'decision' })
        return
      }
      // An empty device with an old, fully acknowledged ledger is not an
      // instruction to delete an account. This also recovers legacy local resets.
      if (!this.o.hasLocalData()) {
        // Keep only deletions that were explicitly stamped before this session.
        // A stale pending LIVE write is not proof that an absent row was deleted.
        this.ledger = Object.fromEntries(Object.entries(this.ledger).filter(([, entry]) => entry.p && entry.d))
      }
    }

    await this.reconcile(snapshot, first, null)
  }

  private async reconcile(remote: RemoteSnapshot, first: boolean, base: Snapshot | null): Promise<void> {
    if (this.stopped) return
    const now = this.clock()
    let local = base ?? this.o.getSnapshot()

    // Documents an older version wrote carry no stamp and old ids: bring them in,
    // then clear them out.
    const legacy = remote.docs.filter((d) => d.legacy)
    const docs = remote.docs.filter((d) => !d.legacy)
    const purges: Purge[] = []

    if (legacy.length) {
      const adopted = adoptLegacy(legacy, local)
      purges.push(...adopted.purges)
      if (!isEmptyChange(adopted.change)) {
        this.o.apply(adopted.change)
        local = applyChange(local, adopted.change)
      }
    }

    // Local edits are stamped *before* the cloud's version is considered, so an
    // edit made offline is newer than anything it meets.
    const diff = diffLocal(this.ledger, local, now)
    this.ledger = diff.ledger

    const applied = applyRemote(this.ledger, local, docs, { full: remote.full, now })
    this.ledger = applied.ledger
    if (!isEmptyChange(applied.change)) {
      this.o.apply(applied.change)
      local = applyChange(local, applied.change)
    }

    const writes = mergeWrites([...diff.writes, ...applied.writes, ...pendingWrites(this.ledger, local)])
    await this.save()
    if (this.stopped) return

    this.firstDone = true
    if (first) await this.o.storage.setOwner(this.o.uid)
    if (this.stopped) return

    this.send(writes, purges)

    if (writes.length === 0 && purges.length === 0 && this.pendingCount() === 0) {
      this.setState({ status: remote.fromCache || !this.online ? 'offline' : 'synced', lastSyncedAt: remote.fromCache ? this.state.lastSyncedAt : now, pending: 0, error: null })
    }
  }

  // ── What leaves ─────────────────────────────────────────────────────────────

  private async flush(): Promise<void> {
    if (this.stopped || !this.firstDone) return
    const local = this.o.getSnapshot()
    const diff = diffLocal(this.ledger, local, this.clock())
    this.ledger = diff.ledger
    await this.save()
    if (this.stopped) return
    this.send(mergeWrites([...diff.writes, ...pendingWrites(this.ledger, local)]), [])
  }

  /** Sends without waiting: the acknowledgement comes back through the queue. */
  private send(writes: Write[], purges: Purge[]): void {
    if (this.stopped) return
    const fresh = writes.filter((w) => !this.inflight.has(inflightKey(w)))
    if (fresh.length === 0 && purges.length === 0) return

    for (const w of fresh) this.inflight.add(inflightKey(w))
    this.setState({ status: this.online ? 'syncing' : 'offline', pending: this.pendingCount() })

    // New documents first, so a purge can never leave the cloud with less than
    // either version had.
    const ops: CommitOp[] = [...fresh, ...purges]
    const batches: CommitOp[][] = []
    for (let i = 0; i < ops.length; i += BATCH) batches.push(ops.slice(i, i + BATCH))

    void (async () => {
      try {
        for (const batch of batches) {
          if (this.stopped) return
          await this.o.transport.commit(this.o.uid, batch)
        }
        if (this.stopped) return
        this.enqueue(async () => {
          for (const w of fresh) this.inflight.delete(inflightKey(w))
          this.ledger = acknowledge(this.ledger, fresh)
          await this.save()
          this.retryIndex = 0
          const pending = this.pendingCount()
          this.setState({
            status: this.online ? (pending === 0 ? 'synced' : 'syncing') : 'offline',
            lastSyncedAt: pending === 0 ? this.clock() : this.state.lastSyncedAt,
            pending,
            error: null,
          })
        })
      } catch (error) {
        for (const w of fresh) this.inflight.delete(inflightKey(w))
        this.fail(error)
      }
    })()
  }

  // ── Trouble ─────────────────────────────────────────────────────────────────

  private fail(error: unknown): void {
    if (this.stopped) return
    const message = firebaseErrorMessage(error, 'sync')
    this.setState({ status: this.online ? 'error' : 'offline', error: message, pending: this.pendingCount() })

    if (this.retryTimer) clearTimeout(this.retryTimer)
    const steps = this.o.retryMs ?? [3_000, 10_000, 30_000, 120_000]
    const wait = steps[Math.min(this.retryIndex, steps.length - 1)]
    this.retryIndex++
    this.retryTimer = setTimeout(() => this.syncNow(), wait)
  }

  /** The browser's word on the network; also callable by a platform with a better one. */
  setOnline(online: boolean): void {
    if (online === this.online) return
    this.online = online
    if (online) {
      this.retryIndex = 0
      this.setState({
        status: !this.firstDone ? 'connecting' : this.pendingCount() > 0 ? 'syncing' : this.state.status === 'offline' ? 'synced' : this.state.status,
      })
      this.syncNow()
    } else {
      this.setState({ status: 'offline' })
    }
  }

  private onOnline = (): void => this.setOnline(true)
  private onOffline = (): void => this.setOnline(false)
}

const inflightKey = (w: Write): string => `${keyOf(w.kind, w.id)}@${w.u}`

/** One write per document: the newest. */
function mergeWrites(writes: Write[]): Write[] {
  const byKey = new Map<string, Write>()
  for (const w of writes) {
    const key = keyOf(w.kind, w.id)
    const current = byKey.get(key)
    if (!current || w.u >= current.u) byKey.set(key, w)
  }
  return [...byKey.values()]
}

/**
 * Brings in documents an older version of the app left in the cloud.
 *
 * They are migrated with the same rules a local snapshot is, added where the
 * device does not already hold the row, and then purged — the engine's own
 * stamped copies replace them. The old `settings` document is purged without
 * being read at all: it held the PIN hash, which has no business being there.
 */
function adoptLegacy(docs: RemoteDoc[], local: Snapshot): { change: RemoteChange; purges: Purge[] } {
  const live = (kind: string) => docs.filter((d) => d.kind === kind && !d.deleted).map((d) => d.data)

  const migrated = migratePersisted({
    version: 2,
    transactions: live('transactions'),
    statements: live('statements'),
    rules: live('rules'),
    profile: local.profile,
    settings: defaultSettings,
  })

  const change = emptyChange()
  if (migrated) {
    for (const kind of KINDS as readonly Kind[]) {
      const held = new Set((local[kind] as Array<{ id: string; merchant?: string }>).map((e) => docIdOf(kind, e)))
      change.upsert[kind] = (migrated.state[kind] as Array<{ id: string; merchant?: string }>).filter(
        (e) => !held.has(docIdOf(kind, e)),
      ) as never
    }
  }

  // A profile the account had, on a device that has none of its own.
  const profile = docs.find((d) => d.kind === 'profile' && !d.deleted)
  const untouched = isDefaultProfile(local.profile)
  if (profile?.data && untouched) change.profile = profile.data as Snapshot['profile']

  const purges: Purge[] = docs
    .filter((d) => (KINDS as readonly string[]).includes(d.kind) || d.kind === 'settings')
    .map((d) => ({ purge: true as const, kind: d.kind, id: d.id }))

  return { change, purges }
}

