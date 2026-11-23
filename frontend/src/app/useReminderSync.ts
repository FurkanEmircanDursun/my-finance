import { useEffect } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { defaultReminders } from '../domain/reminders'
import { clearReminderSession, onReminderOpen, REMINDER_DELIVERY_UPDATED, supportsReminders, syncReminders } from '../platform/reminders'
import { useStore } from '../store/AppStore'

/** The OS owns delivery; React only maintains the upcoming twelve-month plan. */
export function useReminderSync(): void {
  const { state, authReady, authUser, sessionBusy } = useStore()
  const { hydrated, profile, settings } = state
  const uid = authUser?.uid
  useEffect(() => {
    if (!supportsReminders() || !authReady || sessionBusy) return
    if (!uid) {
      void clearReminderSession().catch(() => {})
      return
    }
    if (!hydrated) return
    const refresh = () => { void syncReminders(profile.cards ?? [], settings.reminders ?? defaultReminders, uid) }
    refresh()
    window.addEventListener(REMINDER_DELIVERY_UPDATED, refresh)
    let disposed = false
    let removeResume: (() => void) | undefined
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) refresh()
    }).then((listener) => {
      if (disposed) void listener.remove()
      else removeResume = () => { void listener.remove() }
    })
    return () => { disposed = true; removeResume?.(); window.removeEventListener(REMINDER_DELIVERY_UPDATED, refresh) }
  }, [authReady, hydrated, profile.cards, settings.reminders, sessionBusy, uid])

  useEffect(() => {
    let disposed = false
    let remove: (() => void) | undefined
    void onReminderOpen().then((cleanup) => {
      if (disposed) cleanup()
      else remove = cleanup
    })
    return () => { disposed = true; remove?.() }
  }, [])
}
