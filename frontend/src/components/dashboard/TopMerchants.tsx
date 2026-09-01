import type { Merchant } from '../../types/finance'
import { fmt } from '../../utils/format'

interface TopMerchantsProps {
  data: Merchant[]
}

const CATEGORY_COLORS: Record<string, string> = {
  'Market':           '#22c55e',
  'Yeme & İçme':      '#f97316',
  'Abonelik':         '#8b5cf6',
  'E-Ticaret':        '#3b82f6',
  'Fatura & Telekom': '#06b6d4',
  'Ulaşım & Araç':    '#eab308',
  'Sağlık':           '#ec4899',
  'Eğitim & Kitap':   '#14b8a6',
  'Finans & Cüzdan':  '#f59e0b',
  'Diğer':            '#737373',
}

export default function TopMerchants({ data }: TopMerchantsProps) {
  if (!data || data.length === 0) return null

  const maxTotal = Math.max(...data.map(d => d.total), 1)

  return (
    <div className="card flex flex-col justify-between h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="section-title">Top 10 İşyeri</h3>
          <p className="text-xs text-[#737373] mt-0.5">En çok harcama yapılan yerler</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {data.map((merchant, index) => {
          const percentage = Math.max(3, (merchant.total / maxTotal) * 100)
          const barColor = CATEGORY_COLORS[merchant.category] || '#3b82f6'

          return (
            <div
              key={merchant.name}
              className="group flex flex-col gap-1 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                {/* Left: Rank & Merchant Name */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[11px] font-mono text-[#525252] w-5 shrink-0 text-right">
                    #{index + 1}
                  </span>
                  <span
                    className="font-medium text-[#ededed] truncate group-hover:text-white transition-colors"
                    title={merchant.name}
                  >
                    {merchant.name}
                  </span>
                  <span className="text-[10px] text-[#525252] hidden sm:inline shrink-0">
                    ({merchant.category})
                  </span>
                </div>

                {/* Right: Amount & Count */}
                <div className="flex items-center gap-2.5 shrink-0 text-right">
                  <span className="font-semibold text-[#ededed] tabular-nums">
                    ₺{fmt(merchant.total)}
                  </span>
                  <span className="text-[11px] text-[#525252] w-14 text-right">
                    {merchant.count} işl.
                  </span>
                </div>
              </div>

              {/* Pure CSS Progress Bar */}
              <div className="w-full bg-[#1c1c1c] h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: barColor,
                    opacity: 0.85,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
