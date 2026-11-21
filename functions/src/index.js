import { initializeApp } from 'firebase-admin/app'
import { FieldPath, FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import { deliveryId, deliverOnce, dueReminders, istanbulDate, messageFor, TIME_ZONE } from './reminder-plan.js'

initializeApp()
const db = getFirestore()
const messaging = getMessaging()
const DAY_MS = 86_400_000

/** One shared hourly job, not one Scheduler job per card or account. */
export const monthlyStatementReminders = onSchedule({
  schedule: '0 * * * *', timeZone: TIME_ZONE, region: 'europe-west1',
  memory: '256MiB', maxInstances: 1, minInstances: 0, concurrency: 1,
  timeoutSeconds: 300, retryCount: 0,
}, async (event) => {
  const now = new Date()
  const scheduled = event.scheduleTime ? new Date(event.scheduleTime) : now
  // Do not deliver a historical job after its intended hour has passed.
  if (!Number.isFinite(scheduled.getTime()) || now.getTime() - scheduled.getTime() > 55 * 60_000) return
  const hour = istanbulDate(scheduled).hour
  let cursor
  let sent = 0
  let failed = 0
  do {
    let query = db.collectionGroup('pushDevices').where('hour', '==', hour).orderBy(FieldPath.documentId()).limit(100)
    if (cursor) query = query.startAfter(cursor)
    const page = await query.get()
    for (const deviceDoc of page.docs) {
      // Only the user-owned path supported by the client is eligible.
      const path = deviceDoc.ref.path.split('/')
      if (path.length !== 4 || path[0] !== 'users' || path[2] !== 'pushDevices') continue
      const device = deviceDoc.data()
      if (device.enabled !== true) continue
      if (!device.updatedAt?.toMillis || device.updatedAt.toMillis() < now.getTime() - 90 * DAY_MS) {
        await deviceDoc.ref.delete()
        continue
      }
      if (typeof device.token !== 'string' || device.token.length < 20 || device.token.length > 4096) continue
      const profile = (await db.doc(`users/${path[1]}/meta/profile`).get()).data()
      for (const reminder of dueReminders(profile, device, scheduled)) {
        const id = deliveryId(deviceDoc.ref.path, reminder)
        const receipt = db.doc(`users/${path[1]}/notificationDeliveries/${id}`)
        const result = await deliverOnce({
          claim: async () => {
            // Re-read opt-out before claiming each notification, without logging tokens or account data.
            if (!(await deviceDoc.ref.get()).data()?.enabled) return false
            try {
              await receipt.create({ status: 'claimed', createdAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(now.getTime() + 45 * DAY_MS) })
              return true
            } catch (error) {
              if (error?.code === 6 || error?.code === 'already-exists') return false
              throw error
            }
          },
          send: (message) => messaging.send(message),
          finish: async (_id, status) => { await receipt.update({ status, completedAt: FieldValue.serverTimestamp() }) },
          invalidate: () => deviceDoc.ref.delete(),
        }, id, messageFor(device.token, reminder, id))
        if (result === 'sent') sent++
        if (result === 'failed') failed++
      }
    }
    cursor = page.size === 100 ? page.docs.at(-1) : undefined
  } while (cursor)

  // Bounded cleanup uses this same job; no extra scheduler or TTL service is required.
  const expired = await db.collectionGroup('notificationDeliveries').where('expireAt', '<', Timestamp.now()).limit(200).get()
  if (expired.size) {
    const batch = db.batch()
    expired.docs.forEach((item) => batch.delete(item.ref))
    await batch.commit()
  }
  logger.info('Monthly reminder delivery finished', { sent, failed })
})
