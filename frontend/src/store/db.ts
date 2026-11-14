/**
 * Minimal IndexedDB key-value store (no dependency).
 *
 * The previous build kept nothing but the profile in localStorage, so a page
 * reload threw away every imported statement. Transactions can run to tens of
 * thousands of rows, which is past what localStorage comfortably holds, so they
 * live in IndexedDB; everything degrades to in-memory when storage is blocked
 * (private windows, disabled site data) rather than throwing.
 */

const DB_NAME = 'my-finance'
const DB_VERSION = 1
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase | null> | null = null
let openConnection: IDBDatabase | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => {
      openConnection = request.result
      resolve(openConnection)
    }
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })

  return dbPromise
}

const memoryFallback = new Map<string, unknown>()

export async function dbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  if (!db) return memoryFallback.get(key) as T | undefined

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

function writeValue(db: IDBDatabase, key: string, value: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

export function dbSet(key: string, value: unknown): Promise<boolean> {
  // Hydration opens the database before editing is possible. Reuse that handle
  // synchronously so a lifecycle flush queues its transaction in this call,
  // rather than waiting for an awaited, already-resolved promise.
  if (openConnection) return writeValue(openConnection, key, value)
  return openDb().then((db) => {
    if (db) return writeValue(db, key, value)
    memoryFallback.set(key, value)
    return false
  })
}

export async function dbDelete(key: string): Promise<void> {
  const db = await openDb()
  if (!db) {
    memoryFallback.delete(key)
    return
  }
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
