import type { FinancialProfile, Summary } from '../../types/finance'
import { fmt } from '../../utils/format'

interface BudgetProgressProps {
  profile: FinancialProfile
  summary: Summary
  totalIncome: number
}

export default function BudgetProgress({ profile, summary, totalIncome }: BudgetProgressProps) {
  // Total spending excludes income lines (which are handled separately or negative in logic)
  const spending = summary.total_spending

  const limit = profile.spendingLimit || 0
  const savingsGoal = profile.savingsGoal || 0
  const income = totalIncome || profile.monthlyIncome || 0

  const hasLimit = limit > 0
  
  const limitPct = hasLimit ? Math.min(100, (spending / limit) * 100) : 0
  
  let limitColor = 'bg-emerald-500'
  if (limitPct > 75) limitColor = 'bg-yellow-500'
  if (limitPct > 90) limitColor = 'bg-red-500'

  return (
    <div className="card mb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        
        {/* Budget Section */}
        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#a1a1aa]">Aylık Bütçe Kullanımı</h3>
            <span className="text-sm font-medium text-[#ededed]">
              {fmt(spending)} TL {hasLimit && <span className="text-[#52525b]">/ {fmt(limit)} TL</span>}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#262626]">
            {hasLimit ? (
              <div
                className={`h-full rounded-full transition-all duration-1000 ${limitColor}`}
                style={{ width: `${limitPct}%` }}
              />
            ) : (
              <div className="h-full rounded-full bg-[#52525b] w-full opacity-20" />
            )}
          </div>
          {hasLimit && (
            <div className="mt-2 text-xs text-[#a1a1aa] text-right">
              %{limitPct.toFixed(1)} kullanıldı
            </div>
          )}
        </div>

        {/* Financial Overview Section */}
        <div className="flex flex-1 gap-4 border-l border-[#262626] pl-6">
          <div className="flex-1">
            <h3 className="text-xs font-medium text-[#a1a1aa] mb-1">Toplam Gelir (Maaş + Ek)</h3>
            <p className="text-lg font-medium text-emerald-400">{fmt(income)} TL</p>
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-medium text-[#a1a1aa] mb-1">Net Durum (Gelir - Gider)</h3>
            <p className={`text-lg font-medium ${income - spending >= 0 ? 'text-[#ededed]' : 'text-red-400'}`}>
              {fmt(income - spending)} TL
            </p>
          </div>
          {savingsGoal > 0 && (
            <div className="flex-1">
              <h3 className="text-xs font-medium text-[#a1a1aa] mb-1">Tasarruf Hedefi</h3>
              <p className="text-lg font-medium text-[#ededed]">{fmt(savingsGoal)} TL</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
