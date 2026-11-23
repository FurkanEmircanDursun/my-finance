import { deleteApp, initializeApp } from 'firebase/app'
import { connectFirestoreEmulator, doc, getFirestore, setDoc, type Firestore } from 'firebase/firestore'
import { expect, it, vi } from 'vitest'
import { createScopedFirestoreTransport } from './firestoreTransport'
import type { RemoteSnapshot } from './transport'

const database = vi.hoisted(() => ({ current: null as Firestore | null }))
vi.mock('../firebase/db', () => ({ getFirebaseDb: () => database.current }))

const address = process.env.FIRESTORE_EMULATOR_HOST

it.skipIf(!address)('loads transactions by month, applies tombstones and upgrades to full history', async () => {
  const uid = 'scoped-transport-test'
  const app = initializeApp({ projectId: 'demo-my-finance-rules' }, uid)
  const otherApp = initializeApp({ projectId: 'demo-my-finance-rules' }, uid + '-other')
  const db = getFirestore(app)
  const otherDb = getFirestore(otherApp)
  const [host, port] = address!.split(':')
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid } })
  connectFirestoreEmulator(otherDb, host, Number(port), { mockUserToken: { sub: uid } })
  database.current = db
  const row = (id: string, date: string, billedOn?: string, statementId?: string) => ({
    id, date, ...(billedOn ? { billedOn } : {}), ...(statementId ? { statementId } : {}), description: 'Synthetic record', merchant: 'SYNTHETIC',
    amount: 100, kind: 'expense', category: 'other', categoryLocked: false, bank: 'Test',
    accountLabel: 'Test', installment: null, source: 'manual', _u: 10,
  })
  const ref = (id: string) => doc(db, 'users', uid, 'transactions', id)
  await Promise.all([
    setDoc(ref('latest'), row('latest', '2026-11-10')),
    setDoc(ref('billed'), row('billed', '2026-04-10', '2026-11-12')),
    setDoc(ref('october'), row('october', '2026-10-10')),
    setDoc(ref('archive'), row('archive', '2024-05-10', undefined, 'test-statement')),
  ])
  const transport = createScopedFirestoreTransport()
  const snapshots: RemoteSnapshot[] = []
  const onError = vi.fn()
  const stop = transport.listen(uid, { onSnapshot: snapshot => snapshots.push(snapshot), onError })
  const period = (month: string) => snapshots.find(snapshot => snapshot.periods?.includes(month))
  const ids = (snapshot?: RemoteSnapshot) => snapshot?.docs.map(doc => doc.id).sort()
  try {
    await vi.waitFor(() => expect(ids(period('2026-11'))).toEqual(['billed', 'latest']))
    expect(period('2026-11')?.full).toBe(false)
    transport.requestPeriod('2026-10')
    await vi.waitFor(() => expect(ids(period('2026-10'))).toEqual(['october']))
    transport.requestPeriod('2026-10')
    expect(snapshots.filter(snapshot => snapshot.periods?.includes('2026-10'))).toHaveLength(1)

    transport.requestPeriod('statement:test-statement')
    await vi.waitFor(() => expect(ids(period('statement:test-statement'))).toEqual(['archive']))

    await setDoc(doc(otherDb, 'users', uid, 'transactions', 'latest'), { _u: 11, _d: true })
    await vi.waitFor(() => expect(snapshots.some(snapshot =>
      snapshot.docs.some(doc => doc.id === 'latest' && doc.deleted),
    )).toBe(true))

    transport.requestPeriod('all')
    await vi.waitFor(() => expect(ids(period('all'))).toContain('archive'))
    expect(onError).not.toHaveBeenCalled()
  } finally {
    stop()
    database.current = null
    await Promise.all([deleteApp(app), deleteApp(otherApp)])
  }
}, 20_000)
