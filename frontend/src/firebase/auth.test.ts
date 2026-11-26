import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getRedirectResult,
  linkWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import {
  authErrorMessage,
  completeRedirectSignIn,
  reauthenticate,
  signInWithApple,
  signInWithGoogle,
  signOutSession,
} from './auth'

const session = vi.hoisted(() => ({
  auth: {
    currentUser: null as null | {
      uid?: string
      email?: string | null
      isAnonymous: boolean
      providerData?: Array<{ providerId: string }>
    },
  },
  native: false,
  disconnect: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./config', () => ({ getFirebaseAuth: () => session.auth }))
vi.mock('../platform', () => ({ isNative: () => session.native }))
vi.mock('../platform/push', () => ({ disconnectCloudPush: session.disconnect }))
vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: {
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    signOut: vi.fn(),
  },
}))
vi.mock('firebase/auth', async (original) => ({
  ...await original<typeof import('firebase/auth')>(),
  signInWithCredential: vi.fn(),
  linkWithCredential: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  session.native = false
  session.auth.currentUser = null
  vi.mocked(signInWithCredential).mockResolvedValue({} as never)
  vi.mocked(linkWithCredential).mockResolvedValue({} as never)
  vi.mocked(signInWithPopup).mockResolvedValue({} as never)
  vi.mocked(signInWithRedirect).mockResolvedValue(undefined as never)
  vi.mocked(getRedirectResult).mockResolvedValue(null)
  vi.mocked(reauthenticateWithCredential).mockResolvedValue({} as never)
  vi.mocked(reauthenticateWithPopup).mockResolvedValue({} as never)
  vi.mocked(signOut).mockResolvedValue(undefined)
  vi.mocked(FirebaseAuthentication.signInWithGoogle).mockResolvedValue({ user: null, additionalUserInfo: null, credential: { providerId: 'google.com', idToken: 'google-id-token' } })
  vi.mocked(FirebaseAuthentication.signInWithApple).mockResolvedValue({ user: null, additionalUserInfo: null, credential: { providerId: 'apple.com', idToken: 'apple-id-token', nonce: 'apple-raw-nonce' } })
  vi.mocked(FirebaseAuthentication.signOut).mockResolvedValue(undefined)
})

describe('Google sign-in across platforms', () => {
  it('uses the native credential picker and signs into the single JS session', async () => {
    session.native = true
    expect(await signInWithGoogle()).toBe('done')
    expect(FirebaseAuthentication.signInWithGoogle).toHaveBeenCalledWith({ skipNativeAuth: true })
    expect(signInWithCredential).toHaveBeenCalledWith(session.auth, expect.objectContaining({ idToken: 'google-id-token' }))
    expect(signInWithPopup).not.toHaveBeenCalled()
    expect(signInWithRedirect).not.toHaveBeenCalled()
  })

  it('never accepts a missing native token as a completed sign-in', async () => {
    session.native = true
    vi.mocked(FirebaseAuthentication.signInWithGoogle).mockResolvedValue({ user: null, additionalUserInfo: null, credential: null })
    await expect(signInWithGoogle()).rejects.toThrow('Google kimliği alınamadı')
    expect(signInWithCredential).not.toHaveBeenCalled()
  })

  it('treats the native account picker cancellation as a normal return', async () => {
    session.native = true
    vi.mocked(FirebaseAuthentication.signInWithGoogle).mockRejectedValue({ message: 'User canceled sign-in.' })
    expect(await signInWithGoogle()).toBe('cancelled')
    expect(signInWithCredential).not.toHaveBeenCalled()
  })

  it('shares one native picker across repeated taps from different entry points', async () => {
    session.native = true
    let finish!: (result: never) => void
    vi.mocked(FirebaseAuthentication.signInWithGoogle).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const first = signInWithGoogle()
    const second = signInWithGoogle()
    expect(first).toBe(second)
    await vi.waitFor(() => expect(FirebaseAuthentication.signInWithGoogle).toHaveBeenCalledTimes(1))
    finish({ credential: { idToken: 'google-id-token' } } as never)
    expect(await first).toBe('done')
  })

  it('links an anonymous account without losing its identity', async () => {
    session.native = true
    session.auth.currentUser = { isAnonymous: true }
    await signInWithGoogle()
    expect(linkWithCredential).toHaveBeenCalledWith(session.auth.currentUser, expect.anything())
    expect(signInWithCredential).not.toHaveBeenCalled()
  })

  it('signs into an existing Google account when anonymous linking collides', async () => {
    session.native = true
    session.auth.currentUser = { isAnonymous: true }
    vi.mocked(linkWithCredential).mockRejectedValue({ code: 'auth/credential-already-in-use' })
    await expect(signInWithGoogle()).resolves.toBe('done')
    expect(signInWithCredential).toHaveBeenCalledTimes(1)
  })

  it('falls back to web redirect only when a popup cannot open', async () => {
    vi.mocked(signInWithPopup).mockRejectedValue({ code: 'auth/popup-blocked' })
    expect(await signInWithGoogle()).toBe('redirecting')
    expect(signInWithRedirect).toHaveBeenCalledTimes(1)
  })

  it('does not reopen a closed popup as a redirect', async () => {
    vi.mocked(signInWithPopup).mockRejectedValue({ code: 'auth/popup-closed-by-user' })
    expect(await signInWithGoogle()).toBe('cancelled')
    expect(signInWithRedirect).not.toHaveBeenCalled()
  })

  it('does not run browser redirect recovery inside the Android WebView', async () => {
    session.native = true
    await completeRedirectSignIn()
    expect(getRedirectResult).not.toHaveBeenCalled()
  })

  it('does not swallow a redirect collision when Firebase returned no credential', async () => {
    vi.mocked(getRedirectResult).mockRejectedValue({ code: 'auth/credential-already-in-use' })
    await expect(completeRedirectSignIn()).rejects.toEqual({ code: 'auth/credential-already-in-use' })
  })
})

describe('sign-out and readable failures', () => {
  it('does not sign out a different account after an asynchronous cleanup', async () => {
    session.auth.currentUser = { uid: 'expected', isAnonymous: false }
    session.disconnect.mockImplementationOnce(async () => { session.auth.currentUser = { uid: 'different', isAnonymous: false } })
    await expect(signOutSession('expected')).rejects.toThrow('Hesap değişti')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('rejects an already changed account before disconnecting its push registration', async () => {
    session.auth.currentUser = { uid: 'different', isAnonymous: false }
    await expect(signOutSession('expected')).rejects.toThrow('Hesap değişti')
    expect(session.disconnect).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })
  it('disconnects push before clearing identity and tolerates a native cache failure', async () => {
    session.native = true
    vi.mocked(FirebaseAuthentication.signOut).mockRejectedValue(new Error('Credential cache unavailable'))
    await expect(signOutSession()).resolves.toBeUndefined()
    expect(session.disconnect).toHaveBeenCalledTimes(1)
    expect(session.disconnect.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(signOut).mock.invocationCallOrder[0])
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('explains Android OAuth and Apple failures without raw platform text', () => {
    expect(authErrorMessage({ message: '10: DEVELOPER_ERROR' })).toContain('yapılandırması doğrulanamadı')
    expect(authErrorMessage({ message: 'NoCredentialException: no credentials available' })).toContain('Google hesabı bulunamadı')
    expect(authErrorMessage({ code: '1000', message: 'ASAuthorizationError error 1000' })).toContain('iCloud')
    expect(authErrorMessage({ code: 'auth/operation-not-allowed' })).toContain('şu an etkin değil')
    expect(authErrorMessage({ code: 'auth/network-request-failed' })).toContain('İnternet bağlantısı')
  })
})

describe('Apple sign-in across platforms', () => {
  it('uses native Apple sign-in with idToken + rawNonce and signs into the single JS session', async () => {
    session.native = true
    expect(await signInWithApple()).toBe('done')
    expect(FirebaseAuthentication.signInWithApple).toHaveBeenCalledWith({ skipNativeAuth: true })
    expect(signInWithCredential).toHaveBeenCalledWith(
      session.auth,
      expect.objectContaining({ providerId: 'apple.com', idToken: 'apple-id-token', nonce: 'apple-raw-nonce' }),
    )
    expect(signInWithPopup).not.toHaveBeenCalled()
  })

  it('rejects a missing native Apple token instead of silently succeeding', async () => {
    session.native = true
    vi.mocked(FirebaseAuthentication.signInWithApple).mockResolvedValue({ user: null, additionalUserInfo: null, credential: null })
    await expect(signInWithApple()).rejects.toThrow('Apple kimliği alınamadı')
    expect(signInWithCredential).not.toHaveBeenCalled()
  })

  it('treats native Apple ASAuthorizationErrorCanceled (1001) as a clean cancellation', async () => {
    session.native = true
    vi.mocked(FirebaseAuthentication.signInWithApple).mockRejectedValue({ code: '1001', message: 'ASAuthorizationError error 1001' })
    expect(await signInWithApple()).toBe('cancelled')
    expect(signInWithCredential).not.toHaveBeenCalled()
  })

  it('shares one native Apple sheet across repeated taps', async () => {
    session.native = true
    let finish!: (result: never) => void
    vi.mocked(FirebaseAuthentication.signInWithApple).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const first = signInWithApple()
    const second = signInWithApple()
    expect(first).toBe(second)
    await vi.waitFor(() => expect(FirebaseAuthentication.signInWithApple).toHaveBeenCalledTimes(1))
    finish({ credential: { idToken: 'apple-id-token', nonce: 'apple-raw-nonce' } } as never)
    expect(await first).toBe('done')
  })

  it('falls back to web redirect when Apple popup is blocked and cancels cleanly when closed', async () => {
    vi.mocked(signInWithPopup).mockRejectedValueOnce({ code: 'auth/popup-blocked' })
    expect(await signInWithApple()).toBe('redirecting')
    expect(signInWithRedirect).toHaveBeenCalledTimes(1)

    vi.mocked(signInWithPopup).mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' })
    expect(await signInWithApple()).toBe('cancelled')
    expect(signInWithRedirect).toHaveBeenCalledTimes(1)
  })

  it('reauthenticates Apple-only accounts via Apple on both native and web', async () => {
    session.auth.currentUser = { uid: 'apple-u', isAnonymous: false, providerData: [{ providerId: 'apple.com' }] }

    session.native = true
    await reauthenticate()
    expect(FirebaseAuthentication.signInWithApple).toHaveBeenCalledWith({ skipNativeAuth: true })
    expect(reauthenticateWithCredential).toHaveBeenCalledWith(
      session.auth.currentUser,
      expect.objectContaining({ providerId: 'apple.com', idToken: 'apple-id-token' }),
    )

    session.native = false
    await reauthenticate()
    expect(reauthenticateWithPopup).toHaveBeenCalledWith(
      session.auth.currentUser,
      expect.objectContaining({ providerId: 'apple.com' }),
    )
  })
})
