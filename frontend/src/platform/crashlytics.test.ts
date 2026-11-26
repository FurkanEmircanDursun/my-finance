import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  native: vi.fn(() => false),
  android: vi.fn(() => false),
  ios: vi.fn(() => false),
  getCrashlytics: vi.fn(),
  recordError: vi.fn(),
  nativeSetEnabled: vi.fn(),
  nativeSetCustomKey: vi.fn(),
  nativeRecordException: vi.fn(),
}))

vi.mock('./index', () => ({
  isNative: mocks.native,
  isAndroid: mocks.android,
  isIOS: mocks.ios,
}))
vi.mock('../firebase/available', () => ({ cloudAvailable: true }))
vi.mock('../firebase/config', () => ({ getFirebaseApp: () => ({ name: '[DEFAULT]' }) }))
vi.mock('firebase/crashlytics', () => ({
  getCrashlytics: mocks.getCrashlytics,
  recordError: mocks.recordError,
}))
vi.mock('@capacitor-firebase/crashlytics', () => ({
  FirebaseCrashlytics: {
    setEnabled: mocks.nativeSetEnabled,
    setCustomKey: mocks.nativeSetCustomKey,
    recordException: mocks.nativeRecordException,
  },
}))

const store = new Map<string, string>()

beforeEach(async () => {
  vi.clearAllMocks()
  store.clear()
  mocks.native.mockReturnValue(false)
  mocks.android.mockReturnValue(false)
  mocks.ios.mockReturnValue(false)
  mocks.getCrashlytics.mockReturnValue({ app: { name: '[DEFAULT]' } })
  mocks.nativeSetEnabled.mockResolvedValue(undefined)
  mocks.nativeSetCustomKey.mockResolvedValue(undefined)
  mocks.nativeRecordException.mockResolvedValue(undefined)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
  })
  vi.stubGlobal('window', new EventTarget())
  const mod = await import('./crashlytics')
  mod._resetCrashlyticsForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Firebase Crashlytics (Web + Native)', () => {
  it('redacts emails, card numbers, IBANs, and currency amounts before reporting', async () => {
    const { sanitizeCrashMessage } = await import('./crashlytics')
    const clean = sanitizeCrashMessage(
      new Error('Failed for user@example.com card 4543 1234 5678 9012 IBAN TR330006100519786457841326 amount ₺12.450,00'),
    )
    expect(clean).not.toContain('user@example.com')
    expect(clean).not.toContain('4543')
    expect(clean).not.toContain('TR33')
    expect(clean).not.toContain('12.450')
    expect(clean).toContain('[redacted-email]')
    expect(clean).toContain('[redacted-number]')
    expect(clean).toContain('[redacted-iban]')
    expect(clean).toContain('[redacted-amount]')
  })

  it('defaults to enabled, persists opt-out, and suppresses reporting when disabled', async () => {
    const { crashlyticsEnabled, setCrashlyticsEnabled, recordCrashError } = await import('./crashlytics')
    expect(crashlyticsEnabled()).toBe(true)
    await setCrashlyticsEnabled(false)
    expect(crashlyticsEnabled()).toBe(false)

    await recordCrashError(new Error('Should not be sent'), { source: 'test' })
    expect(mocks.getCrashlytics).not.toHaveBeenCalled()
    expect(mocks.recordError).not.toHaveBeenCalled()
  })

  it('initializes Firebase Crashlytics Web SDK and reports sanitized ErrorBoundary errors', async () => {
    const { initializeCrashlytics, recordCrashError } = await import('./crashlytics')
    initializeCrashlytics()
    await vi.waitFor(() => expect(mocks.getCrashlytics).toHaveBeenCalledOnce())
    expect(mocks.getCrashlytics).toHaveBeenCalledWith(
      { name: '[DEFAULT]' },
      expect.objectContaining({ captureUnhandledErrors: true, customAttributes: { platform: 'web' } }),
    )

    await recordCrashError(new Error('Render crash for alice@test.com'), { source: 'react_error_boundary' })
    expect(mocks.recordError).toHaveBeenCalledOnce()
    const [, reportedError, attrs] = mocks.recordError.mock.calls[0]
    expect((reportedError as Error).message).toContain('[redacted-email]')
    expect(attrs).toMatchObject({ source: 'react_error_boundary', platform: 'web' })
  })

  it('activates native Crashlytics on Android/iOS and forwards exceptions with parsed stack frames', async () => {
    mocks.native.mockReturnValue(true)
    mocks.android.mockReturnValue(true)
    const { initializeCrashlytics, recordCrashError } = await import('./crashlytics')
    const dispose = initializeCrashlytics()
    await vi.waitFor(() => expect(mocks.nativeSetEnabled).toHaveBeenCalledWith({ enabled: true }))

    const err = new Error('Native WebView boom')
    err.stack = 'Error: Native WebView boom\n    at parsePdf (https://localhost/assets/app.js:42:10)'
    await recordCrashError(err, { source: 'react_error_boundary' })

    expect(mocks.nativeRecordException).toHaveBeenCalledWith({
      message: '[react_error_boundary] Error: Native WebView boom',
      stacktrace: [{ functionName: 'parsePdf', fileName: 'https://localhost/assets/app.js', lineNumber: 42 }],
    })
    dispose()
  })
})
