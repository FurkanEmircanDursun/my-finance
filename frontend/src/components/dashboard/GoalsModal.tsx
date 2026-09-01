import { useState } from 'react'
import { X } from 'lucide-react'

interface GoalsModalProps {
  initialIncome: number
  initialLimit: number
  initialSavings: number
  onSave: (income: number, limit: number, savings: number) => void
  onClose: () => void
}

export default function GoalsModal({
  initialIncome,
  initialLimit,
  initialSavings,
  onSave,
  onClose,
}: GoalsModalProps) {
  const [income, setIncome] = useState(initialIncome.toString())
  const [limit, setLimit] = useState(initialLimit.toString())
  const [savings, setSavings] = useState(initialSavings.toString())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(
      parseFloat(income) || 0,
      parseFloat(limit) || 0,
      parseFloat(savings) || 0
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-[#262626] bg-[#0a0a0a] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-medium text-[#ededed]">Bütçe ve Hedefler</h2>
          <button onClick={onClose} className="rounded-full p-2 text-[#a1a1aa] hover:bg-[#262626] hover:text-[#ededed] transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#a1a1aa]">Aylık Toplam Gelir (TL)</label>
            <input
              type="number"
              required
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              className="w-full rounded-lg border border-[#262626] bg-[#111] p-3 text-[#ededed] placeholder-[#52525b] focus:border-[#ededed] focus:outline-none focus:ring-1 focus:ring-[#ededed] transition-all"
              placeholder="Örn: 50000"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#a1a1aa]">Aylık Harcama Limiti (TL)</label>
            <input
              type="number"
              required
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="w-full rounded-lg border border-[#262626] bg-[#111] p-3 text-[#ededed] placeholder-[#52525b] focus:border-[#ededed] focus:outline-none focus:ring-1 focus:ring-[#ededed] transition-all"
              placeholder="Örn: 30000"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#a1a1aa]">Aylık Tasarruf Hedefi (TL)</label>
            <input
              type="number"
              required
              value={savings}
              onChange={(e) => setSavings(e.target.value)}
              className="w-full rounded-lg border border-[#262626] bg-[#111] p-3 text-[#ededed] placeholder-[#52525b] focus:border-[#ededed] focus:outline-none focus:ring-1 focus:ring-[#ededed] transition-all"
              placeholder="Örn: 10000"
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="w-full rounded-lg bg-[#ededed] px-4 py-3 text-sm font-medium text-[#0a0a0a] hover:bg-white transition-colors"
            >
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
