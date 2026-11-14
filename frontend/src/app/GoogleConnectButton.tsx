import { useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { Button } from '../ui/primitives'
import { useStore } from '../store/AppStore'

/** A direct Google entry point for onboarding and the account summary. */
export function GoogleConnectButton({
  className,
  disabled = false,
  onConnected,
}: {
  className?: string
  disabled?: boolean
  onConnected?: () => void
}) {
  const { authReady, authUser, refreshAuthUser } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const connected = authUser && !authUser.isAnonymous

  const connect = async () => {
    if (busy || disabled || !authReady) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const { signInWithGoogle, authErrorMessage } = await import('../firebase/auth')
      try {
        const result = await signInWithGoogle()
        if (result === 'done') {
          refreshAuthUser()
          onConnected?.()
        } else if (result === 'cancelled') {
          setNotice('Giriş iptal edildi. İstediğin zaman yeniden deneyebilirsin.')
        } else {
          setNotice('Google’a yönlendiriliyorsun…')
        }
      } catch (err) {
        setError(authErrorMessage(err))
      }
    } catch {
      setError('Giriş servisi açılamadı. İnternet bağlantını kontrol edip yeniden dene.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      <Button className="google-connect-button w-full" onClick={() => void connect()} disabled={disabled || busy || !authReady || Boolean(connected)} aria-busy={busy}>
        {connected ? <Check size={18} /> : busy ? <LoaderCircle size={18} className="motion-safe:animate-spin" /> : <GoogleMark />}
        {connected ? 'Hesabın bağlı' : busy ? 'Google açılıyor…' : !authReady ? 'Hesabın kontrol ediliyor…' : 'Google ile devam et'}
      </Button>
      {error && <p className="mt-2 text-label text-negative" role="alert">{error}</p>}
      {notice && <p className="mt-2 text-label text-muted" role="status">{notice}</p>}
    </div>
  )
}

/** Google's mark retains its brand colours independently of the app theme. */
export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.2 7-10.3 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}
