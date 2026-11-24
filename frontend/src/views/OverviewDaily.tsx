import { useId, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fullDayLabel } from '../core/date'
import { count, money2, moneyCompact } from '../core/money'
import { hapticTap } from '../platform/haptics'
import { MoneyValue } from '../ui/MoneyValue'
import { Segmented } from '../ui/primitives'
import { ChartTooltipShell } from '../ui/charts'
import type { overviewSpending } from './overviewSpending'

type Spending = ReturnType<typeof overviewSpending>

export function OverviewDaily({
  days,
  peak,
  privateMode,
  onDay,
  onAnalysis,
  unavailable,
}: {
  days: Spending['days']
  peak: Spending['peak']
  privateMode: boolean
  onDay: (day: string) => void
  onAnalysis?: () => void
  unavailable: string
}) {
  const [mode, setMode] = useState<'daily' | 'cumulative'>('daily')
  const [selected, setSelected] = useState('')
  const [scrubDate, setScrubDate] = useState<string | null>(null)
  const [animate] = useState(
    () =>
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const gradId = useId().replace(/:/g, '')

  const series = useMemo(() => {
    let running = 0
    return days.map((day) => {
      const net = day.net ?? 0
      running += net
      return {
        ...day,
        dayNum: String(Number(day.date.slice(-2))),
        netValue: net,
        cumulative: running,
      }
    })
  }, [days])

  const picked =
    series.find((day) => day.date === (scrubDate ?? selected)) ??
    series.find((day) => day.date === peak?.date) ??
    [...series].reverse().find((day) => day.count > 0)

  const hasData = Boolean(picked)
  const index = picked ? series.indexOf(picked) : -1

  const move = (step: number) => {
    const next = series[index + step]
    if (next) {
      hapticTap()
      setSelected(next.date)
    }
  }

  return (
    <section className="bento-card overview-daily" aria-labelledby="overview-daily">
      <header className="overview-panel-heading">
        <div>
          <h2 id="overview-daily">Günlük harcamalar</h2>
          <p>
            {mode === 'daily'
              ? 'Harcama eksi iade · Taksitler yansıdığı günde'
              : 'Ay boyunca birikimli harcama seyri'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasData && !privateMode && (
            <Segmented
              value={mode}
              onChange={(next) => {
                hapticTap()
                setMode(next)
              }}
              options={[
                { value: 'daily', label: 'Günlük' },
                { value: 'cumulative', label: 'Birikimli' },
              ]}
            />
          )}
          {onAnalysis && (
            <button type="button" className="text-button" onClick={onAnalysis}>
              Analiz <ChevronRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {privateMode ? (
        <p className="mt-6 text-body text-muted">Günlük tutarlar gizli.</p>
      ) : !hasData || !picked ? (
        <div className="mt-5 flex min-h-[180px] flex-col items-start justify-center rounded-[var(--radius)] border border-dashed border-line bg-sunken/50 p-5">
          <TrendingUp size={22} className="mb-2 text-faint" />
          <p className="text-body text-muted">{unavailable}</p>
        </div>
      ) : (
        <>
          <div className="overview-day-selection" aria-live="polite">
            <div className="min-w-0">
              <p>
                {fullDayLabel(picked.date)}
                {picked.date === peak?.date && (
                  <span className="ml-2 inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-text">
                    En yüksek gün
                  </span>
                )}
              </p>
              <strong>
                {mode === 'daily' ? (
                  picked.net === null ? (
                    <span className="num">—</span>
                  ) : (
                    <MoneyValue value={picked.net} duration={260} />
                  )
                ) : (
                  <MoneyValue value={picked.cumulative} duration={260} />
                )}
              </strong>
            </div>
            <div className="overview-day-arrows">
              <button
                type="button"
                disabled={index <= 0}
                aria-label="Önceki gün"
                onClick={() => move(-1)}
              >
                <ChevronLeft size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={index >= series.length - 1}
                aria-label="Sonraki gün"
                onClick={() => move(1)}
              >
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="h-[196px] w-full" aria-label="Günlük harcama grafiği">
            <ResponsiveContainer width="100%" height={196}>
              {mode === 'daily' ? (
                <BarChart
                  data={series}
                  margin={{ top: 8, right: 6, bottom: 0, left: -12 }}
                  onMouseMove={(state) => {
                    const active = state?.activePayload?.[0]?.payload as (typeof series)[number] | undefined
                    if (active?.date) setScrubDate(active.date)
                  }}
                  onMouseLeave={() => setScrubDate(null)}
                  onClick={(state) => {
                    const active = state?.activePayload?.[0]?.payload as (typeof series)[number] | undefined
                    if (active?.date) {
                      hapticTap()
                      setSelected(active.date)
                    }
                  }}
                >
                  <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
                  <XAxis
                    dataKey="dayNum"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                    minTickGap={16}
                  />
                  <YAxis
                    width={56}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                    tickFormatter={(v: number) => moneyCompact(v)}
                  />
                  <ReferenceLine y={0} stroke="var(--line-strong)" />
                  <Tooltip
                    cursor={{ fill: 'var(--accent-soft)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const row = payload[0].payload as (typeof series)[number]
                      return (
                        <ChartTooltipShell
                          title={fullDayLabel(row.date)}
                          rows={[
                            {
                              label: 'Net harcama',
                              value: row.net === null ? '—' : money2(row.net),
                              color: row.netValue < 0 ? 'var(--positive)' : 'var(--accent)',
                            },
                            { label: 'Kayıt', value: count(row.count) },
                          ]}
                        />
                      )
                    }}
                  />
                  <Bar
                    dataKey="netValue"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={18}
                    isAnimationActive={animate}
                    animationDuration={420}
                  >
                    {series.map((entry) => {
                      const isSelected = entry.date === picked.date
                      const isRefundDay = entry.netValue < 0
                      return (
                        <Cell
                          key={entry.date}
                          cursor="pointer"
                          fill={isRefundDay ? 'var(--positive)' : 'var(--accent)'}
                          fillOpacity={isSelected ? 1 : entry.count > 0 ? 0.48 : 0.14}
                        />
                      )
                    })}
                  </Bar>
                </BarChart>
              ) : (
                <AreaChart
                  data={series}
                  margin={{ top: 8, right: 6, bottom: 0, left: -12 }}
                  onMouseMove={(state) => {
                    const active = state?.activePayload?.[0]?.payload as (typeof series)[number] | undefined
                    if (active?.date) setScrubDate(active.date)
                  }}
                  onMouseLeave={() => setScrubDate(null)}
                >
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.34} />
                      <stop offset="72%" stopColor="var(--accent)" stopOpacity={0.05} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
                  <XAxis
                    dataKey="dayNum"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                    minTickGap={16}
                  />
                  <YAxis
                    width={56}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                    tickFormatter={(v: number) => moneyCompact(v)}
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--accent-border)', strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const row = payload[0].payload as (typeof series)[number]
                      return (
                        <ChartTooltipShell
                          title={fullDayLabel(row.date)}
                          rows={[
                            { label: 'Birikimli', value: money2(row.cumulative), color: 'var(--accent)' },
                            { label: 'O gün', value: row.net === null ? '—' : money2(row.net) },
                          ]}
                        />
                      )
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="var(--accent)"
                    strokeWidth={2.4}
                    fill={`url(#${gradId})`}
                    activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--bg-raised)', strokeWidth: 2 }}
                    isAnimationActive={animate}
                    animationDuration={460}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="overview-day-footer">
            <span>
              {picked.count
                ? `${count(picked.count)} harcama / iade kaydı`
                : 'Seçili günde kayıt yok'}
            </span>
            {picked.count > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={() => onDay(picked.date)}
              >
                Günün işlemleri <ChevronRight size={15} aria-hidden="true" />
              </button>
            )}
          </div>

          <details className="overview-data">
            <summary>Günlük tutar tablosu</summary>
            <div className="max-h-56 overflow-auto">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Gün</th>
                    <th scope="col">Kayıt</th>
                    <th scope="col">Net harcama</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <tr key={day.date}>
                      <th scope="row">{fullDayLabel(day.date)}</th>
                      <td>{count(day.count)}</td>
                      <td className="num">{day.net === null ? '—' : money2(day.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  )
}
