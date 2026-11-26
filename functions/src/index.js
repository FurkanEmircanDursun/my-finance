import { initializeApp } from 'firebase-admin/app'
import { FieldPath, FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { getStorage } from 'firebase-admin/storage'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import {
  cleanupExpiredDeliveries,
  cleanupExpiredFailedStatements,
  deliveryId,
  deliverOnce,
  dueReminders,
  isExpiredFailedStatementObject,
  istanbulDate,
  messageFor,
  TIME_ZONE,
} from './reminder-plan.js'

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
    const accounts = new Map()
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
      const uid = path[1]
      if (!accounts.has(uid)) {
        const [profileDoc, prefsDoc] = await db.getAll(
          db.doc(`users/${uid}/meta/profile`), db.doc(`users/${uid}/meta/prefs`),
          { fieldMask: ['cards', '_d', 'reminders'] },
        )
        accounts.set(uid, { profile: profileDoc.data(), accountPrefs: prefsDoc.data() })
      }
      const { profile, accountPrefs } = accounts.get(uid)
      const preferences = accountPrefs?.reminders
      if (accountPrefs?._d || (preferences && (preferences.enabled !== true || preferences.cloudPush !== true || preferences.hour !== hour))) continue
      for (const reminder of dueReminders(profile, device, scheduled)) {
        const id = deliveryId(deviceDoc.ref.path, reminder)
        const receipt = db.doc(`users/${path[1]}/notificationDeliveries/${id}`)
        const result = await deliverOnce({
          claim: async () => {
            // Re-read opt-out before claiming each notification, without logging tokens or account data.
            const latest = (await deviceDoc.ref.get()).data()
            if (latest?.enabled !== true || latest.token !== device.token || latest.hour !== hour) return false
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
        }, id, messageFor(device.token, reminder, id, uid))
        if (result === 'sent') sent++
        if (result === 'failed') failed++
      }
    }
    cursor = page.size === 100 ? page.docs.at(-1) : undefined
  } while (cursor)

  // Daily cleanup in the existing job. No extra Scheduler job or billed TTL deletes.
  const cutoff = Timestamp.fromDate(now)
  const removed = await cleanupExpiredDeliveries(hour, async size => {
    const expired = await db.collectionGroup('notificationDeliveries').where('expireAt', '<', cutoff).limit(size).get()
    if (!expired.size) return 0
    const batch = db.batch()
    expired.docs.forEach((item) => batch.delete(item.ref))
    await batch.commit()
    return expired.size
  })

  let removedDiagnostics = 0
  try {
    removedDiagnostics = await cleanupExpiredFailedStatements(hour, async (maxDeletes) => {
      const bucket = getStorage().bucket()
      let deleted = 0
      let pageToken
      for (let page = 0; page < 5 && deleted < maxDeletes; page++) {
        const [files, nextQuery] = await bucket.getFiles({
          prefix: 'users/',
          autoPaginate: false,
          maxResults: 200,
          ...(pageToken ? { pageToken } : {}),
        })
        for (const file of files) {
          if (deleted >= maxDeletes) break
          if (!isExpiredFailedStatementObject(file.name, file.metadata?.timeCreated, now.getTime())) continue
          await file.delete({ ignoreNotFound: true })
          deleted++
        }
        pageToken = nextQuery?.pageToken
        if (!pageToken) break
      }
      return deleted
    })
  } catch (error) {
    logger.warn('Failed-statement storage cleanup skipped', {
      code: typeof error?.code === 'string' ? error.code : 'unknown',
    })
  }

  if (failed) logger.warn('Monthly reminder delivery finished with failures', { sent, failed, removed, removedDiagnostics })
  else if (sent || removed || removedDiagnostics) logger.info('Monthly reminder delivery finished', { sent, removed, removedDiagnostics })
})
