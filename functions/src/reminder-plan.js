import { createHash } from 'node:crypto'

export const TIME_ZONE = 'Europe/Istanbul'
export const CHANNEL = 'finance-push-v1'
const clock = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
})

export function istanbulDate(at) {
  const parts = Object.fromEntries(clock.formatToParts(at).map((part) => [part.type, part.value]))
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) }
}

const validDay = (day) => Number.isInteger(day) && day >= 1 && day <= 31

/** Server input is untrusted even though Firestore limits who can write it. */
export function dueReminders(profile, device, at) {
  if (!device || device.enabled !== true || device.timeZone !== TIME_ZONE ||
      !Number.isInteger(device.hour) || device.hour < 0 || device.hour > 23) return []
  const date = istanbulDate(at)
  if (device.hour !== date.hour || !Array.isArray(profile?.cards) || profile._d === true) return []
  const lastDay = new Date(Date.UTC(date.year, date.month, 0)).getUTCDate()
  const dayKey = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
  const reminders = []
  const seen = new Set()
  for (const card of profile.cards.slice(0, 100)) {
    if (!card || typeof card.id !== 'string' || !card.id || card.id.length > 200 || seen.has(card.id) ||
        card.remindersEnabled === false) continue
    seen.add(card.id)
    const statement = validDay(card.statementDay) && Math.min(card.statementDay, lastDay) === date.day
    const entry = validDay(card.entryDay) && Math.min(card.entryDay, lastDay) === date.day
    if (!statement && !entry) continue
    const kind = statement && entry ? 'combined' : statement ? 'statement' : 'entry'
    reminders.push({
      key: `${dayKey}:${card.id}:${kind}`,
      cardId: card.id,
      kind,
      title: statement ? 'Ekstre günü' : 'Aylık kayıt zamanı',
      // Notification previews must not disclose bank, card name, balance or purchases.
      body: statement && entry ? 'Ekstre ve kayıt günün geldi. Aylık kayıtlarını tamamlayabilirsin.'
        : statement ? 'Ekstre kesim günün geldi. Ekstren hazır olduğunda uygulamaya ekleyebilirsin.'
          : 'Aylık kayıt günün geldi. Gelir ve giderlerini tamamlayabilirsin.',
    })
  }
  return reminders
}

export function deliveryId(devicePath, reminder) {
  return createHash('sha256').update(`${devicePath}:${reminder.key}`).digest('hex')
}

/** Keep the previous maximum of 4,800 removals per day in one scheduled run. */
export async function cleanupExpiredDeliveries(hour, removeBatch) {
  if (hour !== 0) return 0
  let removed = 0
  for (let batch = 0; batch < 24; batch++) {
    const count = await removeBatch(200)
    removed += count
    if (count < 200) break
  }
  return removed
}

export const FAILED_STATEMENT_RETENTION_DAYS = 30
const FAILED_STATEMENT_OBJECT_RE = /^users\/[^/]+\/failed-statements\/[0-9a-f]{64}\/(?:source\.(?:pdf|csv|txt)|report\.json)$/

export function isExpiredFailedStatementObject(name, timeCreated, nowMs) {
  if (typeof name !== 'string' || !FAILED_STATEMENT_OBJECT_RE.test(name)) return false
  const createdMs = typeof timeCreated === 'string' ? Date.parse(timeCreated) : Number(timeCreated)
  if (!Number.isFinite(createdMs)) return false
  return nowMs - createdMs >= FAILED_STATEMENT_RETENTION_DAYS * 86_400_000
}

/** Daily retention sweep for write-only failed-statement diagnostic objects (30-day max lifetime). */
export async function cleanupExpiredFailedStatements(hour, removeExpiredBatch) {
  if (hour !== 0) return 0
  return removeExpiredBatch(500)
}

export function messageFor(token, reminder, id, uid) {
  return {
    token,
    notification: { title: reminder.title, body: reminder.body },
    data: { cardId: reminder.cardId, reminderKind: reminder.kind, deliveryId: id, ...(uid ? { uid } : {}) },
    android: {
      priority: 'high',
      ttl: 6 * 60 * 60 * 1000,
      restrictedPackageName: 'com.faraday.followfinance',
      notification: { channelId: CHANNEL, icon: 'ic_stat_finance', color: '#185C47', tag: id, visibility: 'private' },
    },
  }
}

/** Claim before sending. An ambiguous network acknowledgement is not retried. */
export async function deliverOnce({ claim, send, finish, invalidate }, id, message) {
  if (!await claim(id)) return 'duplicate'
  try {
    await send(message)
    await finish(id, 'sent')
    return 'sent'
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'unknown'
    if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(code)) {
      await invalidate()
    }
    await finish(id, 'failed')
    // Retaining the receipt prevents a later invocation from double posting after a lost acknowledgement.
    return 'failed'
  }
}
