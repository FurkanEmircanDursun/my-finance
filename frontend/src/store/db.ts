import { UserFacingError } from '../core/errors'
/**
 * Minimal IndexedDB key-value store (no dependency).
 *
 * The previous build kept nothing but the profile in localStorage, so a page
 * reload threw away every imported statement. Transactions can run to tens of
 * thousands of rows, which is past what localStorage comfortably holds, so they
 * live in IndexedDB. An unavailable API can retain an explicitly nondurable
 * in-memory copy; blocked upgrades and database failures never look like empty data.
 */

const DB_NAME = 'my-finance'
// Version 2 excludes older clients whose unconditional writes could resurrect
// a cleared snapshot. The existing store and every key stay unchanged.
const DB_VERSION = 2
const STORE = 'kv'
const GENERATION_KEY = 'device:generation'
let financialGeneration = 0

export class DeviceDataChangedError extends UserFacingError {
  constructor() { super('Cihaz verileri başka bir Mizan sekmesinde değişti.'); this.name = 'DeviceDataChangedError' }
}

let dbPromise: Promise<IDBDatabase | null> | null = null
let openConnection: IDBDatabase | null = null
let databaseInvalidated = false

function openDb(): Promise<IDBDatabase | null> {
  if (databaseInvalidated) return Promise.reject(new DeviceDataChangedError())
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      reject(new UserFacingError('Cihaz veritabanı açılamadı. Diğer Mizan sekmelerini kapatıp yeniden yükle; kayıtların korunuyor.'))
      return
    }

    let abandoned = false
    const fail = (message: string) => { abandoned = true; reject(new UserFacingError(message)) }

    request.onupgradeneeded = () => {
      // An upgrade blocked by an old tab may start after we already reported
      // failure. Cancel that late request instead of leaving an orphaned handle.
      if (abandoned) { request.transaction?.abort(); return }
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => {
      if (abandoned) { request.result.close(); return }
      openConnection = request.result
      openConnection.onversionchange = () => {
        databaseInvalidated = true
        openConnection?.close()
        openConnection = null
      }
      resolve(openConnection)
    }
    request.onerror = () => fail(request.error?.name === 'VersionError'
      ? 'Bu Mizan sekmesi daha eski bir sürüm kullanıyor. Sayfayı yeniden yükle; kayıtların korunuyor.'
      : 'Cihaz veritabanı açılamadı. Diğer Mizan sekmelerini kapatıp yeniden yükle; kayıtların korunuyor.')
    request.onblocked = () => fail('Eski bir Mizan sekmesi cihaz veritabanını kullanıyor. Diğer Mizan sekmelerini kapatıp yeniden yükle; kayıtların korunuyor.')
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

/** Snapshot and generation are read together, so a reset cannot split hydration. */
export async function dbReadFinancialState<T>(): Promise<T | undefined> {
  const db = await openDb()
  if (!db) {
    financialGeneration = Number(memoryFallback.get(GENERATION_KEY) ?? 0)
    return memoryFallback.get('state') as T | undefined
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const state = store.get('state'), generation = store.get(GENERATION_KEY)
      tx.oncomplete = () => { financialGeneration = Number(generation.result ?? 0); resolve(state.result as T | undefined) }
      tx.onerror = tx.onabort = () => reject(new UserFacingError('Cihaz verileri okunamadı. Yeniden dene.'))
    } catch { reject(new UserFacingError('Cihaz verileri okunamadı. Yeniden dene.')) }
  })
}

export async function dbReadFinancialValue<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  if (!db) return memoryFallback.get(key) as T | undefined
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).get(key)
      tx.oncomplete = () => resolve(request.result as T | undefined)
      tx.onerror = tx.onabort = () => reject(new UserFacingError('Cihaz eşitleme kaydı okunamadı. Verilerin üzerine yazılmadı.'))
    } catch { reject(new UserFacingError('Cihaz eşitleme kaydı okunamadı. Verilerin üzerine yazılmadı.')) }
  })
}

export async function dbFinancialGenerationIsCurrent(): Promise<boolean> {
  if (databaseInvalidated) return false
  return Number(await dbReadFinancialValue<number>(GENERATION_KEY) ?? 0) === financialGeneration
}

/** A stale tab can never write an old snapshot or sync baseline after clearing. */
function writeFinancialValue(db: IDBDatabase, key: string, value: unknown, expected: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const generation = store.get(GENERATION_KEY)
      let stale = false
      generation.onsuccess = () => {
        stale = Number(generation.result ?? 0) !== expected
        if (!stale) store.put(value, key)
      }
      tx.oncomplete = () => stale ? reject(new DeviceDataChangedError()) : resolve(true)
      tx.onerror = tx.onabort = () => resolve(false)
    } catch { resolve(false) }
  })
}

export function dbWriteFinancialValue(key: string, value: unknown): Promise<boolean> {
  if (databaseInvalidated) return Promise.reject(new DeviceDataChangedError())
  const expected = financialGeneration
  if (openConnection) return writeFinancialValue(openConnection, key, value, expected)
  return openDb().then(db => {
    if (db) return writeFinancialValue(db, key, value, expected)
    if (Number(memoryFallback.get(GENERATION_KEY) ?? 0) !== expected) throw new DeviceDataChangedError()
    memoryFallback.set(key, value)
    return false
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

/** Device clearing and sync-baseline removal must commit as one transaction. */
export async function dbResetFinancialState(value: unknown): Promise<void> {
  const expected = financialGeneration
  const db = await openDb()
  if (!db) {
    if (Number(memoryFallback.get(GENERATION_KEY) ?? 0) !== expected) throw new DeviceDataChangedError()
    for (const key of memoryFallback.keys()) if (key.startsWith('sync:')) memoryFallback.delete(key)
    memoryFallback.set('state', value)
    financialGeneration = Number(memoryFallback.get(GENERATION_KEY) ?? 0) + 1
    memoryFallback.set(GENERATION_KEY, financialGeneration)
    return
  }
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      let nextGeneration = financialGeneration + 1
      let stale = false
      const generation = store.get(GENERATION_KEY)
      generation.onsuccess = () => {
        if (Number(generation.result ?? 0) !== expected) { stale = true; tx.abort(); return }
        nextGeneration = Number(generation.result ?? 0) + 1
        store.put(nextGeneration, GENERATION_KEY)
        store.put(value, 'state')
      }
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        const entry = cursor.result
        if (!entry) return
        if (typeof entry.key === 'string' && entry.key.startsWith('sync:')) entry.delete()
        entry.continue()
      }
      tx.oncomplete = () => { financialGeneration = nextGeneration; resolve() }
      tx.onerror = tx.onabort = () => reject(stale ? new DeviceDataChangedError() : new UserFacingError('Cihaz verileri temizlenemedi. Kayıtların korunuyor; yeniden dene.'))
    } catch {
      reject(new UserFacingError('Cihaz verileri temizlenemedi. Kayıtların korunuyor; yeniden dene.'))
    }
  })
}
