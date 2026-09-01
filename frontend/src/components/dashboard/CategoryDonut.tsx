import { useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector
} from 'recharts'
import type { CategoryTotal, Transaction } from '../../types/finance'
import { fmt } from '../../utils/format'
import TransactionDrawer from './TransactionDrawer'

interface CategoryDonutProps {
  data: CategoryTotal[]
  transactions: Transaction[]
  onUpdateCategory?: (rawLine: string, newCategory: string) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderActiveShape = (props: any) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent, value,
  } = props

  return (
    <g>
      <text x={cx} y={cy - 12} textAnchor="middle" fill="#ededed" fontSize={13} fontWeight={600}>
        {payload.name}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#a3a3a3" fontSize={12} fontWeight={500}>
        ₺{fmt(value)}
      </text>
      <text x={cx} y={cy + 24} textAnchor="middle" fill="#737373" fontSize={11}>
        %{(percent * 100).toFixed(1)}
      </text>
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 4}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  )
}

export default function CategoryDonut({ data, transactions, onUpdateCategory }: CategoryDonutProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const activeCategory = data[activeIndex] || data[0]
  const drawerTxs = selectedCategory
    ? transactions.filter((t) => t.category === selectedCategory && t.amount > 0)
    : []

  if (!data || data.length === 0) return null

  return (
    <>
      <div className="card flex flex-col justify-between h-full">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="section-title">Kategori Dağılımı</h3>
              <p className="text-xs text-[#737373] mt-0.5">Harcamaların kategorilere göre dağılımı</p>
            </div>
            {activeCategory && (
              <span className="text-xs text-[#737373] hidden sm:inline">
                {activeCategory.name}: <strong className="text-[#ededed]">₺{fmt(activeCategory.total)}</strong>
              </span>
            )}
          </div>

          {/* Donut Chart */}
          <div className="w-full h-[220px] sm:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="total"
                  activeIndex={activeIndex}
                  activeShape={renderActiveShape}
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onClick={(entry) => setSelectedCategory(entry.name as string)}
                  className="cursor-pointer outline-none"
                  stroke="#111111"
                  strokeWidth={2}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [`₺${fmt(v)}`, 'Tutar']}
                  contentStyle={{
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#ededed',
                  }}
                  itemStyle={{ color: '#ededed' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Custom Clean Legend List */}
        <div className="mt-4 pt-3 border-t border-[#1f1f1f] grid grid-cols-2 sm:grid-cols-3 gap-2">
          {data.slice(0, 6).map((cat, idx) => (
            <button
              key={cat.name}
              onClick={() => {
                setActiveIndex(idx)
                setSelectedCategory(cat.name)
              }}
              className={`flex items-center justify-between p-1.5 rounded-lg text-left transition-colors ${
                activeIndex === idx ? 'bg-[#171717] border border-[#262626]' : 'hover:bg-[#171717]/60'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-xs text-[#a3a3a3] truncate max-w-[80px] sm:max-w-[100px]">
                  {cat.name}
                </span>
              </div>
              <span className="text-[11px] font-medium text-[#ededed] tabular-nums shrink-0 ml-1">
                %{cat.percentage}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Transaction Detail Drawer */}
      <TransactionDrawer
        isOpen={!!selectedCategory}
        onClose={() => setSelectedCategory(null)}
        category={selectedCategory ?? ''}
        transactions={drawerTxs}
        onUpdateCategory={onUpdateCategory}
      />
    </>
  )
}
