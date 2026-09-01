import { useState, useMemo } from 'react'
import {
  Plus, RefreshCw, AlertTriangle, FileText,
  Calendar, Check, ChevronDown, Activity, X, Target, Wallet
} from 'lucide-react'
import type { AnalysisResult, Transaction } from '../types/finance'
import type { UploadedFile } from '../App'
import { analyzeTransactions } from '../parsers/analyzer'
import { fmt2, parseDate, formatMonthYear } from '../utils/format'
import AnimatedNumber from '../components/ui/AnimatedNumber'
import CategoryDonut from '../components/dashboard/CategoryDonut'
import DailyTrendLine from '../components/dashboard/DailyTrendLine'
import InstallmentProjection from '../components/dashboard/InstallmentProjection'
import SubscriptionPanel from '../components/dashboard/SubscriptionPanel'
import WeekdayHeatmap from '../components/dashboard/WeekdayHeatmap'
import TopMerchants from '../components/dashboard/TopMerchants'
import TransactionDrawer from '../components/dashboard/TransactionDrawer'
import BudgetProgress from '../components/dashboard/BudgetProgress'
import GoalsModal from '../components/dashboard/GoalsModal'
import TransactionModal from '../components/dashboard/TransactionModal'
import type { FinancialProfile } from '../types/finance'

interface DashboardPageProps {
  transactions: Transaction[]
  analysis: AnalysisResult
  uploadedFiles: UploadedFile[]
  profile: FinancialProfile
  onReset: () => void
  onAddMore: () => void
  onUpdateCategory: (rawLineOrKey: string, newCategory: string) => void
  onUpdateProfile: (profile: FinancialProfile) => void
  onAddManualTransaction: (t: Transaction) => void
}

