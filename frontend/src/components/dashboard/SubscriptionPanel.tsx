import { Calendar, AlertCircle } from 'lucide-react'
import type { Subscription } from '../../types/finance'
import { fmt, fmt2 } from '../../utils/format'

interface SubscriptionPanelProps {
  subscriptions: Subscription[]
}

const CATEGORY_COLORS: Record<string, string> = {
  'Abonelik':         'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'Eğitim & Kitap':   'text-teal-400 bg-teal-500/10 border-teal-500/20',
  'Yeme & İçme':      'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'Fatura & Telekom': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'Diğer':            'text-neutral-400 bg-neutral-500/10 border-neutral-500/20',
}

export default function SubscriptionPanel({ subscriptions }: SubscriptionPanelProps) {
  if (!subscriptions || subscriptions.length === 0) return null

  const totalMonthly = subscriptions.reduce((s, sub) => s + sub.monthly_amount, 0)
  const totalAnnual = totalMonthly * 12

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="section-title">Tekrarlayan Ödemeler & Abonelikler</h3>
          <p className="text-xs text-[#737373] mt-0.5">{subscriptions.length} aktif düzenli ödeme tespit edildi</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-[#737373]">Aylık Toplam</p>
          <p className="text-sm font-bold text-[#ededed] tabular-nums mt-0.5">
            ₺{fmt2(totalMonthly)}
            <span className="text-[11px] font-normal text-[#737373]">/ay</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {subscriptions.map((sub) => {
          const badgeClass = CATEGORY_COLORS[sub.category] || CATEGORY_COLORS['Diğer']
          const initials = sub.merchant.slice(0, 2).toUpperCase()

          return (
            <div
              key={sub.merchant}
              className="p-3 rounded-xl bg-[#171717] border border-[#262626] hover:border-[#333333] transition-colors flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#222222] border border-[#2e2e2e] flex items-center justify-center text-xs font-bold text-[#ededed] shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#ededed] truncate">{sub.merchant}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`px-1.5 py-0.2 rounded border text-[10px] ${badgeClass}`}>
                      {sub.category}
                    </span>
                    <span className="text-[11px] text-[#737373] flex items-center gap-1">
                      <Calendar size={10} />
                      {sub.payment_count} ödeme
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-[#ededed] tabular-nums">
                  ₺{fmt2(sub.monthly_amount)}
                  <span className="text-[10px] text-[#737373] font-normal">/ay</span>
                </p>
                <p className="text-[11px] text-[#525252] mt-0.5">
                  ₺{fmt(sub.annual_cost)}/yıl
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {totalAnnual > 5000 && (
        <div className="mt-3.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
          <AlertCircle size={14} className="shrink-0 text-amber-400" />
          <span>
            Yıllık tahmini abonelik maliyetiniz <strong>₺{fmt(totalAnnual)}</strong> seviyesindedir.
          </span>
        </div>
      )}
    </div>
  )
}
