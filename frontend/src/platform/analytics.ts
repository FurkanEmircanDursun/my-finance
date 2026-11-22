import { isNative } from './index'
import { cloudAvailable } from '../firebase/available'

export const ANALYTICS_UPDATED = 'finance:analytics-updated'
const EVENTS = ['entry_saved', 'statement_imported', 'card_added', 'onboarding_completed', 'sign_in_completed', 'asset_saved', 'asset_deleted', 'transaction_deleted', 'update_opened'] as const
const SCREENS = ['overview', 'analysis', 'spending', 'plan', 'cards', 'settings', 'assets'] as const
export type ProductEvent = typeof EVENTS[number]
export type ProductScreen = typeof SCREENS[number]
let queue: Promise<void> = Promise.resolve()
let lastError: string | undefined
let consentGranted = false
let webAnalytics: import('firebase/analytics').Analytics | undefined
// Explicit metadata prevents browser paths, search strings and external
// referrers being attached to our allowlisted custom events by gtag defaults.
export const WEB_MEASUREMENT_CONTEXT = {
  page_location: 'https://my-finance-webapp-fd.web.app/telemetry',
  page_referrer: '',
  page_title: 'Mizan',
} as const

/** The session starts without analytics consent. */
export function analyticsConsent(): boolean {
  return consentGranted
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
        config: { ...WEB_MEASUREMENT_CONTEXT, send_page_view: false, allow_ad_personalization_signals: false, allow_google_signals: false },
      })
    }
    api.setConsent({ analytics_storage: enabled ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
    if (webAnalytics) api.setAnalyticsCollectionEnabled(webAnalytics, enabled)
  }
}

/** UI preference changes immediately; SDK transitions are serialized. */
export function setAnalyticsConsent(enabled: boolean): Promise<void> {
  consentGranted = enabled
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
      logEvent(webAnalytics, name, { ...WEB_MEASUREMENT_CONTEXT })
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
      logEvent(webAnalytics, 'screen_view', { firebase_screen: name, firebase_screen_class: 'FinanceApp', ...WEB_MEASUREMENT_CONTEXT })
    }
  }).catch(() => {})
}
