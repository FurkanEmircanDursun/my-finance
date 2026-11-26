import { cloudAvailable } from '../firebase/available'
import { isAndroid, isIOS, isNative } from './index'

export const CRASHLYTICS_UPDATED = 'mizan:crashlytics-updated'

const PREF_KEY = 'mizan:crashlytics-enabled'
const MAX_MESSAGE_LENGTH = 240
const MAX_STACK_FRAMES = 25

type WebCrashlyticsSdk = typeof import('firebase/crashlytics')
type WebCrashlyticsInstance = import('firebase/crashlytics').Crashlytics

let webSdk: WebCrashlyticsSdk | null = null
let webInstance: WebCrashlyticsInstance | null = null
let nativeInitialized = false
let listenersCleanup: (() => void) | null = null

function safeAppVersion(): string {
  return typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim() ? __APP_VERSION__.trim() : '0.0.0'
}

function currentPlatform(): 'ios' | 'android' | 'web' {
  if (isIOS()) return 'ios'
  if (isAndroid()) return 'android'
  return 'web'
}

function isEmulatorMode(): boolean {
  return Boolean(
    import.meta.env.DEV &&
      (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR ||
        import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR ||
        import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR),
  )
}

/**
 * Enabled by default so unhandled crashes are reported without intrusive popups.
 * Users can opt out anytime from Ayarlar → Bulut ve Gizlilik.
 */
export function crashlyticsEnabled(): boolean {
  try {
    const stored = globalThis.localStorage?.getItem(PREF_KEY)
    if (stored === '0' || stored === 'false') return false
    return true
  } catch {
    return true
  }
}

/**
 * Strips emails, card/IBAN-like digit sequences, and currency amounts so
 * financial or personal data never leaves the device in a crash report.
 */
export function sanitizeCrashMessage(raw: unknown): string {
  const text =
    raw instanceof Error
      ? `${raw.name || 'Error'}: ${raw.message || 'Unknown error'}`
      : typeof raw === 'string'
        ? raw
        : 'Unexpected error'
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\bTR\d{2}[\s-]?(?:\d[\s-]?){20,26}\b/gi, '[redacted-iban]')
    .replace(/\b(?:\d[ -]?){12,19}\b/g, '[redacted-number]')
    .replace(/(?:₺|TL|TRY|USD|EUR|\$|€)\s*\d[\d.,]*/gi, '[redacted-amount]')
    .replace(/\d[\d.,]*\s*(?:₺|TL|TRY|USD|EUR)\b/gi, '[redacted-amount]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH) || 'Unexpected error'
}

