import {
  clearIndexedDbPersistence, initializeFirestore, memoryLocalCache, terminate,
  type Firestore,
} from 'firebase/firestore'
import { getFirebaseApp } from './config'
import { UserFacingError } from '../core/errors'

let dbInstance: Firestore | null = null

export function getFirebaseDb(): Firestore {
  if (dbInstance) return dbInstance

  // `undefined` fields are dropped rather than rejected: a few optional fields
  // on a transaction are `undefined` rather than absent, and Firestore refuses
  // them outright.
  const common = { ignoreUndefinedProperties: true }

  // The application snapshot and pending sync ledger already provide durable
  // offline storage. A second disk cache would retain account records after
  // this device's copy had been cleared.
  dbInstance = initializeFirestore(getFirebaseApp(), { ...common, localCache: memoryLocalCache() })
  return dbInstance
}

/** Drops only SDK-local cached records, never a Firestore document. */
export async function clearFirebaseDeviceCache(): Promise<void> {
  const db = getFirebaseDb()
  await terminate(db)
  dbInstance = null
  try { await clearIndexedDbPersistence(db) } catch {
    throw new UserFacingError('Cihaz önbelleği temizlenemedi. Diğer Mizan sekmelerini kapatıp yeniden dene; bulut verilerin korunuyor.')
  }
}
