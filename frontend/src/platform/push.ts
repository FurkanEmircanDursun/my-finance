import { UserFacingError } from '../core/errors'
import type { PluginListenerHandle } from '@capacitor/core'
import type { ReminderPreferences } from '../domain/reminders'
import { cloudAvailable } from '../firebase/available'
import { isAndroid } from './index'
import { getReminderStatus, recordReminderOpen, setRemoteReminderDelivery, syncReminders } from './reminders'

export const PUSH_UPDATED = 'finance:push-updated'
export const PUSH_TOKEN_UPDATED = 'finance:push-token-updated'
/** Set true only after this project's scheduled function and rules are deployed. */
export const cloudPushBackendReady = cloudAvailable && import.meta.env.VITE_FCM_SCHEDULER_ENABLED === 'true'
export interface PushStatus { supported: boolean; backendReady: boolean; optedIn: boolean; active: boolean; error?: string }
let active = false
let lastError: string | undefined
let token: string | null = null
interface Registration { uid: string; device: string; hour: number }
let registration: Registration | null = null
let enrolling: Registration | null = null
let desiredUid: string | null = null
let desiredCloudPush = false
let session = 0
let listeners: Promise<PluginListenerHandle[]> | undefined
let queue: Promise<void> = Promise.resolve()
let tokenWaiter: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null

export function getPushStatus(): PushStatus {
  return { supported: isAndroid(), backendReady: cloudPushBackendReady, optedIn: desiredCloudPush, active, error: lastError }
}

function changed(): void { window.dispatchEvent(new Event(PUSH_UPDATED)) }
function setActive(next: boolean): void { active = next; setRemoteReminderDelivery(next); changed() }
async function deviceId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest, 0, 16), part => part.toString(16).padStart(2, '0')).join('')
}

async function ensureListeners(): Promise<PluginListenerHandle[]> {
  if (listeners) return listeners
  const generation = session
  listeners = (async () => {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const handles: PluginListenerHandle[] = []
    try {
      handles.push(await PushNotifications.addListener('registration', (next) => {
        if (session !== generation) return
        const changedToken = token !== next.value
        token = next.value
        tokenWaiter?.resolve(next.value)
        if (changedToken && !tokenWaiter) window.dispatchEvent(new Event(PUSH_TOKEN_UPDATED))
      }))
      handles.push(await PushNotifications.addListener('registrationError', () => {
        if (session !== generation) return
        tokenWaiter?.reject(new UserFacingError('Bildirim bağlantısı kurulamadı. İnternetini kontrol edip yeniden dene.'))
      }))
      handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        if (session !== generation) return
        const data = notification.data
        if (typeof data?.uid !== 'string') return
        recordReminderOpen({
          uid: data.uid,
          cardId: typeof data?.cardId === 'string' ? data.cardId : undefined,
          reminderKind: typeof data?.reminderKind === 'string' ? data.reminderKind : undefined,
        })
      }))
      return handles
    } catch (error) {
      await Promise.all(handles.map((handle) => handle.remove()))
      if (session === generation) listeners = undefined
      throw error
    }
  })()
  return listeners
}

async function registrationToken(): Promise<string> {
  if (token) return token
  const generation = session
  await ensureListeners()
  const { PushNotifications } = await import('@capacitor/push-notifications')
  if (generation !== session) throw new UserFacingError('Bildirim oturumu kapandı.')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<string>((resolve, reject) => {
      tokenWaiter = { resolve, reject }
      timer = setTimeout(() => reject(new UserFacingError('Bildirim bağlantısı zaman aşımına uğradı. Yeniden dene.')), 12_000)
      void PushNotifications.register().catch(reject)
    })
  } finally { clearTimeout(timer); if (generation === session) tokenWaiter = null }
}

async function removeDevice(uid: string, device: string): Promise<void> {
  const { deleteDoc, doc } = await import('firebase/firestore')
  const { getFirebaseDb } = await import('../firebase/db')
  await deleteDoc(doc(getFirebaseDb(), 'users', uid, 'pushDevices', device))
}

