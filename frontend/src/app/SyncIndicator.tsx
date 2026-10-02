import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../store/AppStore'
import { describeSync, type Tone } from '../sync/present'
import { hapticTap } from '../platform/haptics'
import { useNow } from './useNow'
import { useSheets } from './sheets'

const DOT: Record<Tone, string> = {
  positive: 'bg-positive',
  accent: 'bg-accent',
  warning: 'bg-warning',
  negative: 'bg-negative',
  neutral: 'bg-line-strong',
}

/**
 * The one place the header says whether the data is safe in the cloud.
 *
 * Quiet by design: a plain cloud when nothing is happening, a coloured dot when
 * there is something worth knowing. Offline is amber and calm; only a failure
 * that survives a working network is red. Signed out it is a muted cloud — an
 * invitation, not an alarm — and absent altogether on a build with no cloud.
 */
export function SyncIndicator() {
  const { cloudAvailable, authReady, authUser, sync } = useStore()
  const { openAccount } = useSheets()
  const now = useNow()

  if (!cloudAvailable) return null

  // Holds the slot while Firebase answers, so the icons beside it do not jump.
  if (!authReady) return <span className="h-11 w-11" aria-hidden />

  const signedIn = authUser !== null
  const view = signedIn ? describeSync(sync, now) : null

  const Icon = !signedIn
    ? Cloud
    : view!.busy
      ? RefreshCw
      : sync.status === 'offline'
        ? CloudOff
        : sync.status === 'error' || sync.status === 'decision'
          ? TriangleAlert
          : Cloud

  const label = view
    ? `Bulut: ${view.title}. ${view.detail}`
    : 'Bulut senkronu kapalı. Giriş yaparak aç.'

  return (
    <button
      type="button"
      onClick={() => {
        hapticTap()
        openAccount()
      }}
      aria-label={label}
      title={label}
      className={clsx(
        'relative inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius)]',
        'transition-colors duration-200 hover:bg-hover hover:text-ink',
        !signedIn ? 'text-faint' : sync.status === 'decision' || sync.status === 'error' ? 'text-warning' : 'text-muted',
      )}
    >
      <Icon size={18} className={clsx(view?.busy && 'motion-safe:animate-spin')} />
      {view && !view.busy && view.tone !== 'neutral' && (
        <span
          aria-hidden
          className={clsx('absolute right-[9px] top-[9px] h-2 w-2 rounded-full ring-2 ring-bg', DOT[view.tone])}
        />
      )}
    </button>
  )
}
