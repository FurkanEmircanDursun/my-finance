import { useEffect, useState } from 'react'
import { BrandMark } from '../ui/Brand'

let splashShownThisSession = false

/**
 * Cinematic cold-launch splash screen (MOTION.md §2A).
 * Renders once per cold session while the app hydrates silently beneath it,
 * and exits smoothly without ever blocking auth or data loading.
 */
export function SplashScreen({ ready }: { ready: boolean }) {
  const [phase, setPhase] = useState<'visible' | 'exiting' | 'gone'>(() => {
    if (splashShownThisSession) return 'gone'
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      splashShownThisSession = true
      return 'gone'
    }
    return 'visible'
  })

  useEffect(() => {
    if (phase !== 'visible') return
    // Ensure at least 760ms for the geometric mark draw & fulcrum ignition,
    // and never hold the screen longer than 1350ms even if auth is slow.
    const minTimer = window.setTimeout(() => {
      if (ready) setPhase('exiting')
    }, 760)
    const maxTimer = window.setTimeout(() => {
      setPhase('exiting')
    }, 1350)
    return () => {
      window.clearTimeout(minTimer)
      window.clearTimeout(maxTimer)
    }
  }, [phase, ready])

  useEffect(() => {
    if (phase !== 'exiting') return
    splashShownThisSession = true
    const done = window.setTimeout(() => setPhase('gone'), 300)
    return () => window.clearTimeout(done)
  }, [phase])

  if (phase === 'gone') return null

  return (
    <div
      className={`mizan-splash ${phase === 'exiting' ? 'mizan-splash--exiting' : ''}`}
      aria-hidden="true"
    >
      <div className="mizan-splash__inner">
        <div className="mizan-splash__ring">
          <BrandMark size={78} animated />
        </div>
        <p className="mizan-splash__title">Mizan</p>
        <p className="mizan-splash__tag">Ayın dengesi, senin elinde.</p>
      </div>
    </div>
  )
}
