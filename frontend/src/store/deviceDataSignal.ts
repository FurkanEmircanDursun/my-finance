const CHANNEL_NAME = 'mizan-device-data'
const STORAGE_KEY = 'mizan.device-data-change.v1'
const SIGNAL_TYPE = 'device-data-change'

function channel(): BroadcastChannel | null {
  try { return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME) } catch { return null }
}

/** Only invalidates a device-local generation; no account or financial data travels. */
export function announceDeviceDataChange(): void {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  try { localStorage.setItem(STORAGE_KEY, nonce) } catch { /* BroadcastChannel and focus checks still work. */ }
  const sender = channel()
  if (!sender) return
  try { sender.postMessage({ type: SIGNAL_TYPE, nonce }) } catch { /* The persisted generation remains authoritative. */ } finally { sender.close() }
}

/** Receivers re-read the authoritative IndexedDB generation before changing state. */
export function watchDeviceDataChange(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  let disposed = false
  let lastNonce: string | undefined
  const receive = (nonce: unknown) => {
    if (disposed || typeof nonce !== 'string' || nonce.length === 0 || nonce.length > 128 || nonce === lastNonce) return
    lastNonce = nonce
    callback()
  }
  const listener = channel()
  if (listener) listener.onmessage = event => {
    if (event.data?.type === SIGNAL_TYPE) receive(event.data.nonce)
  }
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) receive(event.newValue) }
  const checkGeneration = () => { if (!disposed) callback() }
  window.addEventListener('storage', onStorage)
  window.addEventListener('focus', checkGeneration)
  window.addEventListener('pageshow', checkGeneration)
  return () => {
    disposed = true
    if (listener) { listener.onmessage = null; listener.close() }
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', checkGeneration)
    window.removeEventListener('pageshow', checkGeneration)
  }
}
