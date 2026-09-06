import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * A parse or render failure must not leave the user staring at a blank page —
 * the previous build's boundary swallowed the message, so a broken statement
 * looked identical to a broken app.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uygulama hatası:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="surface w-full max-w-md space-y-3 p-5">
          <h1 className="text-[13px] font-semibold text-ink">Beklenmeyen bir hata oluştu</h1>
          <p className="text-2xs leading-relaxed text-muted">
            Kayıtlı verileriniz silinmedi. Sayfayı yenilemek çoğu durumda yeterlidir; sorun sürerse Ayarlar
            bölümünden JSON yedeği alıp verileri sıfırlayabilirsiniz.
          </p>
          <pre className="max-h-40 overflow-auto rounded border border-line bg-sunken p-2.5 text-2xs text-muted">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-9 w-full rounded bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
          >
            Sayfayı yenile
          </button>
        </div>
      </div>
    )
  }
}
