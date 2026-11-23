import { cloudAvailable } from '../firebase/available'
import { DIAGNOSTICS_PATH, isDiagnosticSample, type DiagnosticTrace } from './diagnosticsContract'

export const DIAGNOSTICS_UPDATED = 'mizan:diagnostics-updated'
export type { DiagnosticTrace } from './diagnosticsContract'
export interface DiagnosticsStatus { enabled: boolean; active: boolean; error?: string }
interface Bridge { frame: HTMLIFrameElement; origin: string; channel: string; ready: boolean; dispose: () => void }
let bridge: Bridge | undefined
let generation = 0
let starting: Promise<void> | undefined
let error: string | undefined
let consentGranted = false

export function diagnosticsConsent(): boolean {
  return consentGranted
}
export function diagnosticsStatus(): DiagnosticsStatus {
  return { enabled: diagnosticsConsent(), active: Boolean(bridge?.ready), error }
}
function notify(): void { window.dispatchEvent(new Event(DIAGNOSTICS_UPDATED)) }
function stopBridge(): void { generation++; bridge?.dispose(); bridge = undefined }

async function applyDiagnostics(): Promise<void> {
  if (!diagnosticsConsent()) { stopBridge(); error = undefined; notify(); return }
  if (bridge?.ready) return
  if (!cloudAvailable) { error = 'Bu derlemede Firebase performans bağlantısı bulunmuyor.'; notify(); return }
  const attempt = ++generation
  try {
    const { getFirebaseApp } = await import('../firebase/config')
    if (!diagnosticsConsent() || attempt !== generation) return
    const { apiKey, projectId, appId } = getFirebaseApp().options
    const origin = window.location.origin
    if (!apiKey || !projectId || !appId || origin === 'null') throw new Error('Unavailable transport')
    await new Promise<void>(resolve => {
      const frame = document.createElement('iframe')
      frame.hidden = true
      frame.title = 'Mizan performans ölçümü'
      frame.referrerPolicy = 'no-referrer'
      frame.src = new URL(DIAGNOSTICS_PATH, origin).href
      const channel = String(attempt)
      let timeout: ReturnType<typeof setTimeout> | undefined
      const dispose = () => { clearTimeout(timeout); window.removeEventListener('message', onMessage); frame.remove(); resolve() }
      const fail = () => {
        if (attempt !== generation) return
        error = 'Performans ölçümü şu anda bağlanamadı. Tercihini yeniden deneyebilirsin.'
        dispose(); bridge = undefined; notify()
      }
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== origin || event.source !== frame.contentWindow || event.data?.channel !== channel || attempt !== generation || !diagnosticsConsent()) return
        if (event.data.type === 'ready' && bridge?.frame === frame) { clearTimeout(timeout); bridge.ready = true; error = undefined; notify(); resolve() }
        if (event.data.type === 'error') fail()
      }
      bridge = { frame, origin, channel, ready: false, dispose }
      window.addEventListener('message', onMessage)
      frame.addEventListener('load', () => {
        if (attempt === generation && diagnosticsConsent()) frame.contentWindow?.postMessage({ channel, type: 'init', payload: { apiKey, projectId, appId } }, origin)
      }, { once: true })
      frame.addEventListener('error', fail, { once: true })
      timeout = setTimeout(fail, 8000)
      document.body.append(frame)
    })
  } catch {
    if (attempt === generation) { stopBridge(); error = 'Performans ölçümü şu anda bağlanamadı. Tercihini yeniden deneyebilirsin.'; notify() }
  }
}
function synchronize(): Promise<void> {
  if (starting) return starting.then(() => applyDiagnostics())
  starting = applyDiagnostics().finally(() => { starting = undefined })
  return starting
}
/** Removing the frame discards its SDK queues. Consent expires with this session. */
export function setDiagnosticsConsent(enabled: boolean): Promise<void> {
  consentGranted = enabled
  if (!enabled) stopBridge()
  notify()
  return synchronize()
}
export function initializeDiagnostics(): () => void {
  void synchronize()
  return stopBridge
}
/** Only bounded names and durations cross into the fixed-URL measurement realm. */
export function recordDiagnostic(name: DiagnosticTrace, durationMs: number): boolean {
  if (!isDiagnosticSample({ name, durationMs }) || !diagnosticsConsent() || !bridge?.ready || !bridge.frame.contentWindow) return false
  try { bridge.frame.contentWindow.postMessage({ channel: bridge.channel, type: 'sample', payload: { name, durationMs } }, bridge.origin); return true } catch { return false }
}
export async function measureOperation<T>(name: DiagnosticTrace, operation: () => Promise<T>): Promise<T> {
  const started = Date.now()
  try { return await operation() } finally { recordDiagnostic(name, Date.now() - started) }
}
