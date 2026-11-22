import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isAndroid: vi.fn(() => true), addListener: vi.fn(), register: vi.fn(), unregister: vi.fn(), createChannel: vi.fn(),
  checkPermissions: vi.fn(), requestPermissions: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(),
  recordReminderOpen: vi.fn(), setRemoteReminderDelivery: vi.fn(), syncReminders: vi.fn(), getReminderStatus: vi.fn(),
}))
vi.mock('./index', () => ({ isAndroid: mocks.isAndroid }))
vi.mock('../firebase/available', () => ({ cloudAvailable: true }))
vi.mock('./reminders', () => mocks)
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: mocks }))
vi.mock('../firebase/db', () => ({ getFirebaseDb: () => ({}) }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'), serverTimestamp: () => 'SERVER_TIME', setDoc: mocks.setDoc, deleteDoc: mocks.deleteDoc,
}))
let callbacks: Record<string, (data: any) => void>
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.stubEnv('VITE_FCM_SCHEDULER_ENABLED', 'true')
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
  })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('navigator', { onLine: true })
  callbacks = {}
  mocks.isAndroid.mockReturnValue(true)
  mocks.addListener.mockImplementation(async (name, callback) => { callbacks[name] = callback; return { remove: vi.fn() } })
  mocks.register.mockImplementation(async () => { callbacks.registration({ value: 'TEST_TOKEN_DO_NOT_SEND_12345' }) })
  mocks.checkPermissions.mockResolvedValue({ receive: 'granted' })
  mocks.requestPermissions.mockResolvedValue({ receive: 'granted' })
  mocks.setDoc.mockResolvedValue(undefined); mocks.deleteDoc.mockResolvedValue(undefined)
  mocks.getReminderStatus.mockResolvedValue({ error: undefined })
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('cloud reminder device lifecycle', () => {
  it('keeps the local fallback and never registers when the scheduler is not deployed', async () => {
    vi.stubEnv('VITE_FCM_SCHEDULER_ENABLED', 'false')
    const api = await import('./push')
    await api.syncCloudPush('owner', { enabled: true, hour: 9 }, true)
    expect(api.getPushStatus().backendReady).toBe(false)
    expect(mocks.register).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(mocks.setRemoteReminderDelivery).toHaveBeenCalledWith(false)
  })
  it('startup does not prompt or enroll users without device opt-in', async () => {
    const api = await import('./push')
    await api.syncCloudPush('owner', { enabled: true, hour: 9 }, true)
    expect(mocks.requestPermissions).not.toHaveBeenCalled()
    expect(mocks.register).not.toHaveBeenCalled()
  })
  it('requires synced identity and permission before enabling a server schedule', async () => {
    const api = await import('./push')
    await expect(api.requestCloudPush('owner', { enabled: true, hour: 9 }, false)).rejects.toThrow('eşitlemesinin')
    mocks.requestPermissions.mockResolvedValueOnce({ receive: 'denied' })
    await expect(api.requestCloudPush('owner', { enabled: true, hour: 9 }, true)).rejects.toThrow('izni verilmedi')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
  it('cancels local reminders before enrollment and stores only token scheduling metadata', async () => {
    const api = await import('./push')
    await api.requestCloudPush('owner', { enabled: true, hour: 17 }, true)
    expect(mocks.setDoc).toHaveBeenCalledWith(expect.stringMatching(/^users\/owner\/pushDevices\/[a-f0-9]{32}$/), {
      token: 'TEST_TOKEN_DO_NOT_SEND_12345', enabled: true, hour: 17, timeZone: 'Europe/Istanbul', updatedAt: 'SERVER_TIME',
    })
    expect(mocks.syncReminders.mock.invocationCallOrder[0]).toBeLessThan(mocks.setDoc.mock.invocationCallOrder[0])
    expect(api.getPushStatus().active).toBe(true)
  })
  it('registration failure restores local delivery and allows retry', async () => {
    mocks.register.mockRejectedValueOnce(new Error('FCM unavailable'))
    const api = await import('./push')
    await expect(api.requestCloudPush('owner', { enabled: true, hour: 9 }, true)).rejects.toThrow('bağlanamadı')
    expect(api.getPushStatus().active).toBe(false)
    await api.requestCloudPush('owner', { enabled: true, hour: 9 }, true)
    expect(api.getPushStatus().active).toBe(true)
  })
  it('failed refresh retains cloud ownership, reports the previous plan and recovers on retry', async () => {
    const api = await import('./push')
    await api.requestCloudPush('owner', { enabled: true, hour: 9 }, true)
    mocks.setRemoteReminderDelivery.mockClear()
    mocks.setDoc.mockRejectedValueOnce(new Error('server unavailable'))
    await api.syncCloudPush('owner', { enabled: true, hour: 17, cloudPush: true }, true)
    expect(api.getPushStatus()).toMatchObject({ active: true, optedIn: true })
    expect(api.getPushStatus().error).toContain('Önceki bulut planın etkin')
    expect(mocks.setRemoteReminderDelivery).not.toHaveBeenCalledWith(false)
    expect(mocks.deleteDoc).not.toHaveBeenCalled()
    await api.syncCloudPush('owner', { enabled: true, hour: 17, cloudPush: true }, true)
    expect(api.getPushStatus()).toMatchObject({ active: true, error: undefined })
    expect(mocks.setDoc).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ hour: 17 }))
  })
  it('failed first enrollment restores local delivery instead of claiming a cloud plan exists', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('server unavailable'))
    const api = await import('./push')
    await expect(api.requestCloudPush('owner', { enabled: true, hour: 9 }, true)).rejects.toThrow('bağlanamadı')
    expect(api.getPushStatus().active).toBe(false)
    expect(mocks.setRemoteReminderDelivery).toHaveBeenLastCalledWith(false)
  })
  it('signout removes registration, clears consent and invalidates the native token', async () => {
    const api = await import('./push')
    await api.requestCloudPush('owner', { enabled: true, hour: 9 }, true)
    await api.disconnectCloudPush()
    expect(mocks.deleteDoc).toHaveBeenCalled()
    expect(mocks.unregister).toHaveBeenCalled()
    expect(api.getPushStatus()).toMatchObject({ active: false, optedIn: false })
  })
  it('turning reminders off deletes the cloud enrollment before restoring local ownership', async () => {
    const api = await import('./push')
    await api.requestCloudPush('owner', { enabled: true, hour: 9 }, true)
    await api.syncCloudPush('owner', { enabled: false, hour: 9 }, true)
    expect(mocks.deleteDoc).toHaveBeenCalled()
    expect(api.getPushStatus().active).toBe(false)
  })
  it('push tap uses the PIN-safe pending reminder route', async () => {
    const api = await import('./push')
    await api.requestCloudPush('owner', { enabled: true, hour: 9 }, true)
    callbacks.pushNotificationActionPerformed({ notification: { data: { uid: 'owner', cardId: 'card-a', reminderKind: 'statement' } } })
    expect(mocks.recordReminderOpen).toHaveBeenCalledWith({ uid: 'owner', cardId: 'card-a', reminderKind: 'statement' })
  })
  it('a blocked platform does not import or call native registration', async () => {
    mocks.isAndroid.mockReturnValue(false)
    const api = await import('./push')
    await api.syncCloudPush('owner', { enabled: true, hour: 9 }, true)
    expect(mocks.register).not.toHaveBeenCalled()
  })
})
