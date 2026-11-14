import { IDBDatabase, IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory()) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function twoTabs() {
  const first = await import('./db')
  await first.dbReadFinancialState()
  await first.dbWriteFinancialValue('state', { transactions: ['account-record'], profile: { assets: ['gold'] } })
  await first.dbWriteFinancialValue('sync:ledger:account-a', { 'transactions/account-record': { h: 'known', u: 1 } })
  await first.dbWriteFinancialValue('sync:ledger:account-b', { 'transactions/other-record': { h: 'known', u: 1 } })
  await first.dbWriteFinancialValue('sync:owner', 'account-a')
  vi.resetModules()
  const second = await import('./db')
  await second.dbReadFinancialState()
  return { first, second }
}

function openRawDatabase(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('my-finance', version)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('kv')) request.result.createObjectStore('kv') }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function rawWrite(db: IDBDatabase, values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    for (const [key, value] of Object.entries(values)) tx.objectStore('kv').put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
}

function rawRead(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly'), request = tx.objectStore('kv').get(key)
    tx.oncomplete = () => resolve(request.result)
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
}

describe('atomic device clearing across browser realms', () => {
  it('clears the snapshot and every account baseline together, preserving unrelated device keys', async () => {
    const { first } = await twoTabs()
    await first.dbSet('device:unrelated-preference', 'keep')
    await first.dbResetFinancialState({ transactions: [], profile: { assets: [] } })
    expect(await first.dbReadFinancialValue('state')).toEqual({ transactions: [], profile: { assets: [] } })
    expect(await first.dbReadFinancialValue('sync:owner')).toBeUndefined()
    expect(await first.dbReadFinancialValue('sync:ledger:account-a')).toBeUndefined()
    expect(await first.dbReadFinancialValue('sync:ledger:account-b')).toBeUndefined()
    expect(await first.dbReadFinancialValue('device:unrelated-preference')).toBe('keep')
    expect(await first.dbReadFinancialValue('device:generation')).toBe(1)
  })

  it('rejects stale pagehide snapshots, owner and ledger writes even before another tab receives a signal', async () => {
    const { first, second } = await twoTabs()
    await first.dbResetFinancialState({ transactions: [] })
    expect(await second.dbFinancialGenerationIsCurrent()).toBe(false)
    for (const key of ['state', 'sync:owner', 'sync:ledger:account-a']) {
      await expect(second.dbWriteFinancialValue(key, { oldPrivateData: true })).rejects.toMatchObject({ name: 'DeviceDataChangedError' })
    }
    expect(await first.dbReadFinancialValue('state')).toEqual({ transactions: [] })
    expect(await first.dbReadFinancialValue('sync:owner')).toBeUndefined()
    expect(await first.dbReadFinancialValue('sync:ledger:account-a')).toBeUndefined()
  })

  it('lets a peer save new records only after it rehydrates the new generation', async () => {
    const { first, second } = await twoTabs()
    await first.dbResetFinancialState({ transactions: [] })
    expect(await second.dbReadFinancialState()).toEqual({ transactions: [] })
    expect(await second.dbFinancialGenerationIsCurrent()).toBe(true)
    expect(await second.dbWriteFinancialValue('state', { transactions: ['new-local-record'] })).toBe(true)
    expect(await first.dbReadFinancialValue('state')).toEqual({ transactions: ['new-local-record'] })
  })

  it('rejects a stale reset instead of erasing newer records created after another tab cleared', async () => {
    const { first, second } = await twoTabs()
    await first.dbResetFinancialState({ transactions: [] })
    await first.dbWriteFinancialValue('state', { transactions: ['new-after-clearing'] })
    await expect(second.dbResetFinancialState({ transactions: [] })).rejects.toMatchObject({ name: 'DeviceDataChangedError' })
    expect(await first.dbReadFinancialValue('state')).toEqual({ transactions: ['new-after-clearing'] })
    expect(await first.dbReadFinancialValue('device:generation')).toBe(1)
  })

  it('rolls back every part of a reset when the transaction is aborted', async () => {
    const { first, second } = await twoTabs()
    const transaction = IDBDatabase.prototype.transaction
    let abortNext = true
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, names, mode, options) {
      const tx = transaction.call(this, names, mode, options)
      if (abortNext && mode === 'readwrite') { abortNext = false; queueMicrotask(() => tx.abort()) }
      return tx
    })
    await expect(first.dbResetFinancialState({ transactions: [] })).rejects.toThrow('Cihaz verileri temizlenemedi')
    expect(await first.dbReadFinancialValue('state')).toMatchObject({ transactions: ['account-record'] })
    expect(await first.dbReadFinancialValue('sync:owner')).toBe('account-a')
    expect(await first.dbReadFinancialValue('sync:ledger:account-a')).toBeDefined()
    expect(await second.dbFinancialGenerationIsCurrent()).toBe(true)
  })
})

