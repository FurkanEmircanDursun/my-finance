import { initializeApp } from 'firebase/app'
import { initializePerformance, trace, type FirebasePerformance } from 'firebase/performance'
import { isDiagnosticEnvelope, isFixedDiagnosticsDocument } from './diagnosticsContract'

// Performance reads its window URL at send time. This fixed document prevents
// parent routes, queries and card IDs entering that SDK-controlled field.
if (window.parent !== window && isFixedDiagnosticsDocument(window.location.href)) {
  let service: FirebasePerformance | undefined
  let channel: string | undefined
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== window.location.origin || !isDiagnosticEnvelope(event.data)) return
    const message = event.data
    try {
      if (message.type === 'init' && !service) {
        channel = message.channel
        service = initializePerformance(initializeApp(message.payload), { instrumentationEnabled: false, dataCollectionEnabled: true })
        service.instrumentationEnabled = false
        window.parent.postMessage({ channel, type: 'ready' }, event.origin)
      } else if (message.type === 'sample' && service && message.channel === channel) {
        trace(service, `mizan_${message.payload.name}`).record(Date.now() - message.payload.durationMs, message.payload.durationMs)
      }
    } catch {
      // A single dropped duration must not disable subsequent measurement.
      if (message.type === 'init') window.parent.postMessage({ channel: message.channel, type: 'error' }, event.origin)
    }
  })
}
