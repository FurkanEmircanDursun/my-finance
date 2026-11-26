import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage'
import { getFirebaseApp } from './config'

let storageInstance: FirebaseStorage | null = null

/**
 * Lazily initializes Firebase Storage only when an unreadable/failed statement
 * upload or diagnostic cleanup is actually requested, keeping the Storage SDK
 * out of the initial app bundle.
 */
export function getFirebaseStorage(): FirebaseStorage {
  if (storageInstance) return storageInstance
  storageInstance = getStorage(getFirebaseApp())

  const address = import.meta.env.DEV ? import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR : undefined
  if (address) {
    const endpoint = new URL(address)
    connectStorageEmulator(storageInstance, endpoint.hostname, Number(endpoint.port))
  }
  return storageInstance
}
