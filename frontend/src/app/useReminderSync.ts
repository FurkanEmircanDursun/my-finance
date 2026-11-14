import { useEffect } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { defaultReminders } from '../domain/reminders'
import { isAndroid } from '../platform'
import { onReminderOpen, REMINDER_DELIVERY_UPDATED, syncReminders } from '../platform/reminders'
import { useStore } from '../store/AppStore'

/** The OS owns delivery; React only maintains the upcoming twelve-month plan. */
export function useReminderSync(): void {
  const { state } = useStore()
  const { hydrated, profile, settings } = state
  useEffect(() => {
    if (!hydrated || !isAndroid()) return
    const refresh = () => { void syncReminders(profile.cards ?? [], settings.reminders ?? defaultReminders) }
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
  }, [hydrated, profile.cards, settings.reminders])

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
