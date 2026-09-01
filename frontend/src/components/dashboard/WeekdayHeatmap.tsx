import { useEffect, useState } from 'react'
import type { WeekdayPoint } from '../../types/finance'
import { fmt } from '../../utils/format'

interface WeekdayHeatmapProps {
  data: WeekdayPoint[]
}

function getBarStyle(ratio: number): string {
  if (ratio >= 0.8) return 'bg-rose-500/80 hover:bg-rose-500'
  if (ratio >= 0.6) return 'bg-amber-500/80 hover:bg-amber-500'
  if (ratio >= 0.4) return 'bg-yellow-500/70 hover:bg-yellow-500'
  if (ratio >= 0.2) return 'bg-emerald-500/60 hover:bg-emerald-500'
  return 'bg-emerald-500/30 hover:bg-emerald-500/50'
}

export default function WeekdayHeatmap({ data }: WeekdayHeatmapProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  if (!data || data.length === 0) return null

  const max = Math.max(...data.map(d => d.total), 1)
  const weekendTotal = data.filter(d => d.dayIndex >= 5).reduce((s, d) => s + d.total, 0)
  const weekdayTotal = data.filter(d => d.dayIndex < 5).reduce((s, d) => s + d.total, 0)
  const peakDay = data.reduce((a, b) => (a.total > b.total ? a : b), data[0])

  return (
    <div className="card flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="section-title">Haftalık Harcama Dağılımı</h3>
          <p className="text-xs text-[#737373] mt-0.5">Haftanın günlerine göre harcama yoğunluğu</p>
        </div>
        {peakDay && peakDay.total > 0 && (
          <span className="text-xs text-[#737373] hidden sm:inline">
            Zirve: <strong className="text-[#ededed]">{peakDay.day}</strong>
          </span>
        )}
      </div>

      {/* Heatmap Bars */}
      <div className="grid grid-cols-7 gap-2 my-auto py-3 items-end h-[140px]">
        {data.map((d) => {
          const ratio = d.total / max
          const heightPercent = max > 0 && d.total > 0 ? Math.max(12, Math.round(ratio * 100)) : 8
          const barColorClass = d.total > 0 ? getBarStyle(ratio) : 'bg-[#1c1c1c]'

          return (
            <div key={d.day} className="flex flex-col items-center gap-2 h-full justify-end group relative">
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-[#171717] border border-[#262626] text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-xl">
                <p className="text-[#ededed] font-medium">{d.day}</p>
                <p className="text-white font-semibold tabular-nums mt-0.5">₺{fmt(d.total)}</p>
                <p className="text-[#737373] text-[11px]">{d.count} işlem</p>
              </div>

              {/* Bar */}
              <div className="w-full flex items-end justify-center h-full">
                <div
                  className={`w-full max-w-[28px] rounded-md transition-all duration-500 ease-out cursor-pointer ${barColorClass}`}
                  style={{
                    height: mounted ? `${heightPercent}%` : '8%',
                  }}
                />
              </div>

              {/* Only Day Name */}
              <span className="text-[11px] font-medium text-[#737373] group-hover:text-[#ededed] transition-colors">
                {d.day.slice(0, 3)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Summary Footer */}
      <div className="mt-4 pt-3 border-t border-[#1f1f1f] grid grid-cols-3 gap-2 text-center">
        <div className="p-1">
          <p className="text-[11px] text-[#737373]">Hafta içi</p>
          <p className="text-xs font-semibold text-[#ededed] tabular-nums mt-0.5">₺{fmt(weekdayTotal)}</p>
        </div>
        <div className="p-1 border-x border-[#1f1f1f]">
          <p className="text-[11px] text-[#737373]">Hafta sonu</p>
          <p className="text-xs font-semibold text-[#ededed] tabular-nums mt-0.5">₺{fmt(weekendTotal)}</p>
        </div>
        <div className="p-1">
          <p className="text-[11px] text-[#737373]">Günlük ort.</p>
          <p className="text-xs font-semibold text-[#ededed] tabular-nums mt-0.5">
            ₺{fmt((weekdayTotal + weekendTotal) / 7)}
          </p>
        </div>
      </div>
    </div>
  )
}