/** Called on profile/preferences changes and foreground resume. Never opens permission prompts. */
export function syncCloudPush(uid: string | null, preferences: ReminderPreferences, syncReady: boolean): Promise<void> {
  desiredUid = uid
  desiredCloudPush = Boolean(uid && preferences.enabled && preferences.cloudPush)
  const generation = session
  const current = () => generation === session && desiredUid === uid
  queue = queue.catch(() => {}).then(async () => {
    if (!current()) return
    if (!isAndroid() || !cloudPushBackendReady) { setActive(false); return }
    if (registration && registration.uid !== uid) { registration = null; setActive(false) }
    if (!uid || !desiredCloudPush || !preferences.enabled || !preferences.cloudPush) {
      if (registration) { await removeDevice(registration.uid, registration.device); registration = null }
      lastError = undefined
      setActive(false)
      return
    }
    if (!syncReady && !active) return
    const { PushNotifications } = await import('@capacitor/push-notifications')
    if ((await PushNotifications.checkPermissions()).receive !== 'granted') {
      if (registration) { await removeDevice(registration.uid, registration.device); registration = null }
      setActive(false)
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const nextToken = await registrationToken()
    const device = await deviceId(nextToken)
    if (!current() || !desiredCloudPush) return
    if (registration?.device === device && registration.hour === preferences.hour) return
    await PushNotifications.createChannel({ id: 'finance-push-v1', name: 'Ekstre ve kayıt günleri', importance: 4, visibility: 0, vibration: true })
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore')
    const { getFirebaseDb } = await import('../firebase/db')
    // Cancel local scheduling before enrollment. A failed refresh keeps an
    // existing cloud plan in charge; only first-enrollment failure restores local mode.
    setRemoteReminderDelivery(true)
    await syncReminders([], { ...preferences, enabled: false }, uid)
    if ((await getReminderStatus()).error) throw new UserFacingError('Cihaz hatırlatmaları devredilemedi.')
    if (!current() || !desiredCloudPush) return
    const previous = registration
    const next = { uid, device, hour: preferences.hour }
    enrolling = next
    try {
      await setDoc(doc(getFirebaseDb(), 'users', uid, 'pushDevices', device), {
        token: nextToken, enabled: true, hour: preferences.hour, timeZone: 'Europe/Istanbul', updatedAt: serverTimestamp(),
      })
    } finally {
      if (enrolling === next) enrolling = null
    }
    if (!current()) return
    if (!desiredCloudPush) {
      await removeDevice(uid, device)
      setActive(false)
      return
    }
    registration = next
    if (previous && previous.device !== device) await removeDevice(uid, previous.device).catch(() => {})
    if (!current()) return
    lastError = undefined
    setActive(true)
  }).catch(() => {
    if (!current()) return
    if (registration) {
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
  await syncCloudPush(uid, { ...preferences, cloudPush: true }, syncReady)
  if (!active) throw new UserFacingError(lastError ?? 'Bulut bildirimi bağlantısı kurulamadı. Yeniden dene.')
}

/** Sign-out remains available offline. FCM token invalidation and document removal are best effort. */
export async function disconnectCloudPush(): Promise<void> {
  session++
  desiredCloudPush = false
  desiredUid = null
  const previous = registration
  const queued = enrolling
  const oldListeners = listeners
  registration = null
  enrolling = null
  listeners = undefined
  queue = Promise.resolve()
  tokenWaiter?.reject(new UserFacingError('Bildirim oturumu kapandı.'))
  tokenWaiter = null
  token = null
  lastError = undefined
  setActive(false)
  if (!isAndroid()) return
  const cleanup = Promise.allSettled([
    previous ? removeDevice(previous.uid, previous.device) : Promise.resolve(),
    queued && queued.device !== previous?.device ? removeDevice(queued.uid, queued.device) : Promise.resolve(),
    oldListeners?.then(handles => Promise.allSettled(handles.map(handle => handle.remove()))),
    import('@capacitor/push-notifications').then(({ PushNotifications }) => PushNotifications.unregister()),
  ])
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([cleanup, new Promise<void>((resolve) => { timer = setTimeout(resolve, 8_000) })])
  clearTimeout(timer)
}
