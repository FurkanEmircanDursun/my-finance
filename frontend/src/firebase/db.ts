import {
  clearIndexedDbPersistence, connectFirestoreEmulator, initializeFirestore, memoryLocalCache, terminate,
  persistentLocalCache, persistentSingleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getFirebaseApp } from './config'
import { UserFacingError } from '../core/errors'
import { isAndroid } from '../platform'

let dbInstance: Firestore | null = null
let persistOnDevice = false
const cacheOwnerKey = 'mizan:firestore-cache-owner'

/** Called after Auth resolves and before any reads for that account. */
export async function prepareFirebaseDeviceCache(uid: string | null): Promise<void> {
  if (!isAndroid()) return
  let owner: string | null
  try { owner = localStorage.getItem(cacheOwnerKey) } catch { return }
  if (owner && owner !== uid) await clearFirebaseDeviceCache()
  if (!uid || typeof indexedDB === 'undefined') return
  try {
    localStorage.setItem(cacheOwnerKey, uid)
  } catch { return }
  persistOnDevice = true
}

export function getFirebaseDb(): Firestore {
  if (dbInstance) return dbInstance

  // `undefined` fields are dropped rather than rejected: a few optional fields
  // on a transaction are `undefined` rather than absent, and Firestore refuses
  // them outright.
  const common = { ignoreUndefinedProperties: true }

  const localCache = persistOnDevice ? persistentLocalCache({ tabManager: persistentSingleTabManager({}) }) : memoryLocalCache()
  dbInstance = initializeFirestore(getFirebaseApp(), { ...common, localCache })
  const address = import.meta.env.DEV ? import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR : undefined
  if (address) {
    const endpoint = new URL(address)
    connectFirestoreEmulator(dbInstance, endpoint.hostname, Number(endpoint.port))
  }
  return dbInstance
}

/** Drops only SDK-local cached records, never a Firestore document. */
export async function clearFirebaseDeviceCache(): Promise<void> {
  const db = getFirebaseDb()
  await terminate(db)
  dbInstance = null
  persistOnDevice = false
  try { await clearIndexedDbPersistence(db) } catch {
    throw new UserFacingError('Cihaz önbelleği temizlenemedi. Diğer Mizan sekmelerini kapatıp yeniden dene; bulut verilerin korunuyor.')
  }
  if (isAndroid()) {
    try { localStorage.removeItem(cacheOwnerKey) } catch { /* Persistence could not be enabled without this key. */ }
  }
}
