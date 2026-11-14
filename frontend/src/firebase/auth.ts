import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type AuthCredential,
  type User,
} from 'firebase/auth'
import { getFirebaseAuth } from './config'
import { isNative } from '../platform'
import { trackProductEvent } from '../platform/analytics'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  isAnonymous: boolean
  /** `google.com`, `password` … — how this account can be signed into. */
  providers: string[]
}

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    isAnonymous: user.isAnonymous,
    providers: user.providerData.map((p) => p.providerId),
  }
}

const codeOf = (error: unknown): string | undefined => (error as { code?: string })?.code
const messageOf = (error: unknown): string => (error as { message?: string })?.message ?? ''

/** Native Credential Manager reports cancellation without a Firebase code. */
function isGoogleCancellation(error: unknown): boolean {
  const code = codeOf(error) ?? ''
  return ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', '12501', 'SIGN_IN_CANCELLED'].includes(code)
    || /(?:CANCELED|CANCELLED|CANCELLATION)/i.test(code)
    || /(?:user (?:cancelled|canceled)|(?:sign.in|authorization|activity) (?:is )?(?:cancelled|canceled)|(?:cancelled|canceled) by (?:the )?user)/i.test(messageOf(error))
}

/**
 * `onAuthStateChanged` fires on sign-in/sign-out/account-switch, but *not*
 * when `linkWithCredential`/`linkWithPopup` upgrades an already-signed-in
 * anonymous user in place — the uid does not change, so Firebase does not
 * consider it a state change, even though `isAnonymous` and `email` just did.
 * Callers that just linked a credential need this to pick that up.
 */
export function getCurrentAuthUser(): AuthUser | null {
  const user = getFirebaseAuth().currentUser
  return user ? toAuthUser(user) : null
}

/** Fires once immediately with the current session, then on every change. */
export function onAuthChange(callback: (user: AuthUser | null) => void, onError?: (error: unknown) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (user) => callback(user ? toAuthUser(user) : null), onError)
}

/**
 * Attaches a credential to whoever is signed in — and when it already belongs to
 * another account, signs into *that* account instead.
 *
 * Someone who has been using the app without an account, then signs in with an
 * email or Google account that already exists (made on their phone, say), has
 * asked for exactly one thing: to be in that account. Failing with "this
 * credential is already in use" turns a perfectly clear request into a dead end.
 * Their local data is not lost either way: the sync engine notices the device
 * holds data from a different identity and asks what to do with it.
 */
async function attach(credential: AuthCredential): Promise<void> {
  const auth = getFirebaseAuth()
  const user = auth.currentUser

  if (!user?.isAnonymous) {
    await signInWithCredential(auth, credential)
    return
  }

  try {
    await linkWithCredential(user, credential)
  } catch (error) {
    const code = codeOf(error)
    if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
      // Firebase hands back the credential it refused when it can.
      const refused = GoogleAuthProvider.credentialFromError(error as never) ?? credential
      await signInWithCredential(auth, refused)
      return
    }
    throw error
  }
}

// ─── Email ────────────────────────────────────────────────────────────────────

export type EmailOutcome = 'signed-in' | 'no-match'

/**
 * One form for both doors.
 *
 * Firebase hides whether an address has an account (so that nobody can probe for
 * who is a customer), which means the form cannot know whether to sign in or to
 * register. So it tries to sign in — what almost everyone returning means — and
 * when that fails reports `no-match`, leaving the screen to offer "create an
 * account" and "reset the password" side by side. The wrong-password case and the
 * no-account case are, by design, indistinguishable here.
 */
export async function continueWithEmail(email: string, password: string): Promise<EmailOutcome> {
  try {
    await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
    return 'signed-in'
  } catch (error) {
    const code = codeOf(error)
    if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
      return 'no-match'
    }
    throw error
  }
}

/**
 * Signing up while an anonymous session is active *links* the new credential to
 * it instead of starting a fresh account — the uid stays the same, so whatever
 * was already pushed to Firestore under it is still there afterwards.
 */
