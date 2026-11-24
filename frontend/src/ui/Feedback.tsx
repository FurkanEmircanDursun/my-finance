import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { hapticTap } from '../platform/haptics'

interface Feedback { message: string; undo?: () => string | void }
const FeedbackContext = createContext<(feedback: Feedback) => void>(() => {})
const FeedbackHostContext = createContext<(host: HTMLElement) => () => void>(() => () => {})

export function useFeedback() { return useContext(FeedbackContext) }

/** Keep feedback inside the active dialog's layout and keyboard focus boundary. */
export function FeedbackHost() {
  const ref = useRef<HTMLDivElement>(null)
  const register = useContext(FeedbackHostContext)
  useEffect(() => ref.current ? register(ref.current) : undefined, [register])
  return <div ref={ref} className="feedback-slot" />
}

/** Persistent, dismissible frosted feedback toast with spring checkmark and instant Undo. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [hosts, setHosts] = useState<HTMLElement[]>([])
  const registerHost = useCallback((host: HTMLElement) => {
    setHosts(current => [...current, host])
    return () => setHosts(current => current.filter(item => item !== host))
  }, [])
  const host = hosts[hosts.length - 1]
  return <FeedbackContext.Provider value={setFeedback}>
    <FeedbackHostContext.Provider value={registerHost}>
    {children}
    {feedback && createPortal(<div className={`save-feedback${host ? ' save-feedback-inline' : ''}`}>
      <div role="status" className="save-feedback-message">
        <span className="save-check"><Check size={16} strokeWidth={2.5} /></span>
        <span>{feedback.message}</span>
      </div>
      {feedback.undo && (
        <button
          type="button"
          className="save-feedback__undo"
          onClick={() => {
            hapticTap()
            setFeedback({ message: feedback.undo?.() ?? 'Kayıt geri alındı.' })
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
    </div>, host ?? document.body)}
    </FeedbackHostContext.Provider>
  </FeedbackContext.Provider>
}
