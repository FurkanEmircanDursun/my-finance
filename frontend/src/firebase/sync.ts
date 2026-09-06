import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { getFirebaseDb } from './config'
import { defaultProfile, defaultSettings } from '../store/state'
import type { CategoryRule, Profile, Settings, Statement, Transaction } from '../domain/types'

/**
 * Cloud sync mirrors the same fields the local IndexedDB store persists (see
 * `store/AppStore.tsx`'s `Persisted` type) into `users/{uid}/...` in
 * Firestore. It is a *reconciliation*, not a delta sync: every push compares
 * the full local id set against what Firestore already has for that
 * collection and deletes whatever fell off (a removed statement's
 * transactions, a deleted rule), so cloud never accumulates rows the local
 * store no longer has. That costs one extra read per collection per push,
 * which is a fair trade for never having to reconcile a separate deletion log
 * at the scale a personal finance app runs at.
 */

export interface SyncSnapshot {
  transactions: Transaction[]
  statements: Statement[]
  rules: CategoryRule[]
  profile: Profile
  settings: Settings
}

// Firestore hard-caps a batch at 500 writes; this leaves headroom.
const BATCH_LIMIT = 400

async function reconcileCollection<T extends { id: string }>(
  uid: string,
  name: string,
  items: readonly T[],
): Promise<void> {
  const db = getFirebaseDb()
  const col = collection(db, 'users', uid, name)
  const existing = await getDocs(col)

  const localIds = new Set(items.map((item) => item.id))
  const toDelete = existing.docs.filter((d) => !localIds.has(d.id))

  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const item of items.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(col, item.id), item as unknown as Record<string, unknown>)
    }
    await batch.commit()
  }

  for (let i = 0; i < toDelete.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const d of toDelete.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref)
    await batch.commit()
  }
}

export async function pushSnapshot(uid: string, snapshot: SyncSnapshot): Promise<void> {
  const db = getFirebaseDb()
  await Promise.all([
    reconcileCollection(uid, 'transactions', snapshot.transactions),
    reconcileCollection(uid, 'statements', snapshot.statements),
    reconcileCollection(uid, 'rules', snapshot.rules),
    setDoc(doc(db, 'users', uid, 'meta', 'profile'), snapshot.profile as unknown as Record<string, unknown>),
    setDoc(doc(db, 'users', uid, 'meta', 'settings'), snapshot.settings as unknown as Record<string, unknown>),
  ])
}

/** Null when the account has never synced anything — a brand new sign-up, not an error. */
export async function pullSnapshot(uid: string): Promise<SyncSnapshot | null> {
  const db = getFirebaseDb()
  const [txSnap, stmtSnap, ruleSnap, profileSnap, settingsSnap] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'transactions')),
    getDocs(collection(db, 'users', uid, 'statements')),
    getDocs(collection(db, 'users', uid, 'rules')),
    getDoc(doc(db, 'users', uid, 'meta', 'profile')),
    getDoc(doc(db, 'users', uid, 'meta', 'settings')),
  ])

  const hasAnything =
    txSnap.size > 0 || stmtSnap.size > 0 || ruleSnap.size > 0 || profileSnap.exists() || settingsSnap.exists()
  if (!hasAnything) return null

  return {
    transactions: txSnap.docs.map((d) => d.data() as Transaction),
    statements: stmtSnap.docs.map((d) => d.data() as Statement),
    rules: ruleSnap.docs.map((d) => d.data() as CategoryRule),
    profile: profileSnap.exists() ? { ...defaultProfile, ...(profileSnap.data() as Profile) } : defaultProfile,
    settings: settingsSnap.exists() ? { ...defaultSettings, ...(settingsSnap.data() as Settings) } : defaultSettings,
  }
}

/**
 * Runs once, right after sign-in, to reconcile a device's local data with
 * whatever the account already has in the cloud (from another device, or
 * from before this one ever synced). Both sides are additive unions by id —
 * nothing gets silently dropped just because it is missing on the other
 * side. Profile and settings are simple objects rather than id-keyed lists,
 * so there is nothing to union there: whichever side already has real
 * (non-default) values wins, favouring local so a device's own theme choice
 * is not overwritten by whatever the account had saved elsewhere.
 */
export function mergeSnapshots(local: SyncSnapshot, cloud: SyncSnapshot): SyncSnapshot {
  const localTxIds = new Set(local.transactions.map((t) => t.id))
  const transactions = [...local.transactions, ...cloud.transactions.filter((t) => !localTxIds.has(t.id))]

  const localStmtIds = new Set(local.statements.map((s) => s.id))
  const statements = [...local.statements, ...cloud.statements.filter((s) => !localStmtIds.has(s.id))]

  const localMerchants = new Set(local.rules.map((r) => r.merchant))
  const rules = [...local.rules, ...cloud.rules.filter((r) => !localMerchants.has(r.merchant))]

  const localProfileIsSet = local.profile.monthlyIncome > 0 || local.profile.goal !== null || local.profile.budgets.length > 0
  const profile = localProfileIsSet ? local.profile : cloud.profile

  const localSettingsIsSet = local.settings.periodGrouping !== null
  const settings = localSettingsIsSet ? local.settings : { ...cloud.settings, theme: local.settings.theme }

  return { transactions, statements, rules, profile, settings }
}

/** Permanently removes every document this account has in Firestore — used by "hesabı ve bulut verilerimi sil". */
export async function wipeCloudData(uid: string): Promise<void> {
  const db = getFirebaseDb()

  for (const name of ['transactions', 'statements', 'rules']) {
    const snap = await getDocs(collection(db, 'users', uid, name))
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db)
      for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref)
      await batch.commit()
    }
  }

  await Promise.all([
    deleteDoc(doc(db, 'users', uid, 'meta', 'profile')),
    deleteDoc(doc(db, 'users', uid, 'meta', 'settings')),
  ])
}
