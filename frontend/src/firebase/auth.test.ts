import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRedirectResult, linkWithCredential, signInWithCredential, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { authErrorMessage, completeRedirectSignIn, signInWithGoogle, signOutSession } from './auth'

const session = vi.hoisted(() => ({
  auth: { currentUser: null as null | { isAnonymous: boolean } },
  native: false,
  disconnect: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./config', () => ({ getFirebaseAuth: () => session.auth }))
vi.mock('../platform', () => ({ isNative: () => session.native }))
vi.mock('../platform/push', () => ({ disconnectCloudPush: session.disconnect }))
vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: { signInWithGoogle: vi.fn(), signOut: vi.fn() },
}))
vi.mock('firebase/auth', async (original) => ({
  ...await original<typeof import('firebase/auth')>(),
  signInWithCredential: vi.fn(),
  linkWithCredential: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
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
  vi.mocked(signOut).mockResolvedValue(undefined)
  vi.mocked(FirebaseAuthentication.signInWithGoogle).mockResolvedValue({ user: null, additionalUserInfo: null, credential: { providerId: 'google.com', idToken: 'google-id-token' } })
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
  it('disconnects push before clearing identity and tolerates a native cache failure', async () => {
    session.native = true
    vi.mocked(FirebaseAuthentication.signOut).mockRejectedValue(new Error('Credential cache unavailable'))
    await expect(signOutSession()).resolves.toBeUndefined()
    expect(session.disconnect).toHaveBeenCalledTimes(1)
    expect(session.disconnect.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(signOut).mock.invocationCallOrder[0])
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('explains Android OAuth configuration failures without raw platform text', () => {
    expect(authErrorMessage({ message: '10: DEVELOPER_ERROR' })).toContain('yapılandırması doğrulanamadı')
    expect(authErrorMessage({ message: 'NoCredentialException: no credentials available' })).toContain('Google hesabı bulunamadı')
    expect(authErrorMessage({ code: 'auth/network-request-failed' })).toContain('İnternet bağlantısı')
  })
})
