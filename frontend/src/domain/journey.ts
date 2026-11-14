import type { Profile, Transaction } from './types'

export type MissionId = 'record' | 'income' | 'budget' | 'categories'
export interface Mission {
  id: MissionId
  title: string
  description: string
  action: string
  done: boolean
}

/** Progress rewards completeness, never spend volume, frequency or wealth. */
export function buildJourney(
  rows: readonly Transaction[],
  profile: Pick<Profile, 'spendingLimit' | 'budgets'>,
) {
  const expenses = rows.filter((tx) => tx.kind === 'expense')
  const missions: Mission[] = [
    {
      id: 'record',
      title: 'İlk izi bırak',
      description: 'Bir gider ekle veya ekstreni yükle.',
      action: 'Gider ekle',
      done: expenses.length > 0,
    },
    {
      id: 'income',
      title: 'Resmi tamamla',
      description: 'Gelirini ekle, kalan tutar görünür olsun.',
      action: 'Gelir ekle',
      done: rows.some((tx) => tx.kind === 'income'),
    },
    {
      id: 'budget',
      title: 'Rotanı belirle',
      description: 'Kendine uygun bir harcama limiti oluştur.',
      action: 'Limit belirle',
      done:
        profile.spendingLimit > 0 || profile.budgets.some((b) => b.limit > 0),
    },
    {
      id: 'categories',
      title: 'Her şey yerli yerinde',
      description: 'Diğer kategorisindeki giderlerini gözden geçir.',
      action: 'Kategorileri incele',
      done:
        expenses.length > 0 && expenses.every((tx) => tx.category !== 'other'),
    },
  ]
  const completed = missions.filter((m) => m.done).length
  return {
    missions,
    completed,
    points: completed * 25,
    next: missions.find((m) => !m.done),
    label: [
      'İlk adım',
      'Başlangıç hazır',
      'Resim netleşiyor',
      'Kontrol sende',
      'Rota tamam',
    ][completed],
  }
}
