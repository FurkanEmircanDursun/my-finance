import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { IconButton } from './primitives'
import { hapticImpact, hapticWarn } from '../platform/haptics'
import { setOverlayBackHandler } from '../platform/native'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Open sheets, oldest first. Only the last one answers Escape and Tab. */
const openStack: symbol[] = []
const closeHandlers = new Map<symbol, () => void>()

/** Past this much of a drag, or this fast, the sheet is being thrown away. */
const DISMISS_DISTANCE = 110
const DISMISS_VELOCITY = 0.6 // px per ms

/**
 * Every secondary surface in the app is this one component.
 *
 * It rises from the bottom edge on a phone — where a thumb can reach it and a
 * downward flick is the expected way out — and docks as a centred panel from
 * `sm` upwards. Escape closes it, focus moves in and is restored on close, the
 * page behind it stops scrolling.
 *
 * On a phone the sheet is draggable. The grab handle used to be decoration: it
 * promised a gesture that did not exist, which is worse than no handle at all,
 * because the promise is the first thing a thumb tries. Now the handle and the
 * title bar are one drag surface — pull down and the sheet follows your finger,
 * the backdrop thins out as it goes, and letting go either throws it away or
 * springs it back depending on how far and how fast you moved.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  variant = 'dialog',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'dialog' | 'sheet'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  // The newest `onClose`, without being a dependency of the effect below.
  // Callers pass an inline arrow, which is a new function on every render; as a
  // dependency it re-ran the effect whenever anything above the sheet
  // re-rendered — a sync status ticking over, say — and each run moved focus to
  // the first control, out of whatever field was being typed in.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return

    restoreRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Escape closes the topmost sheet only: a confirmation opened over a sheet
    // is answered first, not closed together with everything under it.
    const token = Symbol()
    openStack.push(token)
    closeHandlers.set(token, () => closeRef.current())
    setOverlayBackHandler(() => {
      const top = openStack[openStack.length - 1]
      if (!top) return false
      closeHandlers.get(top)?.()
      return true
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== token) return

      if (event.key === 'Escape') {
        closeRef.current()
        return
      }

      // Tab stays inside the sheet: the page behind it is inert, and focus
      // wandering onto it is how a keyboard user loses the dialog.
      if (event.key === 'Tab' && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (el) => el.offsetParent !== null,
        )
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)

    // A field with `autoFocus` has already taken focus; moving it to the close
    // button would undo that. Otherwise the first thing to *do* gets it — not
    // the close button, which is always first in the markup.
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) {
      const target = panel.querySelector<HTMLElement>(
        FOCUSABLE.split(',').map((s) => `${s.trim()}:not([data-modal-close])`).join(','),
      )
      ;(target ?? panel).focus()
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const at = openStack.indexOf(token)
      if (at !== -1) openStack.splice(at, 1)
      closeHandlers.delete(token)
      if (openStack.length === 0) setOverlayBackHandler(null)
      document.body.style.overflow = previousOverflow
      restoreRef.current?.focus?.()
    }
  }, [open])

  /*
   * The entrance animation runs once and is then taken off the element for
   * good.
   *
   * It cannot simply be toggled against the drag offset: re-adding the class
   * when a drag settles back to zero *restarts* the keyframes, so a small pull
   * that should spring back instead replayed the whole open animation from
   * transparent. And while either class is attached its `both` fill outranks
   * the inline opacity the drag needs, because a CSS animation beats an inline
   * style. One flag settles both.
   */
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    const timer = window.setTimeout(() => setEntered(true), 240)
    return () => window.clearTimeout(timer)
  }, [open])

  const drag = useSheetDrag(onClose)

  if (!open) return null

  const width =
    variant === 'sheet' ? 'sm:max-w-2xl'
    : size === 'sm' ? 'sm:max-w-sm'
    : size === 'lg' ? 'sm:max-w-3xl'
    : 'sm:max-w-lg'

  /*
   * Rendered into <body> rather than where it was written.
   *
   * `position: fixed` is only viewport-relative while no ancestor establishes a
   * containing block, and `filter`, `transform` and `backdrop-filter` all do.
   * The period picker lives inside the sticky header, which is
   * `backdrop-blur`red — so before this portal the sheet was trapped inside the
   * header's 100px box with its top half above the viewport, unreachable.
   */
  return createPortal(
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-6',
        !entered && 'fade-in',
      )}
      style={{ opacity: drag.backdropOpacity }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={clsx(
          'flex w-full flex-col overflow-hidden bg-raised shadow-overlay focus:outline-none',
          'max-h-[88vh] rounded-t-[20px] sm:max-h-[85vh] sm:rounded-[var(--radius-lg)]',
          // The entrance animation and a finger-following transform cannot both
          // own the transform, so it is only ever attached before the sheet has
          // finished arriving.
          !entered && 'sheet-in',
          width,
        )}
        style={{
          transform: drag.offset ? `translateY(${drag.offset}px)` : undefined,
          transition: drag.settling ? 'transform var(--duration) var(--ease)' : undefined,
          // The gesture pill sits under a bottom sheet; its own padding keeps
          // the last row of content clear of it.
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        <div
          className="no-pan shrink-0 cursor-grab active:cursor-grabbing"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerUp}
        >
          {/* The handle is the signpost for the gesture; the whole bar is the
              target, because a 4px-tall strip is not something a thumb hits. */}
          <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
            <span className="h-1 w-9 rounded-full bg-line-strong" />
          </div>

          <header className="flex items-start justify-between gap-3 px-5 pb-4 pt-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-title font-semibold text-ink">{title}</h2>
              {description && <p id={descriptionId} className="mt-1 text-body text-muted">{description}</p>}
            </div>
            <IconButton label="Kapat" onClick={onClose} data-modal-close className="-mr-2 -mt-2 shrink-0">
              <X size={18} />
            </IconButton>
          </header>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Drag-to-dismiss for the bottom-sheet form.
 *
 * Downward movement only, with resistance if you pull the other way — a sheet
 * that slides up off its own edge looks broken. Release is decided on distance
 * *or* velocity, so a short flick works as well as a long pull, which is what
 * makes the gesture feel like the platform's rather than like a slider.
 */
function useSheetDrag(onClose: () => void) {
  const [offset, setOffset] = useState(0)
  const [settling, setSettling] = useState(false)
  const start = useRef<{ y: number; t: number } | null>(null)
  const last = useRef<{ y: number; t: number } | null>(null)

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // Docked as a centred dialog from `sm` up: no edge to throw it towards.
    if (window.matchMedia('(min-width: 640px)').matches) return
    // Let the close button be a button.
    if ((event.target as HTMLElement).closest('button')) return

    start.current = { y: event.clientY, t: event.timeStamp }
    last.current = start.current
    setSettling(false)
    try {
      // Capture keeps the drag alive if the finger leaves the header, which it
      // does on any pull worth dismissing. It throws for a pointer the browser
      // no longer considers active — a lifted finger, a cancelled gesture — and
      // the drag still works without it.
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* not capturable; the pointer handlers below still fire */
    }
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    const dy = event.clientY - start.current.y
    last.current = { y: event.clientY, t: event.timeStamp }
    // Rubber band upwards: it moves, but only a little, and never off the top.
    setOffset(dy < 0 ? dy / 6 : dy)
  }, [])

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!start.current) return

      const dy = event.clientY - start.current.y
      const dt = Math.max(1, event.timeStamp - (last.current?.t ?? start.current.t))
      const velocity = (event.clientY - (last.current?.y ?? start.current.y)) / dt

      start.current = null
      last.current = null
      setSettling(true)

      if (dy > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
        hapticImpact()
        setOffset(window.innerHeight)
        window.setTimeout(() => {
          setOffset(0)
          setSettling(false)
          onClose()
        }, 180)
        return
      }

      setOffset(0)
      window.setTimeout(() => setSettling(false), 220)
    },
    [onClose],
  )

  // The backdrop thins as the sheet leaves, so the page behind it comes back
  // gradually instead of snapping into view at the end of the gesture.
  const backdropOpacity = offset > 0 ? Math.max(0.15, 1 - offset / 400) : undefined

  return { offset, settling, backdropOpacity, onPointerDown, onPointerMove, onPointerUp }
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Onayla',
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-[var(--radius)] border border-line bg-raised px-4 text-body font-semibold text-ink hover:bg-hover"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => {
              // A destructive confirmation is the one place a second beat is
              // worth it: the phone should not answer a delete the same way it
              // answers a tab change.
              if (destructive) hapticWarn()
              onConfirm()
            }}
            className={clsx(
              'h-11 rounded-[var(--radius)] px-4 text-body font-semibold text-inverse',
              destructive ? 'bg-negative hover:brightness-110' : 'bg-accent hover:bg-accent-hover',
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-body text-muted">{message}</p>
    </Modal>
  )
}
