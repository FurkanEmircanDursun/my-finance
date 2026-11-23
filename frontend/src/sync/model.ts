import { normalizeAssetHoldings } from '../domain/assets'
import { mergeAssetValuations, normalizeAssetValuations } from '../domain/assetsHistory'
import { hash } from '../core/hash'
import type { CategoryRule, Profile, Settings, Statement, Transaction } from '../domain/types'


/**
 * The rules of cloud sync, with no Firestore, no React and no clock in sight.
 *
 * The shape of the problem. The same finances live on several devices, each of
 * which works fully offline and edits whenever it likes. Whatever one does must
 * reach the others, and nothing one does while out of date may undo what another
 * did. The scheme that fell out of that is deliberately plain:
 *
 *   • Every synced thing is a *document* with a version stamp `u` (milliseconds).
 *     The newest stamp wins, per document. Two devices editing different
 *     transactions never conflict; two editing the same one keep the later edit.
 *
 *   • A deletion is a document too — a *tombstone* with its own stamp. That is
 *     what makes deleting safe: a device that was away and still holds the row
 *     learns it was deleted instead of quietly uploading it again, and a device
 *     that re-adds the row later out-votes the tombstone with a newer stamp.
 *     (The scheme this replaces deleted any cloud document the local copy did not
 *     have, so a stale or freshly-installed device wiped everyone else's data the
 *     first time it saved anything.)
 *
 *   • Each device keeps a *ledger*: for every document, the content hash and stamp
 *     it last agreed on with the cloud. Comparing the ledger with what is on the
 *     device now says exactly what changed here — an edit, a new row, a deletion —
 *     with no log of operations to keep, lose or replay.
 *
 * Device clocks are trusted. For one person's two or three devices that is the
 * right trade: the only way it goes wrong is a clock minutes off *and* the same
 * transaction edited on two devices inside that window.
 */

export type Kind = 'transactions' | 'statements' | 'rules'
export const KINDS: readonly Kind[] = ['transactions', 'statements', 'rules']

/** The two singletons: the financial profile and the preferences that travel. */
export type Single = 'profile' | 'prefs'
export const SINGLES: readonly Single[] = ['profile', 'prefs']

/**
 * What of `Settings` is the *person's* and so follows them between devices. The
 * PIN and OCR endpoint describe one device and stay in session memory —
 * and the PIN hash in particular must never reach the cloud: four digits is ten
 * thousand guesses.
 */
export interface Prefs {
  theme: 'light' | 'dark' | 'system'
  periodGrouping: 'calendar' | 'statement' | null
  reminders?: Settings['reminders']
  onboardingSeen?: boolean
}

export interface Entities {
  transactions: Transaction[]
  statements: Statement[]
  rules: CategoryRule[]
}

export interface Snapshot extends Entities {
  profile: Profile
  prefs: Prefs
}

export interface RemoteDoc {
  /** `transactions` … a singleton name, or `settings`: the retired document that held the PIN hash. */
  kind: Kind | Single | 'settings'
  id: string
  /** Version stamp; 0 for a document written before stamps existed. */
  u: number
  deleted: boolean
  data?: unknown
  /** Written by a version that predates stamps; migrated and purged on first contact. */
  legacy?: boolean
}

export type Write =
  | { kind: Kind | Single; id: string; u: number; deleted: false; data: unknown }
  | { kind: Kind | Single; id: string; u: number; deleted: true }

export interface LedgerEntry {
  /** Hash of the content last agreed on; empty for a tombstone. */
  h: string
  /** The stamp last agreed on. */
  u: number
  /** A tombstone. */
  d?: true
  /** Written locally but not yet acknowledged by the cloud. */
  p?: true
}

/** `kind/id`. */
export type Ledger = Record<string, LedgerEntry>

export const keyOf = (kind: Kind | Single | 'settings', id: string): string => `${kind}/${id}`

// ─── Identity and hashing ─────────────────────────────────────────────────────