describe('mixed-version device safety', () => {
  it('preserves every version-1 key while preventing old clients from reopening the upgraded database', async () => {
    const old = await openRawDatabase(1)
    const saved = { transactions: ['legacy-financial-record'], profile: { assets: ['legacy-portfolio'] } }
    await rawWrite(old, { state: saved, 'sync:owner': 'legacy-account', 'device:unrelated': 'keep' })
    old.close()
    const current = await import('./db')
    expect(await current.dbReadFinancialState()).toEqual(saved)
    expect(await current.dbReadFinancialValue('sync:owner')).toBe('legacy-account')
    expect(await current.dbReadFinancialValue('device:unrelated')).toBe('keep')
    await expect(openRawDatabase(1)).rejects.toMatchObject({ name: 'VersionError' })
    await current.dbResetFinancialState({ transactions: [] })
    await expect(openRawDatabase(1)).rejects.toMatchObject({ name: 'VersionError' })
    expect(await current.dbReadFinancialValue('state')).toEqual({ transactions: [] })
  })

  it('fails closed immediately when an old tab blocks upgrade, then cancels its late upgrade before a clean retry', async () => {
    const old = await openRawDatabase(1)
    const saved = { transactions: ['not-cleared-by-blocked-upgrade'] }
    await rawWrite(old, { state: saved })
    const nativeOpen = IDBFactory.prototype.open
    let attempted: IDBOpenDBRequest | undefined
    vi.spyOn(IDBFactory.prototype, 'open').mockImplementation(function (this: IDBFactory, ...args) {
      attempted = nativeOpen.apply(this, args)
      return attempted
    })
    const current = await import('./db')
    await expect(current.dbReadFinancialState()).rejects.toThrow('Diğer Mizan sekmelerini kapatıp yeniden yükle')
    expect(await rawRead(old, 'state')).toEqual(saved)
    const lateFailure = new Promise<string>(resolve => attempted!.addEventListener('error', () => resolve(attempted!.error!.name), { once: true }))
    old.close()
    expect(await lateFailure).toBe('AbortError')
    vi.restoreAllMocks(); vi.resetModules()
    const retry = await import('./db')
    expect(await retry.dbReadFinancialState()).toEqual(saved)
    await expect(openRawDatabase(1)).rejects.toMatchObject({ name: 'VersionError' })
  })

  it('closes on a later version change and rejects writes until the page reloads', async () => {
    const current = await import('./db')
    await current.dbReadFinancialState()
    await current.dbWriteFinancialValue('state', { transactions: ['preserve-during-version-change'] })
    const newer = await openRawDatabase(3)
    expect(await current.dbFinancialGenerationIsCurrent()).toBe(false)
    await expect(current.dbWriteFinancialValue('state', { transactions: ['old-repopulation'] })).rejects.toMatchObject({ name: 'DeviceDataChangedError' })
    await expect(current.dbReadFinancialState()).rejects.toMatchObject({ name: 'DeviceDataChangedError' })
    expect(await rawRead(newer, 'state')).toEqual({ transactions: ['preserve-during-version-change'] })
    newer.close()
  })

  it('rolls back an aborted upgrade and does not replace disk data with an empty memory fallback', async () => {
    const old = await openRawDatabase(1)
    const saved = { transactions: ['preserve-after-aborted-upgrade'] }
    await rawWrite(old, { state: saved }); old.close()
    const nativeOpen = IDBFactory.prototype.open
    vi.spyOn(IDBFactory.prototype, 'open').mockImplementation(function (this: IDBFactory, ...args) {
      const request = nativeOpen.apply(this, args)
      request.addEventListener('upgradeneeded', () => request.transaction!.abort(), { once: true })
      return request
    })
    const current = await import('./db')
    await expect(current.dbReadFinancialState()).rejects.toThrow('Cihaz veritabanı açılamadı')
    await expect(current.dbWriteFinancialValue('state', { transactions: [] })).rejects.toThrow('Cihaz veritabanı açılamadı')
    vi.restoreAllMocks()
    const unchanged = await openRawDatabase(1)
    expect(await rawRead(unchanged, 'state')).toEqual(saved)
    unchanged.close()
  })
})
