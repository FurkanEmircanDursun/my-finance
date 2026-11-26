import { useEffect, useState } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { defaultReminders } from '../domain/reminders'
import {
  getReminderStatus, REMINDERS_UPDATED, requestReminderPermission,
  sendTestReminder, type ReminderStatus,
} from '../platform/reminders'
import { useStore } from '../store/AppStore'
import { Button, Field } from '../ui/primitives'
import { Select } from '../ui/Select'
import { getPushStatus, PUSH_UPDATED } from '../platform/push'
import { firebaseErrorMessage } from '../firebase/errors'

export function NotificationSettings() {
  const { state, dispatch } = useStore()
  const preferences = state.settings.reminders ?? defaultReminders
  const [status, setStatus] = useState<ReminderStatus | null>(null)
  const [cloudActive, setCloudActive] = useState(() => getPushStatus().active)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    const refresh = () => {
      if (!disposed) setCloudActive(getPushStatus().active)
      void getReminderStatus().then((next) => { if (!disposed) setStatus(next) }).catch(() => {
        if (!disposed) setError('Bildirim durumu okunamadı. Yeniden dene.')
      })
    }
    refresh()
    window.addEventListener(REMINDERS_UPDATED, refresh)
    window.addEventListener(PUSH_UPDATED, refresh)
    return () => { disposed = true; window.removeEventListener(REMINDERS_UPDATED, refresh); window.removeEventListener(PUSH_UPDATED, refresh) }
  }, [])

  const enable = async () => {
    setBusy(true); setError(''); setMessage('')
    try {
      if (!await requestReminderPermission()) {
        setError('Bildirim izni verilmedi. Telefonunun Ayarlar > Uygulamalar > Mizan > Bildirimler bölümünden açabilirsin.')
        setStatus(await getReminderStatus())
        return
      }
      dispatch({ type: 'setSettings', settings: { reminders: { ...preferences, enabled: true } } })
      setStatus(await getReminderStatus())
      setMessage('Hatırlatmalar açıldı. Kartlarının ekstre ve kayıt günlerinde haber vereceğiz.')
    } catch {
      setError('Bildirimler açılamadı. Telefonunun bildirim ayarlarını kontrol edip yeniden dene.')
    } finally { setBusy(false) }
  }

  const test = async () => {
    setBusy(true); setError(''); setMessage('')
    try {
      await sendTestReminder()
      setMessage('Test bildirimi gönderildi. Telefonunun bildirim panelini kontrol et.')
    } catch (cause) {
      setError(firebaseErrorMessage(cause, 'notification'))
    } finally { setBusy(false) }
  }

  const active = preferences.enabled && status?.permission === 'granted'
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 shrink-0 text-accent-text" size={21} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">Ekstre gününü aklında tutma</p>
          <p className="mt-1 text-label leading-relaxed text-muted">
            Kartlarının ekstre kesim ve aylık veri giriş günlerinde hatırlatma al.
            {cloudActive ? ' Bulut teslimi için internet gerekir.' : ' Cihaz hatırlatmaları internet olmadan çalışır.'}
          </p>
        </div>
      </div>
      {status && !status.supported ? (
        <p className="text-label leading-relaxed text-muted">
          Web tarayıcısında kart kesim ve son ödeme günlerin Finansal Takvim ile Kokpit’te gösterilir. Otomatik bildirimler Android ve iOS uygulamalarında kullanılabilir.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {active ? (
              <Button disabled={busy} onClick={() => {
                dispatch({ type: 'setSettings', settings: { reminders: { ...preferences, enabled: false, cloudPush: false } } })
                setMessage('Hatırlatmalar kapatıldı.'); setError('')
              }}>Hatırlatmaları kapat</Button>
            ) : (
              <Button variant="primary" disabled={busy || !status} onClick={() => { void enable() }}>
                <BellRing size={16} aria-hidden="true" /> {busy ? 'İzin kontrol ediliyor…' : 'Bildirimleri aç'}
              </Button>
            )}
            {active && !cloudActive && <Button disabled={busy} onClick={() => { void test() }}>Test bildirimi gönder</Button>}
          </div>
          {active && (
            <Field label="Hatırlatma saati" hint={cloudActive ? 'Türkiye saatine göre. Gün sonu önerimiz 20:00; ağ ve cihaz kısıtlamaları teslimi geciktirebilir.' : 'Telefonunun yerel saatine göre. Gün sonu önerimiz 20:00; pil tasarrufu teslimi geciktirebilir.'}>
              <Select
                ariaLabel="Hatırlatma saati"
                value={String(preferences.hour)}
                onChange={(next) => {
                  dispatch({ type: 'setSettings', settings: { reminders: { ...preferences, hour: Number(next) } } })
                }}
                options={Array.from({ length: 24 }, (_, hour) => ({
                  value: String(hour),
                  label: `${String(hour).padStart(2, '0')}:00`,
                }))}
              />
              <Button size="sm" className="mt-2" disabled={preferences.hour === 20} onClick={() => {
                dispatch({ type: 'setSettings', settings: { reminders: { ...preferences, hour: 20 } } })
                setMessage('Hatırlatma saatin gün sonu 20:00 olarak ayarlandı.')
              }}>Gün sonu · 20:00</Button>
            </Field>
          )}
          {active && !state.profile.cards?.length && <p className="text-label text-muted">İlk kartını eklediğinde tarihleri otomatik planlayacağız.</p>}
          {active && !!status?.pending && <p className="text-label text-muted">
            {status.pending} hatırlatma planlandı{status.nextAt ? ` · Sıradaki: ${status.nextAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}` : ''}.
          </p>}
        </>
      )}
      {message && <p className="text-label text-positive" role="status">{message}</p>}
      {(error || status?.error) && <p className="text-label text-negative" role="alert">{error || status?.error}</p>}
    </div>
  )
}
