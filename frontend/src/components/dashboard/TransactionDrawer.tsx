import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CreditCard, Search, Calendar, Tag, Check, ChevronDown } from 'lucide-react'
import type { Transaction } from '../../types/finance'
import { fmt2 } from '../../utils/format'

interface TransactionDrawerProps {
  isOpen: boolean
  onClose: () => void
  category: string
  transactions: Transaction[]
  onUpdateCategory?: (rawLine: string, newCategory: string) => void
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

export default function TransactionDrawer({
  isOpen,
  onClose,
  category,
  transactions,
  onUpdateCategory,
}: TransactionDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handler)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  // Reset search when closing or opening
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
      setEditingIndex(null)
    }
  }, [isOpen])

  // Filter transactions in real-time
  const filteredTransactions = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => b.amount - a.amount)
    if (!searchQuery.trim()) return sorted
    const q = searchQuery.toLowerCase().trim()
    return sorted.filter((tx) => {
      return (
        tx.description.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        tx.bank.toLowerCase().includes(q) ||
        tx.date.includes(q) ||
        tx.amount.toString().includes(q)
      )
    })
  }, [transactions, searchQuery])

  const totalAmount = useMemo(() => {
    return filteredTransactions.reduce((s, t) => s + t.amount, 0)
  }, [filteredTransactions])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full sm:max-w-[480px] z-50 flex flex-col bg-[#111111] border-l border-[#262626] text-[#ededed] shadow-2xl"
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-[#262626] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[#ededed] truncate">
                  {category}
                </h2>
                <p className="text-xs text-[#737373] mt-0.5">
                  {filteredTransactions.length} işlem · Toplam ₺{fmt2(totalAmount)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[#737373] hover:text-[#ededed] hover:bg-[#1a1a1a] transition-colors"
                title="Kapat"
              >
                <X size={18} />
              </button>
            </div>

            {/* Realtime Search Input */}
            <div className="p-3 sm:px-5 border-b border-[#1f1f1f]">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#525252]" />
                <input
                  type="text"
                  placeholder="İşlem veya mağaza ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#171717] border border-[#262626] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#ededed] placeholder-[#525252] focus:outline-none focus:border-[#404040]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#525252] hover:text-[#ededed]"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Transaction List (Optimized without per-item motion for 100+ items) */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1.5">
              {filteredTransactions.map((tx, index) => {
                const isEditing = editingIndex === index
                const badgeClass = CATEGORY_COLORS[tx.category] || CATEGORY_COLORS['Diğer']

                return (
                  <div
                    key={`${tx.date}-${tx.description}-${index}`}
                    className="p-3 rounded-lg bg-[#141414] border border-[#1f1f1f] hover:border-[#262626] transition-colors flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[#ededed] leading-snug break-words">
                          {tx.description || 'Açıklama yok'}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-[#737373]">
                          <span className="flex items-center gap-1">
                            <Calendar size={10} />
                            {tx.date}
                          </span>
                          <span>·</span>
                          <span>{tx.bank}</span>
                          {tx.installment && (
                            <>
                              <span>·</span>
                              <span className="text-purple-400 font-mono">
                                {tx.installment} taksit
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className={`text-xs font-bold tabular-nums ${tx.amount < 0 ? 'text-emerald-400' : 'text-[#ededed]'}`}>
                          {tx.amount < 0 ? '+' : ''}₺{fmt2(Math.abs(tx.amount))}
                        </p>
                      </div>
                    </div>

                    {/* Category pill & Edit option */}
                    <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a] text-[11px]">
                      <div className="relative">
                        <button
                          onClick={() => setEditingIndex(isEditing ? null : index)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${badgeClass} hover:opacity-90`}
                          title="Kategoriyi Değiştir"
                        >
                          <Tag size={9} />
                          <span>{tx.category}</span>
                          <ChevronDown size={10} className="ml-0.5 opacity-60" />
                        </button>

                        {/* Category Dropdown Picker */}
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
                                  setEditingIndex(null)
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
                      </div>

                      <span className="text-[10px] text-[#525252]">
                        {tx.amount < 0 ? 'Geri Ödeme' : 'Harcama'}
                      </span>
                    </div>
                  </div>
                )
              })}

              {filteredTransactions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center text-[#525252]">
                  <CreditCard size={28} className="mb-2 opacity-40" />
                  <p className="text-xs">Eşleşen işlem bulunamadı</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#262626] bg-[#0d0d0d] flex items-center justify-between text-xs">
              <span className="text-[#737373]">Listelenen Toplam:</span>
              <span className="text-sm font-bold text-[#ededed] tabular-nums">₺{fmt2(totalAmount)}</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
