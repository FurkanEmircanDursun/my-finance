import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Line, ReferenceLine,
} from 'recharts'
import type { DailyPoint } from '../../types/finance'
import { fmt } from '../../utils/format'

interface DailyTrendLineProps {
  data: DailyPoint[]
}

export default function DailyTrendLine({ data }: DailyTrendLineProps) {
  if (!data || data.length === 0) return null

  const avgTotal = data.reduce((s, d) => s + d.amount, 0) / data.length

  return (
    <div className="card flex flex-col justify-between h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="section-title">Günlük Harcama Trendi</h3>
          <p className="text-xs text-[#737373] mt-0.5">
            Günlük akış ve <span className="text-emerald-400 font-medium">7 günlük hareketli ortalama</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-[#737373]">Günlük Ortalama</p>
          <p className="text-sm font-semibold text-[#ededed] tabular-nums mt-0.5">₺{fmt(avgTotal)}</p>
        </div>
      </div>

      <div className="w-full h-[220px] sm:h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />

            <XAxis
              dataKey="label"
              tick={{ fill: '#737373', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#262626' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v) => `₺${fmt(v)}`}
              tick={{ fill: '#737373', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={55}
            />

            <Tooltip
              contentStyle={{
                background: '#171717',
                border: '1px solid #262626',
                borderRadius: 8,
                fontSize: 12,
                color: '#ededed',
              }}
              formatter={(v: number, name: string) => [
                `₺${fmt(v)}`,
                name === 'amount' ? 'Harcama' : '7G Ortalama',
              ]}
              labelStyle={{ color: '#ededed', fontWeight: 600, marginBottom: 4 }}
            />

            <ReferenceLine
              y={avgTotal}
              stroke="#404040"
              strokeDasharray="4 4"
              label={{ value: 'Ort.', fill: '#737373', fontSize: 10, position: 'right' }}
            />

            <Area
              type="monotone"
              dataKey="amount"
              stroke="#3b82f6"
              strokeWidth={1.5}
              fill="url(#areaGrad)"
              dot={false}
              activeDot={{ r: 4, fill: '#3b82f6', stroke: '#0a0a0a', strokeWidth: 2 }}
            />

            <Line
              type="monotone"
              dataKey="moving_avg"
              stroke="#22c55e"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 pt-3 border-t border-[#1f1f1f] flex items-center justify-between text-xs text-[#737373]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-[#3b82f6] rounded" />
            <span>Günlük Tutar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-[#22c55e] rounded" />
            <span>7G Hareketli Ort.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
