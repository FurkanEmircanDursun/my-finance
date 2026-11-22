import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  native: vi.fn(() => true), info: vi.fn(), supported: vi.fn(), fetch: vi.fn(), activate: vi.fn(),
  remote: { settings: {}, defaultConfig: {} }, values: {} as Record<string, string>,
  source: 'default', unsubscribe: vi.fn(), observer: null as { next: () => void } | null,
}))
vi.mock('./index', () => ({ isNative: mocks.native, isAndroid: () => true }))
vi.mock('@capacitor/app', () => ({ App: { getInfo: mocks.info } }))
vi.mock('../firebase/available', () => ({ cloudAvailable: true }))
vi.mock('../firebase/config', () => ({ getFirebaseApp: () => ({ name: 'fixture' }) }))
vi.mock('firebase/remote-config', () => ({
  isSupported: mocks.supported, fetchAndActivate: mocks.fetch, activate: mocks.activate,
  getRemoteConfig: () => mocks.remote, ensureInitialized: vi.fn().mockResolvedValue(undefined),
  getString: (_: unknown, key: string) => mocks.values[key] ?? '',
  getValue: () => ({ getSource: () => mocks.source }),
  onConfigUpdate: (_: unknown, observer: { next: () => void }) => { mocks.observer = observer; return mocks.unsubscribe },
}))

const policy = { min_required_version: '2.6.0', latest_version: '2.7.0', update_url: 'https://example.com/mizan', update_url_android: 'https://example.com/mizan.apk', update_message: 'Güncelle.' }

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  mocks.values = { ...policy }; mocks.source = 'default'; mocks.observer = null
  mocks.native.mockReturnValue(true)
  mocks.info.mockResolvedValue({ version: '2.5.0', build: '4005' })
  mocks.supported.mockResolvedValue(true); mocks.fetch.mockResolvedValue(true); mocks.activate.mockResolvedValue(true)
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
})
afterEach(() => vi.unstubAllGlobals())

describe('Remote Config update lifecycle', () => {
  it('uses actual installed native version and activates a mandatory update', async () => {
    const { watchUpdates } = await import('./updates')
    const changed = vi.fn(), watcher = watchUpdates(changed)
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ currentVersion: '2.5.0', decision: 'hard', status: 'ready', platform: 'android', updateUrl: 'https://example.com/mizan.apk' })))
    expect(mocks.info).toHaveBeenCalledOnce()
    expect(mocks.remote.settings).toEqual({ minimumFetchIntervalMillis: 3600000, fetchTimeoutMillis: 8000 })
    watcher.dispose()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })
  it('does not send a native user to Hosting while native distribution links are not configured', async () => {
    mocks.values.update_url_android = ''
    const { watchUpdates } = await import('./updates')
    const changed = vi.fn(), watcher = watchUpdates(changed)
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ decision: 'none', platform: 'android', updateUrl: null, status: 'ready' })))
    watcher.dispose()
  })
  it('retains a previously validated mandatory policy during a network failure', async () => {
    mocks.source = 'remote'
    mocks.fetch.mockRejectedValue(new Error('offline'))
    const { watchUpdates } = await import('./updates')
    const changed = vi.fn(), watcher = watchUpdates(changed)
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ decision: 'hard', status: 'offline' })))
    watcher.dispose()
  })
  it('does not replace a cached valid policy with invalid remote values', async () => {
    const { watchUpdates } = await import('./updates')
    const changed = vi.fn(), watcher = watchUpdates(changed)
    await vi.waitFor(() => expect(mocks.observer).not.toBeNull())
    mocks.values.update_url = 'javascript:alert(1)'
    mocks.values.update_url_android = 'javascript:alert(1)'
    mocks.observer!.next()
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ decision: 'hard', status: 'invalid' })))
    watcher.dispose()
  })
  it('applies a real-time release policy change without a reload', async () => {
    const { watchUpdates } = await import('./updates')
    const changed = vi.fn(), watcher = watchUpdates(changed)
    await vi.waitFor(() => expect(mocks.observer).not.toBeNull())
    mocks.values.min_required_version = '2.4.0'
    mocks.values.latest_version = '2.5.0'
    mocks.observer!.next()
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ decision: 'none', status: 'ready' })))
    watcher.dispose()
  })
  it('does not force an update when installed native version cannot be read', async () => {
    mocks.info.mockRejectedValue(new Error('plugin unavailable'))
    const { watchUpdates } = await import('./updates')
    const changed = vi.fn(), watcher = watchUpdates(changed)
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ currentVersion: null, decision: 'none', status: 'ready' })))
    watcher.dispose()
  })
  it('continues offline without any policy when there is no valid cache', async () => {
    mocks.fetch.mockRejectedValue(new Error('offline'))
    const { watchUpdates } = await import('./updates')
    const changed = vi.fn(), watcher = watchUpdates(changed)
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ policy: null, decision: 'none', status: 'offline' })))
    watcher.dispose()
  })
  it('continues on browsers without Remote Config support', async () => {
    mocks.supported.mockResolvedValue(false)
    const { watchUpdates } = await import('./updates')
    const changed = vi.fn(), watcher = watchUpdates(changed)
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ decision: 'none', status: 'unavailable' })))
    expect(mocks.fetch).not.toHaveBeenCalled()
    watcher.dispose()
  })
  it('cleans up a startup disposed before the native version resolves', async () => {
    let finish: (value: { version: string }) => void = () => { throw new Error('Not initialized') }
    mocks.info.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { watchUpdates } = await import('./updates')
    const changed = vi.fn(), watcher = watchUpdates(changed)
    await vi.waitFor(() => expect(mocks.info).toHaveBeenCalled())
    watcher.dispose(); finish({ version: '2.5.0' })
    await Promise.resolve(); await Promise.resolve()
    expect(changed).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
