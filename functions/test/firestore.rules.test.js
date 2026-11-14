import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, setDoc, deleteDoc, getDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore'

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (!emulator) throw new Error('Run this test through firebase emulators:exec --only firestore.')
let env
before(async () => {
  if (!emulator) return
  env = await initializeTestEnvironment({
    projectId: 'demo-my-finance-rules', firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  })
})
after(async () => { await env?.cleanup() })
const owner = () => env.authenticatedContext('owner', { firebase: { sign_in_provider: 'google.com' } }).firestore()
const devicePath = 'users/owner/pushDevices/0123456789abcdef0123456789abcdef'
const registration = () => ({ token: 'TEST_TOKEN_DO_NOT_SEND_12345', enabled: true, hour: 9, timeZone: 'Europe/Istanbul', updatedAt: serverTimestamp() })
const check = (name, handler) => test(name, { skip: !emulator }, handler)

check('owner can register, update and remove a valid push device', async () => {
  const ref = doc(owner(), devicePath)
  await assertSucceeds(setDoc(ref, registration()))
  await assertSucceeds(setDoc(ref, { ...registration(), hour: 17 }))
  await assertSucceeds(deleteDoc(ref))
})
check('other users and unauthenticated callers cannot read or write tokens', async () => {
  await assertSucceeds(setDoc(doc(owner(), devicePath), registration()))
  for (const db of [env.authenticatedContext('stranger').firestore(), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(db, devicePath)))
    await assertFails(setDoc(doc(db, devicePath), registration()))
  }
})
check('anonymous sessions cannot register devices', async () => {
  const db = env.authenticatedContext('owner', { firebase: { sign_in_provider: 'anonymous' } }).firestore()
  await assertFails(setDoc(doc(db, devicePath), registration()))
})
check('invalid update values, extra fields and missing required fields are rejected', async () => {
  const ref = doc(owner(), devicePath)
  for (const patch of [{ hour: 24 }, { hour: -1 }, { hour: 9.5 }, { enabled: 'true' }, { token: 'short' }, { timeZone: 'UTC' }, { uid: 'stranger' }, { updatedAt: new Date(0) }]) {
    await assertFails(setDoc(ref, { ...registration(), ...patch }))
  }
  await assertFails(setDoc(ref, { enabled: false }))
  await assertFails(setDoc(doc(owner(), 'users/owner/pushDevices/bad-id'), registration()))
})
check('client cannot forge or delete a server delivery receipt through recursive paths', async () => {
  await assertFails(setDoc(doc(owner(), 'users/owner/notificationDeliveries/fake'), { status: 'sent' }))
  await assertFails(deleteDoc(doc(owner(), 'users/owner/notificationDeliveries/fake')))
  await assertFails(setDoc(doc(owner(), 'users/owner/server/nested/deeper/fake'), { _u: 1 }))
})
check('existing sync collections, collection queries, tombstones and legacy purge remain usable', async () => {
  const db = owner()
  for (const kind of ['transactions', 'statements', 'rules', 'meta']) {
    const ref = doc(db, `users/owner/${kind}/compatibility`)
    await assertSucceeds(setDoc(ref, { _u: 123, value: 'legacy-compatible payload' }))
    await assertSucceeds(getDocs(collection(db, 'users/owner', kind)))
    await assertSucceeds(setDoc(ref, { _u: 124, _d: true }))
    await assertSucceeds(deleteDoc(ref))
  }
  await assertFails(setDoc(doc(db, 'users/owner/meta/bad'), { _u: -1 }))
  await assertFails(setDoc(doc(db, 'users/owner/meta/bad'), { _u: 1, _d: true, hidden: 'value' }))
  await assertFails(getDocs(collection(env.authenticatedContext('other').firestore(), 'users/owner', 'transactions')))
})
