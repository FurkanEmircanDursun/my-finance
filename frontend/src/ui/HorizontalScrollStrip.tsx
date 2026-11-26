import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import './horizontal-scroll.css'

export interface HorizontalScrollStripProps {
  children: ReactNode
  className?: string
  scrollerClassName?: string
  role?: string
  ariaLabel?: string
  /** Pixel offset per arrow button click. Defaults to 260. */
  step?: number
}

/**
 * Horizontal scroll strip usable with standard mouse wheel, left/right chevron
 * controls, keyboard focus, and touch swipe — never trapping desktop mouse users
 * behind trackpad-only gestures.
 */
export function HorizontalScrollStrip({
  children,
  className,
  scrollerClassName,
  role,
  ariaLabel,
  step = 260,
}: HorizontalScrollStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const sync = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setCanLeft(el.scrollLeft > 4)
    setCanRight(maxScroll - el.scrollLeft > 4)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    sync()

    const onScroll = () => sync()
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 2) return
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const goingRight = event.deltaY > 0
      const atLeft = el.scrollLeft <= 1
      const atRight = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1
      if ((goingRight && atRight) || (!goingRight && atLeft)) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })

    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(sync)
      ro.observe(el)
      if (el.firstElementChild) ro.observe(el.firstElementChild)
    }
    const raf = window.requestAnimationFrame(sync)
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
      ro?.disconnect()
      window.cancelAnimationFrame(raf)
    }
  }, [sync, children])

  const nudge = (direction: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    const delta = Math.max(160, Math.min(step, Math.round(el.clientWidth * 0.72)))
    el.scrollBy({ left: direction * delta, behavior: 'smooth' })
  }

  return (
    <div
      className={clsx(
        'hscroll-strip',
        canLeft && 'can-scroll-left',
        canRight && 'can-scroll-right',
        className,
      )}
    >
      {canLeft && (
        <button
          type="button"
          className="hscroll-btn hscroll-btn--left"
          onClick={() => nudge(-1)}
          aria-label="Sola kaydır"
        >
          <ChevronLeft size={16} />
        </button>
      )}

      <div
        ref={scrollerRef}
        role={role}
        aria-label={ariaLabel}
        className={clsx('hscroll-viewport', scrollerClassName)}
      >
        {children}
      </div>

      {canRight && (
        <button
          type="button"
          className="hscroll-btn hscroll-btn--right"
          onClick={() => nudge(1)}
          aria-label="Sağa kaydır"
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}
