import { UserFacingError } from '../core/errors'
import type { PluginListenerHandle } from '@capacitor/core'
import type { ReminderPreferences } from '../domain/reminders'
import { cloudAvailable } from '../firebase/available'
import { isAndroid } from './index'
import { getReminderStatus, recordReminderOpen, setRemoteReminderDelivery, syncReminders } from './reminders'

const OPT_IN_KEY = 'finance.cloud-push.v1'
const DEVICE_KEY = 'finance.push-installation.v1'
export const PUSH_UPDATED = 'finance:push-updated'
export const PUSH_TOKEN_UPDATED = 'finance:push-token-updated'
/** Set true only after this project's scheduled function and rules are deployed. */
export const cloudPushBackendReady = cloudAvailable && import.meta.env.VITE_FCM_SCHEDULER_ENABLED === 'true'
export interface PushStatus { supported: boolean; backendReady: boolean; optedIn: boolean; active: boolean; error?: string }
let active = false
let lastError: string | undefined
let token: string | null = null
let currentUid: string | null = null
let desiredUid: string | null = null
let listeners: Promise<void> | undefined
let queue: Promise<void> = Promise.resolve()
let tokenWaiter: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null

export function cloudPushOptedIn(): boolean {
  try { return localStorage.getItem(OPT_IN_KEY) === 'enabled' } catch { return false }
}

export function getPushStatus(): PushStatus {
  return { supported: isAndroid(), backendReady: cloudPushBackendReady, optedIn: cloudPushOptedIn(), active, error: lastError }
}

function changed(): void { window.dispatchEvent(new Event(PUSH_UPDATED)) }
function setActive(next: boolean): void { active = next; setRemoteReminderDelivery(next); changed() }
function deviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY)
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (part) => part.toString(16).padStart(2, '0')).join('')
  localStorage.setItem(DEVICE_KEY, id)
  return id
}

async function ensureListeners(): Promise<void> {
  if (listeners) return listeners
  listeners = (async () => {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const handles: PluginListenerHandle[] = []
    try {
      handles.push(await PushNotifications.addListener('registration', (next) => {
        const changedToken = token !== next.value
        token = next.value
        tokenWaiter?.resolve(next.value)
        if (changedToken) window.dispatchEvent(new Event(PUSH_TOKEN_UPDATED))
      }))
      handles.push(await PushNotifications.addListener('registrationError', () => {
        tokenWaiter?.reject(new UserFacingError('Bildirim bağlantısı kurulamadı. İnternetini kontrol edip yeniden dene.'))
      }))
      handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const data = notification.data
        recordReminderOpen({
          cardId: typeof data?.cardId === 'string' ? data.cardId : undefined,
          reminderKind: typeof data?.reminderKind === 'string' ? data.reminderKind : undefined,
        })
      }))
    } catch (error) {
      await Promise.all(handles.map((handle) => handle.remove()))
      listeners = undefined
      throw error
    }
  })()
  return listeners
}

async function registrationToken(): Promise<string> {
  if (token) return token
  await ensureListeners()
  const { PushNotifications } = await import('@capacitor/push-notifications')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<string>((resolve, reject) => {
      tokenWaiter = { resolve, reject }
      timer = setTimeout(() => reject(new UserFacingError('Bildirim bağlantısı zaman aşımına uğradı. Yeniden dene.')), 12_000)
      void PushNotifications.register().catch(reject)
    })
  } finally { clearTimeout(timer); tokenWaiter = null }
}

async function removeDevice(uid: string): Promise<void> {
  const { deleteDoc, doc } = await import('firebase/firestore')
  const { getFirebaseDb } = await import('../firebase/db')
  await deleteDoc(doc(getFirebaseDb(), 'users', uid, 'pushDevices', deviceId()))
}

