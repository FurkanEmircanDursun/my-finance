import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNative: vi.fn(() => true), setConsent: vi.fn(), setEnabled: vi.fn(), resetAnalyticsData: vi.fn(),
  logEvent: vi.fn(), setCurrentScreen: vi.fn(),
}))
vi.mock('./index', () => ({ isNative: mocks.isNative }))
vi.mock('../firebase/available', () => ({ cloudAvailable: true }))
vi.mock('@capacitor-firebase/analytics', () => ({
  FirebaseAnalytics: mocks,
  ConsentType: { AnalyticsStorage: 'ANALYTICS_STORAGE', AdStorage: 'AD_STORAGE', AdUserData: 'AD_USER_DATA', AdPersonalization: 'AD_PERSONALIZATION' },
  ConsentStatus: { Granted: 'GRANTED', Denied: 'DENIED' },
}))

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  vi.stubGlobal('window', new EventTarget())
})
afterEach(() => vi.unstubAllGlobals())

describe('product measurement privacy', () => {
  it('starts disabled and drops events before explicit consent', async () => {
    const api = await import('./analytics')
    expect(api.analyticsConsent()).toBe(false)
    await api.initializeProductAnalytics()
    api.trackProductEvent('entry_saved')
    await Promise.resolve()
    expect(mocks.setEnabled).toHaveBeenCalledWith({ enabled: false })
    expect(mocks.logEvent).not.toHaveBeenCalled()
  })
  it('accepts only bounded events without financial payloads and keeps ad consent denied', async () => {
    const api = await import('./analytics')
    await api.setAnalyticsConsent(true)
    api.trackProductEvent('entry_saved')
    await vi.waitFor(() => expect(mocks.logEvent).toHaveBeenCalledWith({ name: 'entry_saved' }))
    expect(mocks.setConsent).toHaveBeenCalledWith({ type: 'AD_STORAGE', status: 'DENIED' })
    expect(mocks.setConsent).toHaveBeenCalledWith({ type: 'AD_USER_DATA', status: 'DENIED' })
    expect(mocks.setConsent).toHaveBeenCalledWith({ type: 'AD_PERSONALIZATION', status: 'DENIED' })
    api.trackProductEvent('merchant_private_name' as never)
    await Promise.resolve()
    expect(mocks.logEvent).toHaveBeenCalledTimes(1)
  })
  it('revocation blocks new events immediately and resets native measurement data', async () => {
    const api = await import('./analytics')
    await api.setAnalyticsConsent(true)
    const revoke = api.setAnalyticsConsent(false)
    api.trackProductEvent('entry_saved')
    await revoke
    expect(mocks.logEvent).not.toHaveBeenCalled()
    expect(mocks.resetAnalyticsData).toHaveBeenCalledOnce()
    expect(mocks.setEnabled).toHaveBeenLastCalledWith({ enabled: false })
  })
  it('screen names are constrained and contain no arbitrary URLs or text', async () => {
    const api = await import('./analytics')
    await api.setAnalyticsConsent(true)
    api.trackScreen('overview')
    api.trackScreen('user@example.com' as never)
    await vi.waitFor(() => expect(mocks.setCurrentScreen).toHaveBeenCalledOnce())
    expect(mocks.setCurrentScreen).toHaveBeenCalledWith({ screenName: 'overview', screenClassOverride: 'FinanceApp' })
  })
  it('SDK failure leaves core product usable and exposes a recoverable setting error', async () => {
    mocks.setEnabled.mockRejectedValueOnce(new Error('network'))
    const api = await import('./analytics')
    await api.setAnalyticsConsent(true)
    expect(api.analyticsError()).toContain('ayarlanamadı')
    await api.setAnalyticsConsent(false)
    expect(api.analyticsError()).toBeUndefined()
  })
})
