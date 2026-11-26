import { useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { Button } from '../ui/primitives'
import { useStore } from '../store/AppStore'

/** A direct Sign in with Apple entry point for iOS, web, and the account summary. */
export function AppleConnectButton({
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
      const { signInWithApple, authErrorMessage } = await import('../firebase/auth')
      try {
        const result = await signInWithApple()
        if (result === 'done') {
          refreshAuthUser()
          onConnected?.()
        } else if (result === 'cancelled') {
          setNotice('Giriş iptal edildi. İstediğin zaman yeniden deneyebilirsin.')
        } else {
          setNotice('Apple’a yönlendiriliyorsun…')
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
      <Button
        className="apple-connect-button w-full"
        onClick={() => void connect()}
        disabled={disabled || busy || !authReady || Boolean(connected)}
        aria-busy={busy}
      >
        {connected ? (
          <Check size={18} />
        ) : busy ? (
          <LoaderCircle size={18} className="motion-safe:animate-spin" />
        ) : (
          <AppleMark />
        )}
        {connected
          ? 'Hesabın bağlı'
          : busy
            ? 'Apple açılıyor…'
            : !authReady
              ? 'Hesabın kontrol ediliyor…'
              : 'Apple ile devam et'}
      </Button>
      {error && (
        <p className="mt-2 text-label text-negative" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-2 text-label text-muted" role="status">
          {notice}
        </p>
      )}
    </div>
  )
}

/** Monochrome Apple mark following Apple Human Interface Guidelines. */
export function AppleMark() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 170 170"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.13-1.9-14.34-6.08-3.69-3.03-7.61-7.82-11.77-14.37-5.93-9.22-10.72-19.93-14.38-32.15-3.66-12.22-5.49-23.95-5.49-35.2 0-13.09 3.35-24.06 10.05-32.91 6.7-8.85 15.07-13.42 25.12-13.7 4.91 0 10.48 1.54 16.71 4.6 6.22 3.06 10.22 4.62 11.99 4.68 1.34 0 5.79-1.82 13.35-5.46 7.56-3.64 13.94-5.14 19.14-4.52 14.15 1.14 24.77 6.71 31.86 16.71-12.66 7.68-18.88 18.42-18.66 32.22.22 10.74 4.15 19.67 11.79 26.8 5.28 5.01 11.46 8.15 18.54 9.42-1.49 4.46-3.11 8.69-4.88 12.69zM119.22 31.01c0 8.21-3 15.88-8.98 22.99-7.21 8.43-15.94 13.3-25.41 12.53-.15-.98-.24-2.01-.24-3.1 0-7.88 3.43-16.31 10.29-24.13 3.28-3.75 7.45-6.87 12.51-9.36 5.05-2.46 9.83-3.82 14.33-4.08.16 1.72.24 3.44.24 5.15h-2.74z" />
    </svg>
  )
}
