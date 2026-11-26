import type { FirebaseApp } from 'firebase/app'
import type { AppCheck } from 'firebase/app-check'
import { isNative } from '../platform'

export type AppCheckStatus = 'idle' | 'active' | 'unconfigured' | 'disabled' | 'error'

let currentStatus: AppCheckStatus = 'idle'
let initPromise: Promise<AppCheck | null> | null = null

export function getAppCheckStatus(): AppCheckStatus {
  return currentStatus
}

function isEmulatorMode(): boolean {
  return Boolean(
    import.meta.env.DEV &&
      (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR ||
        import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR ||
        import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR),
  )
}

function resolveDevDebugToken(): boolean | string | undefined {
  if (!import.meta.env.DEV) return undefined
  const raw = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN?.trim()
  if (!raw) return undefined
  if (raw === 'true' || raw === '1') return true
  return raw
}

/**
 * Initializes Firebase App Check once per app session:
 * - Android: Play Integrity via `@capacitor-firebase/app-check` bridged into the
 *   Firebase JS SDK through a `CustomProvider`.
 * - iOS: App Attest (DeviceCheck fallback) via the same native bridge.
 * - Web: `ReCaptchaEnterpriseProvider` when `VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY`
 *   is configured (with optional dev debug token support).
 *
 * Fails open gracefully when unconfigured or running offline so local-first
 * usage is never disrupted.
 */
export function initializeAppCheckOnce(app: FirebaseApp): Promise<AppCheck | null> {
  if (initPromise) return initPromise
  initPromise = startAppCheck(app)
  return initPromise
}

async function startAppCheck(app: FirebaseApp): Promise<AppCheck | null> {
  if (isEmulatorMode()) {
    currentStatus = 'disabled'
    return null
  }

  try {
    if (isNative()) {
      const [{ FirebaseAppCheck }, { CustomProvider, initializeAppCheck }] = await Promise.all([
        import('@capacitor-firebase/app-check'),
        import('firebase/app-check'),
      ])
      const debugToken = resolveDevDebugToken()
      await FirebaseAppCheck.initialize({
        isTokenAutoRefreshEnabled: true,
        ...(debugToken ? { debugToken: true } : {}),
      })
      const provider = new CustomProvider({
        getToken: async () => {
          const result = await FirebaseAppCheck.getToken({ forceRefresh: false })
          if (!result?.token) throw new Error('Native App Check token unavailable')
          const fallbackExpiry = Date.now() + 55 * 60_000
          return {
            token: result.token,
            expireTimeMillis:
              typeof result.expireTimeMillis === 'number' && result.expireTimeMillis > Date.now()
                ? result.expireTimeMillis
                : fallbackExpiry,
          }
        },
      })
      const instance = initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: true,
      })
      currentStatus = 'active'
      return instance
    }

    const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY?.trim()
    if (!siteKey) {
      currentStatus = 'unconfigured'
      return null
    }

    const debugToken = resolveDevDebugToken()
    if (debugToken !== undefined) {
      ;(globalThis as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken
    }

    const { ReCaptchaEnterpriseProvider, initializeAppCheck } = await import('firebase/app-check')
    const instance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
    currentStatus = 'active'
    return instance
  } catch {
    currentStatus = 'error'
    return null
  }
}

/** @internal Test helper to reset module singleton state between unit tests. */
export function _resetAppCheckForTests(): void {
  initPromise = null
  currentStatus = 'idle'
}
