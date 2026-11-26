import { useEffect, useRef, useState } from 'react'
import { money, money2 } from '../core/money'

function splitTurkishMoney(formatted: string): [string, string] {
  const comma = formatted.lastIndexOf(',')
  if (comma === -1) return [formatted, '']
  return [formatted.slice(0, comma), formatted.slice(comma)]
}

/**
 * Rolling odometer currency display.
 * Smoothly interpolates integer kuruş on mount/change using quartic ease-out,
 * preserving strict `tabular-nums` alignment and exact screen-reader labels.
 */
export function MoneyValue({
  value,
  className = '',
  decimals = true,
  sign = false,
  splitFraction = true,
  duration = 520,
}: {
  value: number
  className?: string
  decimals?: boolean
  sign?: boolean
  splitFraction?: boolean
  duration?: number
}) {
  const [display, setDisplay] = useState(value)
  const displayed = useRef(value)
  const mounted = useRef(false)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Subtle count-up from 84% on first mount for hero tactile polish; snap immediately when zeroed
    const from = mounted.current ? displayed.current : Math.round(value * 0.84)
    mounted.current = true

    if (reduced || from === value || value === 0) {
      displayed.current = value
      setDisplay(value)
      return
    }

    const start = performance.now()
    let frame = 0
    const tick = (time: number) => {
      const t = Math.min(1, (time - start) / duration)
      const eased = 1 - Math.pow(1 - t, 4)
      displayed.current = Math.round(from + (value - from) * eased)
      setDisplay(displayed.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  const format = (v: number) =>
    decimals ? money2(v, { sign }) : money(v, { sign })

  const formatted = format(display)
  const exact = format(value)
  const [whole, fraction] = splitFraction && decimals
    ? splitTurkishMoney(formatted)
    : [formatted, '']

  return (
    <span className={`money-value num ${className}`.trim()} aria-label={exact}>
      <span aria-hidden="true">
        {whole}
        {fraction && <span className="money-value__fraction">{fraction}</span>}
      </span>
    </span>
  )
}

/** Smooth count-up integer for habit scores, percentages, and KPI counters. */
export function RollingNumber({
  value,
  suffix = '',
  prefix = '',
  className = '',
  duration = 480,
}: {
  value: number
  suffix?: string
  prefix?: string
  className?: string
  duration?: number
}) {
  const [display, setDisplay] = useState(value)
  const displayed = useRef(value)
  const mounted = useRef(false)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const from = mounted.current ? displayed.current : 0
    mounted.current = true
    if (reduced || from === value) {
      displayed.current = value
      setDisplay(value)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (time: number) => {
      const t = Math.min(1, (time - start) / duration)
      displayed.current = Math.round(from + (value - from) * (1 - Math.pow(1 - t, 4)))
      setDisplay(displayed.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return (
    <span className={`num ${className}`.trim()} aria-label={`${prefix}${value}${suffix}`}>
      <span aria-hidden="true">
        {prefix}
        {display}
        {suffix}
      </span>
    </span>
  )
}
