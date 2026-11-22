import { useCallback, useId, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { IconButton } from './primitives'
import { hapticImpact, hapticWarn } from '../platform/haptics'
import { setOverlayBackHandler } from '../platform/native'
import { FeedbackHost } from './Feedback'
import './modal.css'

const FOCUSABLE = 'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]'
const openStack: { layer: HTMLElement; dismiss: () => void }[] = []
const legacyInert = new Map<HTMLElement, { ariaHidden: string | null; inert: boolean }>()

function availableControls(panel: HTMLElement) {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element =>
    !element.matches(':disabled, [hidden], [tabindex="-1"]'),
  )
}

function closeTopLayer() {
  const top = openStack[openStack.length - 1]
  if (!top) return false
  top.dismiss()
  return true
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'dialog' | 'sheet'
}

export function Modal({ open, ...props }: ModalProps) {
  return open ? <OpenModal {...props} /> : null
}

function OpenModal({ onClose, title, description, children, footer, size = 'md', variant = 'dialog' }: Omit<ModalProps, 'open'>) {
  const native = typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function'
  const nativeLightDismiss = native && 'closedBy' in HTMLDialogElement.prototype
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const openerRef = useRef(document.activeElement as HTMLElement | null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const closing = useRef(false)
  const dismiss = useCallback(() => {
    const layer = dialogRef.current ?? fallbackRef.current
    if (closing.current || openStack[openStack.length - 1]?.layer !== layer) return
    closing.current = true
    dialogRef.current?.close()
    closeRef.current()
  }, [])
  const titleId = useId()
  const descriptionId = useId()

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const layer = dialog ?? fallbackRef.current!
    const panel = panelRef.current!
    const item = { layer, dismiss }
    closing.current = false
    openStack.push(item)
    setOverlayBackHandler(closeTopLayer)

    const openedAt = window.location.hash
    const onHistoryTraversal = () => {
      if (window.location.hash === openedAt || closing.current) return
      // A real browser history traversal leaves the page that opened this layer.
      closing.current = true
      dialog?.close()
      closeRef.current()
    }
    window.addEventListener('popstate', onHistoryTraversal)

    const onCloseRequest = () => {
      if (!dialog?.open && !closing.current) {
        closing.current = true
        closeRef.current()
      }
    }

    const controls = availableControls(panel)
    const initial = panel.querySelector<HTMLElement>('[data-modal-initial-focus]:not(:disabled)')
      ?? controls.find(control => !control.hasAttribute('data-modal-close'))
    const typingControl = initial?.matches('input:not([type="checkbox"]):not([type="radio"]), textarea')
    const touchSheet = window.matchMedia('(max-width: 639px) and (pointer: coarse)').matches
    const focusTarget = typingControl && touchSheet ? controls[0] : initial ?? controls[0]
    let restoreFallback: (() => void) | undefined

    if (dialog) {
      if (nativeLightDismiss) dialog.setAttribute('closedby', 'any')
      dialog.addEventListener('close', onCloseRequest)
      // React only focuses autoFocus props on mount. A closed native dialog
      // needs the real attribute for the browser's initial-focus algorithm.
      const temporaryAutofocus = focusTarget && !focusTarget.hasAttribute('autofocus')
      if (temporaryAutofocus) focusTarget.setAttribute('autofocus', '')
      dialog.showModal()
      if (temporaryAutofocus) focusTarget.removeAttribute('autofocus')
    } else {
      restoreFallback = activateFallback(layer, panel, focusTarget, dismiss)
    }

    const stopViewport = trackViewport(layer)
    return () => {
      window.removeEventListener('popstate', onHistoryTraversal)
      stopViewport?.()
      const wasTop = openStack[openStack.length - 1] === item
      openStack.splice(openStack.indexOf(item), 1)
      if (!openStack.length) setOverlayBackHandler(null)
      if (dialog) {
        dialog.removeEventListener('close', onCloseRequest)
        dialog.close()
      } else {
        restoreFallback?.()
        if (wasTop) openerRef.current?.focus({ preventScroll: true })
      }
    }
  }, [dismiss, nativeLightDismiss])

  const drag = useSheetDrag(panelRef, dismiss)
  const backdropPress = useRef<number | null>(null)

  function isBackdrop(event: ReactPointerEvent<HTMLElement>) {
    if (nativeLightDismiss || event.target !== event.currentTarget) return false
    const rect = panelRef.current!.getBoundingClientRect()
    return event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom
  }

  const backdropEvents = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.isPrimary && event.button === 0) backdropPress.current = isBackdrop(event) ? event.pointerId : null
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const pressedOutside = backdropPress.current === event.pointerId
      backdropPress.current = null
      if (pressedOutside && isBackdrop(event)) dismiss()
    },
    onPointerCancel: () => { backdropPress.current = null },
  }

  const panel = (
    <section
      className="mizan-modal-panel"
      ref={panelRef}
      role={native ? undefined : 'dialog'}
      aria-modal={native ? undefined : true}
      aria-labelledby={native ? undefined : titleId}
      aria-describedby={!native && description ? descriptionId : undefined}
      tabIndex={native ? undefined : -1}
    >
      <div className="mizan-modal-drag" {...drag}>
        <div className="mizan-modal-handle" aria-hidden="true" />
        <header className="mizan-modal-header">
          <div className="min-w-0">
            <h2 id={titleId} className="text-title font-semibold text-ink">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-body text-muted">{description}</p>}
          </div>
          <IconButton label="Kapat" onClick={dismiss} data-modal-close className="mizan-modal-close shrink-0">
            <X size={18} aria-hidden="true" />
          </IconButton>
        </header>
      </div>
      <div className="mizan-modal-body">{children}</div>
      <FeedbackHost />
      {footer && <footer className="mizan-modal-footer">{footer}</footer>}
    </section>
  )

  const layout = variant === 'sheet' ? 'sheet' : size
  return createPortal(native ? (
    <dialog
      ref={dialogRef}
      className="mizan-modal-native"
      data-modal-size={layout}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      {...backdropEvents}
    >{panel}</dialog>
  ) : (
    <div ref={fallbackRef} className="mizan-modal-fallback" data-modal-size={layout} {...backdropEvents}>
      {panel}
    </div>
  ), document.body)
}

