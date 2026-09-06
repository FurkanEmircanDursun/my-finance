import { useEffect, useState } from 'react'
import { Delete, Lock } from 'lucide-react'
import { PIN_LENGTH, verifyPin } from '../core/pin'

/**
 * A full-screen gate, not a modal over the app — the whole point is that
 * nothing behind it should be reachable (or screenshotted) until the PIN is
 * right. Shown once per app start (see `App.tsx`), and again after Android
 * backgrounds the app while a PIN is set (see `platform/native.ts`).
 */
export function LockScreen({
  hash,
  salt,
  onUnlock,
  onForgotPin,
}: {
  hash: string
  salt: string
  onUnlock: () => void
  /**
   * The PIN is a screen gate, not encryption — the data underneath is no more
   * protected from it than from Android's own "clear app data" or clearing
   * site data in a browser, both of which reach the same place without ever
   * seeing this screen. Refusing a recovery path here would not add security
   * against that; it would only add a way to lock someone out of their own
   * finances over four forgotten digits.
   */
  onForgotPin: () => void
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  useEffect(() => {
    if (pin.length < PIN_LENGTH || checking) return
    let cancelled = false
    setChecking(true)
    verifyPin(pin, salt, hash).then((ok) => {
      if (cancelled) return
      if (ok) {
        onUnlock()
        return
      }
      setError(true)
      setPin('')
      setChecking(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const press = (digit: string) => {
    if (checking) return
    setError(false)
    setPin((prev) => (prev.length < PIN_LENGTH ? prev + digit : prev))
  }

  const backspace = () => {
    if (checking) return
    setError(false)
    setPin((prev) => prev.slice(0, -1))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-bg px-6">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-raised text-muted">
          <Lock size={18} />
        </span>
        <p className="text-body font-medium text-ink">
          {error ? 'PIN yanlış, tekrar deneyin' : 'Devam etmek için PIN girin'}
        </p>
      </div>

      <div className={`flex gap-3 ${error ? 'animate-pulse' : ''}`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full border ${
              i < pin.length ? 'border-accent bg-accent' : 'border-line-strong bg-transparent'
            } ${error ? 'border-negative bg-negative' : ''}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            className="num flex h-16 w-16 items-center justify-center rounded-full text-xl font-medium text-ink transition-colors hover:bg-hover active:bg-hover"
          >
            {digit}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => press('0')}
          className="num flex h-16 w-16 items-center justify-center rounded-full text-xl font-medium text-ink transition-colors hover:bg-hover active:bg-hover"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          aria-label="Sil"
          className="flex h-16 w-16 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover active:bg-hover"
        >
          <Delete size={20} />
        </button>
      </div>

      {!confirmingReset ? (
        <button
          type="button"
          onClick={() => setConfirmingReset(true)}
          className="text-label text-muted hover:text-ink hover:underline"
        >
          PIN'i mi unuttunuz?
        </button>
      ) : (
        <div className="max-w-xs space-y-3 rounded border border-line bg-sunken p-3 text-center">
          <p className="text-label leading-relaxed text-muted">
            Bu cihazdaki tüm yerel veriler silinir ve kilit kaldırılır. Buluta yedeklediyseniz (Ayarlar →
            Hesap) giriş yaptığınızda geri gelir; yedeğiniz yoksa veriler kalıcı olarak kaybolur.
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={onForgotPin}
              className="rounded border border-negative bg-negative-soft px-2.5 py-1.5 text-label font-medium text-negative"
            >
              Verileri sil, kilidi kaldır
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReset(false)}
              className="rounded border border-line bg-raised px-2.5 py-1.5 text-label text-muted hover:text-ink"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
