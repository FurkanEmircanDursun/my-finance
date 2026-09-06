import { useEffect } from 'react'
import type { Settings } from '../domain/types'

/**
 * Writes the chosen theme onto <html data-theme>. "system" removes the
 * attribute so the CSS `prefers-color-scheme` block takes over, which keeps a
 * single source of truth for colours in the stylesheet.
 */
export function useTheme(theme: Settings['theme']) {
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])
}
