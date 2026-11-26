import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FirebaseApp } from 'firebase/app'

const mocks = vi.hoisted(() => ({
  native: vi.fn(() => false),
  initializeAppCheck: vi.fn(),
  ReCaptchaEnterpriseProvider: vi.fn(function (this: Record<string, unknown>, siteKey: string) {
    this.kind = 'recaptcha-enterprise'
    this.siteKey = siteKey
  }),
  CustomProvider: vi.fn(function (
    this: Record<string, unknown>,
    opts: { getToken: () => Promise<{ token: string; expireTimeMillis: number }> },
  ) {
    this.kind = 'custom'
    this.getToken = opts.getToken
  }),
  nativeInitialize: vi.fn(),
  nativeGetToken: vi.fn(),
}))

vi.mock('../platform', () => ({ isNative: mocks.native }))
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: mocks.initializeAppCheck,
  ReCaptchaEnterpriseProvider: mocks.ReCaptchaEnterpriseProvider,
  CustomProvider: mocks.CustomProvider,
}))
vi.mock('@capacitor-firebase/app-check', () => ({
  FirebaseAppCheck: {
    initialize: mocks.nativeInitialize,
    getToken: mocks.nativeGetToken,
  },
}))

const fakeApp = { name: '[DEFAULT]' } as unknown as FirebaseApp

beforeEach(async () => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  mocks.native.mockReturnValue(false)
  mocks.initializeAppCheck.mockReturnValue({ app: fakeApp })
  mocks.nativeInitialize.mockResolvedValue(undefined)
  mocks.nativeGetToken.mockResolvedValue({
    token: 'native-jwt-token',
    expireTimeMillis: Date.now() + 3600_000,
  })
  const mod = await import('./appCheck')
  mod._resetAppCheckForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete (globalThis as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN
})

describe('Firebase App Check initialization', () => {
  it('stays unconfigured on Web when no reCAPTCHA Enterprise site key is set', async () => {
    vi.stubEnv('VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY', '')
    const { initializeAppCheckOnce, getAppCheckStatus } = await import('./appCheck')
    const result = await initializeAppCheckOnce(fakeApp)
    expect(result).toBeNull()
    expect(getAppCheckStatus()).toBe('unconfigured')
    expect(mocks.initializeAppCheck).not.toHaveBeenCalled()
  })

  it('initializes ReCaptchaEnterpriseProvider on Web when site key is configured', async () => {
    vi.stubEnv('VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY', '6LcEnterpriseTestKey')
    const { initializeAppCheckOnce, getAppCheckStatus } = await import('./appCheck')
    const first = await initializeAppCheckOnce(fakeApp)
    const second = await initializeAppCheckOnce(fakeApp)

    expect(first).toEqual({ app: fakeApp })
    expect(second).toBe(first)
    expect(getAppCheckStatus()).toBe('active')
    expect(mocks.ReCaptchaEnterpriseProvider).toHaveBeenCalledOnce()
    expect(mocks.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('6LcEnterpriseTestKey')
    expect(mocks.initializeAppCheck).toHaveBeenCalledOnce()
    expect(mocks.initializeAppCheck).toHaveBeenCalledWith(
      fakeApp,
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    )
  })

  it('bridges native Play Integrity / App Attest tokens into JS SDK CustomProvider on mobile', async () => {
    mocks.native.mockReturnValue(true)
    const { initializeAppCheckOnce, getAppCheckStatus } = await import('./appCheck')
    const result = await initializeAppCheckOnce(fakeApp)

    expect(result).toEqual({ app: fakeApp })
    expect(getAppCheckStatus()).toBe('active')
    expect(mocks.nativeInitialize).toHaveBeenCalledWith({ isTokenAutoRefreshEnabled: true })
    expect(mocks.CustomProvider).toHaveBeenCalledOnce()

    const customArgs = mocks.CustomProvider.mock.calls[0][0]
    const tokenResult = await customArgs.getToken()
    expect(tokenResult.token).toBe('native-jwt-token')
    expect(tokenResult.expireTimeMillis).toBeGreaterThan(Date.now())
  })

  it('fails open gracefully if native plugin initialization throws', async () => {
    mocks.native.mockReturnValue(true)
    mocks.nativeInitialize.mockRejectedValueOnce(new Error('Native plugin unavailable'))
    const { initializeAppCheckOnce, getAppCheckStatus } = await import('./appCheck')
    const result = await initializeAppCheckOnce(fakeApp)
    expect(result).toBeNull()
    expect(getAppCheckStatus()).toBe('error')
  })
})
