import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { InstallmentMonth } from '../../types/finance'
import { fmt } from '../../utils/format'

interface InstallmentProjectionProps {
  data: InstallmentMonth[]
}

const CATEGORY_COLORS: Record<string, string> = {
  'E-Ticaret':         '#3b82f6',
  'Sağlık':            '#ec4899',
  'Ulaşım & Araç':     '#eab308',
  'Market':            '#22c55e',
  'Yeme & İçme':       '#f97316',
  'Diğer':             '#737373',
  'Abonelik':          '#8b5cf6',
  'Fatura & Telekom':  '#06b6d4',
  'Eğitim & Kitap':    '#14b8a6',
  'Finans & Cüzdan':   '#f59e0b',
}

export default function InstallmentProjection({ data }: InstallmentProjectionProps) {
  if (!data || data.length === 0) return null

  const hasData = data.some(d => d.total > 0)
  if (!hasData) return null

  const allCategories = Array.from(
    new Set(data.flatMap(d => Object.keys(d.breakdown || {})))
  )

  const totalUpcoming = data.reduce((s, d) => s + d.total, 0)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="section-title">Taksit Projeksiyonu</h3>
          <p className="text-xs text-[#737373] mt-0.5">Gelecek aylardaki taksit ödeme yükü</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-[#737373]">Toplam Taksit Yükü</p>
          <p className="text-sm font-bold text-[#ededed] tabular-nums mt-0.5">₺{fmt(totalUpcoming)}</p>
        </div>
      </div>

      <div className="w-full h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#737373', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#262626' }}
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
              formatter={(v: number, name: string) => [`₺${fmt(v)}`, name]}
              labelStyle={{ color: '#ededed', fontWeight: 600, marginBottom: 4 }}
            />
            <Legend
              formatter={(value) => (
                <span className="text-xs text-[#a3a3a3] mr-2">{value}</span>
              )}
              iconSize={8}
            />

            {allCategories.map((cat) => (
              <Bar
                key={cat}
                dataKey={`breakdown.${cat}`}
                name={cat}
                stackId="a"
                fill={CATEGORY_COLORS[cat] ?? '#737373'}
                radius={[0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
