import { useEffect, useRef, useState } from 'react'
import { watchSharedPdfs, type SharedPdfDelivery } from '../platform/sharedPdf'
import { SharedImportHandoff } from '../app/sharedImportHandoff'

export function useSharedPdfImport() {
  const [delivery, setDelivery] = useState<SharedPdfDelivery | null>(null)
  const [error, setError] = useState('')
  const handoff = useRef<SharedImportHandoff | null>(null)
  const receiver = useRef<{ dispose(): void; retry(): Promise<void> } | null>(null)
  useEffect(() => {
    let active = true
    const session = new SharedImportHandoff(setDelivery)
    handoff.current = session
    void Promise.resolve(watchSharedPdfs({
      onFiles: incoming => { if (active) setError(''); return session.receive(incoming) },
      onError: message => { if (active) setError(message) },
    })).then(watcher => {
      if (active) receiver.current = watcher
      else watcher.dispose()
    }).catch(() => { if (active) setError('Paylaşılan PDF alınamadı. Dosyayı yeniden paylaşmayı dene.') })
    return () => {
      active = false
      session.dispose()
      receiver.current?.dispose()
      receiver.current = null
      handoff.current = null
    }
  }, [])
  const finish = () => { if (delivery) handoff.current?.complete(delivery.id) }
  const retry = () => {
    setError('')
    void receiver.current?.retry().catch(() => setError('Paylaşılan PDF alınamadı. Dosyayı yeniden paylaşmayı dene.'))
  }
  return { delivery, error, finish, retry, dismissError: () => setError('') }
}
