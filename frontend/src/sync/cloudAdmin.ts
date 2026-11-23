import { collection, deleteDoc, doc, getDocsFromServer, writeBatch } from 'firebase/firestore'
import { getFirebaseDb } from '../firebase/db'
import { KINDS, SINGLES } from './model'

const BATCH = 400

/**
 * Permanently removes everything this account has in Firestore. Used by "bulut
 * verilerimi sil" and "hesabımı sil"; the device's own copy is not touched.
 *
 * The caller stops writes before deletion and detaches the account on success.
 */
export async function wipeCloudData(uid: string): Promise<void> {
  const db = getFirebaseDb()

  for (const name of [...KINDS, 'pushDevices']) {
    const snap = await getDocsFromServer(collection(db, 'users', uid, name))
    for (let i = 0; i < snap.docs.length; i += BATCH) {
      const batch = writeBatch(db)
      for (const d of snap.docs.slice(i, i + BATCH)) batch.delete(d.ref)
      await batch.commit()
    }
  }

  await Promise.all(
    [...SINGLES, 'settings', 'schema'].map((id) => deleteDoc(doc(db, 'users', uid, 'meta', id))),
  )
}
