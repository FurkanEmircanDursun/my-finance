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

export function SpendingPulse({ daily }: { daily: DailyPoint[] }) {
  const [mode, setMode] = useState<'daily' | 'cumulative'>('cumulative')
  const [motion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
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
      <div className="pulse-heading">
        <div>
          <h2>Harcama akışın</h2>
          <p>
            {mode === 'daily'
              ? 'Hangi gün, ne kadar?'
              : 'Dönem boyunca biriken net harcama.'}
          </p>
        </div>
        <div className="pulse-toggle" aria-label="Grafik görünümü">
          <button
            aria-pressed={mode === 'daily'}
            onClick={() => setMode('daily')}
          >
            Günlük
          </button>
          <button
            aria-pressed={mode === 'cumulative'}
            onClick={() => setMode('cumulative')}
          >
            Birikimli
          </button>
        </div>
      </div>
      {data.length ? (
        <div className="pulse-chart" aria-label="Harcama grafiği">
          <ResponsiveContainer width="100%" height={190}>
            <Chart data={data} margin={{ left: -8, top: 15, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--accent)"
                    stopOpacity={0.22}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--accent)"
                    stopOpacity={0.01}
                  />
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
                width={62}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                tickFormatter={moneyCompact}
              />
              <Tooltip
                cursor={{ fill: 'var(--bg-sunken)', stroke: 'var(--line)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="pulse-tooltip">
                      <span>{payload[0].payload.label}</span>
                      <strong className="num">
                        {money2(Number(payload[0].value))}
                      </strong>
                    </div>
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
                  strokeWidth={2.5}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={motion}
                  animationDuration={450}
                  animationEasing="ease-out"
                />
              )}
            </Chart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="pulse-empty">
          <span>Her kayıt, resmin bir parçası.</span>
          <p>İlk giderini eklediğinde harcama akışın burada oluşur.</p>
        </div>
      )}
      {data.length > 0 && (
        <details className="chart-data">
          <summary>Grafik verilerini tablo olarak aç</summary>
          <div>
            <table>
              <thead>
                <tr>
                  <th scope="col">Gün</th>
                  <th scope="col">
                    {mode === 'daily' ? 'Net harcama' : 'Birikimli harcama'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((day) => (
                  <tr key={day.date}>
                    <td>{day.label}</td>
                    <td className="num">{money2(day.amount)}</td>
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