export async function registerWithEmail(email: string, password: string): Promise<void> {
  const auth = getFirebaseAuth()
  const cleaned = email.trim()

  if (auth.currentUser?.isAnonymous) {
    try {
      await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(cleaned, password))
    } catch (error) {
      if (codeOf(error) !== 'auth/email-already-in-use') throw error
      // The address already has an account. If the password typed is *its*
      // password, this person simply has an account already: sign them in.
      await signInWithEmailAndPassword(auth, cleaned, password)
    }
    return
  }

  await createUserWithEmailAndPassword(auth, cleaned, password)
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email.trim())
}

// ─── Google ───────────────────────────────────────────────────────────────────

export type GoogleOutcome = 'done' | 'redirecting' | 'cancelled'

/**
 * On the web this is a popup, with a full-page redirect as the way out when the
 * popup cannot open (blocked, or inside an in-app browser that has no popups).
 * Inside the Android WebView there is no popup to open at all, so the native
 * build asks the OS for a Google credential (via `@capacitor-firebase/authentication`,
 * configured with `skipNativeAuth: true`) and feeds the idToken into this same
 * Firebase JS session, which is what the rest of the app reads. Every path ends
 * in the one session, attached the same way.
 */
let googleSignInFlight: Promise<GoogleOutcome> | null = null

/** Sharing one in-flight request prevents competing Google account pickers. */
export function signInWithGoogle(): Promise<GoogleOutcome> {
  if (!googleSignInFlight) {
    googleSignInFlight = performGoogleSignIn().then(outcome => {
      if (outcome === 'done') trackProductEvent('sign_in_completed')
      return outcome
    }).finally(() => { googleSignInFlight = null })
  }
  return googleSignInFlight
}

async function performGoogleSignIn(): Promise<GoogleOutcome> {
  const auth = getFirebaseAuth()

  if (isNative()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
    try {
      const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })
      const idToken = result.credential?.idToken
      if (!idToken) throw new Error('Google kimliği alınamadı. Yeniden dene veya e-posta ile giriş yap.')
      await attach(GoogleAuthProvider.credential(idToken))
      return 'done'
    } catch (error) {
      if (isGoogleCancellation(error)) return 'cancelled'
      throw error
    }
  }

  const provider = new GoogleAuthProvider()
  // Always offer the account chooser: silently reusing whichever Google account
  // the browser happens to be in is how people end up in the wrong one.
  provider.setCustomParameters({ prompt: 'select_account' })

  const user = auth.currentUser
  try {
    if (user?.isAnonymous) await linkWithPopup(user, provider)
    else await signInWithPopup(auth, provider)
    return 'done'
  } catch (error) {
    switch (codeOf(error)) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'cancelled'

      case 'auth/popup-blocked':
      case 'auth/operation-not-supported-in-this-environment':
        if (user?.isAnonymous) await linkWithRedirect(user, provider)
        else await signInWithRedirect(auth, provider)
        return 'redirecting'

      case 'auth/credential-already-in-use': {
        const refused = GoogleAuthProvider.credentialFromError(error as never)
        if (!refused) throw error
        await signInWithCredential(auth, refused)
        return 'done'
      }

      default:
        throw error
    }
  }
}

/**
 * Completes a Google sign-in that left the page and came back. Called once at
 * start-up; a no-op when the page was not reached by a redirect.
 */
export async function completeRedirectSignIn(): Promise<void> {
  // The native picker returns credentials directly; browser redirects do not
  // participate in its lifecycle and must not delay native session recovery.
  if (isNative()) return
  const auth = getFirebaseAuth()
  try {
    await getRedirectResult(auth)
  } catch (error) {
    if (codeOf(error) === 'auth/credential-already-in-use') {
      const refused = GoogleAuthProvider.credentialFromError(error as never)
      if (refused) {
        await signInWithCredential(auth, refused)
        return
      }
    }
    throw error
  }
}

// ─── Leaving ──────────────────────────────────────────────────────────────────

/** A session with no credentials yet — kept for accounts that were started that way; the interface no longer offers it. */
export async function startAnonymousSession(): Promise<void> {
  await signInAnonymously(getFirebaseAuth())
}

export async function signOutSession(): Promise<void> {
  await import('../platform/push').then((push) => push.disconnectCloudPush())
  await signOut(getFirebaseAuth())
  // Only clears the OS-level Google account cache the native plugin keeps;
  // `skipNativeAuth` means there was never a second native Firebase session to
  // sign out of. Without this, the next "Google ile devam et" would silently
  // reuse the same account with no picker.
  if (isNative()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
    // The JS sign-out already succeeded. An unavailable OS credential cache
    // must not turn that success into a misleading account error.
    await FirebaseAuthentication.signOut().catch(() => undefined)
  }
}

