import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { IconButton } from './primitives'

/**
 * Dialog and side-sheet in one component.
 *
 * Handles the accessibility basics the previous inline modals skipped: Escape
 * to close, focus moved into the dialog and restored on close, background
 * scroll lock, and a labelled `role="dialog"`.
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
    variant === 'sheet'
      ? 'h-full w-full max-w-2xl'
      : size === 'sm'
        ? 'w-full max-w-sm'
        : size === 'lg'
          ? 'w-full max-w-3xl'
          : 'w-full max-w-lg'

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex bg-black/40 backdrop-blur-[2px] fade-in',
        variant === 'sheet' ? 'justify-end' : 'items-center justify-center p-4',
      )}
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
          'flex flex-col overflow-hidden border border-line bg-raised shadow-overlay',
          variant === 'sheet' ? 'rounded-none border-y-0 border-r-0' : 'rounded-lg rise-in',
          width,
          variant === 'dialog' && 'max-h-[85vh]',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-2xs text-muted">{description}</p>}
          </div>
          <IconButton label="Kapat" onClick={onClose} className="-mr-1 -mt-0.5">
            <X size={15} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-sunken px-4 py-3">
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
            className="h-8 rounded border border-line bg-raised px-3 text-2xs font-medium text-ink hover:bg-hover"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={clsx(
              'h-8 rounded px-3 text-2xs font-medium text-white',
              destructive ? 'bg-negative hover:brightness-110' : 'bg-accent hover:bg-accent-hover',
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-muted">{message}</p>
    </Modal>
  )
}
