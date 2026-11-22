import {
  collection, doc, getDocFromServer, getDocsFromServer, limit, onSnapshot, orderBy, query, where,
  writeBatch, type DocumentData, type Query, type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseDb } from '../firebase/db'
import { KINDS, SINGLES, keyOf, type Kind, type RemoteDoc, type Single } from './model'
import { isPurge, type CommitOp, type Listener, type SyncTransport } from './transport'
import { monthOf, todayKey } from '../core/date'

/**
 * The account's documents, as Firestore holds them:
 *
 *   users/{uid}/transactions/{id}   one document per transaction
 *   users/{uid}/statements/{id}
 *   users/{uid}/rules/{id}          id derived from the merchant
 *   users/{uid}/meta/profile        the financial profile
 *   users/{uid}/meta/prefs          theme and period grouping — nothing device-specific
 *   users/{uid}/meta/settings       retired: held a PIN hash; read once, then deleted
 *
 * Every document carries its version stamp `_u`, and a deleted one is reduced to
 * `{ _u, _d: true }`. Whatever a document held besides those two fields is the
 * entity itself, untouched, so what is in the console is what is in the app.
 */

const stripped = (data: DocumentData): { u: number; deleted: boolean; legacy: boolean; rest: DocumentData } => {
  const { _u, _d, ...rest } = data
  return { u: typeof _u === 'number' ? _u : 0, deleted: _d === true, legacy: typeof _u !== 'number', rest }
}

interface Source {
  /** Whether this source has delivered a snapshot confirmed by the server. */
  confirmed: boolean
}

/** Keep older month queries dormant until needed. Migration still sees the complete account. */
export function createScopedFirestoreTransport() {
  const requested = new Set<string>()
  let latestMonth: string | undefined
  let addPeriod: ((period: string) => void) | undefined
  return {
    commit: firestoreTransport.commit,
    listen: (uid: string, listener: Listener) => listen(uid, listener, {
      requested,
      getLatest: () => latestMonth,
      setLatest: month => { latestMonth = month },
      register: add => { addPeriod = add },
    }),
    requestPeriod(period: string) {
      if (requested.has('all') || requested.has(period)) return
      requested.add(period)
      addPeriod?.(period)
    },
  }
}

interface ScopedTransactions {
  requested: Set<string>
  getLatest: () => string | undefined
  setLatest: (month: string) => void
  register: (add?: (period: string) => void) => void
}

