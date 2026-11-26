import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, RefreshCw, Download, ShieldAlert, X } from 'lucide-react'
import { Brand } from '../ui/Brand'
import { initialUpdateState, watchUpdates, type UpdateState } from '../platform/updates'
import { dismissSoftUpdate, resolvePolicyVersions, softUpdateDismissed } from '../platform/updatesPolicy'
import { setBackInterceptor } from '../platform/native'
import './updates.css'

function storeActionLabel(platform: UpdateState['platform']): string {
  if (platform === 'android') return 'Google Play’de Güncelle'
  if (platform === 'ios') return 'App Store’da Güncelle'
  return 'Şimdi Güncelle'
}

/**
 * Remote Config driven update gate:
 * - Hard (mandatory) updates open a blocking modal popup that cannot be closed
 *   via Escape, backdrop click, or Android back button and direct the user to
 *   the store (or reload the web app).
 * - Soft (optional) updates open a dismissible modal popup with persistent
 *   24-hour snooze.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpdateState>(initialUpdateState)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const refresh = useRef<(() => Promise<void>) | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const watcher = watchUpdates(setState)
    refresh.current = watcher.refresh
    return () => {
      watcher.dispose()
      refresh.current = null
    }
  }, [])

  const policy = state.policy
  const resolvedVersions = policy ? resolvePolicyVersions(policy, state.platform) : null
  const targetVersion = resolvedVersions?.latestVersion ?? policy?.latestVersion ?? null

  const isHard = Boolean(policy && state.updateUrl && state.decision === 'hard')
  const isSoftVisible = Boolean(
    policy &&
      state.updateUrl &&
      state.decision === 'soft' &&
      targetVersion &&
      dismissedVersion !== targetVersion &&
      !softUpdateDismissed(localStorage, targetVersion),
  )

  useEffect(() => {
    if (!isHard) return
    heading.current?.focus()
    setBackInterceptor(() => true)
    return () => setBackInterceptor(null)
  }, [isHard])

  useEffect(() => {
    if (!isSoftVisible || !targetVersion) return
    heading.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissSoftUpdate(localStorage, targetVersion)
        setDismissedVersion(targetVersion)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isSoftVisible, targetVersion])

  if (!policy || !state.updateUrl || state.decision === 'none' || (!isHard && !isSoftVisible)) {
    return <>{children}</>
  }

  const postpone = () => {
    if (!targetVersion) return
    dismissSoftUpdate(localStorage, targetVersion)
    setDismissedVersion(targetVersion)
  }

  const retry = async () => {
    if (!refresh.current) return
    setRetrying(true)
    try {
      await refresh.current()
    } finally {
      setRetrying(false)
    }
  }

  const handleWebReload = () => {
    try {
      const target = new URL(state.updateUrl!)
      if (target.origin === window.location.origin) {
        window.location.reload()
        return
      }
    } catch {
      // Fallback to direct anchor navigation.
    }
    window.open(state.updateUrl!, '_blank', 'noopener,noreferrer')
  }

  const actionLabel = storeActionLabel(state.platform)

  return (
    <>
      {!isHard && children}
      <div
        className={isHard ? 'mizan-update-backdrop mizan-update-backdrop--hard' : 'mizan-update-backdrop'}
        onClick={isHard ? undefined : postpone}
      >
        <section
          role={isHard ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-labelledby="update-dialog-title"
          aria-describedby="update-dialog-desc"
          className="mizan-update-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mizan-update-modal-header">
            <div className="mizan-update-brand-row">
              <Brand size={32} />
              <span className={isHard ? 'mizan-update-badge mizan-update-badge--hard' : 'mizan-update-badge'}>
                {isHard ? (
                  <>
                    <ShieldAlert size={13} aria-hidden="true" /> Zorunlu güncelleme
                  </>
                ) : (
                  <>
                    <Download size={13} aria-hidden="true" /> Yeni sürüm
                  </>
                )}
              </span>
            </div>
            {!isHard && (
              <button
                type="button"
                aria-label="Kapat"
                className="mizan-update-close"
                onClick={postpone}
              >
                <X size={18} />
              </button>
            )}
          </div>

          <h1 id="update-dialog-title" tabIndex={-1} ref={heading} className="mizan-update-title">
            {isHard ? 'Devam etmek için Mizan’ı güncelle' : 'Mizan’ın yeni sürümü hazır'}
          </h1>

          <p id="update-dialog-desc" className="mizan-update-desc">
            {policy.message ||
              (isHard
                ? 'Bu sürüm artık desteklenmiyor. Kayıtlarınla güvenli şekilde devam etmek için en yeni Mizan sürümünü yükle.'
                : `${targetVersion} sürümündeki yeniliklerle devam et. Dilersen mevcut sürümünü kullanmayı sürdürebilirsin.`)}
          </p>

          <div className="mizan-update-meta">
            <span>
              Yüklü sürüm <strong>{state.currentVersion}</strong>
            </span>
            {targetVersion && (
              <span>
                Yeni sürüm <strong>{targetVersion}</strong>
              </span>
            )}
          </div>

          <div className="mizan-update-modal-actions">
            {state.platform === 'web' ? (
              <button type="button" className="primary-button mizan-update-cta" onClick={handleWebReload}>
                {actionLabel} <RefreshCw size={16} />
              </button>
            ) : (
              <a
                className="primary-button mizan-update-cta"
                href={state.updateUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {actionLabel} <ArrowUpRight size={18} />
              </a>
            )}

            {isHard ? (
              <button
                type="button"
                className="text-button mizan-update-secondary"
                disabled={retrying}
                onClick={() => { void retry() }}
              >
                <RefreshCw size={15} className={retrying ? 'update-refreshing' : ''} />
                {retrying ? 'Kontrol ediliyor…' : 'Yeniden kontrol et'}
              </button>
            ) : (
              <button type="button" className="quiet-button mizan-update-secondary" onClick={postpone}>
                Daha Sonra
              </button>
            )}
          </div>

          {isHard && state.status === 'offline' && (
            <p className="mizan-update-offline" role="status">
              Son doğrulanan güncelleme bilgisi gösteriliyor. Yeniden kontrol için internete bağlan.
            </p>
          )}
        </section>
      </div>
    </>
  )
}