/** Older iOS WKWebViews keep the dialog semantics, focus ring and stack behavior. */
function activateFallback(layer: HTMLElement, panel: HTMLElement, initial: HTMLElement | undefined, dismiss: () => void) {
  const isTop = () => openStack[openStack.length - 1]?.layer === layer
  if (!panel.contains(document.activeElement)) (initial ?? panel).focus({ preventScroll: true })
  syncLegacyInert()

  const onFocusIn = (event: FocusEvent) => {
    if (isTop() && !panel.contains(event.target as Node)) (initial ?? panel).focus({ preventScroll: true })
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isTop() || event.defaultPrevented) return
    if (event.key === 'Escape') {
      event.preventDefault()
      dismiss()
    } else if (event.key === 'Tab') {
      const items = availableControls(panel).filter(element => element.getClientRects().length)
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!first || (event.shiftKey ? active === first : active === last) || !panel.contains(active)) {
        event.preventDefault()
        const target = (event.shiftKey ? last : first) ?? panel
        target.focus({ preventScroll: true })
      }
    }
  }
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('keydown', onKeyDown)
  return () => {
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('keydown', onKeyDown)
    syncLegacyInert()
  }
}

function syncLegacyInert() {
  const outside = new Set(openStack.slice(0, -1).map(item => item.layer))
  const app = document.getElementById('root')
  if (app && openStack.length) outside.add(app)

  for (const [element, { ariaHidden, inert }] of legacyInert) {
    if (outside.has(element)) continue
    if (ariaHidden === null) element.removeAttribute('aria-hidden')
    else element.setAttribute('aria-hidden', ariaHidden)
    if (!inert) element.removeAttribute('inert')
    legacyInert.delete(element)
  }
  for (const element of outside) {
    if (legacyInert.has(element)) continue
    legacyInert.set(element, { ariaHidden: element.getAttribute('aria-hidden'), inert: element.hasAttribute('inert') })
    element.setAttribute('aria-hidden', 'true')
    element.setAttribute('inert', '')
  }
}

function trackViewport(layer: HTMLElement) {
  const viewport = window.visualViewport
  if (!viewport) return undefined
  let frame = 0
  const update = () => {
    if (viewport.scale !== 1) return
    const keyboard = Math.max(0, document.documentElement.clientHeight - viewport.height - viewport.offsetTop)
    layer.style.setProperty('--modal-visible-height', `${viewport.height}px`)
    layer.style.setProperty('--modal-viewport-bottom', `${keyboard}px`)
  }
  const schedule = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(update)
  }
  update()
  viewport.addEventListener('resize', schedule)
  viewport.addEventListener('scroll', schedule)
  return () => {
    window.cancelAnimationFrame(frame)
    viewport.removeEventListener('resize', schedule)
    viewport.removeEventListener('scroll', schedule)
  }
}

function useSheetDrag(panelRef: { current: HTMLElement | null }, dismiss: () => void) {
  const drag = useRef<{ pointer: number; y: number; time: number; lastY: number; lastTime: number; speed: number } | null>(null)

  const reset = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== event.pointerId) return
    drag.current = null
    const panel = panelRef.current
    if (!panel) return
    delete panel.dataset.dragging
    panel.style.removeProperty('transform')
  }

  return {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || event.button !== 0 || drag.current || window.matchMedia('(min-width: 640px)').matches) return
      if ((event.target as Element).closest('button')) return
      const { pointerId, clientY, timeStamp } = event
      drag.current = { pointer: pointerId, y: clientY, time: timeStamp, lastY: clientY, lastTime: timeStamp, speed: 0 }
      panelRef.current?.setAttribute('data-dragging', '')
      event.currentTarget.setPointerCapture(pointerId)
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = drag.current
      if (!current || current.pointer !== event.pointerId) return
      const distance = event.clientY - current.y
      current.speed = (event.clientY - current.lastY) / Math.max(1, event.timeStamp - current.lastTime)
      current.lastY = event.clientY
      current.lastTime = event.timeStamp
      if (panelRef.current && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
        panelRef.current.style.transform = `translateY(${distance < 0 ? distance / 6 : distance}px)`
      }
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = drag.current
      if (!current || current.pointer !== event.pointerId) return
      const distance = event.clientY - current.y
      const speed = event.timeStamp - current.lastTime < 80
        ? current.speed
        : distance / Math.max(1, event.timeStamp - current.time)
      reset(event)
      if (distance > 110 || (distance > 18 && speed > 0.55)) {
        hapticImpact()
        dismiss()
      }
    },
    onPointerCancel: reset,
    onLostPointerCapture: reset,
  }
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
