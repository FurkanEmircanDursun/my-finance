import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, deleteField, deleteDoc, getDoc, collection, collectionGroup, getDocs, serverTimestamp, writeBatch, setLogLevel } from 'firebase/firestore'
import { dueReminders } from '../src/reminder-plan.js'

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run through firebase emulators:exec --only firestore,storage.')
setLogLevel('silent')
let env
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-my-finance-rules',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  })
})
beforeEach(async () => { await env.clearFirestore() })
after(async () => { await env?.cleanup() })
const owner = () => env.authenticatedContext('owner', { firebase: { sign_in_provider: 'google.com' } }).firestore()
const attackers = () => [env.authenticatedContext('other').firestore(), env.unauthenticatedContext().firestore()]
const time = Date.UTC(2026, 10, 14)
const devicePath = 'users/owner/pushDevices/0123456789abcdef0123456789abcdef'
const registration = () => ({ token: 'TEST_TOKEN_DO_NOT_SEND_12345', enabled: true, hour: 9, timeZone: 'Europe/Istanbul', updatedAt: serverTimestamp() })
const transaction = (id = 'tx-1') => ({
  id, date: '2026-11-14', description: 'Synthetic transaction', merchant: 'SYNTHETIC', amount: 12345,
  kind: 'expense', category: 'other', categoryLocked: false, bank: 'Test bank',
  accountLabel: 'Synthetic card', installment: null, source: 'statement', _u: time,
})
const statement = (id = 'st-1') => ({
  id, label: 'Synthetic statement', fileName: 'synthetic.pdf', bank: 'Test bank',
  transactionCount: 1, skippedCount: 0, periodStart: '2026-10-15', periodEnd: '2026-11-14',
  dueDate: '2026-11-24', importedAt: time, engine: 'rules-test', _u: time,
})
const rule = () => ({ id: 'rule-1', merchant: 'SYNTHETIC', category: 'other', createdAt: time, _u: time })
const card = { id: 'card-1', bank: 'akbank', name: 'Synthetic card', last4: '1234', statementDay: 14, entryDay: 14, remindersEnabled: true }
const profile = () => ({
  monthlyIncome: 500000, spendingLimit: 300000, currentBalance: -5000,
  budgets: [{ category: 'market', limit: 100000 }], goal: { targetAmount: 100000, startingAmount: 0, targetMonth: '2027-01', startMonth: '2026-11' },
  cards: [card], archivedCards: [{ ...card, id: 'archived-card', remindersEnabled: false }],
  assets: [{ id: 'holding-1', instrument: 'usd', quantityMicros: 1000000, updatedAt: time }], assetValuations: [], _u: time,
})
const prefs = () => ({ theme: 'system', periodGrouping: 'calendar', _u: time })
const fixtures = () => [
  ['users/owner/transactions/tx-1', transaction()], ['users/owner/statements/st-1', statement()],
  ['users/owner/rules/r_hash', rule()], ['users/owner/meta/profile', profile()], ['users/owner/meta/prefs', prefs()],
]

test('statement PDF fingerprints must be lowercase SHA-256 and remain owner-only', async () => {
  const path = 'users/owner/statements/st-1'
  const ref = doc(owner(), path)
  await assertSucceeds(setDoc(ref, statement()))
  await assertSucceeds(updateDoc(ref, { pdfSha256: 'ab'.repeat(32) }))
  for (const pdfSha256 of ['AB'.repeat(32), 'a'.repeat(63), 'g'.repeat(64), null]) {
    await assertFails(updateDoc(ref, { pdfSha256 }))
  }
  for (const reader of attackers()) await assertFails(getDoc(doc(reader, path)))
  await assertSucceeds(setDoc(ref, statement()))
})

test('owner full-sync batch, collection queries, edit, tombstone, resurrection and deletion work without a parent user document', async () => {
  const db = owner()
  const batch = writeBatch(db)
  for (const [path, data] of fixtures()) batch.set(doc(db, path), data)
  await assertSucceeds(batch.commit())
  for (const kind of ['transactions', 'statements', 'rules', 'meta']) {
    await assertSucceeds(getDocs(collection(db, 'users/owner', kind)))
  }
  for (const [path, data] of fixtures()) {
    const ref = doc(db, path)
    await assertSucceeds(getDoc(ref))
    await assertSucceeds(setDoc(ref, { ...data, _u: time + 1 }))
    await assertSucceeds(setDoc(ref, { _u: time + 2, _d: true }))
    await assertSucceeds(setDoc(ref, { ...data, _u: time + 3 }))
    await assertSucceeds(deleteDoc(ref))
  }
})

