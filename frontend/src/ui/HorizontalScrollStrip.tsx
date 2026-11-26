import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
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

const DRAG_THRESHOLD_PX = 6

/**
 * Responsive horizontal scroll strip supporting:
 * - Mouse/pen press-and-drag scrolling with click suppression after drag
 * - Touch native swipe
 * - Standard mouse wheel horizontal translation
 * - Tap or press-and-hold chevron buttons with non-overlapping edge padding
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
  const [dragging, setDragging] = useState(false)

  const dragRef = useRef<{
    pointerId: number
    startX: number
    startScrollLeft: number
    moved: boolean
  } | null>(null)
  const suppressClickUntilRef = useRef(0)
  const holdTimerRef = useRef<number | null>(null)
  const holdRafRef = useRef<number | null>(null)

  const stopHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    if (holdRafRef.current !== null) {
      window.cancelAnimationFrame(holdRafRef.current)
      holdRafRef.current = null
    }
  }, [])

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
      stopHold()
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
      ro?.disconnect()
      window.cancelAnimationFrame(raf)
    }
  }, [sync, stopHold, children])

  const nudge = (direction: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    const delta = Math.max(160, Math.min(step, Math.round(el.clientWidth * 0.72)))
    el.scrollBy({ left: direction * delta, behavior: 'smooth' })
  }

  const startHold = (direction: -1 | 1) => {
    stopHold()
    holdTimerRef.current = window.setTimeout(() => {
      const tick = () => {
        const el = scrollerRef.current
        if (!el) return
        el.scrollLeft += direction * 10
        holdRafRef.current = window.requestAnimationFrame(tick)
      }
      holdRafRef.current = window.requestAnimationFrame(tick)
    }, 220)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return
    const el = scrollerRef.current
    if (!el || el.scrollWidth <= el.clientWidth + 2) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: el.scrollLeft,
      moved: false,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragRef.current
    const el = scrollerRef.current
    if (!state || !el || state.pointerId !== event.pointerId) return
    const dx = event.clientX - state.startX
    if (!state.moved && Math.abs(dx) >= DRAG_THRESHOLD_PX) {
      state.moved = true
      setDragging(true)
      try {
        el.setPointerCapture(event.pointerId)
      } catch {
        // Synthetic test events may not support pointer capture.
      }
    }
    if (state.moved) {
      el.scrollLeft = state.startScrollLeft - dx
    }
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragRef.current
    if (!state || state.pointerId !== event.pointerId) return
    dragRef.current = null
    if (state.moved) {
      suppressClickUntilRef.current = Date.now() + 260
      setDragging(false)
      try {
        scrollerRef.current?.releasePointerCapture(event.pointerId)
      } catch {
        // Ignore if not captured.
      }
    }
  }

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressClickUntilRef.current) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  return (
    <div
      className={clsx(
        'hscroll-strip',
        canLeft && 'can-scroll-left',
        canRight && 'can-scroll-right',
        dragging && 'is-dragging',
        className,
      )}
    >
      {canLeft && (
        <button
          type="button"
          className="hscroll-btn hscroll-btn--left"
          onClick={() => nudge(-1)}
          onPointerDown={() => startHold(-1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          aria-label="Sola kaydır"
        >
          <ChevronLeft size={16} />
        </button>
      )}

      <div
        ref={scrollerRef}
        role={role}
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        className={clsx('hscroll-viewport', (canLeft || canRight) && 'is-scrollable', scrollerClassName)}
      >
        {children}
      </div>

      {canRight && (
        <button
          type="button"
          className="hscroll-btn hscroll-btn--right"
          onClick={() => nudge(1)}
          onPointerDown={() => startHold(1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          aria-label="Sağa kaydır"
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}
