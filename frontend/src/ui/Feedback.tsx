import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { hapticTap } from '../platform/haptics'

interface Feedback {
  message: string
  undo?: () => string | void
}

interface ActiveFeedback extends Feedback {
  id: number
  targetHost: HTMLElement | null
}

const FeedbackContext = createContext<(feedback: Feedback) => void>(() => {})
const FeedbackHostContext = createContext<(host: HTMLElement) => () => void>(() => () => {})

export function useFeedback() {
  return useContext(FeedbackContext)
}

/** Keep feedback inside the active dialog's layout and keyboard focus boundary when triggered inside that dialog. */
export function FeedbackHost() {
  const ref = useRef<HTMLDivElement>(null)
  const register = useContext(FeedbackHostContext)
  useEffect(() => (ref.current ? register(ref.current) : undefined), [register])
  return <div ref={ref} className="feedback-slot" />
}

/**
 * Frosted feedback toast with spring checkmark, instant Undo, and auto-dismiss lifecycle.
 * Captures the modal host active at the moment feedback is emitted so a page-level toast
 * never jumps into a modal opened later.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<ActiveFeedback | null>(null)
  const [hosts, setHosts] = useState<HTMLElement[]>([])
  const [paused, setPaused] = useState(false)
  const hostsRef = useRef<HTMLElement[]>([])
  const seqRef = useRef(0)

  const registerHost = useCallback((host: HTMLElement) => {
    setHosts((current) => {
      const next = [...current, host]
      hostsRef.current = next
      return next
    })
    return () => {
      setHosts((current) => {
        const next = current.filter((item) => item !== host)
        hostsRef.current = next
        return next
      })
    }
  }, [])

  const showFeedback = useCallback((next: Feedback) => {
    const currentTopHost = hostsRef.current[hostsRef.current.length - 1] ?? null
    setFeedback({
      ...next,
      id: ++seqRef.current,
      targetHost: currentTopHost,
    })
  }, [])

  // Auto-dismiss after 6.5s (with Undo) or 4.2s (info only), pausing on hover/focus
  useEffect(() => {
    if (!feedback || paused) return
    const ttl = feedback.undo ? 6500 : 4200
    const timer = window.setTimeout(() => {
      setFeedback((current) => (current?.id === feedback.id ? null : current))
    }, ttl)
    return () => window.clearTimeout(timer)
  }, [feedback, paused])

  // Only render inside targetHost if that exact host is still mounted; otherwise render on document.body
  const activeHost =
    feedback?.targetHost && hosts.includes(feedback.targetHost) ? feedback.targetHost : null

  return (
    <FeedbackContext.Provider value={showFeedback}>
      <FeedbackHostContext.Provider value={registerHost}>
        {children}
        {feedback &&
          createPortal(
            <div
              key={feedback.id}
              className={`save-feedback${activeHost ? ' save-feedback-inline' : ''}`}
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
            >
              <div role="status" className="save-feedback-message">
                <span className="save-check">
                  <Check size={16} strokeWidth={2.5} />
                </span>
                <span>{feedback.message}</span>
              </div>
              {feedback.undo && (
                <button
                  type="button"
                  className="save-feedback__undo"
                  onClick={() => {
                    hapticTap()
                    showFeedback({ message: feedback.undo?.() ?? 'Kayıt geri alındı.' })
                  }}
                >
                  Geri al
                </button>
              )}
              <button
                type="button"
                className="save-feedback__close"
                aria-label="Bildirimi kapat"
                onClick={() => setFeedback(null)}
              >
                <X size={16} />
              </button>
            </div>,
            activeHost ?? document.body,
          )}
      </FeedbackHostContext.Provider>
    </FeedbackContext.Provider>
  )
}
