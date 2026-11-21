import { useEffect, useState } from 'react'
import { Gauge } from 'lucide-react'
import { cloudAvailable } from '../firebase/available'
import { DIAGNOSTICS_UPDATED, diagnosticsStatus, setDiagnosticsConsent } from '../platform/diagnostics'

export function DiagnosticsSettings() {
  const [status, setStatus] = useState(diagnosticsStatus)
  useEffect(() => {
    const refresh = () => setStatus(diagnosticsStatus())
    window.addEventListener(DIAGNOSTICS_UPDATED, refresh)
    return () => window.removeEventListener(DIAGNOSTICS_UPDATED, refresh)
  }, [])
  return <div className="flex items-start gap-3">
    <Gauge size={20} className="mt-3 shrink-0 text-muted" aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span className="text-body font-semibold text-ink">Performansı iyileştirmeye yardımcı ol</span>
        <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--accent)]" checked={status.enabled} disabled={!cloudAvailable}
          aria-describedby="performance-privacy" onChange={event => { void setDiagnosticsConsent(event.target.checked) }} />
      </label>
      <p id="performance-privacy" className="text-label leading-relaxed text-muted">İsteğe bağlı süre ölçümü: ekran açılışı, ekstre ayrıştırma, kur yenileme ve yedekleme gibi işlemlerin ne kadar sürdüğü ölçülür. Tutar, dosya adı, hata metni, hesap veya kart adresi gönderilmez. Firebase sabit bir teknik ölçüm sayfası adresi, kurulum kimliği ve bağlantı türü gibi teknik bilgiler alır.</p>
      {status.error && <p className="mt-2 text-label text-negative" role="alert">{status.error}</p>}
      {status.enabled && status.active && <p className="mt-2 text-label text-positive" role="status">Yalnızca belirtilen işlem süreleri ölçülüyor.</p>}
    </div>
  </div>
}
