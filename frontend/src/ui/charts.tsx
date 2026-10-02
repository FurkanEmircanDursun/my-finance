import { useMemo, type ReactNode } from 'react'
import {
  Area, AreaChart, Bar, BarChart, Cell, ComposedChart, Line, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { money, moneyCompact } from '../core/money'
import type { CommitmentMonth, DailyPoint, MonthlyPoint, WeekdayPoint } from '../analytics/types'
import type { ForecastPoint } from '../analytics/forecast'
import type { GoalPoint } from '../analytics/goal'

/**
 * Thin wrappers over Recharts.
 *
 * Every chart in the product shares one axis style, one tooltip and one colour
 * source, so a chart never re-declares presentation. Series colours come from
 * the category definitions or from the CSS variables, never from a literal.
 */

/*
 * The tick colour is set here, as a prop, not in the stylesheet. Recharts writes
 * `fill="transparent"` onto each tick label (it reads the axis `stroke`), and a
 * presentation attribute outranks anything in a CSS `@layer` — so the rule in
 * index.css that was meant to colour them never applied, and every chart in the
 * app drew without a single axis label.
 */
const AXIS = {
  stroke: 'transparent',
  tick: { fill: 'var(--text-faint)', fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const

function TooltipShell({ title, rows }: { title: string; rows: Array<{ label: string; value: ReactNode; color?: string }> }) {
  return (
    <div className="rounded border border-line bg-raised px-2.5 py-2 shadow-overlay">
      <p className="mb-1 text-label font-semibold text-ink">{title}</p>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-label">
            {row.color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: row.color }} />}
            <span className="text-muted">{row.label}</span>
            <span className="num ml-auto font-semibold text-ink">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Daily spend ─────────────────────────────────────────────────────────── */

export function DailySpendChart({ data, height = 200 }: { data: DailyPoint[]; height?: number }) {
  // Long ranges get thinned so the SVG stays under a few hundred nodes.
  const step = data.length > 400 ? Math.ceil(data.length / 400) : 1
  const series = step === 1 ? data : data.filter((_, i) => i % step === 0)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" {...AXIS} minTickGap={28} />
        <YAxis {...AXIS} width={52} tickFormatter={(v: number) => moneyCompact(v)} />
        <Tooltip
          cursor={{ stroke: 'var(--line-strong)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as DailyPoint
            return (
              <TooltipShell
                title={point.label}
                rows={[
                  { label: 'Harcama', value: money(point.amount, { decimals: true }), color: 'var(--accent)' },
                  { label: '7 günlük ortalama', value: money(point.trend), color: 'var(--text-faint)' },
                ]}
              />
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="var(--accent)"
          strokeWidth={1.5}
          fill="url(#spendFill)"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="trend"
          stroke="var(--text-faint)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ── Monthly cash flow ───────────────────────────────────────────────────── */

export function MonthlyFlowChart({
  data,
  height = 220,
  showIncome = false,
}: {
  data: MonthlyPoint[]
  height?: number
  /** Overlays a line for income — off by default since not every screen needs it. */
  showIncome?: boolean
}) {
  const hasIncome = showIncome && data.some((d) => d.income > 0)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={52} tickFormatter={(v: number) => moneyCompact(v)} />
        <Tooltip
          cursor={{ fill: 'var(--bg-hover)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as MonthlyPoint
            return (
              <TooltipShell
                title={point.label + (point.partial ? ' (kısmi dönem)' : '')}
                rows={[
                  { label: 'Harcama', value: money(point.spend), color: 'var(--accent)' },
                  ...(hasIncome ? [{ label: 'Gelir', value: money(point.income), color: 'var(--positive)' }] : []),
                  { label: 'İade', value: money(point.refunds), color: 'var(--positive)' },
                  { label: 'İşlem', value: point.count },
                ]}
              />
            )
          }}
        />
        <Bar dataKey="spend" radius={[3, 3, 0, 0]} maxBarSize={64} isAnimationActive={false}>
          {data.map((point) => (
            <Cell
              key={point.month}
              fill="var(--accent)"
              fillOpacity={point.partial ? 0.4 : 1}
            />
          ))}
        </Bar>
        {hasIncome && (
          <Line
            type="monotone"
            dataKey="income"
            stroke="var(--positive)"
            strokeWidth={1.5}
            dot={{ r: 2.5, fill: 'var(--positive)', strokeWidth: 0 }}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ── Category donut ──────────────────────────────────────────────────────── */

export interface DonutSlice {
  id: string
  label: string
  value: number
  color: string
}

export function CategoryDonut({
  data,
  height = 180,
  activeId,
  onSelect,
}: {
  data: DonutSlice[]
  height?: number
  activeId?: string | null
  onSelect?: (id: string) => void
}) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data])

  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="94%"
            paddingAngle={1}
            stroke="var(--bg-raised)"
            strokeWidth={2}
            isAnimationActive={false}
            onClick={(slice: any) => onSelect?.(slice?.payload?.id)}
          >
            {data.map((slice) => (
              <Cell
                key={slice.id}
                fill={slice.color}
                fillOpacity={!activeId || activeId === slice.id ? 1 : 0.28}
                cursor={onSelect ? 'pointer' : undefined}
              />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const slice = payload[0].payload as DonutSlice
              return (
                <TooltipShell
                  title={slice.label}
                  rows={[
                    { label: 'Tutar', value: money(slice.value), color: slice.color },
                    { label: 'Pay', value: `%${((slice.value / total) * 100).toFixed(1)}`, color: undefined },
                  ]}
                />
              )
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-label text-faint">Toplam</span>
        <span className="num text-title font-semibold text-ink">{money(total)}</span>
      </div>
    </div>
  )
}

/* ── Commitments ladder ──────────────────────────────────────────────────── */

export function CommitmentChart({ data, height = 200 }: { data: CommitmentMonth[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={52} tickFormatter={(v: number) => moneyCompact(v)} />
        <Tooltip
          cursor={{ fill: 'var(--bg-hover)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as CommitmentMonth
            return (
              <TooltipShell
                title={point.label}
                rows={[
                  { label: 'Taksit', value: money(point.installments), color: 'var(--accent)' },
                  { label: 'Düzenli ödeme', value: money(point.recurring), color: 'var(--warning)' },
                  { label: 'Toplam', value: money(point.total) },
                ]}
              />
            )
          }}
        />
        <Bar dataKey="installments" stackId="c" fill="var(--accent)" maxBarSize={48} isAnimationActive={false} />
        <Bar dataKey="recurring" stackId="c" fill="var(--warning)" radius={[3, 3, 0, 0]} maxBarSize={48} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ── Weekday profile ─────────────────────────────────────────────────────── */

export function WeekdayChart({ data, height = 160 }: { data: WeekdayPoint[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.total), 1)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="26%">
        <XAxis dataKey="short" {...AXIS} />
        <YAxis {...AXIS} width={52} tickFormatter={(v: number) => moneyCompact(v)} />
        <Tooltip
          cursor={{ fill: 'var(--bg-hover)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as WeekdayPoint
            return (
              <TooltipShell
                title={point.label}
                rows={[
                  { label: 'Toplam', value: money(point.total), color: 'var(--accent)' },
                  { label: 'İşlem', value: point.count },
                  { label: 'Ortalama', value: money(point.average) },
                ]}
              />
            )
          }}
        />
        <Bar dataKey="total" radius={[3, 3, 0, 0]} maxBarSize={56} isAnimationActive={false}>
          {data.map((point) => (
            <Cell
              key={point.index}
              fill={point.index >= 5 ? 'var(--warning)' : 'var(--accent)'}
              fillOpacity={0.35 + 0.65 * (point.total / max)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ── Cash-flow forecast ───────────────────────────────────────────────────── */

export function CashFlowChart({
  points,
  height = 220,
  negative,
}: {
  points: ForecastPoint[]
  height?: number
  /** Red when the projection dips below zero at any point in the window, green otherwise. */
  negative: boolean
}) {
  const tone = negative ? 'var(--negative)' : 'var(--positive)'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="cashFlowFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity={0.22} />
            <stop offset="100%" stopColor={tone} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" {...AXIS} minTickGap={28} />
        <YAxis {...AXIS} width={52} tickFormatter={(v: number) => moneyCompact(v)} />
        <ReferenceLine y={0} stroke="var(--line-strong)" strokeDasharray="3 3" />
        <Tooltip
          cursor={{ stroke: 'var(--line-strong)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as ForecastPoint
            return (
              <TooltipShell
                title={point.label}
                rows={[
                  { label: 'Bakiye', value: money(point.balance), color: tone },
                  { label: 'Beklenen gelir', value: money(point.in), color: 'var(--positive)' },
                  { label: 'Beklenen gider', value: money(point.out), color: 'var(--accent)' },
                ]}
              />
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="balance"
          stroke={tone}
          strokeWidth={1.5}
          fill="url(#cashFlowFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ── Savings goal trajectory ─────────────────────────────────────────────── */

/**
 * Two lines: the straight-line pace a goal needs (dashed, always drawn in
 * full) and what was actually saved (solid, stops at the current month —
 * `null` after that point breaks the line rather than drawing a fake zero).
 */
export function GoalTrajectoryChart({
  points,
  height = 220,
  onPace,
}: {
  points: GoalPoint[]
  height?: number
  /** Colours the actual line — green while ahead of pace, red while behind. */
  onPace: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={52} tickFormatter={(v: number) => moneyCompact(v)} />
        <Tooltip
          cursor={{ stroke: 'var(--line-strong)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as GoalPoint
            return (
              <TooltipShell
                title={point.label}
                rows={[
                  { label: 'Gereken birikim', value: money(point.required), color: 'var(--text-faint)' },
                  ...(point.actual !== null
                    ? [{ label: 'Gerçekleşen', value: money(point.actual), color: onPace ? 'var(--positive)' : 'var(--negative)' }]
                    : []),
                ]}
              />
            )
          }}
        />
        <Line
          type="monotone"
          dataKey="required"
          stroke="var(--text-faint)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke={onPace ? 'var(--positive)' : 'var(--negative)'}
          strokeWidth={2}
          dot={{ r: 2.5, strokeWidth: 0, fill: onPace ? 'var(--positive)' : 'var(--negative)' }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
