/**
 * What the sync engine reports, kept apart from the engine itself.
 *
 * The shell needs these types and the starting state on first paint; the engine
 * (and everything it pulls in) is loaded only once somebody is signed in.
 */

export type SyncStatus = 'connecting' | 'syncing' | 'synced' | 'offline' | 'error' | 'decision'

export interface SyncState {
  status: SyncStatus
  /** When the cloud last confirmed everything this device had. */
  lastSyncedAt: number | null
  /** Documents written here that the cloud has not yet confirmed. */
  pending: number
  error: string | null
}

export const initialSyncState: SyncState = { status: 'connecting', lastSyncedAt: null, pending: 0, error: null }
