import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Info, Minus, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import { money, percent, signedPercent } from '../core/money'
import { NATURE_LABEL } from '../domain/categories'
import type { CategoryStat, HealthReport, Insight, NatureStat } from '../analytics/types'
import { Badge, Meter } from './primitives'

/* ── Trend indicator ─────────────────────────────────────────────────────── */

export function TrendPill({
  value,
  /** For spending, an increase is bad; set false for metrics where up is good. */
  inverse = true,
  suffix,
}: {
  value: number | null
  inverse?: boolean
  suffix?: string
}) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span className="inline-flex items-center gap-1 text-2xs text-faint">
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
        'inline-flex items-center gap-1 text-2xs font-medium',
        bad ? 'text-negative' : good ? 'text-positive' : 'text-muted',
      )}
    >
      {rising ? <ArrowUpRight size={12} /> : falling ? <ArrowDownRight size={12} /> : <Minus size={11} />}
      {signedPercent(value)}
      {suffix && <span className="font-normal text-faint">{suffix}</span>}
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
  critical: 'text-negative',
  warning: 'text-warning',
  info: 'text-muted',
  positive: 'text-positive',
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
    <div className="flex gap-3 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0">
      <Icon size={15} className={clsx('mt-0.5 shrink-0', SEVERITY_CLASS[insight.severity])} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-snug text-ink">{insight.title}</p>
        <p className="mt-1 text-2xs leading-relaxed text-muted">{insight.body}</p>
        {insight.action && onAction && (
          <button
            type="button"
            onClick={() => onAction(insight.action!.view)}
            className="mt-1.5 inline-flex items-center gap-1 text-2xs font-medium text-accent hover:underline"
          >
            {insight.action.label}
            <ArrowRight size={11} />
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

export function HealthPanel({ health }: { health: HealthReport }) {
  const color =
    health.band === 'strong' ? 'var(--positive)' : health.band === 'fair' ? 'var(--warning)' : 'var(--negative)'

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="num text-[34px] font-semibold leading-none tracking-tight" style={{ color }}>
            {health.score}
            <span className="text-base font-normal text-faint">/100</span>
          </div>
          <p className="mt-1.5 text-2xs text-muted">Ağırlıklı bileşen ortalaması</p>
        </div>
        <Badge tone={BAND_TONE[health.band]}>{health.label}</Badge>
      </div>

      <div className="space-y-3">
        {health.components.map((component) => (
          <div key={component.id}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-2xs font-medium text-ink">{component.label}</span>
              <span className="num text-2xs text-muted">
                {Math.round(component.score)}
                <span className="text-faint"> · ağırlık {percent(component.weight * 100, 0)}</span>
              </span>
            </div>
            <Meter
              value={component.score}
              max={100}
              tone={component.score >= 70 ? 'positive' : component.score >= 45 ? 'warning' : 'negative'}
            />
            <p className="mt-1 text-2xs text-faint">{component.detail}</p>
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
    <ul className="space-y-2">
      {list.map((stat) => {
        const active = activeId === stat.id
        const Row = onSelect ? 'button' : 'div'
        return (
          <li key={stat.id}>
            <Row
              {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(stat.id) } : {})}
              className={clsx(
                'w-full rounded px-2 py-1.5 text-left transition-colors',
                onSelect && 'hover:bg-hover',
                active && 'bg-hover',
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stat.color }} />
                  <span className="truncate text-2xs font-medium text-ink">{stat.label}</span>
                </span>
                <span className="num shrink-0 text-2xs font-medium text-ink">{money(stat.total)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(stat.total / max) * 100}%`, background: stat.color }}
                  />
                </div>
                <span className="num w-12 shrink-0 text-right text-2xs text-faint">
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
    <div className="space-y-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-sunken">
        {natures.map((n) => (
          <div
            key={n.nature}
            style={{ width: `${n.share * 100}%`, background: NATURE_BAR_COLOR[n.nature] }}
            title={`${NATURE_LABEL[n.nature]} · ${percent(n.share * 100)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {natures.map((n) => (
          <span key={n.nature} className="flex items-center gap-1.5 text-2xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: NATURE_BAR_COLOR[n.nature] }} />
            {NATURE_LABEL[n.nature]}
            <span className="num font-medium text-ink">{percent(n.share * 100)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
