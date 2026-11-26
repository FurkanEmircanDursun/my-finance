import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { hapticTap } from '../platform/haptics'
import './select.css'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  icon?: ReactNode
  dot?: string
  subtitle?: string
  badge?: string
}

export interface SelectProps<T extends string = string> {
  value: T
  onChange: (value: T) => void
  options: readonly SelectOption<T>[]
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

/**
 * Unified 2026 custom dropdown replacing OS-native <select> across web and mobile.
 * Portals its floating listbox into document.body with automatic viewport flip so it
 * never clips inside modals or Bento cards.
 */
export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Seç…',
  disabled = false,
  ariaLabel,
  className,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  )
  const current = options.find((opt) => opt.value === value)

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth
    const maxMenuH = 292
    const spaceBelow = viewportH - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const flipUp = spaceBelow < 180 && spaceAbove > spaceBelow
    const width = Math.min(Math.max(rect.width, 180), viewportW - 24)
    const left = Math.min(Math.max(12, rect.left), viewportW - width - 12)

    if (flipUp) {
      setMenuStyle({
        position: 'fixed',
        left,
        bottom: viewportH - rect.top + 6,
        width,
        maxHeight: Math.min(maxMenuH, spaceAbove),
      })
    } else {
      setMenuStyle({
        position: 'fixed',
        left,
        top: rect.bottom + 6,
        width,
        maxHeight: Math.min(maxMenuH, Math.max(140, spaceBelow)),
      })
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    setActiveIndex(selectedIndex)
    positionMenu()
  }, [open, selectedIndex, positionMenu])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
    }
    const onResize = () => positionMenu()
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node | null)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown, { passive: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, positionMenu])

  useEffect(() => {
    if (!open) return
    const el = menuRef.current?.querySelector<HTMLElement>(
      `[data-select-idx="${activeIndex}"]`,
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const commit = (option: SelectOption<T>) => {
    hapticTap()
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
      } else {
        setActiveIndex((prev) => (options.length ? (prev + 1) % options.length : 0))
      }
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
      } else {
        setActiveIndex((prev) =>
          options.length ? (prev - 1 + options.length) % options.length : 0,
        )
      }
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
      } else if (options[activeIndex]) {
        commit(options[activeIndex])
      }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          hapticTap()
          setOpen((prev) => !prev)
        }}
        onKeyDown={onKeyDown}
        className={clsx('mizan-select-trigger', open && 'is-open', className)}
      >
        <span className="mizan-select-value">
          {current?.icon ? (
            <span className="mizan-select-leading">{current.icon}</span>
          ) : current?.dot ? (
            <span
              className="mizan-select-dot"
              style={{ background: current.dot }}
              aria-hidden="true"
            />
          ) : null}
          <span className="truncate">{current ? current.label : placeholder}</span>
        </span>
        <ChevronDown
          size={16}
          className={clsx('mizan-select-chevron', open && 'is-open')}
          aria-hidden="true"
        />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            className="mizan-select-popover"
            style={menuStyle}
          >
            {options.map((option, idx) => {
              const selected = option.value === value
              const active = idx === activeIndex
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-select-idx={idx}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => commit(option)}
                  className={clsx(
                    'mizan-select-option',
                    selected && 'is-selected',
                    active && 'is-active',
                  )}
                >
                  {option.icon ? (
                    <span className="mizan-select-leading">{option.icon}</span>
                  ) : option.dot ? (
                    <span
                      className="mizan-select-dot"
                      style={{ background: option.dot }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="mizan-select-option-copy">
                    <span className="truncate">{option.label}</span>
                    {option.subtitle && (
                      <small className="truncate">{option.subtitle}</small>
                    )}
                  </span>
                  {option.badge && (
                    <span className="mizan-select-badge">{option.badge}</span>
                  )}
                  {selected && (
                    <Check
                      size={15}
                      className="shrink-0 text-accent-text"
                      aria-hidden="true"
                    />
                  )}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