test('all financial paths reject cross-account/unauthenticated get/list/create/update/delete', async () => {
  const db = owner()
  for (const [path, data] of fixtures()) await setDoc(doc(db, path), data)
  for (const attacker of attackers()) {
    for (const [path, data] of fixtures()) {
      await assertFails(getDoc(doc(attacker, path)))
      await assertFails(setDoc(doc(attacker, path), { ...data, _u: time + 1 }))
      await assertFails(updateDoc(doc(attacker, path), { _u: time + 1 }))
      await assertFails(deleteDoc(doc(attacker, path)))
      const missing = path.startsWith('users/owner/meta/') ? path.replace('owner', 'victim') : `${path}-new`
      await assertFails(setDoc(doc(attacker, missing), data))
    }
    for (const kind of ['transactions', 'statements', 'rules', 'meta', 'pushDevices']) {
      await assertFails(getDocs(collection(attacker, 'users/owner', kind)))
    }
    await assertFails(getDocs(collection(attacker, 'users')))
    await assertFails(getDocs(collectionGroup(attacker, 'transactions')))
  }
})

test('owner cannot introduce roles, spoof ownership, arbitrary schema or a retired PIN document', async () => {
  const db = owner()
  for (const [path, data] of fixtures()) {
    for (const field of ['isAdmin', 'role', 'uid', 'ownerId', 'extraData', 'lockPinHash']) {
      await assertFails(setDoc(doc(db, path), { ...data, [field]: 'forged' }))
    }
    await assertSucceeds(setDoc(doc(db, path), data))
    await assertFails(updateDoc(doc(db, path), { role: 'admin' }))
  }
  for (const id of ['settings', 'schema', 'anything']) {
    await assertFails(setDoc(doc(db, 'users/owner/meta', id), { _u: time, lockPinHash: 'forged' }))
  }
  await assertFails(setDoc(doc(db, 'users/other/meta/profile'), profile()))
  await assertFails(setDoc(doc(db, 'users/owner'), { role: 'admin' }))
})

test('all sync creates and updates reject invalid versions, malformed tombstones and required-field removal', async () => {
  const db = owner()
  for (const [path, data] of fixtures()) {
    const ref = doc(db, path)
    for (const _u of [-1, 1.5, '123', 253402300800000]) await assertFails(setDoc(ref, { ...data, _u }))
    await assertFails(setDoc(ref, { _u: time, _d: true, hidden: 'unexpected' }))
    await assertFails(setDoc(ref, { ...data, _d: false }))
    await assertSucceeds(setDoc(ref, data))
    await assertFails(updateDoc(ref, { _u: deleteField() }))
    const required = path.includes('/transactions/') ? 'amount' : path.includes('/statements/') ? 'fileName' : path.includes('/rules/') ? 'merchant' : path.endsWith('/profile') ? 'monthlyIncome' : 'theme'
    await assertFails(updateDoc(ref, { [required]: deleteField() }))
  }
})

test('transaction updates cannot bypass scalar, ID, enum, nested-map and string bounds', async () => {
  const ref = doc(owner(), 'users/owner/transactions/tx-1')
  const valid = { ...transaction(), cardId: 'card-1', statementId: 'st-1', billedOn: '2026-11-14',
    installment: { current: 2, total: 12, principal: 100000, remaining: { count: 10, amount: 5000 } },
    foreign: { currency: 'USD', amount: 399 }, reward: 10, raw: 'Synthetic raw row' }
  await assertSucceeds(setDoc(ref, valid))
  for (const patch of [
    { id: 'different' }, { amount: -1 }, { amount: 1.5 }, { category: 'invented' },
    { categoryLocked: 'false' }, { date: '2026-13-01' }, { source: 'invented' },
    { description: 'x'.repeat(4097) }, { merchant: 'x'.repeat(4097) }, { raw: 'x'.repeat(16385) },
    { accountLabel: 'x'.repeat(257) }, { bank: 'x'.repeat(257) }, { cardId: 'x'.repeat(257) },
    { installment: { current: 3, total: 2 } }, { installment: { current: 1, total: 2, uid: 'other' } },
    { foreign: { amount: 1, currency: 'LONG' } }, { reward: 'ten' },
  ]) await assertFails(updateDoc(ref, patch))
})

test('all supported transaction directions and manual/CSV sources remain writable', async () => {
  const db = owner(), batch = writeBatch(db)
  for (const source of ['statement', 'manual', 'csv']) {
    for (const kind of ['expense', 'refund', 'income', 'payment']) {
      const id = `${source}-${kind}`
      batch.set(doc(db, 'users/owner/transactions', id), { ...transaction(id), source, kind })
    }
  }
  await assertSucceeds(batch.commit())
})

