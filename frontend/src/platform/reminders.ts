import { UserFacingError } from '../core/errors'
import { LocalNotifications, type LocalNotificationSchema, type PendingLocalNotificationSchema } from '@capacitor/local-notifications'
import { defaultReminders, isReminderId, planReminders, type ReminderPreferences } from '../domain/reminders'
import type { CreditCard } from '../domain/types'
import { isAndroid, isIOS } from './index'

const CHANNEL_ID = 'finance-reminders-v1'
const TEST_ID = 1_199_999_999
export const REMINDERS_UPDATED = 'finance:reminders-updated'
export const REMINDER_OPEN = 'finance:reminder-open'
export const REMINDER_DELIVERY_UPDATED = 'finance:reminder-delivery-updated'
let remoteDelivery = false

/** Exactly one transport owns scheduled reminders on this installation. */
export function setRemoteReminderDelivery(active: boolean): void {
  if (remoteDelivery === active) return
  remoteDelivery = active
  window.dispatchEvent(new Event(REMINDER_DELIVERY_UPDATED))
}

export function recordReminderOpen(detail: PendingReminderOpen): void {
  pendingOpen = detail
  window.dispatchEvent(new CustomEvent(REMINDER_OPEN, { detail }))
}

export interface ReminderStatus {
  supported: boolean
  permission: 'granted' | 'denied' | 'prompt'
  pending: number
  nextAt: Date | null
  error?: string
}

let lastError: string | undefined
let queue: Promise<void> = Promise.resolve()
export interface PendingReminderOpen { cardId?: string; reminderKind?: string; uid?: string }
let pendingOpen: PendingReminderOpen | null = null

/** A notification can launch the app while the PIN screen still owns the UI. */
export function consumePendingReminder(uid?: string): PendingReminderOpen | null {
  const pending = pendingOpen
  pendingOpen = null
  return pending?.uid === uid ? pending : null
}

export async function clearReminderSession(): Promise<void> {
  pendingOpen = null
  if (!supportsReminders()) return
  await syncReminders([], defaultReminders)
  if (lastError) throw new UserFacingError(lastError)
  const delivered = await LocalNotifications.getDeliveredNotifications()
  const owned = delivered.notifications.filter(item => isReminderId(item.id) || item.id === TEST_ID)
  if (owned.length) await LocalNotifications.removeDeliveredNotifications({ notifications: owned })
}

function changed(): void {
  window.dispatchEvent(new Event(REMINDERS_UPDATED))
}

async function createChannel(): Promise<void> {
  if (!isAndroid()) return
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Ekstre ve aylık kayıt hatırlatmaları',
    description: 'Kartlarının ekstre ve veri giriş günleri',
    importance: 4,
    visibility: 0,
    vibration: true,
  })
}

export function supportsReminders(): boolean {
  return isAndroid() || isIOS()
}

function scheduledTime(item: PendingLocalNotificationSchema): number {
  // Android's returned java.util.Date can include an unparseable timezone name.
  const at = item.extra?.reminderAt ?? item.schedule?.at
  return at ? new Date(at).getTime() : NaN
}

/** No prompt on startup: only the explicit enable button requests permission. */
export async function requestReminderPermission(): Promise<boolean> {
  if (!supportsReminders()) return false
  const result = await LocalNotifications.requestPermissions()
  return result.display === 'granted'
}

export async function getReminderStatus(): Promise<ReminderStatus> {
  if (!supportsReminders()) return { supported: false, permission: 'prompt', pending: 0, nextAt: null }
  const [permission, pending] = await Promise.all([
    LocalNotifications.checkPermissions(), LocalNotifications.getPending(),
  ])
  const reminders = pending.notifications.filter((item) => isReminderId(item.id))
  const dates = reminders.map(scheduledTime).filter((at) => Number.isFinite(at) && at > Date.now())
  return {
    supported: true,
    permission: permission.display === 'granted' ? 'granted' : permission.display === 'denied' ? 'denied' : 'prompt',
    pending: dates.length,
    nextAt: dates.length ? new Date(Math.min(...dates)) : null,
    error: lastError,
  }
}