function listen(uid: string, listener: Listener, scope?: ScopedTransactions): Unsubscribe {
  const db = getFirebaseDb()
  const unsubscribers: Unsubscribe[] = []

  // Everything the account has, so the first delivery can be the whole of it.
  const known = new Map<string, RemoteDoc>()
  const sources: Source[] = []
  const scopedUnsubscribers = new Map<string, Unsubscribe>()
  const confirmedPeriods = new Set<string>()
  const confirming = new Map<string, number>()
  const firstPeriodChanges = new Map<string, RemoteDoc[]>()
  const checkingExits = new Set<string>()
  let announced = false
  let armed = !scope
  let stopped = false

  const emit = (changed: RemoteDoc[], fromCache: boolean, period?: string) => {
    if (!announced) {
      // The first delivery is the cloud's entire contents — and it must come
      // from the *server*. A cache that is stale or partial is not "the
      // contents", and treating it as such would re-send documents the cloud
      // already has under a newer stamp, overwriting another device's work.
      if (!armed || !sources.every((s) => s.confirmed)) return
      announced = true
      listener.onSnapshot({ docs: [...known.values()], full: !scope, fromCache: false,
        ...(scope ? { periods: [...confirmedPeriods] } : {}) })
      return
    }
    if (changed.length || period) listener.onSnapshot({ docs: changed, full: false, fromCache,
      ...(period ? { periods: [period] } : {}) })
  }

  const watch = (name: string, ref: Query, toDoc: (id: string, data: DocumentData) => RemoteDoc | null, period?: string) => {
    const source: Source = { confirmed: false }
    if (!announced) sources.push(source)
    let lastPeriodIds = new Set<string>()
    let active = true
    const unsubscribe =
      onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!active || (period && snapshot.metadata.fromCache)) return
          const firstConfirmation = !source.confirmed && !snapshot.metadata.fromCache
          let changed: RemoteDoc[] = []
          const changes = period && (period !== 'all' || firstConfirmation)
            ? snapshot.docs.map(doc => ({ doc, type: 'added' as const }))
            : snapshot.docChanges({ includeMetadataChanges: true })
          const nextPeriodIds = period && period !== 'all' ? new Set(snapshot.docs.map(doc => doc.id)) : null
          const exited = nextPeriodIds ? [...lastPeriodIds].filter(id => !nextPeriodIds.has(id)) : []
          if (nextPeriodIds) lastPeriodIds = nextPeriodIds
          for (const change of changes) {
            // Our own writes echo back before the server confirms them; the
            // engine already knows about them.
            if (change.doc.metadata.hasPendingWrites) continue
            if (change.type === 'removed') {
              // Hard deletes only ever come from the purge of legacy documents.
              // (`meta` holds the singletons, which are keyed by their own name.)
              known.delete(name === 'meta' ? `${change.doc.id}/${change.doc.id}` : `${name}/${change.doc.id}`)
              continue
            }
            const remote = toDoc(change.doc.id, change.doc.data())
            if (!remote) continue
            const key = keyOf(remote.kind, remote.id)
            if (period && !firstConfirmation && !remote.legacy && known.get(key)?.u === remote.u) continue
            known.set(key, remote)
            changed.push(remote)
          }
          if (!snapshot.metadata.fromCache) source.confirmed = true
          let finishedPeriod: string | undefined
          if (period && firstConfirmation) {
            const pending = (confirming.get(period) ?? 1) - 1
            confirming.set(period, pending)
            if (pending === 0) {
              confirmedPeriods.add(period)
              finishedPeriod = period
              changed = (firstPeriodChanges.get(period) ?? []).concat(changed)
              firstPeriodChanges.delete(period)
            } else {
              firstPeriodChanges.set(period, changed)
              return
            }
          }
          emit(changed, snapshot.metadata.fromCache, finishedPeriod)
          for (const id of exited) {
            // Tombstones have no date. Read the post-image to distinguish a
            // deletion from a move to another period, even after reconnect.
            if (checkingExits.has(id)) continue
            checkingExits.add(id)
            void getDocFromServer(doc(db, 'users', uid, name, id)).then(result => {
              if (stopped || confirmedPeriods.has('all') || !result.exists()) return
              const remote = toDoc(id, result.data())
              if (remote) {
                const key = keyOf(remote.kind, remote.id)
                if ((known.get(key)?.u ?? -1) < remote.u) known.set(key, remote)
                emit([remote], false)
              }
            }).catch(error => { if (active) listener.onError(error) })
              .finally(() => checkingExits.delete(id))
          }
          if (period === 'all' && firstConfirmation) {
            for (const [key, stop] of scopedUnsubscribers) {
              if (key !== 'all') { stop(); scopedUnsubscribers.delete(key) }
            }
          }
        },
        (error) => listener.onError(error),
      )
    return () => { active = false; unsubscribe() }
  }

  const entity = (kind: Kind, id: string, data: DocumentData): RemoteDoc => {
    const { u, deleted, legacy, rest } = stripped(data)
    return { kind, id, u, deleted, legacy, data: deleted ? undefined : rest }
  }
  for (const kind of KINDS as readonly Kind[]) {
    if (scope && kind === 'transactions') continue
    unsubscribers.push(watch(kind, collection(db, 'users', uid, kind), (id, data) => entity(kind, id, data)))
  }

  // The three small documents under `meta` arrive as a collection of their own.
  unsubscribers.push(watch('meta', collection(db, 'users', uid, 'meta'), (id, data) => {
    const { u, deleted, legacy, rest } = stripped(data)
    if (id === 'settings') return { kind: 'settings', id, u: 0, deleted: false, legacy: true, data: undefined }
    if (!(SINGLES as readonly string[]).includes(id)) return null
    return { kind: id as Single, id, u, deleted, legacy, data: deleted ? undefined : rest }
  }))

  if (scope) {
    const transactions = collection(db, 'users', uid, 'transactions')
    const add = (period: string) => {
      if (stopped || scopedUnsubscribers.has(period) || confirmedPeriods.has('all')) return
      const refs = period === 'all' ? [transactions] : period.startsWith('statement:')
        ? [query(transactions, where('statementId', '==', period.slice('statement:'.length)))]
        : transactionsForMonth(transactions, period)
      confirming.set(period, refs.length)
      const stops = refs.map(ref => watch('transactions', ref, (id, data) => entity('transactions', id, data), period))
      scopedUnsubscribers.set(period, () => stops.forEach(stop => stop()))
    }
    const start = async () => {
      if (!scope.requested.has('all') && !scope.getLatest()) {
        const latest = await Promise.all(['date', 'billedOn'].map(field =>
          getDocsFromServer(query(transactions, orderBy(field, 'desc'), limit(1))),
        ))
        if (stopped) return
        const date = latest.flatMap(snapshot => snapshot.docs.map(row => row.get('billedOn') ?? row.get('date')))
          .filter((day): day is string => typeof day === 'string').sort().pop()
        scope.setLatest(monthOf(date ?? todayKey()))
      }
      if (stopped) return
      if (scope.requested.has('all')) add('all')
      else {
        add(scope.getLatest()!)
        scope.requested.forEach(add)
      }
      scope.register(add)
      armed = true
    }
    void start().catch(error => { if (!stopped) listener.onError(error) })
  }

  return () => {
    stopped = true
    scope?.register()
    unsubscribers.forEach(stop => stop())
    scopedUnsubscribers.forEach(stop => stop())
  }
}

function transactionsForMonth(transactions: Query, month: string): Query[] {
  const start = `${month}-01`
  const end = `${month}-31`
  // A multi-field range query implicitly orders by both fields and drops
  // manual/legacy rows that have no billedOn. Each branch uses one index.
  return ['date', 'billedOn'].map(field =>
    query(transactions, where(field, '>=', start), where(field, '<=', end)),
  )
}

export const firestoreTransport: SyncTransport = {
  listen,
  async commit(uid: string, ops: CommitOp[]): Promise<void> {
    const db = getFirebaseDb()
    const batch = writeBatch(db)

    for (const op of ops) {
      const isSingle = (SINGLES as readonly string[]).includes(op.kind) || op.kind === 'settings'
      const ref = isSingle ? doc(db, 'users', uid, 'meta', op.id) : doc(db, 'users', uid, op.kind, op.id)

      if (isPurge(op)) batch.delete(ref)
      else if (op.deleted) batch.set(ref, { _u: op.u, _d: true })
      else batch.set(ref, { ...(op.data as DocumentData), _u: op.u })
    }

    await batch.commit()
  },
}
