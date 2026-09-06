import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { IconButton } from './primitives'

/**
 * Every secondary surface in the app is this one component.
 *
 * It rises from the bottom edge on a phone — where a thumb can reach its close
 * affordance and a downward flick is the expected way out — and docks as a
 * centred panel from `sm` upwards. Escape closes it, focus moves in and is
 * restored on close, the page behind it stops scrolling.
 *
 * `variant="sheet"` is the wide form used for drill-downs that carry a list;
 * `dialog` is the short form used for a single decision.
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

  useEffect(() => {
    if (!open) return

    restoreRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    focusable?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      restoreRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const width =
    variant === 'sheet' ? 'sm:max-w-2xl'
    : size === 'sm' ? 'sm:max-w-sm'
    : size === 'lg' ? 'sm:max-w-3xl'
    : 'sm:max-w-lg'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] fade-in sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'sheet-in flex w-full flex-col overflow-hidden bg-raised shadow-overlay',
          'max-h-[88vh] rounded-t-[20px] sm:max-h-[85vh] sm:rounded-[var(--radius-lg)]',
          width,
        )}
      >
        {/* The grab handle is the phone's affordance for "flick this away". It
            has no click target of its own — the close button is the pointer
            path, this is the gesture's signpost. */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-line-strong" />
        </div>

        <header className="flex items-start justify-between gap-3 px-5 pb-4 pt-4">
          <div className="min-w-0">
            <h2 className="text-title font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-body text-muted">{description}</p>}
          </div>
          <IconButton label="Kapat" onClick={onClose} className="-mr-2 -mt-2 shrink-0">
            <X size={18} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
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
            onClick={onConfirm}
            className={clsx(
              'h-11 rounded-[var(--radius)] px-4 text-body font-semibold text-white',
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
