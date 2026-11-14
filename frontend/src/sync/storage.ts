import { UserFacingError } from '../core/errors'
import { dbReadFinancialValue, dbWriteFinancialValue } from '../store/db'
import type { Ledger } from './model'

/**
 * What the engine remembers between sessions: for each account, the ledger of
 * what this device last agreed on with the cloud; and whose data this device
 * holds, so signing in as someone else cannot silently mix two people's money.
 */
export interface SyncStorage {
  loadLedger(uid: string): Promise<Ledger>
  saveLedger(uid: string, ledger: Ledger): Promise<void>
  getOwner(): Promise<string | null>
  setOwner(uid: string): Promise<void>
}

const ledgerKey = (uid: string) => `sync:ledger:${uid}`
const OWNER_KEY = 'sync:owner'

export const indexedDbStorage: SyncStorage = {
  async loadLedger(uid) {
    return (await dbReadFinancialValue<Ledger>(ledgerKey(uid))) ?? {}
  },
  async saveLedger(uid, ledger) {
    if (!await dbWriteFinancialValue(ledgerKey(uid), ledger)) throw new UserFacingError('Eşitleme kaydı cihazda saklanamadı.')
  },
  async getOwner() {
    return (await dbReadFinancialValue<string>(OWNER_KEY)) ?? null
  },
  async setOwner(uid) {
    if (!await dbWriteFinancialValue(OWNER_KEY, uid)) throw new UserFacingError('Hesap sahipliği cihazda saklanamadı.')
  },
}

export function memoryStorage(initial: { owner?: string | null; ledgers?: Record<string, Ledger> } = {}): SyncStorage & {
  ledgers: Record<string, Ledger>
  owner: string | null
} {
  const state = { ledgers: { ...(initial.ledgers ?? {}) }, owner: initial.owner ?? null }
  return Object.assign(state, {
    async loadLedger(uid: string) {
      return structuredClone(state.ledgers[uid] ?? {})
    },
    async saveLedger(uid: string, ledger: Ledger) {
      state.ledgers[uid] = structuredClone(ledger)
    },
    async getOwner() {
      return state.owner
    },
    async setOwner(uid: string) {
      state.owner = uid
    },
  })
}
