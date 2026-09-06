import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { getFirebaseAuth } from './config'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  isAnonymous: boolean
}

function toAuthUser(user: User): AuthUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName, isAnonymous: user.isAnonymous }
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
export function onAuthChange(callback: (user: AuthUser | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (user) => callback(user ? toAuthUser(user) : null))
}

/**
 * Signing up (or signing in with Google) while an anonymous session is
 * already active *links* the new credential to it instead of starting a
 * fresh account — the uid stays the same, so whatever was already pushed to
 * Firestore under it is still there afterwards, not orphaned.
 */
export async function registerWithEmail(email: string, password: string): Promise<void> {
  const auth = getFirebaseAuth()
  if (auth.currentUser?.isAnonymous) {
    await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email, password))
  } else {
    await createUserWithEmailAndPassword(auth, email, password)
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
}

export async function signInWithGoogle(): Promise<void> {
  const auth = getFirebaseAuth()
  const provider = new GoogleAuthProvider()
  if (auth.currentUser?.isAnonymous) {
    await linkWithPopup(auth.currentUser, provider)
  } else {
    await signInWithPopup(auth, provider)
  }
}

/** "Devam et" without a form — starts a Firebase-backed account with no credentials attached yet; email/Google can be added to it later without losing the uid. */
export async function startAnonymousSession(): Promise<void> {
  await signInAnonymously(getFirebaseAuth())
}

export async function signOutSession(): Promise<void> {
  await signOut(getFirebaseAuth())
}

export async function deleteCurrentAccount(): Promise<void> {
  const user = getFirebaseAuth().currentUser
  if (!user) return
  await deleteUser(user)
}

const ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.',
  'auth/credential-already-in-use': 'Bu e-posta başka bir hesaba bağlı. Giriş yapmayı deneyin.',
  'auth/invalid-email': 'E-posta adresi geçersiz.',
  'auth/invalid-credential': 'E-posta veya şifre hatalı.',
  'auth/wrong-password': 'E-posta veya şifre hatalı.',
  'auth/user-not-found': 'Bu e-postayla kayıtlı bir hesap yok.',
  'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
  'auth/popup-closed-by-user': 'Google penceresi kapatıldı.',
  'auth/network-request-failed': 'İnternet bağlantısı yok veya çok zayıf.',
  'auth/requires-recent-login': 'Bu işlem için önce tekrar giriş yapmanız gerekiyor.',
  'auth/too-many-requests': 'Çok fazla deneme yapıldı, biraz sonra tekrar deneyin.',
  'auth/configuration-not-found': 'Bulut girişi henüz Firebase konsolunda etkinleştirilmedi.',
  'auth/operation-not-allowed': 'Bu giriş yöntemi Firebase konsolunda henüz açılmadı.',
}

/** Firebase errors carry a `code` like "auth/wrong-password"; this turns it into something to show. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  return 'Bir şeyler ters gitti, tekrar deneyin.'
}
