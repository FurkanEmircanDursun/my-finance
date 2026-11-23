import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const sdk = vi.hoisted(() => ({
  initializeFirestore: vi.fn(), memoryLocalCache: vi.fn(() => ({ kind: 'memory' })),
  persistentLocalCache: vi.fn(() => ({ kind: 'persistent' })), persistentSingleTabManager: vi.fn(),
  terminate: vi.fn(), clearIndexedDbPersistence: vi.fn(),
}))
const platform = vi.hoisted(() => ({ isAndroid: vi.fn(() => false) }))
vi.mock('firebase/firestore', () => sdk)
vi.mock('../platform', () => platform)
vi.mock('./config', () => ({ getFirebaseApp: () => ({ name: '[DEFAULT]' }) }))
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  platform.isAndroid.mockReturnValue(false)
  sdk.initializeFirestore.mockReturnValue({ id: 'old' })
  sdk.terminate.mockResolvedValue(undefined); sdk.clearIndexedDbPersistence.mockResolvedValue(undefined)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('device-only Firebase cache cleanup', () => {
  it('uses session-scoped SDK memory without a financial cache on disk', async () => {
    const api = await import('./db')
    api.getFirebaseDb(); api.getFirebaseDb()
    expect(sdk.initializeFirestore).toHaveBeenCalledOnce()
    expect(sdk.initializeFirestore).toHaveBeenCalledWith({ name: '[DEFAULT]' }, { ignoreUndefinedProperties: true, localCache: { kind: 'memory' } })
  })
  it('terminates before clearing only local persistence and recreates a fresh client for the next login', async () => {
    const api = await import('./db'), old = api.getFirebaseDb()
    await api.clearFirebaseDeviceCache()
    expect(sdk.terminate).toHaveBeenCalledWith(old)
    expect(sdk.clearIndexedDbPersistence).toHaveBeenCalledWith(old)
    expect(sdk.terminate.mock.invocationCallOrder[0]).toBeLessThan(sdk.clearIndexedDbPersistence.mock.invocationCallOrder[0])
    sdk.initializeFirestore.mockReturnValue({ id: 'new' })
    expect(api.getFirebaseDb()).toEqual({ id: 'new' })
  })
  it('reports another-tab cache failure rather than pretending the device was cleared', async () => {
    sdk.clearIndexedDbPersistence.mockRejectedValueOnce(new Error('failed-precondition'))
    const api = await import('./db')
    await expect(api.clearFirebaseDeviceCache()).rejects.toThrow('Diğer Mizan sekmelerini kapat')
  })

  it('retains a confirmed Android account cache across startup and clears it before another account can query', async () => {
    const values = new Map<string, string>()
    const key = 'mizan:firestore-cache-owner'
    vi.stubGlobal('localStorage', {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => values.set(name, value),
      removeItem: (name: string) => values.delete(name),
    })
    vi.stubGlobal('indexedDB', {})
    platform.isAndroid.mockReturnValue(true)
    values.set(key, 'previous')
    const api = await import('./db')
    await api.prepareFirebaseDeviceCache('previous')
    const previous = api.getFirebaseDb()
    expect(sdk.persistentLocalCache).toHaveBeenCalledOnce()
    expect(sdk.clearIndexedDbPersistence).not.toHaveBeenCalled()

    await api.prepareFirebaseDeviceCache('next')
    expect(sdk.clearIndexedDbPersistence).toHaveBeenCalledWith(previous)
    expect(values.get(key)).toBe('next')
    await api.prepareFirebaseDeviceCache(null)
    expect(values.has(key)).toBe(false)
  })
})