/** Rules are one per merchant, whichever device taught them. */
export function docIdOf(kind: Kind, entity: { id: string; merchant?: string }): string {
  return kind === 'rules' ? `r_${hash(entity.merchant ?? entity.id)}` : entity.id
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
}

/** A hash that changes when any field does, and not otherwise. */
export function contentHash(value: unknown): string {
  return hash(stable(value))
}

export const isDefaultProfile = (profile: Profile): boolean =>
  profile.monthlyIncome === 0 &&
  profile.spendingLimit === 0 &&
  profile.currentBalance === 0 &&
  profile.goal === null &&
  profile.budgets.length === 0 &&
  (profile.cards?.length ?? 0) === 0 &&
  (profile.archivedCards?.length ?? 0) === 0 &&
  (profile.assets?.length ?? 0) === 0 &&
  (profile.assetValuations?.length ?? 0) === 0

/** Financial ownership includes profiles and portfolios even without transactions. */
export function hasFinancialData(snapshot: Snapshot): boolean {
  return snapshot.transactions.length > 0 || snapshot.statements.length > 0 || snapshot.rules.length > 0 || !isDefaultProfile(snapshot.profile)
}

// ─── What changed here ────────────────────────────────────────────────────────

export interface DiffResult {
  ledger: Ledger
  writes: Write[]
}

function singleOf(snapshot: Snapshot, kind: Single): unknown {
  return snapshot[kind]
}

/**
 * Compares the device with its ledger and stamps whatever differs.
 *
 * Run *before* applying anything from the cloud: a local edit made while offline
 * must carry a fresh stamp by the time it meets the cloud's version, or an older
 * remote copy would overwrite it.
 */
export function diffLocal(ledger: Ledger, snapshot: Snapshot, now: number): DiffResult {
  const next: Ledger = { ...ledger }
  const writes: Write[] = []
  const present = new Set<string>()

  for (const kind of KINDS) {
    for (const entity of snapshot[kind] as Array<{ id: string; merchant?: string }>) {
      const id = docIdOf(kind, entity)
      const key = keyOf(kind, id)
      present.add(key)

      const h = contentHash(entity)
      const known = next[key]
      if (known && !known.d && known.h === h) continue

      // New here, edited here, or back after having been deleted: all three are
      // "this device has something newer to say".
      const u = known ? Math.max(now, known.u + 1) : now
      next[key] = { h, u, p: true }
      writes.push({ kind, id, u, deleted: false, data: entity })
    }
  }

  for (const [key, entry] of Object.entries(ledger)) {
    const [kind] = key.split('/') as [Kind | Single]
    if (!(KINDS as readonly string[]).includes(kind)) continue
    if (present.has(key) || entry.d) continue

    // Known to the cloud, gone from here: deleted here.
    const id = key.slice(kind.length + 1)
    const u = Math.max(now, entry.u + 1)
    next[key] = { h: '', u, d: true, p: true }
    writes.push({ kind: kind as Kind, id, u, deleted: true })
  }

  for (const kind of SINGLES) {
    const value = singleOf(snapshot, kind)
    const key = keyOf(kind, kind)
    const h = contentHash(value)
    const known = next[key]
    if (known && known.h === h) continue
    // A singleton nobody has stamped yet is only a *change* if it is not the
    // factory default; stamping the default would let a fresh install overwrite
    // an account's real profile with nothing.
    if (!known && isFactoryDefault(kind, snapshot)) continue
    const u = known ? Math.max(now, known.u + 1) : now
    next[key] = { h, u, p: true }
    writes.push({ kind, id: kind, u, deleted: false, data: value })
  }

  return { ledger: next, writes }
}

function isFactoryDefault(kind: Single, snapshot: Snapshot): boolean {
  return kind === 'profile'
    ? isDefaultProfile(snapshot.profile)
    : snapshot.prefs.theme === 'system' && (snapshot.prefs.periodGrouping === null || snapshot.prefs.periodGrouping === 'calendar') &&
      !snapshot.prefs.reminders && !snapshot.prefs.onboardingSeen
}

