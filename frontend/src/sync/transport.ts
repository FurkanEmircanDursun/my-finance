import type { Kind, RemoteDoc, Single, Write } from './model'

/**
 * The engine's only view of the outside world.
 *
 * Everything the sync logic needs from a backend is here, so the logic can be
 * run against Firestore in the app and against a small in-memory stand-in in
 * the tests — which is how "two devices, one of them offline" gets tested at all
 * on a machine that cannot run the Firestore emulator.
 */

export interface RemoteSnapshot {
  docs: RemoteDoc[]
  /**
   * The first delivery after connecting is the cloud's whole contents; later
   * ones carry only what changed. Absence means something only in the former.
   */
  full: boolean
  /** Served from the local cache because there is no connection. */
  fromCache: boolean
}

export interface Listener {
  onSnapshot(snapshot: RemoteSnapshot): void
  onError(error: unknown): void
}

/** A hard delete, used only to clear documents an older version wrote. */
export interface Purge {
  purge: true
  kind: Kind | Single | 'settings'
  id: string
}

export type CommitOp = Write | Purge

export interface SyncTransport {
  /** Starts delivering the account's documents; returns the unsubscribe. */
  listen(uid: string, listener: Listener): () => void
  /** Resolves when the cloud has the writes; may stay pending while offline. */
  commit(uid: string, ops: CommitOp[]): Promise<void>
}

export const isPurge = (op: CommitOp): op is Purge => 'purge' in op
