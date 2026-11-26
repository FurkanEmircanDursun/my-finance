import { useId, useMemo, useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { money, money2, moneyCompact } from '../core/money'
import { hapticTap } from '../platform/haptics'
import type { CommitmentMonth, DailyPoint, MonthlyPoint, WeekdayPoint } from '../analytics/types'
import type { ForecastPoint } from '../analytics/forecast'
import type { GoalPoint } from '../analytics/goal'

const AXIS = {
  stroke: 'transparent',
  tick: { fill: 'var(--text-faint)', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const

function prefersMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function ChartTooltipShell({
  title,
  rows,
}: {
  title?: string
  rows: Array<{ label: string; value: ReactNode; color?: string }>
}) {
  return (
    <div className="mizan-chart-tooltip">
      {title && <p className="mizan-chart-tooltip__title">{title}</p>}
      <div className="mizan-chart-tooltip__rows">
        {rows.map((row) => (
          <div key={row.label} className="mizan-chart-tooltip__row">
            {row.color && (
              <span
                className="mizan-chart-tooltip__dot"
                style={{ background: row.color }}
              />
            )}
            <span className="mizan-chart-tooltip__label">{row.label}</span>
            <span className="mizan-chart-tooltip__value num">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Exploding Active Donut Shape ────────────────────────────────────────── */

interface ActiveSliceProps {
  cx: number
  cy: number
  innerRadius: number
  outerRadius: number
  startAngle: number
  endAngle: number
  fill: string
}

function ActiveDonutSector(props: unknown) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } =
    props as ActiveSliceProps
  return (
    <g>
      {/* Subtle outer halo arc */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 9}
        outerRadius={outerRadius + 12}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        fillOpacity={0.35}
        cornerRadius={4}
      />
      {/* Exploded / scaled active slice */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={Math.max(0, innerRadius - 2)}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="var(--bg-raised)"
        strokeWidth={2.5}
        cornerRadius={6}
      />
    </g>
  )
}

/* ── Interactive Exploding Donut Chart ───────────────────────────────────── */

export interface DonutSlice {
  id: string
  label: string
  value: number
  color: string
}

export function InteractiveDonutChart({
  data,
  height = 228,
  activeId,
  onSelect,
  totalLabel = 'Toplam',
  totalValue,
  privateMode = false,
}: {
  data: DonutSlice[]
  height?: number
  activeId?: string | null
  onSelect?: (id: string | null) => void
  totalLabel?: string
  /** Optional explicit denominator / center total (e.g. monthly income in 50/30/20). */
  totalValue?: number
  privateMode?: boolean
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [localActiveId, setLocalActiveId] = useState<string | null>(null)
  const [animate] = useState(prefersMotion)

  const sliceTotal = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data])
  const total = totalValue ?? sliceTotal
  const controlled = activeId !== undefined
  const selectedId = controlled ? activeId : localActiveId
  const focusedId = hoveredId ?? selectedId
  const activeIndex = useMemo(
    () => (focusedId ? data.findIndex((d) => d.id === focusedId) : -1),
    [data, focusedId],
  )
  const activeSlice = activeIndex >= 0 ? data[activeIndex] : null

  const handleClick = (sliceId: string) => {
    hapticTap()
    const next = selectedId === sliceId ? null : sliceId
    if (!controlled) setLocalActiveId(next)
    onSelect?.(next)
  }

  const shareText = activeSlice && total > 0
    ? (() => {
        const pct = (activeSlice.value / total) * 100
        return pct < 0.1
          ? '<%0,1'
          : `%${pct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`
      })()
    : null

  return (
    <div className="mizan-donut" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="64%"
            outerRadius="85%"
            paddingAngle={data.length > 1 ? 2.5 : 0}
            cornerRadius={5}
            stroke="var(--bg-raised)"
            strokeWidth={2}
            activeIndex={activeIndex >= 0 ? activeIndex : undefined}
            activeShape={ActiveDonutSector}
            isAnimationActive={animate}
            animationDuration={560}
            animationEasing="ease-out"
            onMouseEnter={(_entry, index) => {
              const target = data[index]
              if (target) setHoveredId(target.id)
            }}
            onMouseLeave={() => setHoveredId(null)}
            onClick={(_entry, index) => {
              const target = data[index]
              if (target) handleClick(target.id)
            }}
          >
            {data.map((slice) => (
              <Cell
                key={slice.id}
                fill={slice.color}
                fillOpacity={!focusedId || focusedId === slice.id ? 1 : 0.28}
                cursor="pointer"
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Dynamic Center Readout */}
      <div
        key={activeSlice?.id ?? 'total'}
        className="mizan-donut__center"
        aria-live="polite"
      >
        <span className="mizan-donut__center-label">
          {activeSlice ? activeSlice.label : totalLabel}
        </span>
        <span className="mizan-donut__center-value num">
          {privateMode ? '—' : money2(activeSlice ? activeSlice.value : total)}
        </span>
        {shareText && !privateMode && (
          <span className="mizan-donut__center-share num">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: activeSlice?.color }}
            />
            {shareText}
          </span>
        )}
      </div>
    </div>
  )
}

/** Backwards-compatible alias for CategoryDonut consumers. */
export function CategoryDonut({
  data,
  height = 216,
  activeId,
  onSelect,
}: {
  data: DonutSlice[]
  height?: number
  activeId?: string | null
  onSelect?: (id: string) => void
}) {
  return (
    <InteractiveDonutChart
      data={data}
      height={height}
      activeId={activeId}
      onSelect={(id) => {
        if (id) onSelect?.(id)
      }}
    />
  )
}

/* ── Daily Spend Area Chart ──────────────────────────────────────────────── */

export function DailySpendChart({ data, height = 210 }: { data: DailyPoint[]; height?: number }) {
  const gradId = useId().replace(/:/g, '')
  const [animate] = useState(prefersMotion)
  const step = data.length > 400 ? Math.ceil(data.length / 400) : 1
  const series = step === 1 ? data : data.filter((_, i) => i % step === 0)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 8, right: 6, bottom: 0, left: -6 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.32} />
            <stop offset="68%" stopColor="var(--accent)" stopOpacity={0.05} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
        <XAxis dataKey="label" {...AXIS} minTickGap={28} />
        <YAxis {...AXIS} width={54} tickFormatter={(v: number) => moneyCompact(v)} />
        <Tooltip
          cursor={{ stroke: 'var(--accent-border)', strokeWidth: 1.5, strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as DailyPoint
            return (
              <ChartTooltipShell
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
          strokeWidth={2.2}
          fill={`url(#${gradId})`}
          activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--bg-raised)', strokeWidth: 2 }}
          isAnimationActive={animate}
          animationDuration={500}
        />
        <Line
          type="monotone"
          dataKey="trend"
          stroke="var(--text-faint)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ── Monthly Cash Flow Chart ─────────────────────────────────────────────── */

export function MonthlyFlowChart({
  data,
  height = 230,
  showIncome = false,
}: {
  data: MonthlyPoint[]
  height?: number
  showIncome?: boolean
}) {
  const gradId = useId().replace(/:/g, '')
  const [animate] = useState(prefersMotion)
  const hasIncome = showIncome && data.some((d) => d.income > 0)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 6, bottom: 0, left: -6 }} barCategoryGap="28%">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.95} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.45} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={54} tickFormatter={(v: number) => moneyCompact(v)} />
        <Tooltip
          cursor={{ fill: 'var(--accent-soft)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as MonthlyPoint
            return (
              <ChartTooltipShell
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
        <Bar dataKey="spend" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={animate} animationDuration={480}>
          {data.map((point) => (
            <Cell
              key={point.month}
              fill={`url(#${gradId})`}
              fillOpacity={point.partial ? 0.45 : 1}
            />
          ))}
        </Bar>
        {hasIncome && (
          <Line
            type="monotone"
            dataKey="income"
            stroke="var(--positive)"
            strokeWidth={2.2}
            dot={{ r: 3, fill: 'var(--positive)', stroke: 'var(--bg-raised)', strokeWidth: 1.5 }}
            activeDot={{ r: 5, fill: 'var(--positive)', stroke: 'var(--bg-raised)', strokeWidth: 2 }}
            isAnimationActive={animate}
            animationDuration={540}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ── Commitments Ladder ──────────────────────────────────────────────────── */

export function CommitmentChart({ data, height = 220 }: { data: CommitmentMonth[]; height?: number }) {
  const [animate] = useState(prefersMotion)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 6, bottom: 0, left: -6 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={54} tickFormatter={(v: number) => moneyCompact(v)} />
        <Tooltip
          cursor={{ fill: 'var(--accent-soft)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as CommitmentMonth
            return (
              <ChartTooltipShell
                title={point.label}
                rows={[
                  { label: 'Taksit', value: money(point.installments), color: 'var(--accent)' },
                  { label: 'Düzenli ödeme', value: money(point.recurring), color: 'var(--gold)' },
                  { label: 'Toplam', value: money(point.total) },
                ]}
              />
            )
          }}
        />
        <Bar dataKey="installments" stackId="c" fill="var(--accent)" maxBarSize={42} isAnimationActive={animate} animationDuration={460} />
        <Bar dataKey="recurring" stackId="c" fill="var(--gold)" radius={[6, 6, 0, 0]} maxBarSize={42} isAnimationActive={animate} animationDuration={520} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ── Weekday Profile ─────────────────────────────────────────────────────── */

export function WeekdayChart({ data, height = 170 }: { data: WeekdayPoint[]; height?: number }) {
  const [animate] = useState(prefersMotion)
  const max = Math.max(...data.map((d) => d.total), 1)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -6 }} barCategoryGap="26%">
        <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
        <XAxis dataKey="short" {...AXIS} />
        <YAxis {...AXIS} width={54} tickFormatter={(v: number) => moneyCompact(v)} />
        <Tooltip
          cursor={{ fill: 'var(--accent-soft)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as WeekdayPoint
            return (
              <ChartTooltipShell
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
        <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={animate} animationDuration={460}>
          {data.map((point) => (
            <Cell
              key={point.index}
              fill={point.index >= 5 ? 'var(--gold)' : 'var(--accent)'}
              fillOpacity={0.38 + 0.62 * (point.total / max)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ── Cash-Flow Forecast ──────────────────────────────────────────────────── */

export function CashFlowChart({
  points,
  height = 230,
  negative,
}: {
  points: ForecastPoint[]
  height?: number
  negative: boolean
}) {
  const gradId = useId().replace(/:/g, '')
  const [animate] = useState(prefersMotion)
  const tone = negative ? 'var(--negative)' : 'var(--positive)'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 10, right: 6, bottom: 0, left: -6 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity={0.30} />
            <stop offset="72%" stopColor={tone} stopOpacity={0.04} />
            <stop offset="100%" stopColor={tone} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
        <XAxis dataKey="label" {...AXIS} minTickGap={28} />
        <YAxis {...AXIS} width={56} tickFormatter={(v: number) => moneyCompact(v)} />
        <ReferenceLine y={0} stroke="var(--line-strong)" strokeDasharray="4 4" />
        <Tooltip
          cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as ForecastPoint
            return (
              <ChartTooltipShell
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
          strokeWidth={2.4}
          fill={`url(#${gradId})`}
          activeDot={{ r: 5, fill: tone, stroke: 'var(--bg-raised)', strokeWidth: 2 }}
          isAnimationActive={animate}
          animationDuration={520}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ── Savings Goal Trajectory ─────────────────────────────────────────────── */

export function GoalTrajectoryChart({
  points,
  height = 230,
  onPace,
}: {
  points: GoalPoint[]
  height?: number
  onPace: boolean
}) {
  const [animate] = useState(prefersMotion)
  const actualTone = onPace ? 'var(--positive)' : 'var(--negative)'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={points} margin={{ top: 10, right: 6, bottom: 0, left: -6 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={56} tickFormatter={(v: number) => moneyCompact(v)} />
        <Tooltip
          cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as GoalPoint
            return (
              <ChartTooltipShell
                title={point.label}
                rows={[
                  { label: 'Gereken birikim', value: money(point.required), color: 'var(--text-faint)' },
                  ...(point.actual !== null
                    ? [{ label: 'Gerçekleşen', value: money(point.actual), color: actualTone }]
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
          strokeWidth={1.6}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke={actualTone}
          strokeWidth={2.5}
          dot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--bg-raised)', fill: actualTone }}
          activeDot={{ r: 5.5, fill: actualTone, stroke: 'var(--bg-raised)', strokeWidth: 2 }}
          connectNulls={false}
          isAnimationActive={animate}
          animationDuration={540}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
