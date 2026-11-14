import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  native: false,
  app: { name: '[DEFAULT]' },
  auth: { languageCode: '' },
  initializeAuth: vi.fn(),
  getAuth: vi.fn(),
  indexedDB: { type: 'LOCAL', name: 'IndexedDB' },
  local: { type: 'LOCAL', name: 'localStorage' },
}))

vi.mock('../platform', () => ({ isNative: () => sdk.native }))
vi.mock('firebase/app', () => ({ getApps: () => [sdk.app], initializeApp: vi.fn(() => sdk.app) }))
vi.mock('firebase/auth', () => ({
  initializeAuth: sdk.initializeAuth,
  getAuth: sdk.getAuth,
  indexedDBLocalPersistence: sdk.indexedDB,
  browserLocalPersistence: sdk.local,
  connectAuthEmulator: vi.fn(),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  sdk.native = false
  sdk.initializeAuth.mockReturnValue(sdk.auth)
  sdk.getAuth.mockReturnValue(sdk.auth)
})

describe('persistent Firebase identity', () => {
  it('initializes native persistence before any auth-state event or sign-in', async () => {
    sdk.native = true
    const { getFirebaseAuth } = await import('./config')
    expect(getFirebaseAuth()).toBe(sdk.auth)
    expect(sdk.initializeAuth).toHaveBeenCalledWith(sdk.app, { persistence: [sdk.indexedDB, sdk.local] })
    expect(sdk.getAuth).not.toHaveBeenCalled()
    expect(getFirebaseAuth()).toBe(sdk.auth)
    expect(sdk.initializeAuth).toHaveBeenCalledTimes(1)
    expect(sdk.auth.languageCode).toBe('tr')
  })

  it('retains the normal browser auth resolver on the web', async () => {
    const { getFirebaseAuth } = await import('./config')
    getFirebaseAuth()
    expect(sdk.getAuth).toHaveBeenCalledWith(sdk.app)
    expect(sdk.initializeAuth).not.toHaveBeenCalled()
  })

  it('reuses the native session after a hot-module replacement', async () => {
    sdk.native = true
    sdk.initializeAuth.mockImplementationOnce(() => { throw { code: 'auth/already-initialized' } })
    const { getFirebaseAuth } = await import('./config')
    expect(getFirebaseAuth()).toBe(sdk.auth)
    expect(sdk.getAuth).toHaveBeenCalledTimes(1)
  })
})