test('statement summaries, reconciliation, ignored rows and reimport update stay compatible', async () => {
  const ref = doc(owner(), 'users/owner/statements/st-1')
  const data = { ...statement(), cardId: 'card-1', accountLabel: 'Synthetic', ignored: [{ date: '2026-11-14', description: 'Synthetic reward', amount: 10, reason: 'reward-earned', raw: 'Synthetic' }],
    summary: { totalDebt: 100, previousBalance: -100, minPayment: 40, creditLimit: 100000, availableLimit: 99900, cashAdvanceLimit: 50000, interestMonthly: 3.75, previousCutDate: '2026-10-14', nextCutDate: '2026-12-14', nextDueDate: '2026-12-24', loyalty: { programme: 'Synthetic', earned: 10, spent: 0, balance: 10 } },
    reconciliation: { status: 'match', printedDebt: 100, previousBalance: -100, payments: 0, parsedCharges: 200, expectedCharges: 200, delta: 0 } }
  await assertSucceeds(setDoc(ref, data))
  await assertSucceeds(updateDoc(ref, { _u: time + 1000, engine: 'reimport' }))
  await assertSucceeds(updateDoc(ref, { importedAt: time + 1000, _u: time + 1001 }))
  for (const patch of [{ fileName: 'x'.repeat(1025) }, { id: 'other' }, { summary: { ...data.summary, totalDebt: '100' } }, { reconciliation: { ...data.reconciliation, status: 'invented' } }, { ignored: {} }, { ignored: Array(5001).fill(null) }]) {
    await assertFails(updateDoc(ref, patch))
  }
})

test('legacy merchant rule re-learning can replace its local ID and date while retaining its merchant', async () => {
  const ref = doc(owner(), 'users/owner/rules/r_hash')
  await assertSucceeds(setDoc(ref, rule()))
  await assertSucceeds(updateDoc(ref, { category: 'market', _u: time + 1 }))
  await assertSucceeds(updateDoc(ref, { id: 'rule-new', createdAt: time + 2, category: 'dining', _u: time + 2 }))
  await assertFails(updateDoc(ref, { merchant: 'another merchant' }))
  await assertFails(updateDoc(ref, { createdAt: 'yesterday' }))
})

test('account reminder and onboarding preferences accept exact types and reject out-of-range updates', async () => {
  const ref = doc(owner(), 'users/owner/meta/prefs')
  for (const reminders of [true, { enabled: true }, { enabled: 1, hour: 8 }, { enabled: false, hour: 24 }, { enabled: true, hour: 9, cloudPush: 'true' }]) {
    await assertFails(setDoc(ref, { ...prefs(), reminders }))
  }
  await assertSucceeds(setDoc(ref, { ...prefs(), onboardingSeen: true, reminders: { enabled: true, hour: 9, cloudPush: true } }))
  await assertFails(updateDoc(ref, { 'reminders.hour': -1 }))
  await assertFails(updateDoc(ref, { 'reminders.enabled': 'yes' }))
  await assertFails(updateDoc(ref, { 'reminders.extra': 'unexpected' }))
  await assertFails(updateDoc(ref, { onboardingSeen: 1 }))
  await assertSucceeds(updateDoc(ref, { 'reminders.hour': 22, 'reminders.cloudPush': false }))
})

test('profile supports 240 complete monthly asset observations without an expression-limit failure', async () => {
  const db = owner()
  const data = profile()
  const instruments = ['gold-gram', 'gold-quarter', 'silver-gram', 'usd', 'eur']
  data.assetValuations = Array.from({ length: 240 }, (_, i) => {
    const year = 2007 + Math.floor(i / 12), month = String(i % 12 + 1).padStart(2, '0')
    const observedAt = Date.UTC(year, i % 12, 14)
    return { id: `valuation-${year}-${month}`, day: `${year}-${month}-14`, observedAt, totalMinor: 50000, origin: 'quotes',
      rows: instruments.map(instrument => ({ instrument, quantityMicros: 1000000, valueMinor: 10000, tryPerUnit: 100, quoteAsOf: observedAt, source: 'truncgil', kind: 'market' })) }
  })
  const ref = doc(db, 'users/owner/meta/profile')
  await assertSucceeds(setDoc(ref, data))
  await assertSucceeds(updateDoc(ref, { monthlyIncome: 600000, _u: time + 1 }))
  const restored = (await assertSucceeds(getDoc(ref))).data()
  assert.equal(restored.assetValuations.length, 240)
  assert.equal(restored.assetValuations[239].rows.length, 5)
  assert.equal(dueReminders(restored, { enabled: true, hour: 9, timeZone: 'Europe/Istanbul' }, new Date('2026-11-14T06:00:00Z')).length, 1)
  for (const attacker of attackers()) await assertFails(getDoc(doc(attacker, 'users/owner/meta/profile')))
})

