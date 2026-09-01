import { useState, useEffect, useRef } from 'react'

interface AnimatedNumberProps {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  duration?: number
  className?: string
}

export default function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 1200,
  className = '',
}: AnimatedNumberProps) {
  const [displayed, setDisplayed] = useState(0)
  const startRef = useRef<number | null>(null)
  const startValueRef = useRef(0)

  useEffect(() => {
    startValueRef.current = displayed
    startRef.current = null

    let raf: number
    const animate = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(startValueRef.current + (value - startValueRef.current) * eased)
      if (progress < 1) raf = requestAnimationFrame(animate)
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(displayed)

  return (
    <span className={className}>
      {prefix}{formatted}{suffix}
    </span>
  )
}
