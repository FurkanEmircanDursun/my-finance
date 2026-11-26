import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { firebaseErrorMessage } from '../firebase/errors'
import { recordCrashError } from '../platform/crashlytics'
import { BrandMark } from '../ui/Brand'

interface State {
  error: Error | null
}

/**
 * Last-resort error boundary preserving strict privacy (no SDK internals or
 * reset suggestions) in the 2026 Obsidian Equilibrium aesthetic.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uygulama hatası:', error, info.componentStack)
    void recordCrashError(error, {
      source: 'react_error_boundary',
      componentStack: info.componentStack ?? undefined,
    })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div className="bento-card w-full max-w-md space-y-4">
          <div className="flex items-center gap-3">
            <BrandMark size={38} />
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-negative-soft text-negative">
              <AlertTriangle size={18} />
            </span>
          </div>
          <div>
            <h1 className="text-title font-semibold text-ink">Beklenmeyen bir hata oluştu</h1>
            <p className="mt-1.5 text-label leading-relaxed text-muted">
              Kayıtlarını temizlemeden sayfayı yenileyip yeniden dene. Sorun sürerse uygulamayı kapatıp yeniden aç.
            </p>
          </div>
          <p role="alert" className="rounded-[var(--radius)] border border-line bg-sunken p-3 text-body text-muted">
            {firebaseErrorMessage(error)}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="primary-button w-full"
          >
            <RefreshCw size={16} />
            Sayfayı yenile
          </button>
        </div>
      </div>
    )
  }
}
