import { useId, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DailyPoint } from '../analytics/types'
import { money2, moneyCompact } from '../core/money'
import { hapticTap } from '../platform/haptics'
import { Segmented } from './primitives'
import { ChartTooltipShell } from './charts'

export function SpendingPulse({ daily }: { daily: DailyPoint[] }) {
  const [mode, setMode] = useState<'daily' | 'cumulative'>('cumulative')
  const [motion] = useState(
    () =>
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const gradientId = useId().replace(/:/g, '')

  const data = useMemo(() => {
    let total = 0
    return daily.map((day) => ({
      ...day,
      amount: mode === 'daily' ? day.amount : (total += day.amount),
    }))
  }, [daily, mode])

  const Chart = mode === 'daily' ? BarChart : AreaChart

  return (
    <div className="spending-pulse">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-title font-semibold text-ink">Harcama akışın</h2>
          <p className="mt-0.5 text-label text-muted">
            {mode === 'daily'
              ? 'Hangi gün, ne kadar?'
              : 'Dönem boyunca biriken net harcama.'}
          </p>
        </div>
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
      </div>

      {data.length ? (
        <div className="pulse-chart" aria-label="Harcama grafiği">
          <ResponsiveContainer width="100%" height={205}>
            <Chart data={data} margin={{ left: -8, top: 12, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.32} />
                  <stop offset="72%" stopColor="var(--accent)" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                minTickGap={28}
              />
              <YAxis
                width={58}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                tickFormatter={moneyCompact}
              />
              <Tooltip
                cursor={{ fill: 'var(--accent-soft)', stroke: 'var(--accent-border)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <ChartTooltipShell
                      title={payload[0].payload.label}
                      rows={[
                        {
                          label: mode === 'daily' ? 'Günlük' : 'Birikimli',
                          value: money2(Number(payload[0].value)),
                          color: 'var(--accent)',
                        },
                      ]}
                    />
                  ) : null
                }
              />
              {mode === 'daily' ? (
                <Bar
                  dataKey="amount"
                  fill="var(--accent)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={motion}
                  animationDuration={450}
                  animationEasing="ease-out"
                />
              ) : (
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="var(--accent)"
                  strokeWidth={2.4}
                  fill={`url(#${gradientId})`}
                  activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--bg-raised)', strokeWidth: 2 }}
                  isAnimationActive={motion}
                  animationDuration={450}
                  animationEasing="ease-out"
                />
              )}
            </Chart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex min-h-[180px] flex-col items-start justify-center rounded-[var(--radius)] border border-dashed border-line bg-sunken/50 p-6">
          <span className="text-title font-semibold text-ink">Her kayıt, resmin bir parçası.</span>
          <p className="mt-1.5 max-w-sm text-label text-muted">
            İlk giderini eklediğinde harcama akışın burada oluşur.
          </p>
        </div>
      )}

      {data.length > 0 && (
        <details className="mt-3 border-t border-line pt-2">
          <summary className="cursor-pointer py-2 text-label font-medium text-muted">
            Grafik verilerini tablo olarak aç
          </summary>
          <div className="max-h-52 overflow-auto">
            <table className="w-full border-collapse text-label">
              <thead>
                <tr className="border-b border-line text-left text-faint">
                  <th scope="col" className="py-2">Gün</th>
                  <th scope="col" className="py-2 text-right">
                    {mode === 'daily' ? 'Net harcama' : 'Birikimli harcama'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((day) => (
                  <tr key={day.date} className="border-b border-line/60">
                    <td className="py-2 text-muted">{day.label}</td>
                    <td className="num py-2 text-right font-semibold text-ink">{money2(day.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
