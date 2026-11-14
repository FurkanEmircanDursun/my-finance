import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  initializeAnalytics: vi.fn(() => ({ app: 'public-app' })),
  isSupported: vi.fn(async () => true),
  setConsent: vi.fn(), setAnalyticsCollectionEnabled: vi.fn(), logEvent: vi.fn(),
}))
vi.mock('./index', () => ({ isNative: () => false }))
vi.mock('../firebase/available', () => ({ cloudAvailable: true }))
vi.mock('../firebase/config', () => ({ getFirebaseApp: () => ({ name: '[DEFAULT]' }) }))
vi.mock('firebase/analytics', () => sdk)

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  })
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    location: new URL('https://mizan.test/?private=ACCOUNT#/cards/PRIVATE-CARD'),
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('web measurement metadata', () => {
  it('overrides browser URL and referrer at initialization and on each named event', async () => {
    const api = await import('./analytics')
    await api.setAnalyticsConsent(true)
    const context = { page_location: 'https://my-finance-webapp-fd.web.app/telemetry', page_referrer: '', page_title: 'Mizan' }
    expect(sdk.initializeAnalytics).toHaveBeenCalledWith(expect.anything(), {
      config: { ...context, send_page_view: false, allow_ad_personalization_signals: false, allow_google_signals: false },
    })
    api.trackProductEvent('asset_saved'); api.trackScreen('cards')
    await vi.waitFor(() => expect(sdk.logEvent).toHaveBeenCalledTimes(2))
    expect(sdk.logEvent).toHaveBeenCalledWith(expect.anything(), 'asset_saved', context)
    expect(sdk.logEvent).toHaveBeenCalledWith(expect.anything(), 'screen_view', {
      firebase_screen: 'cards', firebase_screen_class: 'FinanceApp', ...context,
    })
    expect(JSON.stringify(sdk.logEvent.mock.calls)).not.toMatch(/PRIVATE|ACCOUNT|mizan\.test/)
  })
  it('does not initialize without consent and blocks new web events immediately on revocation', async () => {
    const api = await import('./analytics')
    await api.initializeProductAnalytics()
    expect(sdk.initializeAnalytics).not.toHaveBeenCalled()
    await api.setAnalyticsConsent(true)
    const revoked = api.setAnalyticsConsent(false)
    api.trackProductEvent('asset_saved'); api.trackScreen('cards')
    await revoked
    expect(sdk.logEvent).not.toHaveBeenCalled()
    expect(sdk.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(expect.anything(), false)
  })
})