/** Serializing prevents an old asynchronous cancellation from erasing a newer plan. */
export function syncReminders(cards: CreditCard[], preferences = defaultReminders, uid?: string): Promise<void> {
  if (!supportsReminders()) return Promise.resolve()
  queue = queue.catch(() => {}).then(async () => {
    lastError = undefined
    const pending = await LocalNotifications.getPending()
    const owned = pending.notifications.filter((item) => isReminderId(item.id))
    const permission = await LocalNotifications.checkPermissions()
    if (!preferences.enabled || remoteDelivery || permission.display !== 'granted') {
      if (owned.length) await LocalNotifications.cancel({ notifications: owned.map(({ id }) => ({ id })) })
      return
    }
    const now = new Date()
    const future = planReminders(cards, preferences, now).slice(0, isIOS() ? 60 : 400)
    // Inexact alarms may still be waiting after their requested time. Do not
    // cancel a valid recent alarm merely because the app resumed late.
    // Nor should we re-post it: the OS may already have delivered it.
    const recentMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
    const recent = planReminders(cards, preferences, new Date(recentMonthStart - 1))
    const expected = new Map([...(isAndroid() ? recent : []), ...future].map((item) => [item.id, item]))
    const retained = new Set<number>()
    const cancelled: { id: number }[] = []
    for (const item of owned) {
      const target = expected.get(item.id)
      if (target && item.extra?.uid === uid && scheduledTime(item) === target.at.getTime() && item.title === target.title && item.body === target.body) {
        retained.add(item.id)
      } else cancelled.push({ id: item.id })
    }
    if (cancelled.length) await LocalNotifications.cancel({ notifications: cancelled })
    await createChannel()
    const notifications: LocalNotificationSchema[] = future.filter((item) => !retained.has(item.id)).map((item) => ({
      id: item.id, title: item.title, body: item.body,
      schedule: { at: item.at, allowWhileIdle: true },
      // A day-end reminder needs no exact-alarm privilege or extra permission.
      isExactNotification: false,
      channelId: CHANNEL_ID,
      smallIcon: 'ic_stat_finance',
      iconColor: '#7161d8',
      autoCancel: true,
      group: 'finance-reminders',
      extra: { cardId: item.cardId, reminderKind: item.kind, reminderAt: item.at.toISOString(), ...(uid ? { uid } : {}) },
    }))
    if (notifications.length) await LocalNotifications.schedule({ notifications })
  }).catch(() => {
    lastError = 'Hatırlatmalar planlanamadı. Bildirim iznini kontrol edip yeniden dene.'
  }).finally(changed)
  return queue
}

export async function sendTestReminder(): Promise<void> {
  if (!supportsReminders()) throw new UserFacingError('Bildirim testi Android ve iOS uygulamalarında kullanılabilir.')
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') {
    throw new UserFacingError('Önce bildirimlere izin ver.')
  }
  await createChannel()
  await LocalNotifications.schedule({ notifications: [{
    id: TEST_ID,
    title: 'Hatırlatmalar hazır',
    body: 'Ekstre ve aylık kayıt günlerinde buradan haber vereceğiz.',
    channelId: CHANNEL_ID,
    smallIcon: 'ic_stat_finance',
    iconColor: '#7161d8',
    isExactNotification: false,
    autoCancel: true,
    extra: { reminderKind: 'test' },
  }] })
}

export async function onReminderOpen(): Promise<() => void> {
  if (!supportsReminders()) return () => {}
  const listener = await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    if (!isReminderId(notification.id)) return
    recordReminderOpen({
      cardId: typeof notification.extra?.cardId === 'string' ? notification.extra.cardId : undefined,
      reminderKind: typeof notification.extra?.reminderKind === 'string' ? notification.extra.reminderKind : undefined,
      ...(typeof notification.extra?.uid === 'string' ? { uid: notification.extra.uid } : {}),
    })
  })
  return () => { void listener.remove() }
}

export type { ReminderPreferences }
