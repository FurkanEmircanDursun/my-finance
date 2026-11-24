import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Info, Minus, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import { money, percent, signedPercent } from '../core/money'
import { NATURE_LABEL } from '../domain/categories'
import type { CategoryStat, HealthReport, Insight, NatureStat } from '../analytics/types'
import { Badge, Meter } from './primitives'
import { RadialGauge } from './motion'
import { RollingNumber } from './MoneyValue'

/* ── Trend indicator ─────────────────────────────────────────────────────── */

export function TrendPill({
  value,
  inverse = true,
  suffix,
}: {
  value: number | null
  inverse?: boolean
  suffix?: string
}) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-sunken px-2.5 py-0.5 text-label text-faint">
        <Minus size={11} /> karşılaştırma yok
      </span>
    )
  }

  const rising = value > 0.5
  const falling = value < -0.5
  const bad = inverse ? rising : falling
  const good = inverse ? falling : rising

  return (
    <span
      className={clsx(
        'num inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label font-semibold',
        bad ? 'bg-negative-soft text-negative' : good ? 'bg-positive-soft text-positive' : 'bg-sunken text-muted',
      )}
    >
      {rising ? <ArrowUpRight size={12} /> : falling ? <ArrowDownRight size={12} /> : <Minus size={11} />}
      {signedPercent(value)}
      {suffix && <span className="font-normal opacity-80">{suffix}</span>}
    </span>
  )
}

/* ── Insights ────────────────────────────────────────────────────────────── */

const SEVERITY_ICON = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  positive: ShieldCheck,
} as const

const SEVERITY_CLASS = {
  critical: 'text-negative bg-negative-soft',
  warning: 'text-warning bg-warning-soft',
  info: 'text-accent-text bg-accent-soft',
  positive: 'text-positive bg-positive-soft',
} as const

export function InsightRow({
  insight,
  onAction,
}: {
  insight: Insight
  onAction?: (view: string) => void
}) {
  const Icon = SEVERITY_ICON[insight.severity]

  return (
    <div className="flex gap-3.5 border-b border-line py-3.5 last:border-b-0 last:pb-0 first:pt-0">
      <span className={clsx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', SEVERITY_CLASS[insight.severity])}>
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold leading-snug text-ink">{insight.title}</p>
        <p className="mt-1 text-label leading-relaxed text-muted">{insight.body}</p>
        {insight.action && onAction && (
          <button
            type="button"
            onClick={() => onAction(insight.action!.view)}
            className="mt-2 inline-flex items-center gap-1 text-label font-semibold text-accent-text hover:underline"
          >
            {insight.action.label}
            <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Health ──────────────────────────────────────────────────────────────── */

const BAND_TONE = {
  strong: 'positive',
  fair: 'warning',
  weak: 'negative',
} as const

const BAND_SMART = {
  strong: 'safe',
  fair: 'caution',
  weak: 'critical',
} as const

export function HealthPanel({ health }: { health: HealthReport }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-line bg-sunken p-4">
        <div className="flex items-center gap-4">
          <RadialGauge value={health.score} max={100} size={74} strokeWidth={6} tone={BAND_SMART[health.band]}>
            <RollingNumber value={health.score} className="text-title font-bold text-ink" />
          </RadialGauge>
          <div>
            <Badge tone={BAND_TONE[health.band]}>{health.label}</Badge>
            <p className="mt-1.5 text-label text-muted">Ağırlıklı bileşen ortalaması</p>
          </div>
        </div>
        <span className="num text-label text-faint">/ 100</span>
      </div>

      <div className="space-y-3.5">
        {health.components.map((component) => (
          <div key={component.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-label font-semibold text-ink">{component.label}</span>
              <span className="num text-label text-muted">
                {Math.round(component.score)}
                <span className="text-faint"> · ağırlık {percent(component.weight * 100, 0)}</span>
              </span>
            </div>
            <Meter
              value={component.score}
              max={100}
              tone={component.score >= 70 ? 'positive' : component.score >= 45 ? 'warning' : 'negative'}
            />
            <p className="mt-1 text-label text-faint">{component.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Category list ───────────────────────────────────────────────────────── */

export function CategoryList({
  categories,
  activeId,
  onSelect,
  limit,
}: {
  categories: CategoryStat[]
  activeId?: string | null
  onSelect?: (id: string) => void
  limit?: number
}) {
  const list = limit ? categories.slice(0, limit) : categories
  const max = Math.max(...list.map((c) => c.total), 1)

  return (
    <ul className="space-y-1.5">
      {list.map((stat) => {
        const active = activeId === stat.id
        const Row = onSelect ? 'button' : 'div'
        return (
          <li key={stat.id}>
            <Row
              {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(stat.id) } : {})}
              className={clsx(
                'w-full rounded-[var(--radius)] px-2.5 py-2 text-left transition-colors',
                onSelect && 'hover:bg-hover',
                active && 'bg-accent-soft',
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stat.color }} />
                  <span className="truncate text-label font-semibold text-ink">{stat.label}</span>
                </span>
                <span className="num shrink-0 text-label font-semibold text-ink">{money(stat.total)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(stat.total / max) * 100}%`, background: stat.color }}
                  />
                </div>
                <span className="num w-12 shrink-0 text-right text-label text-faint">
                  {percent(stat.share * 100)}
                </span>
              </div>
            </Row>
          </li>
        )
      })}
    </ul>
  )
}

/* ── Need / want split ───────────────────────────────────────────────────── */

const NATURE_BAR_COLOR: Record<string, string> = {
  need: 'var(--accent)',
  mixed: 'var(--warning)',
  want: 'var(--negative)',
  neutral: 'var(--text-faint)',
}

export function NatureSplit({ natures }: { natures: NatureStat[] }) {
  if (!natures.length) return null

  return (
    <div className="space-y-2.5">
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-sunken">
        {natures.map((n) => (
          <div
            key={n.nature}
            className="h-full rounded-full"
            style={{ width: `${n.share * 100}%`, background: NATURE_BAR_COLOR[n.nature] }}
            title={`${NATURE_LABEL[n.nature]} · ${percent(n.share * 100)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {natures.map((n) => (
          <span key={n.nature} className="flex items-center gap-1.5 text-label text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: NATURE_BAR_COLOR[n.nature] }} />
            {NATURE_LABEL[n.nature]}
            <span className="num font-semibold text-ink">{percent(n.share * 100)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
