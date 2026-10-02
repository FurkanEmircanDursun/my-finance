import {
  collection, doc, onSnapshot, writeBatch, type DocumentData, type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseDb } from '../firebase/db'
import { KINDS, SINGLES, keyOf, type Kind, type RemoteDoc, type Single } from './model'
import { isPurge, type CommitOp, type Listener, type SyncTransport } from './transport'

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
  name: string
  /** Whether this source has delivered a snapshot confirmed by the server. */
  confirmed: boolean
}

export const firestoreTransport: SyncTransport = {
  listen(uid: string, listener: Listener): Unsubscribe {
    const db = getFirebaseDb()
    const unsubscribers: Unsubscribe[] = []

    // Everything the account has, so the first delivery can be the whole of it.
    const known = new Map<string, RemoteDoc>()
    const sources: Source[] = []
    let announced = false

    const emit = (changed: RemoteDoc[], fromCache: boolean) => {
      if (!announced) {
        // The first delivery is the cloud's entire contents — and it must come
        // from the *server*. A cache that is stale or partial is not "the
        // contents", and treating it as such would re-send documents the cloud
        // already has under a newer stamp, overwriting another device's work.
        if (!sources.every((s) => s.confirmed)) return
        announced = true
        listener.onSnapshot({ docs: [...known.values()], full: true, fromCache: false })
        return
      }
      if (changed.length) listener.onSnapshot({ docs: changed, full: false, fromCache })
    }

    const watch = (name: string, ref: ReturnType<typeof collection>, toDoc: (id: string, data: DocumentData) => RemoteDoc | null) => {
      const source: Source = { name, confirmed: false }
      sources.push(source)

      unsubscribers.push(
        onSnapshot(
          ref,
          { includeMetadataChanges: true },
          (snapshot) => {
            const changed: RemoteDoc[] = []
            for (const change of snapshot.docChanges({ includeMetadataChanges: true })) {
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
              known.set(keyOf(remote.kind, remote.id), remote)
              changed.push(remote)
            }
            if (!snapshot.metadata.fromCache) source.confirmed = true
            emit(changed, snapshot.metadata.fromCache)
          },
          (error) => listener.onError(error),
        ),
      )
    }

    for (const kind of KINDS as readonly Kind[]) {
      watch(kind, collection(db, 'users', uid, kind), (id, data) => {
        const { u, deleted, legacy, rest } = stripped(data)
        return { kind, id, u, deleted, legacy, data: deleted ? undefined : rest }
      })
    }

    // The three small documents under `meta` arrive as a collection of their own.
    watch('meta', collection(db, 'users', uid, 'meta'), (id, data) => {
      const { u, deleted, legacy, rest } = stripped(data)
      if (id === 'settings') return { kind: 'settings', id, u: 0, deleted: false, legacy: true, data: undefined }
      if (!(SINGLES as readonly string[]).includes(id)) return null
      return { kind: id as Single, id, u, deleted, legacy, data: deleted ? undefined : rest }
    })

    return () => unsubscribers.forEach((u) => u())
  },

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
