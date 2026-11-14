import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  connectAuthEmulator, getAuth, initializeAuth, indexedDBLocalPersistence,
  browserLocalPersistence, type Auth,
} from 'firebase/auth'
import { isNative } from '../platform'

/**
 * Cloud sync is entirely optional — the app works fully offline without any
 * synchronization (see `store/AppStore.tsx`). Services initialize lazily when
 * needed. Remote Config checks update policy before sign-in; Analytics and
 * Performance Monitoring remain independently gated by device-local consent.
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
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
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
  // Capacitor's WebView needs IndexedDB persistence at initialization, before
  // the first auth-state event. This also avoids a second asynchronous
  // setPersistence racing the user's first Google sign-in.
  if (isNative()) {
    try {
      authInstance = initializeAuth(getFirebaseApp(), {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      })
    } catch (error) {
      // A hot-module replacement may re-run this module while the app's
      // Firebase Auth instance is still alive.
      if ((error as { code?: string }).code !== 'auth/already-initialized') throw error
      authInstance = getAuth(getFirebaseApp())
    }
  } else {
    authInstance = getAuth(getFirebaseApp())
  }

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
