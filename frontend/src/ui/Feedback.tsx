import { createContext, useContext, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { createPortal } from 'react-dom'

interface Feedback { message: string; undo?: () => void }
const FeedbackContext = createContext<(feedback: Feedback) => void>(() => {})

export function useFeedback() { return useContext(FeedbackContext) }

/** Persistent, dismissible feedback keeps undo available without a time limit. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  return <FeedbackContext.Provider value={setFeedback}>
    {children}
    {feedback && createPortal(<div className="save-feedback">
      <div role="status" className="save-feedback-message"><span className="save-check"><Check size={18} /></span>{feedback.message}</div>
      {feedback.undo && <button type="button" onClick={() => { feedback.undo?.(); setFeedback({ message: 'Kayıt geri alındı.' }) }}>Geri al</button>}
      <button type="button" aria-label="Bildirimi kapat" onClick={() => setFeedback(null)}><X size={18} /></button>
    </div>, document.body)}
  </FeedbackContext.Provider>
}
