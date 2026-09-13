import { isNative } from './index'

export type ResolvedTheme = 'light' | 'dark'

/** "system" is a setting, not a colour — this is what the status bar actually needs. */
export function resolveTheme(themeSetting: 'light' | 'dark' | 'system'): ResolvedTheme {
  if (themeSetting !== 'system') return themeSetting
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Matches the status bar to the app's own theme; a no-op on web.
 *
 * The bar overlays the WebView rather than reserving a strip of its own, so the
 * app's own background runs the full height of the screen the way every current
 * banking app's does. That is only safe because the layout now pads itself with
 * `env(safe-area-inset-top)` — see `--safe-top` in `styles/index.css`. Turning
 * one on without the other puts the header under the clock.
 */
export async function syncStatusBar(theme: ResolvedTheme): Promise<void> {
  if (!isNative()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light })
  } catch {
    // Some OEM shells refuse the overlay call; the icon-colour call above is
    // the part that matters and lands independently.
  }
}

/**
 * A screen that sits outside the router — the intro, so far — can claim the
 * hardware back button while it is up. Returning true means "handled"; false
 * lets the press fall through to normal history navigation.
 *
 * Kept as a single slot rather than a stack: only one such screen is ever
 * mounted at a time, and a stack would invite the bug where a screen that
 * forgot to unregister keeps swallowing every press after it is gone.
 */
let backInterceptor: (() => boolean) | null = null

export function setBackInterceptor(handler: (() => boolean) | null): void {
  backInterceptor = handler
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
    if (backInterceptor?.()) return
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
