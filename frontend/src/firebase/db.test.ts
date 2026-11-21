import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const sdk = vi.hoisted(() => ({ initializeFirestore: vi.fn(), memoryLocalCache: vi.fn(() => ({ kind: 'memory' })), terminate: vi.fn(), clearIndexedDbPersistence: vi.fn() }))
vi.mock('firebase/firestore', () => sdk)
vi.mock('./config', () => ({ getFirebaseApp: () => ({ name: '[DEFAULT]' }) }))
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  sdk.initializeFirestore.mockReturnValue({ id: 'old' })
  sdk.terminate.mockResolvedValue(undefined); sdk.clearIndexedDbPersistence.mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())
describe('device-only Firebase cache cleanup', () => {
  it('keeps the SDK cache in memory while the app owns offline financial persistence', async () => {
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
})
