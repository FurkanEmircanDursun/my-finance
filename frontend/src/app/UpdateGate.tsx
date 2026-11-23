import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, RefreshCw, Download } from 'lucide-react'
import { Brand } from '../ui/Brand'
import { initialUpdateState, watchUpdates, type UpdateState } from '../platform/updates'
import { setBackInterceptor } from '../platform/native'
import './updates.css'

/** Hard updates replace the app tree; Escape, backdrop and Android back cannot dismiss them. */
export function UpdateGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpdateState>(initialUpdateState)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const refresh = useRef<(() => Promise<void>) | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const watcher = watchUpdates(setState)
    refresh.current = watcher.refresh
    return () => { watcher.dispose(); refresh.current = null }
  }, [])
  useEffect(() => {
    if (state.decision !== 'hard') return
    heading.current?.focus()
    setBackInterceptor(() => true)
    return () => setBackInterceptor(null)
  }, [state.decision])
  const policy = state.policy
  if (!policy || !state.updateUrl || state.decision === 'none') return <>{children}</>
  const postpone = () => setDismissed(policy.latestVersion)
  const retry = async () => {
    if (!refresh.current) return
    setRetrying(true)
    try { await refresh.current() } finally { setRetrying(false) }
  }
  if (state.decision === 'hard') return <main className="mizan-update-required" aria-labelledby="update-required-title">
    <Brand size={38} />
    <div className="mizan-update-content">
      <span className="mizan-update-symbol"><Download size={31} strokeWidth={1.6} /></span>
      <h1 id="update-required-title" tabIndex={-1} ref={heading}>Devam etmek için Mizan’ı güncelle.</h1>
      <p>{policy.message || 'Bu sürüm artık desteklenmiyor. En yeni Mizan sürümünü yükleyerek kayıtlarınla devam edebilirsin.'}</p>
      <a className="primary-button" href={state.updateUrl} target="_blank" rel="noopener noreferrer">Güncellemeyi aç <ArrowUpRight size={18} /></a>
      <p className="mizan-update-version">Yüklü sürüm {state.currentVersion} · Yeni sürüm {policy.latestVersion}</p>
      <button className="text-button" disabled={retrying} onClick={() => { void retry() }}><RefreshCw size={15} className={retrying ? 'update-refreshing' : ''} />{retrying ? 'Kontrol ediliyor…' : 'Yeniden kontrol et'}</button>
      {state.status === 'offline' && <p className="mizan-update-offline" role="status">Son doğrulanan güncelleme bilgisi gösteriliyor. Yeniden kontrol için internete bağlan.</p>}
    </div>
  </main>
  const snoozed = dismissed === policy.latestVersion
  return <>{children}{!snoozed && <section className="mizan-update-suggestion" aria-label="Yeni Mizan sürümü" role="status">
    <span className="mizan-update-symbol"><Download size={22} /></span>
    <div><h2>Mizan’ın yeni sürümü hazır.</h2><p>{policy.message || `${policy.latestVersion} sürümündeki yeniliklerle devam et. Mevcut sürümünü kullanmaya da devam edebilirsin.`}</p></div>
    <div className="mizan-update-actions"><a className="primary-button" href={state.updateUrl} target="_blank" rel="noopener noreferrer">Güncelle <ArrowUpRight size={16} /></a><button className="quiet-button" onClick={postpone}>Daha Sonra</button></div>
  </section>}</>
}
