import { readFileSync } from 'node:fs'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ initializeApp: vi.fn(), initializePerformance: vi.fn(), trace: vi.fn(), record: vi.fn() }))
vi.mock('firebase/app', () => ({ initializeApp: mocks.initializeApp }))
vi.mock('firebase/performance', () => ({ initializePerformance: mocks.initializePerformance, trace: mocks.trace }))
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.initializeApp.mockReturnValue({ name: '[DEFAULT]' }); mocks.initializePerformance.mockReturnValue({ instrumentationEnabled: true }); mocks.trace.mockReturnValue({ record: mocks.record }) })
afterEach(() => vi.unstubAllGlobals())

function child(url = 'https://mizan.test/diagnostics.html') {
  const parent = { postMessage: vi.fn() }
  const frame = Object.assign(new EventTarget(), { location: new URL(url), parent })
  vi.stubGlobal('window', frame)
  const send = (data: unknown, source: unknown = parent, origin = 'https://mizan.test') => {
    const event = new Event('message'); Object.assign(event, { source, origin, data }); frame.dispatchEvent(event)
  }
  return { parent, frame, send }
}
const init = { channel: '3', type: 'init', payload: { apiKey: 'public-key', projectId: 'public-project', appId: 'public-app' } }
describe('isolated SDK entry', () => {
  it('initializes only its default app after a validated parent handshake and records bounded samples', async () => {
    const { send, parent } = child(); await import('./diagnosticsFrame')
    expect(mocks.initializePerformance).not.toHaveBeenCalled()
    send(init, {}); send(init, parent, 'https://attacker.test')
    expect(mocks.initializeApp).not.toHaveBeenCalled()
    send(init)
    expect(mocks.initializeApp).toHaveBeenCalledOnce()
    expect(mocks.initializeApp).toHaveBeenCalledWith(init.payload)
    expect(mocks.initializePerformance).toHaveBeenCalledWith({ name: '[DEFAULT]' }, { instrumentationEnabled: false, dataCollectionEnabled: true })
    expect(parent.postMessage).toHaveBeenCalledWith({ channel: '3', type: 'ready' }, 'https://mizan.test')
    send({ channel: '3', type: 'sample', payload: { name: 'quote_refresh', durationMs: 125 } })
    expect(mocks.trace).toHaveBeenCalledWith(expect.anything(), 'mizan_quote_refresh')
    expect(mocks.record).toHaveBeenCalledWith(expect.any(Number), 125)
    send({ channel: 'wrong', type: 'sample', payload: { name: 'quote_refresh', durationMs: 125 } })
    send({ channel: '3', type: 'sample', payload: { name: 'quote_refresh', durationMs: 125, card: 'PRIVATE' } })
    send({ channel: '3', type: 'sample', payload: { name: 'quote_refresh', durationMs: 0 } })
    expect(mocks.record).toHaveBeenCalledOnce()
    mocks.record.mockImplementationOnce(() => { throw new Error('Dropped sample') })
    send({ channel: '3', type: 'sample', payload: { name: 'quote_refresh', durationMs: 10 } })
    expect(parent.postMessage).not.toHaveBeenCalledWith({ channel: '3', type: 'error' }, expect.anything())
    send({ channel: '3', type: 'sample', payload: { name: 'quote_refresh', durationMs: 11 } })
    expect(mocks.record).toHaveBeenCalledTimes(3)
  })
  it.each(['https://mizan.test/diagnostics.html#/cards/PRIVATE', 'https://mizan.test/diagnostics.html?private=ID'])('does not initialize from an unsafe diagnostic URL %s', async url => {
    const { send } = child(url); await import('./diagnosticsFrame'); send(init)
    expect(mocks.initializeApp).not.toHaveBeenCalled()
  })
  it('does not initialize when opened as a top-level page', async () => {
    const { frame, send } = child(); Object.assign(frame, { parent: frame }); await import('./diagnosticsFrame'); send(init, frame)
    expect(mocks.initializeApp).not.toHaveBeenCalled()
  })
})

describe('installed Firebase Performance serializer contract', () => {
  it('serializes only the fixed frame URL even when the parent changes to a private card before send', () => {
    // Execute these unmodified functions from the installed SDK. This pins the
    // actual serializer behavior, including SDK-controlled application fields.
    const source = readFileSync(new URL('../../node_modules/@firebase/performance/dist/esm/index.esm.js', import.meta.url), 'utf8')
    const sdkFunction = (name: string) => {
      const start = source.indexOf(`function ${name}(`)
      expect(start).toBeGreaterThan(-1)
      return source.slice(start, source.indexOf('\n}', start) + 2)
    }
    const getUrlBody = source.match(/    getUrl\(\) \{([\s\S]*?)\n    \}/)?.[1]
    expect(getUrlBody).toBeTruthy()
    const frameLocation = { href: 'https://mizan.test/diagnostics.html' }
    const parentLocation = { href: 'https://mizan.test/#/cards/PRIVATE-CARD-1' }
    const actualGetUrl = new Function(getUrlBody!)
    const api = { getUrl: () => actualGetUrl.call({ windowLocation: frameLocation }) }
    const serialize = new Function('getAppId', 'getIid', 'SDK_VERSION', 'Api', 'getServiceWorkerStatus', 'getVisibilityState', 'getEffectiveConnectionType', `${sdkFunction('getApplicationInfo')}\n${sdkFunction('serializeTrace')}\nreturn serializeTrace;`)(
      () => 'public-app', () => 'installation-id', 'installed-sdk', { getInstance: () => api }, () => 0, () => 2, () => 4,
    ) as (value: unknown) => string
    parentLocation.href = 'https://mizan.test/?private=query#/cards/PRIVATE-CARD-2'
    expect(parentLocation.href).toContain('PRIVATE-CARD-2')
    const serialized = serialize({ name: 'mizan_quote_refresh', isAuto: false, startTimeUs: 1000, durationUs: 125000, counters: {}, getAttributes: () => ({}), performanceController: { app: {} } })
    const metric = JSON.parse(serialized)
    expect(metric.application_info.web_app_info.page_url).toBe('https://mizan.test/diagnostics.html')
    expect(metric.trace_metric).toEqual({ name: 'mizan_quote_refresh', is_auto: false, client_start_time_us: 1000, duration_us: 125000 })
    expect(serialized).not.toMatch(/PRIVATE|cards|query|referrer/)
    // This is the bug a simple record-time route guard would miss.
    expect(actualGetUrl.call({ windowLocation: { href: 'https://mizan.test/#/cards/PRIVATE-CARD-2' } })).toContain('PRIVATE-CARD-2')
  })
})
