import { Cloud, CircleCheck, CloudOff, RefreshCw, ChevronRight, UserRound } from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../store/AppStore'
import { describeSync } from '../sync/present'
import { Button, Skeleton } from '../ui/primitives'
import { GoogleConnectButton } from './GoogleConnectButton'
import { useNow } from './useNow'
import './account.css'

/** Visible, truthful account status; Google is an action, not a hidden setting. */
export function AccountPanel({ onOpen, compact = false }: { onOpen: () => void; compact?: boolean }) {
  const { cloudAvailable, authReady, authError, retryAuth, authUser, sync, syncNow } = useStore()
  const now = useNow()
  const signedIn = authUser && !authUser.isAnonymous
  const view = describeSync(sync, now)

  if (!cloudAvailable) return (
    <section className="account-panel account-panel--local" aria-label="Hesap durumu">
      <CloudOff size={20} aria-hidden="true" />
      <p>Verilerin bu cihazda. Bu sürüm için bulut bağlantısı yapılandırılmadı.</p>
    </section>
  )

  if (!authReady) return <Skeleton className={compact ? 'h-11 w-32' : 'h-28 w-full'} />

  if (compact) return (
    <button type="button" className={clsx('account-pill', authError && 'account-pill--warning')} onClick={onOpen} aria-label={signedIn ? `Hesabım. ${view.title}` : 'Google girişi ve senkronizasyon'}>
      {signedIn ? sync.status === 'synced' ? <CircleCheck size={18} /> : sync.status === 'offline' ? <CloudOff size={18} /> : <Cloud size={18} /> : <UserRound size={18} />}
      <span>{signedIn ? 'Hesabım' : 'Giriş yap'}</span>
      {signedIn && <span className={clsx('account-pill__dot', `account-tone-${view.tone}`)} aria-hidden="true" />}
    </button>
  )

  return (
    <section className={clsx('account-panel', signedIn && 'account-panel--connected')} aria-label="Hesap ve senkronizasyon">
      <div className="account-panel__intro">
        <span className="account-panel__icon" aria-hidden="true">{signedIn ? <CircleCheck size={22} /> : <Cloud size={22} />}</span>
        <div className="account-panel__copy">
          <h2>{signedIn ? (authUser.displayName ?? authUser.email ?? 'Hesabım') : 'Her cihazda, aynı bütçe.'}</h2>
          <p>{signedIn ? view.detail : 'Google ile bağlan. Kayıtların telefonunda ve bilgisayarında eşitlensin.'}</p>
        </div>
      </div>

      {authError && (
        <div className="account-panel__error" role="alert">
          <p>{authError}</p>
          <Button size="sm" onClick={retryAuth}>Bağlantıyı yeniden dene</Button>
        </div>
      )}

      {signedIn ? (
        <div className="account-panel__footer">
          <span className={clsx('account-panel__status', `account-tone-${view.tone}`)} role="status">
            <span className="account-pill__dot" aria-hidden="true" />{view.title}
          </span>
          {sync.status === 'error' || sync.status === 'offline' ? (
            <Button size="sm" onClick={syncNow}><RefreshCw size={15} />Yeniden eşitle</Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onOpen}>Hesabı yönet<ChevronRight size={15} /></Button>
        </div>
      ) : (
        <div className="account-panel__actions">
          <GoogleConnectButton />
          <Button variant="ghost" onClick={onOpen}>Diğer giriş seçenekleri<ChevronRight size={15} /></Button>
        </div>
      )}
    </section>
  )
}
