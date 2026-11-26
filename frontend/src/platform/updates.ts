import { cloudAvailable } from '../firebase/available'
import { isNative, isAndroid } from './index'
import { measureOperation } from './diagnostics'
import { cacheUpdatePolicy, compareVersions, parseUpdatePolicy, readCachedUpdatePolicy, resolveUpdateUrl, updateDecision, type UpdateDecision, type UpdatePolicy, type UpdatePlatform } from './updatesPolicy'

export interface UpdateState {
  currentVersion: string | null
  platform: UpdatePlatform
  updateUrl: string | null
  policy: UpdatePolicy | null
  decision: UpdateDecision
  status: 'checking' | 'ready' | 'offline' | 'unavailable' | 'invalid'
}

export const initialUpdateState: UpdateState = { currentVersion: null, platform: 'web', updateUrl: null, policy: null, decision: 'none', status: 'checking' }

async function installedVersion(): Promise<string | null> {
  if (isNative()) {
    try {
      const { App } = await import('@capacitor/app')
      const info = await App.getInfo()
      return compareVersions(info.version, info.version) === null ? null : info.version
    } catch { return null }
  }
  return compareVersions(__APP_VERSION__, __APP_VERSION__) === null ? null : __APP_VERSION__
}

/** Fetches only deployment policy, never financial fields, account identifiers or documents. */
export function watchUpdates(onChange: (state: UpdateState) => void): { refresh: () => Promise<void>; dispose: () => void } {
  let disposed = false
  let current = initialUpdateState
  let remote: import('firebase/remote-config').RemoteConfig | undefined
  let sdk: typeof import('firebase/remote-config') | undefined
  let unsubscribe: (() => void) | undefined
  let inFlight: Promise<void> | undefined

  const publish = (patch: Partial<UpdateState>) => {
    current = { ...current, ...patch }
    current.updateUrl = current.policy ? resolveUpdateUrl(current.policy, current.platform) : null
    current.decision = updateDecision(current.currentVersion, current.policy, current.platform)
    if (!disposed) onChange(current)
  }
  const acceptPolicy = () => {
    if (!remote || !sdk) return
    const policy = parseUpdatePolicy({
      min_required_version: sdk.getString(remote, 'min_required_version'),
      latest_version: sdk.getString(remote, 'latest_version'),
      min_required_version_android: sdk.getString(remote, 'min_required_version_android'),
      latest_version_android: sdk.getString(remote, 'latest_version_android'),
      min_required_version_ios: sdk.getString(remote, 'min_required_version_ios'),
      latest_version_ios: sdk.getString(remote, 'latest_version_ios'),
      update_url: sdk.getString(remote, 'update_url'),
      update_url_android: sdk.getString(remote, 'update_url_android'),
      update_url_ios: sdk.getString(remote, 'update_url_ios'),
      update_message: sdk.getString(remote, 'update_message'),
    })
    if (!policy) { publish({ status: 'invalid' }); return }
    if (typeof localStorage !== 'undefined') cacheUpdatePolicy(localStorage, policy)
    publish({ policy, status: 'ready' })
  }
  const refreshRemote = async () => {
    if (!remote || !sdk || disposed) return
    try {
      const remoteConfig = remote, remoteSdk = sdk
      await measureOperation('update_check', () => remoteSdk.fetchAndActivate(remoteConfig))
      if (!disposed) acceptPolicy()
    } catch { publish({ status: 'offline' }) }
  }
  const initialize = async () => {
    const currentVersion = await installedVersion()
    const cached = typeof localStorage !== 'undefined' ? readCachedUpdatePolicy(localStorage) : null
    publish({
      currentVersion,
      platform: isNative() ? isAndroid() ? 'android' : 'ios' : 'web',
      ...(cached ? { policy: cached } : {}),
    })
    if (disposed) return
    if (!cloudAvailable || (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR)) {
      publish({ status: 'unavailable' })
      return
    }
    try {
      sdk = await import('firebase/remote-config')
      if (disposed) return
      if (!await sdk.isSupported()) { publish({ status: 'unavailable' }); return }
      const { getFirebaseApp } = await import('../firebase/config')
      if (disposed) return
      remote = sdk.getRemoteConfig(getFirebaseApp())
      remote.settings = { minimumFetchIntervalMillis: 60 * 60 * 1000, fetchTimeoutMillis: 8000 }
      remote.defaultConfig = {
        min_required_version: '0.0.0',
        latest_version: '0.0.0',
        min_required_version_android: '',
        latest_version_android: '',
        min_required_version_ios: '',
        latest_version_ios: '',
        update_url: '',
        update_url_android: '',
        update_url_ios: '',
        update_message: '',
      }
      await sdk.ensureInitialized(remote)
      if (disposed) return
      // A previously activated remote policy is useful even before today's fetch.
      if (sdk.getValue(remote, 'min_required_version').getSource() === 'remote') acceptPolicy()
      await refreshRemote()
      if (disposed) return
      unsubscribe = sdk.onConfigUpdate(remote, {
        next: () => {
          if (!sdk || !remote || disposed) return
          void sdk.activate(remote).then(() => { if (!disposed) acceptPolicy() }).catch(() => publish({ status: 'offline' }))
        },
        error: () => publish({ status: 'offline' }),
        complete: () => { publish({ status: 'offline' }) },
      })
    } catch { publish({ status: 'offline' }) }
  }
  const ready = initialize()
  const refresh = () => {
    if (inFlight) return inFlight
    inFlight = ready.then(refreshRemote).finally(() => { inFlight = undefined })
    return inFlight
  }
  const onOnline = () => { void refresh() }
  const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  return {
    refresh,
    dispose: () => {
      disposed = true
      unsubscribe?.()
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    },
  }
}
