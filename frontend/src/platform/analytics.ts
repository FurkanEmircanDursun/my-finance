import { isNative } from './index'
import { cloudAvailable } from '../firebase/available'

const CONSENT_KEY = 'finance.analytics-consent.v1'
export const ANALYTICS_UPDATED = 'finance:analytics-updated'
const EVENTS = ['entry_saved', 'statement_imported', 'card_added', 'onboarding_completed', 'sign_in_completed'] as const
const SCREENS = ['overview', 'spending', 'plan', 'cards', 'settings'] as const
export type ProductEvent = typeof EVENTS[number]
export type ProductScreen = typeof SCREENS[number]
let queue: Promise<void> = Promise.resolve()
let lastError: string | undefined
let webAnalytics: import('firebase/analytics').Analytics | undefined

/** Consent belongs to this device, not to the synced financial profile. */
export function analyticsConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === 'granted' } catch { return false }
}

export function analyticsError(): string | undefined { return lastError }

async function applyConsent(enabled: boolean): Promise<void> {
  if (!cloudAvailable) return
  if (isNative()) {
    const { FirebaseAnalytics, ConsentType, ConsentStatus } = await import('@capacitor-firebase/analytics')
    await FirebaseAnalytics.setConsent({ type: ConsentType.AnalyticsStorage, status: enabled ? ConsentStatus.Granted : ConsentStatus.Denied })
    for (const type of [ConsentType.AdStorage, ConsentType.AdUserData, ConsentType.AdPersonalization]) {
      await FirebaseAnalytics.setConsent({ type, status: ConsentStatus.Denied })
    }
    await FirebaseAnalytics.setEnabled({ enabled })
    if (!enabled) await FirebaseAnalytics.resetAnalyticsData()
  } else {
    // Never initialize the browser measurement SDK before explicit opt-in.
    if (!enabled && !webAnalytics) return
    const api = await import('firebase/analytics')
    if (!await api.isSupported()) return
    if (!webAnalytics && enabled) {
      const { getFirebaseApp } = await import('../firebase/config')
      webAnalytics = api.initializeAnalytics(getFirebaseApp(), {
        config: { send_page_view: false, allow_ad_personalization_signals: false },
      })
    }
    api.setConsent({ analytics_storage: enabled ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
    if (webAnalytics) api.setAnalyticsCollectionEnabled(webAnalytics, enabled)
  }
}

/** UI preference changes immediately; SDK transitions are serialized. */
export function setAnalyticsConsent(enabled: boolean): Promise<void> {
  try { localStorage.setItem(CONSENT_KEY, enabled ? 'granted' : 'denied') } catch {
    lastError = 'Tercihin kaydedilemedi. Cihaz depolamasını kontrol et.'
    return Promise.resolve()
  }
  queue = queue.catch(() => {}).then(() => applyConsent(analyticsConsent())).then(() => {
    lastError = undefined
  }).catch(() => {
    lastError = 'Kullanım ölçümü ayarlanamadı. Tercihini yeniden deneyebilirsin.'
  }).finally(() => window.dispatchEvent(new Event(ANALYTICS_UPDATED)))
  window.dispatchEvent(new Event(ANALYTICS_UPDATED))
  return queue
}

/** Also restores the disabled default after an app restart. */
export function initializeProductAnalytics(): Promise<void> {
  queue = queue.catch(() => {}).then(() => applyConsent(analyticsConsent())).catch(() => {
    lastError = 'Kullanım ölçümü şu anda kullanılamıyor.'
  })
  return queue
}

/** No arbitrary parameters: financial amounts, merchants, filenames and identity cannot enter this API. */
export function trackProductEvent(name: ProductEvent): void {
  if (!EVENTS.includes(name) || !analyticsConsent() || !cloudAvailable) return
  void queue.then(async () => {
    if (!analyticsConsent()) return
    if (isNative()) {
      const { FirebaseAnalytics } = await import('@capacitor-firebase/analytics')
      await FirebaseAnalytics.logEvent({ name })
    } else if (webAnalytics) {
      const { logEvent } = await import('firebase/analytics')
      logEvent(webAnalytics, name)
    }
  }).catch(() => {})
}

export function trackScreen(name: ProductScreen): void {
  if (!SCREENS.includes(name) || !analyticsConsent() || !cloudAvailable) return
  void queue.then(async () => {
    if (!analyticsConsent()) return
    if (isNative()) {
      const { FirebaseAnalytics } = await import('@capacitor-firebase/analytics')
      await FirebaseAnalytics.setCurrentScreen({ screenName: name, screenClassOverride: 'FinanceApp' })
    } else if (webAnalytics) {
      const { logEvent } = await import('firebase/analytics')
      logEvent(webAnalytics, 'screen_view', { firebase_screen: name, firebase_screen_class: 'FinanceApp' })
    }
  }).catch(() => {})
}