// ─── What arrived from the cloud ──────────────────────────────────────────────

/** The part of the state the store has to change, expressed as the minimum. */
export interface RemoteChange {
  upsert: Entities
  remove: Record<Kind, string[]>
  profile?: Profile
  prefs?: Prefs
}

export const emptyChange = (): RemoteChange => ({
  upsert: { transactions: [], statements: [], rules: [] },
  remove: { transactions: [], statements: [], rules: [] },
})

export function isEmptyChange(change: RemoteChange): boolean {
  return (
    !change.profile &&
    !change.prefs &&
    KINDS.every((k) => change.upsert[k].length === 0 && change.remove[k].length === 0)
  )
}

export interface ApplyResult {
  ledger: Ledger
  change: RemoteChange
  /** Local documents that are newer than — or absent from — the cloud's copy. */
  writes: Write[]
}

/**
 * Folds documents from the cloud into the device.
 *
 * `full` marks the first delivery after connecting, which is the cloud's *entire*
 * contents. Only then can absence mean something: a document the device has
 * agreed on before but the cloud no longer holds was wiped from the cloud, and
 * is re-seeded rather than treated as a deletion — wiping the cloud copy is not
 * a request to wipe the device (every other path deletes with a tombstone).
 */
export function applyRemote(
  ledger: Ledger,
  snapshot: Snapshot,
  docs: readonly RemoteDoc[],
  options: { full: boolean; now: number },
): ApplyResult {
  const next: Ledger = { ...ledger }
  const change = emptyChange()
  const writes: Write[] = []
  const seen = new Set<string>()

  const localById = {
    transactions: new Map(snapshot.transactions.map((t) => [docIdOf('transactions', t), t])),
    statements: new Map(snapshot.statements.map((s) => [docIdOf('statements', s), s])),
    rules: new Map(snapshot.rules.map((r) => [docIdOf('rules', r), r])),
  }

  for (const doc of docs) {
    if (doc.kind === 'settings') continue
    const key = keyOf(doc.kind, doc.id)
    seen.add(key)
    const known = next[key]
    const isSingle = (SINGLES as readonly string[]).includes(doc.kind)

    // A singleton the device has never exchanged with the cloud: the account's
    // value wins unless this device actually set one of its own.
    if (isSingle && !known) {
      const kind = doc.kind as Single
      if (!doc.deleted && isFactoryDefault(kind, snapshot)) {
        adoptSingle(change, kind, doc.data)
        next[key] = { h: contentHash(doc.data), u: doc.u }
      } else if (!doc.deleted) {
        // Both sides have a value and no history to say which is newer: this
        // device's, because it is the one in the person's hands right now.
        next[key] = { h: contentHash(singleOf(snapshot, kind)), u: options.now, p: true }
        writes.push({ kind, id: kind, u: options.now, deleted: false, data: singleOf(snapshot, kind) })
      }
      continue
    }

    if (known && doc.u <= known.u) continue // ours is as new, or newer

    if (doc.deleted) {
      if (!isSingle) change.remove[doc.kind as Kind].push(doc.id)
      next[key] = { h: '', u: doc.u, d: true }
      continue
    }

    if (isSingle) adoptSingle(change, doc.kind as Single, doc.data)
    else change.upsert[doc.kind as Kind].push(doc.data as never)
    next[key] = { h: contentHash(doc.data), u: doc.u }
  }

  if (options.full) {
    // Re-seed what the cloud has lost.
    for (const kind of KINDS) {
      for (const [id, entity] of localById[kind] as Map<string, unknown>) {
        const key = keyOf(kind, id)
        if (seen.has(key)) continue
        const entry = next[key]
        if (entry && !entry.p && !entry.d) {
          next[key] = { ...entry, u: options.now, p: true }
          writes.push({ kind, id, u: options.now, deleted: false, data: entity })
        }
      }
    }
  }

  // Remote rows that replace a local one must not be listed as both.
  for (const kind of KINDS) {
    const removed = new Set(change.remove[kind])
    change.upsert[kind] = (change.upsert[kind] as Array<{ id: string; merchant?: string }>).filter(
      (e) => !removed.has(docIdOf(kind, e)),
    ) as never
  }

  return { ledger: next, change, writes }
}