const BANK_BADGES: Record<string, { label: string; color: string }> = {
  'Garanti BBVA': { label: 'Garanti', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  'Akbank':       { label: 'Akbank',  color: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const AVAILABLE_CATEGORIES = [
  'Market',
  'Yeme & İçme',
  'Abonelik',
  'E-Ticaret',
  'Fatura & Telekom',
  'Ulaşım & Araç',
  'Sağlık',
  'Eğitim & Kitap',
  'Finans & Cüzdan',
  'Diğer',
]

const CATEGORY_COLORS: Record<string, string> = {
  'Market':           'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'Yeme & İçme':      'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'Abonelik':         'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'E-Ticaret':        'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Fatura & Telekom': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'Ulaşım & Araç':    'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'Sağlık':           'text-pink-400 bg-pink-500/10 border-pink-500/20',
  'Eğitim & Kitap':   'text-teal-400 bg-teal-500/10 border-teal-500/20',
  'Finans & Cüzdan':  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'Diğer':            'text-neutral-400 bg-neutral-500/10 border-neutral-500/20',
}

export default function DashboardPage({
  transactions,
  analysis: initialAnalysis,
  uploadedFiles,
  profile,
  onReset,
  onAddMore,
  onUpdateCategory,
  onUpdateProfile,
  onAddManualTransaction
}: DashboardPageProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>('all')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showHealthModal, setShowHealthModal] = useState(false)
  const [allTxDrawerOpen, setAllTxDrawerOpen] = useState(false)
  const [editingInlineIdx, setEditingInlineIdx] = useState<number | null>(null)
  const [showGoalsModal, setShowGoalsModal] = useState(false)
  const [showTxModal, setShowTxModal] = useState(false)

  // 1. Extract distinct available months from transactions for Date Filter (Section 5.1)
  const availableMonths = useMemo(() => {
    const monthsMap = new Map<string, { key: string; label: string; date: Date }>()

    transactions.forEach((tx) => {
      const d = parseDate(tx.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!monthsMap.has(key)) {
        monthsMap.set(key, {
          key,
          label: formatMonthYear(d, true),
          date: d,
        })
      }
    })

    return Array.from(monthsMap.values()).sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [transactions])

  // 2. Filter transactions based on selected date period
  const activeTransactions = useMemo(() => {
    if (selectedMonth === 'all') return transactions
    return transactions.filter((tx) => {
      const d = parseDate(tx.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return key === selectedMonth
    })
  }, [transactions, selectedMonth])

  // 3. Compute analysis for active period
  const currentAnalysis = useMemo(() => {
    if (selectedMonth === 'all') return initialAnalysis
    return analyzeTransactions(activeTransactions)
  }, [activeTransactions, selectedMonth, initialAnalysis])

  const {
    summary,
    category_totals,
    daily_trend,
    top_merchants,
    installment_projection,
    subscriptions,
    weekday_heatmap,
  } = currentAnalysis

  const income = activeTransactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalIncome = profile.monthlyIncome + income
  const expense = activeTransactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const netDurum = totalIncome - expense
  const incomeCount = activeTransactions.filter((t) => t.amount < 0).length
  const expenseCount = activeTransactions.filter((t) => t.amount > 0).length

  const healthColor =
    summary.health_score.color === 'green'
      ? '#22c55e'
      : summary.health_score.color === 'yellow'
      ? '#f59e0b'
      : '#ef4444'

  const hasInstallments = installment_projection && installment_projection.some((d) => d.total > 0)
  const hasSubscriptions = subscriptions && subscriptions.length > 0

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a] text-[#ededed] animate-fade-in">
      {/* ── Sticky Header (Linear Minimalist) ── */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-[#262626]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Left: Logo & File info */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#171717] border border-[#262626] flex items-center justify-center font-semibold text-xs text-[#ededed]">
                ₺
              </div>
              <span className="font-semibold text-sm tracking-tight text-[#ededed] hidden sm:inline">
                My Finance
              </span>
            </div>

            {/* Mobile File Count Badge */}
            <div className="sm:hidden px-2 py-0.5 rounded bg-[#171717] border border-[#262626] text-[11px] text-[#a3a3a3]">
              {uploadedFiles.length} ekstre · {activeTransactions.length} işlem
            </div>

            {/* Tablet/Desktop Uploaded Files Info */}
            <div className="hidden sm:flex items-center gap-1.5 ml-2">
              {uploadedFiles.map((f) => {
                const badge = BANK_BADGES[f.bank]
                return (
                  <div
                    key={f.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#171717] border border-[#262626] text-xs text-[#a3a3a3]"
                  >
                    <span className="text-[#ededed] font-medium max-w-[120px] truncate">{f.name}</span>
                    <span className="text-[#525252]">({f.transactionCount})</span>
                    {badge && (
                      <span className={`px-1.5 py-0.2 rounded text-[9px] border ${badge.color}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => setShowTxModal(true)}
              className="btn-secondary text-xs py-1.5 px-3 border-emerald-900/30 text-emerald-400 hover:bg-emerald-900/20"
            >
              <Wallet size={13} />
              <span className="hidden md:inline">İşlem Ekle</span>
            </button>
            <button
              onClick={() => setShowGoalsModal(true)}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              <Target size={13} />
              <span className="hidden md:inline">Bütçe</span>
            </button>
            <button
              onClick={onAddMore}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              <Plus size={13} />
              <span className="hidden md:inline">Ekstre Ekle</span>
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="btn-secondary text-xs py-1.5 px-2.5 text-[#737373] hover:text-[#ededed]"
              title="Tüm verileri sıfırla"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content Container ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">

        {/* ── Budget Progress ── */}
        <BudgetProgress 
          profile={profile} 
          summary={summary} 
          totalIncome={profile.monthlyIncome + transactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + Math.abs(curr.amount), 0)} 
        />

        {/* ── Date Filter Bar (Section 5.1) ── */}
        <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1 scrollbar-none">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#737373] flex items-center gap-1 mr-1">
              <Calendar size={13} />
              <span>Dönem:</span>
            </span>
            <button
              onClick={() => setSelectedMonth('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                selectedMonth === 'all'
                  ? 'bg-[#ededed] text-[#0a0a0a] shadow-sm'
                  : 'bg-[#171717] text-[#a3a3a3] border border-[#262626] hover:text-[#ededed] hover:border-[#333333]'
              }`}
            >
              Tüm Dönemler ({transactions.length})
            </button>
            {availableMonths.map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedMonth(m.key)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  selectedMonth === m.key
                    ? 'bg-[#ededed] text-[#0a0a0a] shadow-sm'
                    : 'bg-[#171717] text-[#a3a3a3] border border-[#262626] hover:text-[#ededed] hover:border-[#333333]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-[#525252] hidden md:block">
            {activeTransactions.length} işlem analiz ediliyor
          </div>
        </div>

        {/* ── Section 1: [ÖZET] 3 KPI Horizontal ── */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* 1. Toplam Harcama */}
          <div className="card">
            <p className="card-label">Toplam Harcama</p>
            <p className="kpi-value mt-2">
              <AnimatedNumber value={expense} prefix="₺" decimals={0} />
            </p>
            <p className="text-xs text-[#737373] mt-2 flex items-center justify-between">
              <span>{expenseCount} işlem</span>
              {income > 0 && (
                <span className="text-[11px] text-[#525252]">İadeler hariç</span>
              )}
            </p>
          </div>

          {/* 2. Geri Ödeme / İade */}
          <div className="card">
            <p className="card-label">Geri Ödeme / İade</p>
            <p className="kpi-value mt-2 text-emerald-400">
              <AnimatedNumber value={income} prefix="₺" decimals={0} />
            </p>
            <p className="text-xs text-[#737373] mt-2">
              {incomeCount} işlem iade / ödeme
            </p>
          </div>

          {/* 3. Net Durum & Finansal Sağlık */}
          <div className="card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="card-label">Net Durum</p>
                {/* Health Score Trigger */}
                <button
                  onClick={() => setShowHealthModal(true)}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-[#262626] bg-[#171717] hover:border-[#333333] transition-colors"
                  title="Sağlık skoru detayını gör"
                >
                  <Activity size={11} style={{ color: healthColor }} />
                  <span className="text-[#a3a3a3]">Sağlık:</span>
                  <span className="font-bold tabular-nums" style={{ color: healthColor }}>
                    {summary.health_score.score}
                  </span>
                </button>
              </div>
              <p className={`kpi-value mt-2 ${netDurum >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {netDurum > 0 ? '+' : ''}<AnimatedNumber value={netDurum} prefix="₺" decimals={0} />
              </p>
            </div>
            <p className="text-xs text-[#737373] mt-2">
              En yüksek: <span className="text-[#ededed] font-medium">{summary.top_category.name}</span> (%{summary.top_category.percentage})
            </p>
          </div>
        </section>

        {/* ── Section 2: [ANALİZ] Donut + DailyTrend (2 Sütun) ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          <CategoryDonut
            data={category_totals}
            transactions={activeTransactions}
            onUpdateCategory={onUpdateCategory}
          />
          <DailyTrendLine data={daily_trend} />
        </section>

        {/* ── Section 3: [DAVRANIŞLAR] TopMerchants + WeekdayHeatmap (2 Sütun) ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          <TopMerchants data={top_merchants} />
          <WeekdayHeatmap data={weekday_heatmap} />
        </section>

        {/* ── Section 4: [TAKSİTLER & ABONELİKLER] (Sadece veri varsa render edilir) ── */}
        {(hasInstallments || hasSubscriptions) && (
          <section className={`grid grid-cols-1 ${hasInstallments && hasSubscriptions ? 'lg:grid-cols-2' : ''} gap-4`}>
            {hasInstallments && <InstallmentProjection data={installment_projection} />}
            {hasSubscriptions && <SubscriptionPanel subscriptions={subscriptions} />}
          </section>
        )}

        {/* ── Section 5: [TÜM İŞLEMLER] İnline Expandable Tablo & Drawer ── */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="section-title">İşlem Özeti & Kayıtlar</h3>
              <p className="text-xs text-[#737373] mt-0.5">
                Toplam {activeTransactions.length} işlem ({selectedMonth === 'all' ? 'Tüm dönemler' : 'Seçili ay'})
              </p>
            </div>
            <button
              onClick={() => setAllTxDrawerOpen(true)}
              className="btn-secondary text-xs"
            >
              <FileText size={13} />
              <span>Arama & Tüm İşlemler ({activeTransactions.length})</span>
            </button>
          </div>

          {/* Quick Preview Table (First 8 items) */}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Açıklama / İşyeri</th>
                  <th>Kategori</th>
                  <th className="hidden sm:table-cell">Banka</th>
                  <th className="text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {activeTransactions.slice(0, 8).map((tx, idx) => {
                  const badgeClass = CATEGORY_COLORS[tx.category] || CATEGORY_COLORS['Diğer']
                  const isEditing = editingInlineIdx === idx

                  return (
                    <tr key={`${tx.date}-${tx.description}-${idx}`}>
                      <td className="text-xs text-[#737373] whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="text-xs font-medium text-[#ededed] max-w-[240px] truncate">
                        {tx.description}
                        {tx.installment && (
                          <span className="ml-2 text-[10px] text-purple-400 font-mono">
                            ({tx.installment})
                          </span>
                        )}
                      </td>
                      <td className="relative">
                        <button
                          onClick={() => setEditingInlineIdx(isEditing ? null : idx)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${badgeClass}`}
                          title="Kategoriyi değiştir"
                        >
                          <span>{tx.category}</span>
                          <ChevronDown size={10} className="opacity-50" />
                        </button>

                        {/* Inline Category Dropdown */}
                        {isEditing && (
                          <div className="absolute left-0 top-full mt-1 z-30 w-44 bg-[#1a1a1a] border border-[#262626] rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto">
                            {AVAILABLE_CATEGORIES.map((cat) => (
                              <button
                                key={cat}
                                onClick={() => {
                                  if (onUpdateCategory) {
                                    onUpdateCategory(tx.raw_line || `${tx.date}_${tx.description}`, cat)
                                  }
                                  tx.category = cat
                                  setEditingInlineIdx(null)
                                }}
                                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-[#262626] transition-colors ${
                                  tx.category === cat ? 'text-white font-semibold' : 'text-[#a3a3a3]'
                                }`}
                              >
                                <span>{cat}</span>
                                {tx.category === cat && <Check size={12} className="text-emerald-400" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="text-xs text-[#737373] hidden sm:table-cell">
                        {tx.bank}
                      </td>
                      <td className={`text-xs font-semibold text-right tabular-nums ${tx.amount < 0 ? 'text-emerald-400' : 'text-[#ededed]'}`}>
                        {tx.amount < 0 ? '+' : ''}₺{fmt2(Math.abs(tx.amount))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Expand Full Drawer Trigger */}
          {activeTransactions.length > 8 && (
            <div className="pt-2 text-center border-t border-[#1a1a1a]">
              <button
                onClick={() => setAllTxDrawerOpen(true)}
                className="text-xs text-[#a3a3a3] hover:text-[#ededed] transition-colors py-1 inline-flex items-center gap-1"
              >
                <span>+{activeTransactions.length - 8} işlem daha var · Detaylı arama ve filtreleme için tıklayın</span>
              </button>
            </div>
          )}
        </section>

      </main>

      {/* ── Minimal Footer ── */}
      <footer className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-5 text-center text-xs text-[#404040] border-t border-[#1a1a1a]">
        My Finance · Sıfır-Bilgi Prensibi · Tüm veriler yalnızca tarayıcınızda işlenir
      </footer>

      {/* ── Financial Health Detail Modal ── */}
      {showHealthModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-5 space-y-4 animate-fade-in bg-[#111111] border-[#262626]">
            <div className="flex items-center justify-between border-b border-[#1f1f1f] pb-3">
              <div className="flex items-center gap-2">
                <Activity size={16} style={{ color: healthColor }} />
                <h3 className="text-sm font-semibold text-[#ededed]">Finansal Sağlık Raporu</h3>
              </div>
              <button
                onClick={() => setShowHealthModal(false)}
                className="p-1 text-[#737373] hover:text-[#ededed]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-[#171717] border border-[#262626]">
              <div>
                <p className="text-xs text-[#737373]">Genel Sağlık Skoru</p>
                <p className="text-xl font-bold mt-0.5" style={{ color: healthColor }}>
                  {summary.health_score.score} / 100
                </p>
              </div>
              <span
                className="px-2.5 py-1 rounded-md text-xs font-semibold"
                style={{
                  backgroundColor: `${healthColor}20`,
                  color: healthColor,
                  border: `1px solid ${healthColor}40`,
                }}
              >
                {summary.health_score.label}
              </span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              <p className="text-xs font-medium text-[#737373]">Kural ve Puan Dağılımı</p>
              {summary.health_score.breakdown.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[#141414] border border-[#1f1f1f] text-xs"
                >
                  <span className="text-[#a3a3a3]">{item.rule}</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      item.points > 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {item.points > 0 ? `+${item.points}` : item.points} puan
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowHealthModal(false)}
              className="btn-secondary w-full text-xs py-2"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* ── Safe Reset Confirmation Dialog (Data Loss Prevention) ── */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="card max-w-sm w-full p-5 space-y-4 bg-[#111111] border-[#262626] animate-fade-in">
            <div className="flex items-center gap-2.5 text-red-400">
              <AlertTriangle size={18} />
              <h3 className="text-sm font-semibold text-[#ededed]">Verileri Sıfırla</h3>
            </div>
            <p className="text-xs text-[#a3a3a3] leading-relaxed">
              Yüklenen tüm ekstreler ve hesaplanan analiz verileri temizlenecektir. Bu işlem geri alınamaz.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="btn-secondary text-xs"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  setShowResetConfirm(false)
                  onReset()
                }}
                className="btn-danger text-xs"
              >
                Sıfırla ve Başa Dön
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── All Transactions Drawer ─── */}
      <TransactionDrawer
        isOpen={allTxDrawerOpen}
        onClose={() => setAllTxDrawerOpen(false)}
        category="Tüm İşlemler"
        transactions={activeTransactions.filter((t) => t.amount > 0)}
        onUpdateCategory={onUpdateCategory}
      />

      {/* ─── Goals Modal ─── */}
      {showGoalsModal && (
        <GoalsModal
          initialIncome={profile.monthlyIncome}
          initialLimit={profile.spendingLimit}
          initialSavings={profile.savingsGoal}
          onSave={(monthlyIncome, spendingLimit, savingsGoal) => {
            onUpdateProfile({ monthlyIncome, spendingLimit, savingsGoal })
          }}
          onClose={() => setShowGoalsModal(false)}
        />
      )}

      {/* ─── Transaction Modal ─── */}
      {showTxModal && (
        <TransactionModal
          onAdd={onAddManualTransaction}
          onClose={() => setShowTxModal(false)}
        />
      )}
    </div>
  )
}