function parseStackFrames(stack?: string): Array<{ fileName?: string; functionName?: string; lineNumber?: number }> {
  if (!stack) return []
  const frames: Array<{ fileName?: string; functionName?: string; lineNumber?: number }> = []
  for (const rawLine of stack.split('\n')) {
    if (frames.length >= MAX_STACK_FRAMES) break
    const line = rawLine.trim()
    if (!line || !line.includes(':')) continue
    // V8/Chrome: "at fnName (file:line:col)" or "at file:line:col"
    const v8 = /^at\s+(?:([^\s(]+)\s+\()?([^()\s]+):(\d+):\d+\)?$/.exec(line)
    if (v8) {
      frames.push({
        ...(v8[1] ? { functionName: v8[1].slice(0, 120) } : {}),
        fileName: v8[2].slice(0, 200),
        lineNumber: Number(v8[3]),
      })
      continue
    }
    // WebKit/Safari: "fnName@file:line:col"
    const webkit = /^([^@\s]*)@([^\s]+):(\d+):\d+$/.exec(line)
    if (webkit) {
      frames.push({
        ...(webkit[1] ? { functionName: webkit[1].slice(0, 120) } : {}),
        fileName: webkit[2].slice(0, 200),
        lineNumber: Number(webkit[3]),
      })
    }
  }
  return frames
}

async function initWebCrashlytics(): Promise<void> {
  if (webInstance || !cloudAvailable || !crashlyticsEnabled() || isEmulatorMode()) return
  try {
    const [sdk, { getFirebaseApp }] = await Promise.all([
      import('firebase/crashlytics'),
      import('../firebase/config'),
    ])
    if (!crashlyticsEnabled()) return
    webSdk = sdk
    webInstance = sdk.getCrashlytics(getFirebaseApp(), {
      appVersion: safeAppVersion(),
      captureUnhandledErrors: true,
      customAttributes: { platform: 'web' },
    })
  } catch {
    // Crashlytics Web is optional; never disrupt app startup.
  }
}

async function initNativeCrashlytics(enabled: boolean): Promise<void> {
  try {
    const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics')
    await FirebaseCrashlytics.setEnabled({ enabled })
    if (!enabled) return
    nativeInitialized = true
    await Promise.allSettled([
      FirebaseCrashlytics.setCustomKey({ key: 'app_version', value: safeAppVersion(), type: 'string' }),
      FirebaseCrashlytics.setCustomKey({ key: 'platform', value: currentPlatform(), type: 'string' }),
    ])
  } catch {
    // Plugin may be absent in offline iOS builds without GoogleService-Info.plist.
  }
}

function installNativeWebViewListeners(): () => void {
  if (typeof window === 'undefined') return () => {}
  const onError = (event: ErrorEvent) => {
    void recordCrashError(event.error ?? event.message, { source: 'window_error' })
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    void recordCrashError(event.reason, { source: 'unhandled_rejection' })
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

/**
 * Starts Crashlytics once near app root:
 * - Web: official Firebase Crashlytics Web SDK (`firebase/crashlytics`).
 * - Android & iOS: `@capacitor-firebase/crashlytics` + WebView unhandled error bridge.
 */
export function initializeCrashlytics(): () => void {
  if (!cloudAvailable || isEmulatorMode()) return () => {}
  const enabled = crashlyticsEnabled()

  if (isNative()) {
    void initNativeCrashlytics(enabled)
    listenersCleanup?.()
    listenersCleanup = enabled ? installNativeWebViewListeners() : null
    return () => {
      listenersCleanup?.()
      listenersCleanup = null
    }
  }

  if (enabled) {
    void initWebCrashlytics()
  }
  return () => {}
}

export async function setCrashlyticsEnabled(enabled: boolean): Promise<void> {
  try {
    globalThis.localStorage?.setItem(PREF_KEY, enabled ? '1' : '0')
  } catch {
    // Ignore restricted storage modes.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CRASHLYTICS_UPDATED))
  }
  if (!cloudAvailable || isEmulatorMode()) return

  if (isNative()) {
    await initNativeCrashlytics(enabled)
    listenersCleanup?.()
    listenersCleanup = enabled ? installNativeWebViewListeners() : null
    return
  }

  if (enabled) {
    await initWebCrashlytics()
  }
}

/** Records a non-fatal or ErrorBoundary exception with PII-free metadata. */
export async function recordCrashError(
  error: unknown,
  context?: { source?: string; componentStack?: string },
): Promise<void> {
  if (!cloudAvailable || !crashlyticsEnabled() || isEmulatorMode()) return

  const message = sanitizeCrashMessage(error)
  const source = context?.source ?? 'app'

  try {
    if (isNative()) {
      const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics')
      if (!nativeInitialized) await initNativeCrashlytics(true)
      const stack = error instanceof Error ? error.stack : undefined
      const stacktrace = parseStackFrames(stack)
      await FirebaseCrashlytics.recordException({
        message: `[${source}] ${message}`,
        ...(stacktrace.length ? { stacktrace } : {}),
      })
      return
    }

    if (!webInstance || !webSdk) await initWebCrashlytics()
    if (!webInstance || !webSdk) return
    const sanitizedError = new Error(message)
    if (error instanceof Error) {
      sanitizedError.name = error.name || 'Error'
      if (error.stack) sanitizedError.stack = error.stack
    }
    webSdk.recordError(webInstance, sanitizedError, {
      source,
      platform: 'web',
      app_version: safeAppVersion(),
    })
  } catch {
    // Never let telemetry throw inside error handlers.
  }
}

/** @internal Test helper to reset module state between unit tests. */
export function _resetCrashlyticsForTests(): void {
  listenersCleanup?.()
  listenersCleanup = null
  webSdk = null
  webInstance = null
  nativeInitialized = false
}