/** Called on profile/preferences changes and foreground resume. Never opens permission prompts. */
export function syncCloudPush(uid: string | null, preferences: ReminderPreferences, syncReady: boolean): Promise<void> {
  desiredUid = uid
  queue = queue.catch(() => {}).then(async () => {
    if (!isAndroid() || !cloudPushBackendReady) { setActive(false); return }
    if (currentUid && currentUid !== uid) { await removeDevice(currentUid); currentUid = null; setActive(false) }
    if (!uid || !cloudPushOptedIn() || !preferences.enabled) {
      if (currentUid) { await removeDevice(currentUid); currentUid = null }
      setActive(false)
      return
    }
    if (!syncReady && !active) return
    const { PushNotifications } = await import('@capacitor/push-notifications')
    if ((await PushNotifications.checkPermissions()).receive !== 'granted') {
      if (currentUid) { await removeDevice(currentUid); currentUid = null }
      setActive(false)
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const nextToken = await registrationToken()
    if (desiredUid !== uid || !cloudPushOptedIn()) return
    await PushNotifications.createChannel({ id: 'finance-push-v1', name: 'Ekstre ve kayıt günleri', importance: 4, visibility: 0, vibration: true })
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore')
    const { getFirebaseDb } = await import('../firebase/db')
    // Cancel local scheduling before enrollment. A failed refresh keeps an
    // existing cloud plan in charge; only first-enrollment failure restores local mode.
    setRemoteReminderDelivery(true)
    await syncReminders([], { ...preferences, enabled: false })
    if ((await getReminderStatus()).error) throw new UserFacingError('Cihaz hatırlatmaları devredilemedi.')
    await setDoc(doc(getFirebaseDb(), 'users', uid, 'pushDevices', deviceId()), {
      token: nextToken, enabled: true, hour: preferences.hour, timeZone: 'Europe/Istanbul', updatedAt: serverTimestamp(),
    })
    if (desiredUid !== uid || !cloudPushOptedIn()) {
      await removeDevice(uid)
      setActive(false)
      return
    }
    currentUid = uid
    lastError = undefined
    setActive(true)
  }).catch(() => {
    if (currentUid) {
      lastError = 'Bulut planı güncellenemedi. Önceki bulut planın etkin; son ayarlarının uygulanması için yeniden dene.'
      changed()
    } else {
      lastError = 'Bulut bildirimleri bağlanamadı. Yeniden bağlanana kadar cihaz hatırlatmalarını kullanabilirsin.'
      setActive(false)
    }
  })
  return queue
}

export async function requestCloudPush(uid: string, preferences: ReminderPreferences, syncReady: boolean): Promise<void> {
  if (!isAndroid() || !cloudPushBackendReady) throw new UserFacingError('Bulut bildirimleri bu sürümde henüz etkin değil. Cihaz hatırlatmalarını kullanabilirsin.')
  if (!preferences.enabled) throw new UserFacingError('Önce ekstre hatırlatmalarını aç.')
  if (!syncReady) throw new UserFacingError('Önce hesap eşitlemesinin tamamlanmasını bekle.')
  const { PushNotifications } = await import('@capacitor/push-notifications')
  if ((await PushNotifications.requestPermissions()).receive !== 'granted') throw new UserFacingError('Bildirim izni verilmedi. Telefon ayarlarından açabilirsin.')
  localStorage.setItem(OPT_IN_KEY, 'enabled')
  await syncCloudPush(uid, preferences, syncReady)
  if (!active) throw new UserFacingError(lastError ?? 'Bulut bildirimi bağlantısı kurulamadı. Yeniden dene.')
}

/** Sign-out remains available offline. FCM token invalidation and document removal are best effort. */
export async function disconnectCloudPush(): Promise<void> {
  try { localStorage.removeItem(OPT_IN_KEY) } catch { /* A blocked store must not prevent signing out. */ }
  desiredUid = null
  const uid = currentUid
  currentUid = null
  token = null
  lastError = undefined
  setActive(false)
  if (!isAndroid()) return
  const cleanup = Promise.allSettled([
    uid ? removeDevice(uid) : Promise.resolve(),
    import('@capacitor/push-notifications').then(({ PushNotifications }) => PushNotifications.unregister()),
  ])
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([cleanup, new Promise<void>((resolve) => { timer = setTimeout(resolve, 8_000) })])
  clearTimeout(timer)
}
