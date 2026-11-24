import type { CSSProperties, ReactNode } from 'react'
import { clsx } from 'clsx'

export type SmartTone = 'safe' | 'caution' | 'critical' | 'accent' | 'gold'

export function resolveBudgetTone(ratio: number): SmartTone {
  if (ratio > 0.95) return 'critical'
  if (ratio >= 0.75) return 'caution'
  return 'safe'
}

export function toneColor(tone: SmartTone): string {
  switch (tone) {
    case 'safe':
      return 'var(--positive)'
    case 'caution':
      return 'var(--warning)'
    case 'critical':
      return 'var(--negative)'
    case 'gold':
      return 'var(--gold)'
    case 'accent':
    default:
      return 'var(--accent)'
  }
}

/** Staggered entrance wrapper following MOTION.md (45ms cadence, 270ms cap). */
export function Stagger({
  index = 0,
  as = 'div',
  className,
  children,
}: {
  index?: number
  as?: 'div' | 'li'
  className?: string
  children: ReactNode
}) {
  const Tag = as
  return (
    <Tag
      className={clsx('stagger-item', className)}
      style={{ '--stagger-i': index } as CSSProperties}
    >
      {children}
    </Tag>
  )
}

/**
 * Animated linear progress ribbon with smart semantic threshold colors
 * (Safe <75% Jade · Caution 75–95% Amber · Critical >95% Crimson).
 */
export function AnimatedProgress({
  value,
  max,
  tone,
  color,
  height = 8,
  label,
  className,
}: {
  value: number
  max: number
  tone?: SmartTone
  color?: string
  height?: number
  label?: string
  className?: string
}) {
  const ratio = max > 0 ? Math.max(0, value / max) : 0
  const clamped = Math.min(1, ratio)
  const resolvedColor = color ?? toneColor(tone ?? resolveBudgetTone(ratio))

  return (
    <div
      className={clsx('mizan-progress-track', className)}
      style={{ height }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="mizan-progress-fill"
        style={{
          width: '100%',
          transform: `scaleX(${clamped})`,
          background: resolvedColor,
        }}
      />
    </div>
  )
}

/**
 * Circular SVG radial gauge for budget capacity and financial habit scores.
 * Uses GPU-friendly stroke-dashoffset transitions and crisp round caps.
 */
export function RadialGauge({
  value,
  max = 100,
  size = 84,
  strokeWidth = 7,
  tone,
  color,
  children,
  className,
}: {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  tone?: SmartTone
  color?: string
  children?: ReactNode
  className?: string
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - ratio)
  const stroke = color ?? toneColor(tone ?? 'accent')

  return (
    <div
      className={clsx('radial-gauge', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="radial-gauge__track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="radial-gauge__arc"
        />
      </svg>
      {children && <div className="radial-gauge__label">{children}</div>}
    </div>
  )
}

/** Bespoke Bento Cockpit shimmer skeleton for lazy route & period transitions. */
export function CockpitSkeleton() {
  return (
    <div className="space-y-5 fade-in" aria-busy="true" aria-label="Yükleniyor">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="mizan-skeleton h-9 w-44" />
          <div className="mizan-skeleton h-4 w-32" />
        </div>
        <div className="mizan-skeleton h-10 w-32 rounded-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="mizan-skeleton h-52 rounded-[var(--radius-xl)] lg:col-span-7" />
        <div className="mizan-skeleton h-52 rounded-[var(--radius-xl)] lg:col-span-5" />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="mizan-skeleton h-72 rounded-[var(--radius-lg)] lg:col-span-7" />
        <div className="mizan-skeleton h-72 rounded-[var(--radius-lg)] lg:col-span-5" />
      </div>
    </div>
  )
}