function adoptSingle(change: RemoteChange, kind: Single, data: unknown): void {
  if (kind === 'profile') change.profile = data as Profile
  else change.prefs = data as Prefs
}

/** Applies a change to a snapshot — the store's reducer and the tests share it. */
export function applyChange(snapshot: Snapshot, change: RemoteChange): Snapshot {
  const merge = <T extends { id: string; merchant?: string }>(kind: Kind, current: T[]): T[] => {
    const removed = new Set(change.remove[kind])
    const incoming = change.upsert[kind] as unknown as T[]
    if (!removed.size && !incoming.length) return current

    const byId = new Map<string, T>()
    for (const item of current) if (!removed.has(docIdOf(kind, item))) byId.set(docIdOf(kind, item), item)
    for (const item of incoming) byId.set(docIdOf(kind, item), item)
    return [...byId.values()]
  }

  return {
    transactions: merge('transactions', snapshot.transactions),
    statements: merge('statements', snapshot.statements),
    rules: merge('rules', snapshot.rules),
    profile: change.profile ? {
      ...change.profile,
      assets: Object.prototype.hasOwnProperty.call(change.profile, 'assets')
        ? normalizeAssetHoldings(change.profile.assets)
        : normalizeAssetHoldings(snapshot.profile.assets),
      assetValuations: Object.prototype.hasOwnProperty.call(change.profile, 'assetValuations')
        ? Array.isArray(change.profile.assetValuations) && change.profile.assetValuations.length === 0
          ? []
          : mergeAssetValuations(snapshot.profile.assetValuations, change.profile.assetValuations)
        : normalizeAssetValuations(snapshot.profile.assetValuations),
    } : snapshot.profile,
    prefs: change.prefs ?? snapshot.prefs,
  }
}

/** Marks writes as acknowledged, but only if the ledger still describes that write. */
export function acknowledge(ledger: Ledger, writes: readonly Write[]): Ledger {
  const next = { ...ledger }
  for (const w of writes) {
    const key = keyOf(w.kind, w.id)
    const entry = next[key]
    if (entry?.p && entry.u === w.u) {
      const { p: _p, ...rest } = entry
      void _p
      next[key] = rest
    }
  }
  return next
}

/** What still has to be sent: every ledger entry that was never acknowledged. */
export function pendingWrites(ledger: Ledger, snapshot: Snapshot): Write[] {
  const writes: Write[] = []
  const lookup = {
    transactions: new Map(snapshot.transactions.map((t) => [docIdOf('transactions', t), t])),
    statements: new Map(snapshot.statements.map((s) => [docIdOf('statements', s), s])),
    rules: new Map(snapshot.rules.map((r) => [docIdOf('rules', r), r])),
  }

  for (const [key, entry] of Object.entries(ledger)) {
    if (!entry.p) continue
    const slash = key.indexOf('/')
    const kind = key.slice(0, slash) as Kind | Single
    const id = key.slice(slash + 1)

    if (entry.d) {
      writes.push({ kind, id, u: entry.u, deleted: true })
    } else if ((SINGLES as readonly string[]).includes(kind)) {
      writes.push({ kind, id, u: entry.u, deleted: false, data: singleOf(snapshot, kind as Single) })
    } else {
      const entity = lookup[kind as Kind].get(id)
      if (entity) writes.push({ kind, id, u: entry.u, deleted: false, data: entity })
    }
  }
  return writes
}
