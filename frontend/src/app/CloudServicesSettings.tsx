import { useEffect, useState } from 'react'
import { Cloud, BarChart3 } from 'lucide-react'
import { defaultReminders } from '../domain/reminders'
import { analyticsConsent, analyticsError, ANALYTICS_UPDATED, setAnalyticsConsent } from '../platform/analytics'
import { disconnectCloudPush, getPushStatus, PUSH_UPDATED, requestCloudPush } from '../platform/push'
import { useStore } from '../store/AppStore'
import { Button } from '../ui/primitives'

/** Device-specific privacy and delivery preferences, separate from financial settings. */
export function CloudServicesSettings() {
  const { state, authUser, sync, cloudAvailable } = useStore()
  const [consent, setConsent] = useState(analyticsConsent)
  const [status, setStatus] = useState(getPushStatus)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const refresh = () => { setConsent(analyticsConsent()); setStatus(getPushStatus()) }
    window.addEventListener(PUSH_UPDATED, refresh)
    window.addEventListener(ANALYTICS_UPDATED, refresh)
    return () => { window.removeEventListener(PUSH_UPDATED, refresh); window.removeEventListener(ANALYTICS_UPDATED, refresh) }
  }, [])
  const togglePush = async () => {
    setBusy(true); setError(''); setMessage('')
    try {
      if (status.optedIn) { await disconnectCloudPush(); setMessage('Cihaz hatırlatmaları kullanılacak.') }
      else if (authUser && !authUser.isAnonymous) {
        await requestCloudPush(authUser.uid, state.settings.reminders ?? defaultReminders,
          sync.lastSyncedAt !== null && sync.pending === 0 && sync.status !== 'decision' && sync.status !== 'error')
        setMessage('Bulut bildirimleri bağlandı. Saatler Türkiye saatine göre planlanır.')
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Bağlantı kurulamadı.') }
    finally { setBusy(false); setStatus(getPushStatus()) }
  }
  return <div className="space-y-6">
    <div className="flex items-start gap-3">
      <Cloud size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 className="text-body font-semibold text-ink">Bulut bildirimleri</h3>
        <p className="mt-1 text-label leading-relaxed text-muted">
          {!status.supported ? 'Ekstre bildirimleri Android uygulamasında kullanılabilir.'
            : !status.backendReady ? 'Cihaz hatırlatmaları kullanılabilir. Buluttan otomatik gönderim henüz etkin değil.'
              : status.active ? 'Firebase bağlantısı açık. Cihaz hatırlatmaları çift bildirim oluşmaması için beklemede.'
                : 'Ekstre ve kayıt günlerinde Firebase üzerinden hatırlatma al. İnternet gerekir.'}
        </p>
        {status.supported && status.backendReady && (
          <div className="mt-3">
            {authUser && !authUser.isAnonymous ? <Button disabled={busy} onClick={() => { void togglePush() }}>
              {busy ? 'Bağlanıyor…' : status.optedIn ? 'Cihaz hatırlatmalarını kullan' : 'Bulut bildirimlerini aç'}
            </Button> : <p className="text-label text-muted">Önce Google hesabınla giriş yap.</p>}
          </div>
        )}
        {(status.error || error) && <p className="mt-2 text-label text-negative" role="alert">{error || status.error}</p>}
        {message && <p className="mt-2 text-label text-positive" role="status">{message}</p>}
      </div>
    </div>
    <div className="flex items-start gap-3">
      <BarChart3 size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
          <span className="text-body font-semibold text-ink">Uygulamayı geliştirmeye yardımcı ol</span>
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--accent)]" checked={consent}
            disabled={!cloudAvailable} aria-describedby="analytics-privacy"
            onChange={(event) => { void setAnalyticsConsent(event.target.checked) }} />
        </label>
        <p id="analytics-privacy" className="mt-1 text-label leading-relaxed text-muted">
          İsteğe bağlı kullanım ölçümü. Açılan ekranlar ve tamamlanan işlemler sayılır.
          Tutar, kart bilgisi, ekstre içeriği ve e-posta gönderilmez. İstediğin an kapatabilirsin.
        </p>
        {analyticsError() && <p className="mt-2 text-label text-negative" role="alert">{analyticsError()}</p>}
      </div>
    </div>
  </div>
}
