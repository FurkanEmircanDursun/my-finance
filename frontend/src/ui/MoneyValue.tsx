import { useEffect, useRef, useState } from 'react'
import { money2 } from '../core/money'

/** Interpolates integer kuruş only for display; the stored value never changes. */
export function MoneyValue({ value, className = '' }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value)
  const displayed = useRef(value)
  useEffect(() => {
    const from = displayed.current
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from === value) {
      displayed.current = value
      setDisplay(value)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (time: number) => {
      const t = Math.min(1, (time - start) / 480)
      displayed.current = Math.round(from + (value - from) * (1 - Math.pow(1 - t, 4)))
      setDisplay(displayed.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <span className={`num ${className}`} aria-label={money2(value)}><span aria-hidden="true">{money2(display)}</span></span>
}
