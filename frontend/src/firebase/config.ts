import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence, type Auth } from 'firebase/auth'
import { initializeFirestore, type Firestore } from 'firebase/firestore'

/**
 * Cloud sync is entirely optional — the app works fully offline without any
 * of this ever running (see `store/AppStore.tsx`). These are only
 * instantiated lazily, the first time something actually needs Firebase, so a
 * user who never touches the "Hesap" section in Ayarlar never opens a
 * connection to it.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId)
}

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null

function getApp(): FirebaseApp {
  if (app) return app
  app = getApps()[0] ?? initializeApp(config)
  return app
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance
  authInstance = getAuth(getApp())
  // Explicit rather than relying on the SDK default so a signed-in session
  // survives a reload the same way the local IndexedDB data does.
  void setPersistence(authInstance, browserLocalPersistence)
  return authInstance
}

export function getFirebaseDb(): Firestore {
  if (dbInstance) return dbInstance
  // Transactions carry a couple of optional fields (`raw`, `installment.principal`)
  // that are `undefined` rather than absent; Firestore rejects `undefined`
  // outright, and stripping it field-by-field at every call site would be
  // easy to miss once, so it is disabled here instead.
  dbInstance = initializeFirestore(getApp(), { ignoreUndefinedProperties: true })
  return dbInstance
}
