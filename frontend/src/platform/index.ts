import { Capacitor } from '@capacitor/core'

/**
 * Where web-vs-native branching lives.
 *
 * The app is one React codebase for both targets: on the web it runs as a
 * normal site, and the exact same build runs inside a Capacitor WebView for
 * the Android app (`capacitor.config.ts`, `android/`). Nearly everything —
 * parsing, analytics, the store, every view — never needs to know which one
 * it is in. The handful of things that genuinely differ (the hardware back
 * button, the status bar, native Google Sign-In) are collected here instead
 * of scattered as `Capacitor.isNativePlatform()` checks through the views, so
 * there is exactly one place that knows about the native shell.
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android'
}

export function isIOS(): boolean {
  return Capacitor.getPlatform() === 'ios'
}
