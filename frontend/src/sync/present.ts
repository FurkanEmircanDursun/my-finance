import type { SyncState } from './status'

export type Tone = 'positive' | 'accent' | 'warning' | 'negative' | 'neutral'

export interface SyncPresentation {
  /** One short phrase: what is true right now. */
  title: string
  /** What it means, or what happens next. */
  detail: string
  tone: Tone
  /** Whether something is in motion, so the indicator can say so. */
  busy: boolean
}

/** "az önce", "3 dk önce", "2 sa önce", "dün" … */
export function ago(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 45) return 'az önce'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} dk önce`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} sa önce`
  const days = Math.round(hours / 24)
  return days === 1 ? 'dün' : `${days} gün önce`
}

/**
 * What cloud sync is doing, said the way a person would say it.
 *
 * Offline and failed are different news. Offline is ordinary — a train, a lift —
 * and nothing is wrong: the device has everything and will send it when it can.
 * Only a failure that persists while the network is up is a problem, and even
 * then the message is that the engine is retrying, not that the data is at risk.
 */
export function describeSync(state: SyncState, now: number): SyncPresentation {
  const pending = state.pending
  const changes = pending === 1 ? '1 değişiklik' : `${pending} değişiklik`

  switch (state.status) {
    case 'connecting':
      return { title: 'Bağlanıyor', detail: 'Hesabındaki veriler kontrol ediliyor.', tone: 'accent', busy: true }

    case 'syncing':
      return {
        title: 'Eşitleniyor',
        detail: pending > 0 ? `${changes} gönderiliyor.` : 'Veriler karşılaştırılıyor.',
        tone: 'accent',
        busy: true,
      }

    case 'synced':
      return {
        title: 'Her şey güncel',
        detail: state.lastSyncedAt ? `Son eşitleme ${ago(state.lastSyncedAt, now)}.` : 'Veriler bulutta.',
        tone: 'positive',
        busy: false,
      }

    case 'offline':
      return {
        title: 'Çevrimdışı',
        detail:
          pending > 0
            ? `${changes} bu cihazda bekliyor; bağlanınca kendiliğinden gönderilir.`
            : 'Bağlanınca değişiklikler kendiliğinden eşitlenir.',
        tone: 'warning',
        busy: false,
      }

    case 'error':
      return {
        title: 'Gönderilemedi',
        detail: 'Verilerin bu cihazda güvende. Otomatik olarak tekrar deneniyor.',
        tone: 'negative',
        busy: false,
      }

    case 'decision':
      return {
        title: 'Seçim bekleniyor',
        detail: 'Bu cihazdaki veriler başka bir hesaba ait görünüyor.',
        tone: 'warning',
        busy: false,
      }
  }
}