/** Deleting an account is refused unless the sign-in is recent; this proves it again. */
export async function reauthenticate(password?: string): Promise<void> {
  const user = getFirebaseAuth().currentUser
  if (!user) return

  const usesPassword = user.providerData.some((p) => p.providerId === 'password')
  if (usesPassword && password !== undefined && user.email) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
    return
  }

  if (isNative()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })
    const idToken = result.credential?.idToken
    if (!idToken) throw new Error('Google girişi tamamlanamadı.')
    await reauthenticateWithCredential(user, GoogleAuthProvider.credential(idToken))
    return
  }

  await reauthenticateWithPopup(user, new GoogleAuthProvider())
}

export async function deleteCurrentAccount(): Promise<void> {
  const user = getFirebaseAuth().currentUser
  if (!user) return
  await import('../platform/push').then((push) => push.disconnectCloudPush())
  await deleteUser(user)
}

// ─── Words for what went wrong ────────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'Bu e-posta zaten kayıtlı. Şifren doğruysa giriş yap.',
  'auth/credential-already-in-use': 'Bu hesap başka bir oturuma bağlı. Giriş yapmayı dene.',
  'auth/account-exists-with-different-credential':
    'Bu e-posta başka bir yöntemle kayıtlı. O yöntemle giriş yap; Google\'ı sonra bağlayabilirsin.',
  'auth/invalid-email': 'E-posta adresi geçersiz.',
  'auth/invalid-credential': 'E-posta veya şifre hatalı.',
  'auth/wrong-password': 'E-posta veya şifre hatalı.',
  'auth/missing-password': 'Şifreni yaz.',
  'auth/user-not-found': 'Bu e-postayla kayıtlı bir hesap yok.',
  'auth/user-disabled': 'Bu hesap devre dışı bırakılmış.',
  'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
  'auth/popup-closed-by-user': 'Google penceresi kapatıldı.',
  'auth/popup-blocked': 'Tarayıcı Google penceresini engelledi. Engeli kaldırıp tekrar dene.',
  'auth/network-request-failed': 'İnternet bağlantısı yok veya çok zayıf.',
  'auth/requires-recent-login': 'Bu işlem için önce kimliğini yeniden doğrulaman gerekiyor.',
  'auth/too-many-requests': 'Çok fazla deneme yapıldı, biraz sonra tekrar dene.',
  'auth/configuration-not-found': 'Bulut girişi henüz Firebase konsolunda etkinleştirilmedi.',
  'auth/operation-not-allowed': 'Bu giriş yöntemi Firebase konsolunda henüz açılmadı.',
  'auth/unauthorized-domain': 'Bu adres Firebase\'de yetkili alan adı olarak tanımlı değil.',
  'auth/internal-error': 'Giriş servisi şu an yanıt vermedi, birazdan tekrar dene.',
}

/** Firebase errors carry a `code` like "auth/wrong-password"; this turns it into something to show. */
export function authErrorMessage(error: unknown): string {
  const code = codeOf(error)
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (isGoogleCancellation(error)) return 'Google girişi iptal edildi. Hazır olduğunda yeniden deneyebilirsin.'
  const message = messageOf(error)
  if (code === '10' || /(?:DEVELOPER_ERROR|(?:^|\s)10:|serverClientId.*(?:invalid|incorrect))/i.test(message)) {
    return 'Bu Android sürümünün Google giriş yapılandırması doğrulanamadı. E-posta ile giriş yapabilir, durumu geliştiriciye iletebilirsin.'
  }
  if (/NoCredentialException|no credentials available|no google accounts/i.test(message)) {
    return 'Bu telefonda kullanılabilir Google hesabı bulunamadı. Telefon ayarlarından Google hesabı ekle veya e-posta ile devam et.'
  }
  if (/network|unable to resolve host|connection.*failed/i.test(message)) return ERROR_MESSAGES['auth/network-request-failed']
  if (error instanceof Error && !code && error.message) return error.message
  return 'Bir şeyler ters gitti, tekrar dene.'
}
