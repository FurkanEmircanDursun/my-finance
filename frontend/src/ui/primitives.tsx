import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

/* ── Layout ──────────────────────────────────────────────────────────────── */

/**
 * A raised, self-contained block. Reserved for the one or two headline figures
 * on a screen; ordinary content uses `Section`, which draws no box at all.
 */
export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return <div className={clsx('surface', padded && 'p-5', className)}>{children}</div>
}

/**
 * A titled block of content, separated from its neighbours by space rather than
 * by a frame.
 *
 * The previous version wrapped every section in a bordered card, so a screen was
 * a stack of boxes containing boxes and the border carried no information. Here
 * a border means one thing: you can touch this. Sections are quiet; rows and
 * tiles are the things that look pressable.
 *
 * `description` is deliberately rare — a section that needs a sentence to
 * explain what it is usually needs a better title.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={clsx('flex flex-col', className)}>
      {(title || actions) && (
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-title font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-1 text-label text-faint">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  )
}

export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('grid gap-3', className)}>{children}</div>
}

/**
 * One tappable line in a list — a category, a subscription, an instalment plan.
 *
 * Rows are the workhorse of this interface: almost every drill-down starts with
 * one. They carry the hairline that says "pressable", a 44px minimum height for
 * a thumb, and nothing else.
 */
export function Row({
  children,
  onClick,
  className,
  active,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  active?: boolean
}) {
  const shared = clsx(
    'flex min-h-[44px] w-full items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-left',
    'transition-colors duration-200',
    active && 'bg-hover',
    className,
  )

  if (!onClick) return <div className={shared}>{children}</div>

  return (
    <button type="button" onClick={onClick} className={clsx(shared, 'hover:bg-hover')}>
      {children}
    </button>
  )
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-semibold whitespace-nowrap transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover border border-transparent',
  secondary: 'bg-raised text-ink border border-line hover:bg-hover',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-hover border border-transparent',
  // Destructive work is never the accent colour: the loudest button on a screen
  // should be the one you are meant to press.
  danger: 'bg-transparent text-negative border border-line hover:bg-negative-soft',
}

// 44px is the smallest target a thumb hits reliably, and this app ships as an
// Android build too. `sm` exists for inline actions inside an already dense row.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-label',
  md: 'h-11 px-4 text-body',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      className={clsx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  )
}

export function IconButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-muted',
        'transition-colors duration-200 hover:bg-hover hover:text-ink',
        className,
      )}
      {...props}
    />
  )
}

/* ── Indicators ──────────────────────────────────────────────────────────── */

type Tone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted',
  accent: 'bg-accent-soft text-accent-text',
  positive: 'bg-positive-soft text-positive',
  negative: 'bg-negative-soft text-negative',
  warning: 'bg-warning-soft text-warning',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
  dot?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-label font-semibold leading-tight',
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  )
}

/**
 * A headline figure. The label sits under the number, not above it: the number
 * is what the eye should land on first, and the caption then reads as its
 * explanation rather than as a form field's name.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  action,
  onClick,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  action?: ReactNode
  onClick?: () => void
}) {
  const valueTone =
    tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink'

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className={clsx('num text-figure font-semibold', valueTone)}>{value}</div>
        {action}
      </div>
      <div className="mt-2 text-body text-muted">{label}</div>
      {hint && <div className="mt-1 text-label text-faint">{hint}</div>}
    </>
  )

  if (!onClick) return <div className="surface p-5">{body}</div>

  return (
    <button
      type="button"
      onClick={onClick}
      className="surface p-5 text-left transition-colors duration-200 hover:bg-hover"
    >
      {body}
    </button>
  )
}

export function Meter({
  value,
  max,
  tone = 'accent',
  className,
}: {
  value: number
  max: number
  tone?: Tone
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const color =
    tone === 'negative' ? 'var(--negative)'
    : tone === 'warning' ? 'var(--warning)'
    : tone === 'positive' ? 'var(--positive)'
    : 'var(--accent)'

  return (
    <div
      className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

/* ── Controls ────────────────────────────────────────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: ReactNode }>
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={clsx('inline-flex rounded-[var(--radius)] bg-sunken p-1', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={clsx(
            'rounded-[6px] px-3 py-1.5 text-label font-semibold transition-colors duration-200',
            value === option.value ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'h-11 w-full rounded-[var(--radius)] border border-line bg-raised px-3 text-body text-ink',
        'placeholder:text-faint focus:border-accent focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-body text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-label text-faint">{hint}</span>}
    </label>
  )
}

/* ── States ──────────────────────────────────────────────────────────────── */

/**
 * An empty state is a title and, at most, one thing to do. The explanatory
 * paragraph that used to sit between them told people what they had already
 * worked out from the title.
 */
export function Empty({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'py-8' : 'py-16',
      )}
    >
      {icon && <div className="text-faint">{icon}</div>}
      <p className="text-title font-semibold text-ink">{title}</p>
      {description && <p className="max-w-xs text-body text-muted">{description}</p>}
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-[var(--radius)] bg-sunken', className)} />
}
