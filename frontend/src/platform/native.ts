import { isNative } from './index'

export type ResolvedTheme = 'light' | 'dark'

/** "system" is a setting, not a colour — this is what the status bar actually needs. */
export function resolveTheme(themeSetting: 'light' | 'dark' | 'system'): ResolvedTheme {
  if (themeSetting !== 'system') return themeSetting
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Matches the status bar to the app's own theme; a no-op on web. */
export async function syncStatusBar(theme: ResolvedTheme): Promise<void> {
  if (!isNative()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: theme === 'dark' ? '#0b0e13' : '#ffffff' })
  } catch {
    // Edge-to-edge devices (Android 15+) draw behind the status bar and reject
    // setBackgroundColor outright; the icon-colour call above still lands.
  }
}

/**
 * Maps the hardware back button to the same history the hash router already
 * keeps — one step back per press, exiting only from the root. A no-op pair
 * on web, where there is no hardware back button.
 */
export async function initNativeShell(): Promise<() => void> {
  if (!isNative()) return () => {}

  const { App: CapacitorApp } = await import('@capacitor/app')
  const listener = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void CapacitorApp.exitApp()
  })

  return () => {
    void listener.remove()
  }
}

/**
 * Reveals the app behind the splash screen. Called once local data has
 * actually hydrated rather than on mount, so the splash never hands off to a
 * bare loading skeleton for the (usually sub-100ms, occasionally not) time
 * IndexedDB takes to answer.
 */
export async function hideSplashScreen(): Promise<void> {
  if (!isNative()) return
  const { SplashScreen } = await import('@capacitor/splash-screen')
  await SplashScreen.hide()
}

/**
 * Fires when Android sends the app to the background — the app-switcher, the
 * lock screen, another app opening on top. The one caller (see `App.tsx`)
 * uses it to re-arm the PIN lock, the same way a phone's own lock screen
 * would: stepping away should not leave a finance app sitting open. A no-op
 * on web, where there is no equivalent notion of "backgrounded".
 */
export async function onAppBackground(callback: () => void): Promise<() => void> {
  if (!isNative()) return () => {}

  const { App: CapacitorApp } = await import('@capacitor/app')
  const listener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) callback()
  })

  return () => {
    void listener.remove()
  }
}
