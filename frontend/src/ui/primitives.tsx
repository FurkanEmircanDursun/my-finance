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
  return <div className={clsx('surface', padded && 'p-4 sm:p-5', className)}>{children}</div>
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section className={clsx('surface flex flex-col', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-2xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={clsx('min-w-0 flex-1', padded && 'p-4 sm:p-5', title && padded && 'pt-3 sm:pt-4')}>
        {children}
      </div>
    </section>
  )
}

export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('grid gap-3', className)}>{children}</div>
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover border border-transparent',
  secondary: 'bg-raised text-ink border border-line hover:bg-hover',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-hover border border-transparent',
  danger: 'bg-negative-soft text-negative border border-transparent hover:brightness-95',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-2xs',
  md: 'h-9 px-3.5 text-[13px]',
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
        'inline-flex h-8 w-8 items-center justify-center rounded text-muted transition-colors hover:bg-hover hover:text-ink',
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
  accent: 'bg-accent-soft text-accent-text border-transparent',
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
        'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-2xs font-medium leading-tight',
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
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  action?: ReactNode
}) {
  const valueTone =
    tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink'

  return (
    <div className="surface flex flex-col justify-between gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</span>
        {action}
      </div>
      <div>
        <div className={clsx('num text-[26px] font-semibold leading-none tracking-tight', valueTone)}>
          {value}
        </div>
        {hint && <div className="mt-1.5 text-2xs text-muted">{hint}</div>}
      </div>
    </div>
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
    <div className={clsx('inline-flex rounded border border-line bg-sunken p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={clsx(
            'rounded-[6px] px-2.5 py-1 text-2xs font-medium transition-colors',
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
        'h-9 w-full rounded border border-line bg-raised px-2.5 text-[13px] text-ink',
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
      <span className="mb-1.5 block text-2xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-2xs text-faint">{hint}</span>}
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
        'flex flex-col items-center justify-center gap-2 text-center',
        compact ? 'py-6' : 'py-12',
      )}
    >
      {icon && <div className="text-faint">{icon}</div>}
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-2xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded bg-sunken', className)} />
}
