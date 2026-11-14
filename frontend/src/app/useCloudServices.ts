import { useEffect } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { defaultReminders } from '../domain/reminders'
import { isAndroid } from '../platform'
import { initializeProductAnalytics } from '../platform/analytics'
import { PUSH_TOKEN_UPDATED, syncCloudPush } from '../platform/push'
import { useStore } from '../store/AppStore'

export function useCloudServices(): void {
  const { state, authUser, authReady, sync } = useStore()
  useEffect(() => { void initializeProductAnalytics() }, [])
  const uid = authUser && !authUser.isAnonymous ? authUser.uid : null
  const syncReady = sync.lastSyncedAt !== null && sync.pending === 0 && sync.status !== 'decision' && sync.status !== 'error'
  useEffect(() => {
    if (!state.hydrated || !authReady || !isAndroid()) return
    const refresh = () => { void syncCloudPush(uid, state.settings.reminders ?? defaultReminders, syncReady) }
    refresh()
    window.addEventListener('online', refresh)
    window.addEventListener(PUSH_TOKEN_UPDATED, refresh)
    let disposed = false
    let remove: (() => void) | undefined
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) refresh() }).then((handle) => {
      if (disposed) void handle.remove()
      else remove = () => { void handle.remove() }
    })
    return () => {
      disposed = true; remove?.()
      window.removeEventListener('online', refresh)
      window.removeEventListener(PUSH_TOKEN_UPDATED, refresh)
    }
  }, [state.hydrated, authReady, uid, state.profile.cards, state.settings.reminders, syncReady])
}
