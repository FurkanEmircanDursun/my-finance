import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, browserLocalPersistence, setPersistence, type Auth } from 'firebase/auth'

/**
 * Cloud sync is entirely optional — the app works fully offline without any
 * of this ever running (see `store/AppStore.tsx`). These are only
 * instantiated lazily, the first time something actually needs Firebase, so a
 * user who never opens the account sheet never opens a connection to it.
 *
 * Firestore lives in `./db`, not here: signing in needs only Auth, and a person
 * who has an account but is merely being asked "who is signed in?" at start-up
 * should not download the database client to find out.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

let app: FirebaseApp | null = null
let authInstance: Auth | null = null

export function getFirebaseApp(): FirebaseApp {
  if (app) return app
  app = getApps()[0] ?? initializeApp(config)
  return app
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance
  authInstance = getAuth(getFirebaseApp())
  // Explicit rather than relying on the SDK default so a signed-in session
  // survives a reload the same way the local IndexedDB data does.
  void setPersistence(authInstance, browserLocalPersistence)

  // Password-reset and verification mails go out in the language of the screen
  // that asked for them, not Firebase's default English.
  authInstance.languageCode = 'tr'

  // Development only: point sign-in at the local Auth emulator
  // (`VITE_FIREBASE_AUTH_EMULATOR=http://127.0.0.1:9099`), so the whole flow can
  // be exercised with throwaway accounts that never touch the real project.
  const emulator = import.meta.env.DEV ? import.meta.env.VITE_FIREBASE_AUTH_EMULATOR : undefined
  if (emulator) connectAuthEmulator(authInstance, emulator, { disableWarnings: true })

  return authInstance
}
