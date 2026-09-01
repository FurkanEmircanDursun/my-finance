import { useState } from 'react'
import { X } from 'lucide-react'
import type { Transaction } from '../../types/finance'
import { generateTransactionId } from '../../utils/format'

interface TransactionModalProps {
  onAdd: (transaction: Transaction) => void
  onClose: () => void
}

export default function TransactionModal({ onAdd, onClose }: TransactionModalProps) {
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Diğer')

  const categories = [
    'Market & Gıda', 'Dışarıda Yemek', 'Ulaşım', 'Fatura', 'Alışveriş',
    'Eğlence', 'Sağlık', 'Eğitim', 'Diğer', 'Maaş', 'Yatırım', 'Kira'
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Convert YYYY-MM-DD to DD/MM/YYYY for consistency
    const [y, m, d] = date.split('-')
    const formattedDate = `${d}/${m}/${y}`
    const parsedAmount = parseFloat(amount) || 0

    // For manual transactions, we store the id
    const t: Transaction = {
      id: generateTransactionId(formattedDate, parsedAmount, description),
      type,
      isManual: true,
      bank: 'Manuel',
      date: formattedDate,
      description: description.trim(),
      amount: type === 'expense' ? Math.abs(parsedAmount) : -Math.abs(parsedAmount),
      installment: null,
      category,
    }

    onAdd(t)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-[#262626] bg-[#0a0a0a] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-medium text-[#ededed]">Manuel İşlem Ekle</h2>
          <button onClick={onClose} className="rounded-full p-2 text-[#a1a1aa] hover:bg-[#262626] hover:text-[#ededed] transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2 p-1 bg-[#111] border border-[#262626] rounded-lg">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${type === 'expense' ? 'bg-[#262626] text-[#ededed]' : 'text-[#a1a1aa] hover:text-[#ededed]'}`}
            >
              Gider
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${type === 'income' ? 'bg-[#262626] text-[#ededed]' : 'text-[#a1a1aa] hover:text-[#ededed]'}`}
            >
              Gelir
            </button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#a1a1aa]">Tarih</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[#262626] bg-[#111] p-3 text-[#ededed] focus:border-[#ededed] focus:outline-none focus:ring-1 focus:ring-[#ededed] transition-all [color-scheme:dark]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#a1a1aa]">Açıklama</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-[#262626] bg-[#111] p-3 text-[#ededed] placeholder-[#52525b] focus:border-[#ededed] focus:outline-none focus:ring-1 focus:ring-[#ededed] transition-all"
              placeholder="Örn: Ev Kirası"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#a1a1aa]">Tutar (TL)</label>
            <input
              type="number"
              required
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-[#262626] bg-[#111] p-3 text-[#ededed] placeholder-[#52525b] focus:border-[#ededed] focus:outline-none focus:ring-1 focus:ring-[#ededed] transition-all"
              placeholder="Örn: 15000"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#a1a1aa]">Kategori</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-[#262626] bg-[#111] p-3 text-[#ededed] focus:border-[#ededed] focus:outline-none focus:ring-1 focus:ring-[#ededed] transition-all"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="w-full rounded-lg bg-[#ededed] px-4 py-3 text-sm font-medium text-[#0a0a0a] hover:bg-white transition-colors"
            >
              Ekle
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
