import {
  initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getFirebaseApp } from './config'

let dbInstance: Firestore | null = null

export function getFirebaseDb(): Firestore {
  if (dbInstance) return dbInstance

  // `undefined` fields are dropped rather than rejected: a few optional fields
  // on a transaction are `undefined` rather than absent, and Firestore refuses
  // them outright.
  const common = { ignoreUndefinedProperties: true }

  try {
    // A persistent cache is what makes "offline" a normal state instead of an
    // error: writes made without a connection are kept on disk and sent when it
    // returns, even if the app is closed in between, and a reload shows the last
    // known data at once instead of waiting for the network. One cache shared by
    // every tab, so two open tabs cannot disagree with each other.
    dbInstance = initializeFirestore(getFirebaseApp(), {
      ...common,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    // No IndexedDB (a private window, a locked-down WebView): sync still works,
    // it just cannot outlive the page.
    dbInstance = initializeFirestore(getFirebaseApp(), { ...common, localCache: memoryLocalCache() })
  }
  return dbInstance
}