test('legacy profiles without optional arrays remain writable; invalid profile scalars/lists and leaked device settings fail', async () => {
  const ref = doc(owner(), 'users/owner/meta/profile')
  const legacy = { monthlyIncome: 0, spendingLimit: 0, currentBalance: 0, budgets: [], goal: null, _u: time }
  await assertSucceeds(setDoc(ref, legacy))
  await assertSucceeds(setDoc(ref, profile()))
  for (const patch of [{ monthlyIncome: -1 }, { spendingLimit: '100' }, { currentBalance: 1.5 }, { cards: {} }, { assets: 'bad' },
    { budgets: Array(101).fill(null) }, { assetValuations: Array(241).fill(null) }, { archivedCards: Array(1001).fill(null) },
    { cards: Array(1001).fill(null) }, { assets: Array(10001).fill(null) }, { lockPinHash: 'device-only' }]) {
    await assertFails(updateDoc(ref, patch))
  }
  const preferences = doc(owner(), 'users/owner/meta/prefs')
  await assertSucceeds(setDoc(preferences, { ...prefs(), periodGrouping: null }))
  await assertFails(updateDoc(preferences, { theme: 'invented' }))
  await assertFails(updateDoc(preferences, { lockPinSalt: 'device-only' }))
})

test('owner can read/query/purge legacy data, including retired settings, without rewriting it', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/owner/meta/settings'), { lockPinHash: 'synthetic-old-hash' })
    await setDoc(doc(context.firestore(), 'users/owner/meta/schema'), { version: 1 })
    await setDoc(doc(context.firestore(), 'users/owner/transactions/legacy'), { legacy: 'synthetic' })
  })
  const db = owner()
  await assertSucceeds(getDocs(collection(db, 'users/owner/meta')))
  for (const path of ['users/owner/meta/settings', 'users/owner/meta/schema', 'users/owner/transactions/legacy']) {
    await assertSucceeds(getDoc(doc(db, path)))
    for (const attacker of attackers()) await assertFails(getDoc(doc(attacker, path)))
    await assertSucceeds(deleteDoc(doc(db, path)))
  }
})

test('owner can register, refresh, list and remove a valid push device', async () => {
  const db = owner(), ref = doc(db, devicePath)
  await assertSucceeds(setDoc(ref, registration()))
  await assertSucceeds(updateDoc(ref, { enabled: false, hour: 17, updatedAt: serverTimestamp() }))
  await assertSucceeds(getDoc(ref))
  await assertSucceeds(getDocs(collection(db, 'users/owner/pushDevices')))
  await assertSucceeds(deleteDoc(ref))
})

test('push tokens cannot be read/written/deleted across users or by guests', async () => {
  await setDoc(doc(owner(), devicePath), registration())
  for (const db of attackers()) {
    await assertFails(getDoc(doc(db, devicePath)))
    await assertFails(setDoc(doc(db, devicePath), registration()))
    await assertFails(deleteDoc(doc(db, devicePath)))
  }
  const anonymous = env.authenticatedContext('owner', { firebase: { sign_in_provider: 'anonymous' } }).firestore()
  await assertFails(setDoc(doc(anonymous, devicePath), registration()))
})

test('push creates and updates both enforce schema, token bounds, hour and server time', async () => {
  const db = owner(), ref = doc(db, devicePath)
  const patches = [{ hour: 24 }, { hour: -1 }, { hour: 9.5 }, { enabled: 'true' }, { token: 'short' }, { token: 'x'.repeat(4097) }, { timeZone: 'UTC' }, { uid: 'other' }, { updatedAt: new Date(0) }]
  for (const patch of patches) await assertFails(setDoc(ref, { ...registration(), ...patch }))
  await assertSucceeds(setDoc(ref, registration()))
  for (const patch of patches) await assertFails(updateDoc(ref, patch))
  await assertFails(updateDoc(ref, { token: deleteField() }))
  await assertFails(setDoc(doc(db, 'users/owner/pushDevices/bad-id'), registration()))
})

test('default deny blocks server receipts, unknown collections and deeper subcollections even for their apparent owner', async () => {
  const paths = ['users/owner/notificationDeliveries/fake', 'users/owner/server/fake', 'users/owner/meta/profile/private/fake', 'users/owner/transactions/tx-1/private/fake', 'public/anything']
  await env.withSecurityRulesDisabled(async context => {
    for (const path of paths) await setDoc(doc(context.firestore(), path), { _u: time })
  })
  for (const db of [owner(), ...attackers()]) {
    for (const path of paths) {
      await assertFails(getDoc(doc(db, path)))
      await assertFails(setDoc(doc(db, path), { _u: time + 1 }))
      await assertFails(deleteDoc(doc(db, path)))
    }
  }
})
