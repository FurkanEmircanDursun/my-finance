import type { Transaction } from './types'
import type { CategoryId } from './categories'

/** Read-only sample, never dispatched to the store or synchronized. */
export function demoTransactions(month: string): Transaction[] {
  const items: Array<
    [number, string, number, CategoryId, 'expense' | 'income']
  > = [
    [1, 'Örnek maaş', 4200000, 'other', 'income'],
    [1, 'Örnek kira', 1400000, 'rent', 'expense'],
    [2, 'Haftalık market', 146500, 'market', 'expense'],
    [3, 'Kahve molası', 12500, 'dining', 'expense'],
    [5, 'İnternet faturası', 45000, 'bills', 'expense'],
    [6, 'Akşam yemeği', 65000, 'dining', 'expense'],
    [8, 'Ulaşım kartı', 40000, 'transport', 'expense'],
    [9, 'Manav alışverişi', 34000, 'market', 'expense'],
    [11, 'Kitap alışverişi', 38000, 'education', 'expense'],
    [12, 'Haftalık market', 112000, 'market', 'expense'],
    [14, 'Öğle yemeği', 28000, 'dining', 'expense'],
    [16, 'Müzik aboneliği', 6000, 'subscription', 'expense'],
    [18, 'Kahve molası', 14000, 'dining', 'expense'],
    [20, 'Market alışverişi', 87500, 'market', 'expense'],
  ]
  return items.map(([day, description, amount, category, kind], i) => ({
    id: `demo-${i}`,
    date: `${month}-${String(day).padStart(2, '0')}`,
    description,
    merchant: description,
    amount,
    category,
    kind,
    categoryLocked: true,
    bank: i > 1 && i % 3 !== 0 ? 'Örnek banka' : 'Örnek hesap',
    accountLabel: category === 'rent' ? 'Banka / EFT' : i > 1 && i % 3 !== 0 ? 'Örnek kart' : 'Nakit',
    source: i > 1 && i % 3 !== 0 ? 'statement' : 'manual',
    installment: null,
  }))
}
