import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

/* ── Layout ──────────────────────────────────────────────────────────────── */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return <div className={clsx('surface min-w-0', padded && 'p-4 sm:p-5', className)}>{children}</div>
}

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
    <section className={clsx('flex min-w-0 flex-col', className)}>
      {(title || actions) && (
        <header className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-title font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-1 text-label font-normal text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  )
}

export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('grid gap-3.5', className)}>{children}</div>
}

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
  'inline-flex select-none items-center justify-center gap-2 rounded-[var(--radius)] font-medium whitespace-nowrap transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-inverse hover:bg-accent-hover border border-transparent shadow-glow disabled:bg-active disabled:text-faint disabled:border-line disabled:shadow-none',
  secondary:
    'bg-raised text-ink border border-line hover:bg-hover hover:border-line-strong disabled:bg-sunken disabled:text-faint disabled:opacity-70',
  ghost:
    'bg-transparent text-muted hover:text-ink hover:bg-hover border border-transparent disabled:text-faint disabled:opacity-60',
  danger:
    'bg-negative-soft text-negative border border-transparent hover:border-negative/30 disabled:opacity-50',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-[44px] h-11 px-3.5 text-label',
  md: 'min-h-[44px] h-11 px-4 text-body',
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
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted',
        'transition-all duration-200 hover:bg-hover hover:text-ink active:scale-95',
        className,
      )}
      {...props}
    />
  )
}

/* ── Indicators ──────────────────────────────────────────────────────────── */

type Tone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted border-line',
  accent: 'bg-accent-soft text-accent-text border-accent-border',
  positive: 'bg-positive-soft text-positive border-transparent',
  negative: 'bg-negative-soft text-negative border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
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
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label font-medium leading-tight',
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  )
}

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
        <div className={clsx('num min-w-0 break-words text-figure font-semibold', valueTone)}>{value}</div>
        {action}
      </div>
      <div className="mt-2 text-body font-normal text-muted">{label}</div>
      {hint && <div className="mt-1 text-label font-normal text-faint">{hint}</div>}
    </>
  )

  if (!onClick) return <div className="bento-card">{body}</div>

  return (
    <button
      type="button"
      onClick={onClick}
      className="bento-card bento-card--interactive text-left"
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
      className={clsx('mizan-progress-track', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="mizan-progress-fill"
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
    <div className={clsx('inline-flex max-w-full min-h-[44px] items-center overflow-x-auto scrollbar-none rounded-[var(--radius)] border border-line bg-sunken p-1', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={clsx(
            'inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-[9px] px-3.5 py-1.5 text-label font-medium whitespace-nowrap transition-all duration-200',
            value === option.value
              ? 'bg-raised text-ink shadow-card'
              : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-label font-medium transition-all duration-200 active:scale-95',
        selected
          ? 'border-accent-border bg-accent-soft text-accent-text'
          : 'border-line bg-raised text-ink hover:bg-hover hover:border-line-strong',
      )}
    >
      {children}
    </button>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'h-11 w-full min-w-0 rounded-[var(--radius)] border border-line bg-sunken px-3.5 text-body text-ink transition-all duration-200',
        'placeholder:text-faint hover:border-line-strong focus:border-accent focus:bg-raised focus:outline-none focus:ring-2 focus:ring-accent/20',
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
    <label className="block min-w-0">
      <span className="mb-1.5 block text-label font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-label font-normal text-faint">{hint}</span>}
    </label>
  )
}

/* ── States ──────────────────────────────────────────────────────────────── */

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
        'flex flex-col items-center justify-center gap-3.5 rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-sunken/50 px-5 text-center sm:px-6',
        compact ? 'py-8' : 'py-12 sm:py-14',
      )}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-raised text-accent-text shadow-card">
          {icon}
        </div>
      )}
      <p className="text-title font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-body font-normal text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('mizan-skeleton', className)} />
}
