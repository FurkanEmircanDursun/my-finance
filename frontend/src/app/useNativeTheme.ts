import { useEffect } from 'react'
import type { Settings } from '../domain/types'
import { resolveTheme, syncStatusBar } from '../platform/native'

/** The native counterpart to `useTheme`: keeps the Android status bar matching the app's own theme, including live OS-theme changes while running in "system" mode. */
export function useNativeTheme(theme: Settings['theme']) {
  useEffect(() => {
    void syncStatusBar(resolveTheme(theme))
    if (theme !== 'system') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => void syncStatusBar(resolveTheme(theme))
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])
}
