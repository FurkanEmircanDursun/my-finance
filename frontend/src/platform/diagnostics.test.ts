import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isDiagnosticEnvelope, isDiagnosticSample, isFixedDiagnosticsDocument } from './diagnosticsContract'

vi.mock('../firebase/available', () => ({ cloudAvailable: true }))
vi.mock('../firebase/config', () => ({ getFirebaseApp: () => ({ options: { apiKey: 'public-key', projectId: 'public-project', appId: 'public-app', other: 'never-crosses' } }) }))
class TestFrame extends EventTarget {
  hidden = false; title = ''; referrerPolicy = ''; src = ''
  contentWindow = { postMessage: vi.fn() }
  remove = vi.fn()
}
let frames: TestFrame[], host: EventTarget & { location: { origin: string; href: string } }
function reply(frame: TestFrame, data: unknown, origin = host.location.origin, source: unknown = frame.contentWindow) {
  const event = new Event('message')
  Object.assign(event, { data, origin, source }); host.dispatchEvent(event)
}
async function connect(api: typeof import('./diagnostics')) {
  const pending = api.setDiagnosticsConsent(true)
  await vi.waitFor(() => expect(frames).toHaveLength(1))
  const frame = frames[0]
  frame.dispatchEvent(new Event('load'))
  const init = frame.contentWindow.postMessage.mock.calls[0][0]
  reply(frame, { channel: init.channel, type: 'ready' })
  await pending
  return { frame, init }
}
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  frames = []
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } })
  host = Object.assign(new EventTarget(), { location: { origin: 'https://mizan.test', href: 'https://mizan.test/?private=query#/cards/PRIVATE-CARD-ID' } })
  vi.stubGlobal('window', host)
  vi.stubGlobal('document', { createElement: () => new TestFrame(), body: { append: (frame: TestFrame) => frames.push(frame) } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('isolated optional Performance Monitoring', () => {
  it('does not create the SDK realm without separate performance consent', async () => {
    localStorage.setItem('finance.analytics-consent.v1', 'granted')
    const api = await import('./diagnostics'), cleanup = api.initializeDiagnostics()
    await Promise.resolve()
    expect(frames).toHaveLength(0)
    expect(api.recordDiagnostic('quote_refresh', 10)).toBe(false)
    cleanup()
  })
  it('sends only public Firebase configuration into a fixed URL without referrer', async () => {
    const api = await import('./diagnostics'), { frame, init } = await connect(api)
    expect(frame.src).toBe('https://mizan.test/diagnostics.html')
    expect(frame.referrerPolicy).toBe('no-referrer')
    expect(frame.hidden).toBe(true)
    expect(init).toEqual({ channel: expect.any(String), type: 'init', payload: { apiKey: 'public-key', projectId: 'public-project', appId: 'public-app' } })
    expect(api.recordDiagnostic('quote_refresh', 125)).toBe(true)
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith({ channel: init.channel, type: 'sample', payload: { name: 'quote_refresh', durationMs: 125 } }, 'https://mizan.test')
    expect(JSON.stringify(frame.contentWindow.postMessage.mock.calls)).not.toContain('PRIVATE')
    expect(api.recordDiagnostic('private merchant' as never, 10)).toBe(false)
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 600001]) expect(api.recordDiagnostic('statement_parse', duration)).toBe(false)
    await api.setDiagnosticsConsent(false)
  })
  it('rejects spoofed origin, source and channel acknowledgements', async () => {
    const api = await import('./diagnostics'), pending = api.setDiagnosticsConsent(true)
    await vi.waitFor(() => expect(frames).toHaveLength(1))
    const frame = frames[0]; frame.dispatchEvent(new Event('load'))
    const { channel } = frame.contentWindow.postMessage.mock.calls[0][0]
    reply(frame, { channel, type: 'ready' }, 'https://attacker.test')
    reply(frame, { channel, type: 'ready' }, host.location.origin, {})
    reply(frame, { channel: 'stale', type: 'ready' })
    expect(api.diagnosticsStatus().active).toBe(false)
    reply(frame, { channel, type: 'ready' }); await pending
    expect(api.diagnosticsStatus().active).toBe(true)
    await api.setDiagnosticsConsent(false)
  })
  it('revokes synchronously, destroys the SDK realm and ignores buffered messages', async () => {
    const api = await import('./diagnostics'), { frame, init } = await connect(api)
    const revoked = api.setDiagnosticsConsent(false)
    expect(frame.remove).toHaveBeenCalledOnce()
    expect(api.recordDiagnostic('screen_render', 20)).toBe(false)
    reply(frame, { channel: init.channel, type: 'ready' })
    expect(api.diagnosticsStatus().active).toBe(false)
    await revoked
  })
  it('lets core work finish when the isolated SDK cannot start', async () => {
    const api = await import('./diagnostics'), pending = api.setDiagnosticsConsent(true)
    await vi.waitFor(() => expect(frames).toHaveLength(1))
    frames[0].dispatchEvent(new Event('error')); await pending
    expect(api.diagnosticsStatus().error).toContain('bağlanamadı')
    expect(await api.measureOperation('backup_export', async () => 'backup')).toBe('backup')
    await expect(api.measureOperation('backup_export', async () => { throw new Error('disk full') })).rejects.toThrow('disk full')
  })
  it('revokes a still-loading frame without waiting for timeout', async () => {
    const api = await import('./diagnostics'), pending = api.setDiagnosticsConsent(true)
    await vi.waitFor(() => expect(frames).toHaveLength(1))
    await api.setDiagnosticsConsent(false); await pending
    expect(frames[0].remove).toHaveBeenCalledOnce()
    expect(api.diagnosticsStatus().active).toBe(false)
  })
})

describe('measurement protocol and document guards', () => {
  it('rejects extra fields and nonfinite or unbounded durations', () => {
    expect(isDiagnosticSample({ name: 'quote_refresh', durationMs: 10, card: 'private' })).toBe(false)
    expect(isDiagnosticSample({ name: 'unknown', durationMs: 10 })).toBe(false)
    expect(isDiagnosticEnvelope({ channel: '1', type: 'init', payload: { apiKey: 'key', projectId: 'id', appId: 'app', private: 'no' } })).toBe(false)
    expect(isDiagnosticEnvelope({ channel: '1', type: 'sample', payload: { name: 'update_check', durationMs: 10 } })).toBe(true)
  })
  it('allows only the exact fixed transport path with no hash, query or credentials', () => {
    expect(isFixedDiagnosticsDocument('https://mizan.test/diagnostics.html')).toBe(true)
    for (const url of ['https://mizan.test/diagnostics.html#/cards/ID', 'https://mizan.test/diagnostics.html?user=ID', 'https://mizan.test/#/cards/ID', 'https://user:pw@mizan.test/diagnostics.html', 'data:/diagnostics.html']) expect(isFixedDiagnosticsDocument(url)).toBe(false)
  })
})
