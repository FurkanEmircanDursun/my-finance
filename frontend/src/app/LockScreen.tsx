import { useEffect, useState } from 'react'
import { Delete, Lock } from 'lucide-react'
import { PIN_LENGTH, verifyPin } from '../core/pin'
import { BrandMark } from '../ui/Brand'
import { hapticImpact, hapticTap, hapticWarn } from '../platform/haptics'

/**
 * Tactile full-screen PIN security vault.
 * Supports touch keypad and physical keyboard entry with spring press physics
 * and shake-on-mismatch feedback.
 */
export function LockScreen({
  hash,
  salt,
  onUnlock,
  onForgotPin,
  resetError,
}: {
  hash: string
  salt: string
  onUnlock: () => void
  onForgotPin: () => void | Promise<void>
  resetError?: string | null
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
        hapticImpact()
        onUnlock()
        return
      }
      hapticWarn()
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
    hapticTap()
    setError(false)
    setPin((prev) => (prev.length < PIN_LENGTH ? prev + digit : prev))
  }

  const backspace = () => {
    if (checking) return
    hapticTap()
    setError(false)
    setPin((prev) => prev.slice(0, -1))
  }

  // Desktop keyboard support
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (confirmingReset) return
      if (/^[0-9]$/.test(event.key)) press(event.key)
      else if (event.key === 'Backspace') backspace()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmingReset, checking])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-bg px-6" style={{ backgroundImage: 'var(--mesh-bg)' }}>
      <div className="flex flex-col items-center gap-3.5 text-center">
        <div className="relative">
          <BrandMark size={54} />
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-raised text-accent-text shadow-card">
            <Lock size={12} />
          </span>
        </div>
        <div>
          <h1 className="text-title font-semibold text-ink">Mizan Kilitli</h1>
          <p className={`mt-1 text-label ${error ? 'font-semibold text-negative' : 'text-muted'}`}>
            {error ? 'PIN yanlış, tekrar deneyin' : 'Devam etmek için 4 haneli PIN girin'}
          </p>
        </div>
      </div>

      {resetError && (
        <p className="max-w-xs text-center text-label text-negative" role="alert">
          {resetError}
        </p>
      )}

      <div
        className="flex gap-4"
        style={error ? { animation: 'mizan-shake 360ms ease-in-out' } : undefined}
        aria-label={`${pin.length} / ${PIN_LENGTH} hane girildi`}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < pin.length
          return (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full border transition-all duration-150 ${
                error
                  ? 'scale-110 border-negative bg-negative'
                  : filled
                    ? 'scale-110 border-accent bg-accent shadow-glow'
                    : 'border-line-strong bg-sunken'
              }`}
            />
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            className="num flex h-[68px] w-[68px] items-center justify-center rounded-full border border-line bg-raised text-figure font-semibold text-ink shadow-card transition-all duration-150 hover:border-line-strong hover:bg-hover active:scale-90 active:bg-accent-soft active:text-accent-text"
          >
            {digit}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => press('0')}
          className="num flex h-[68px] w-[68px] items-center justify-center rounded-full border border-line bg-raised text-figure font-semibold text-ink shadow-card transition-all duration-150 hover:border-line-strong hover:bg-hover active:scale-90 active:bg-accent-soft active:text-accent-text"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          aria-label="Sil"
          className="flex h-[68px] w-[68px] items-center justify-center rounded-full text-muted transition-all duration-150 hover:bg-hover hover:text-ink active:scale-90"
        >
          <Delete size={22} />
        </button>
      </div>

      {!confirmingReset ? (
        <button
          type="button"
          onClick={() => setConfirmingReset(true)}
          className="text-label font-medium text-muted hover:text-ink hover:underline"
        >
          PIN&apos;i mi unuttunuz?
        </button>
      ) : (
        <div className="max-w-xs space-y-3 rounded-[var(--radius-lg)] border border-line bg-raised p-4 text-center shadow-card rise-in">
          <p className="text-label leading-relaxed text-muted">
            Çıkış yapıp Firebase hesabınla yeniden giriş yapabilirsin.
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                void Promise.resolve(onForgotPin()).catch(() => {})
              }}
              className="rounded-[var(--radius-sm)] bg-negative-soft px-3.5 py-2 text-label font-semibold text-negative"
            >
              Çıkış yap
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReset(false)}
              className="rounded-[var(--radius-sm)] border border-line bg-sunken px-3.5 py-2 text-label font-medium text-muted hover:text-ink"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
