import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { announceDeviceDataChange, watchDeviceDataChange } from './deviceDataSignal'

class TestChannel {
  static instances: TestChannel[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  closed = false
  sent: unknown[] = []
  constructor(readonly name: string) { TestChannel.instances.push(this) }
  postMessage(value: unknown) {
    this.sent.push(value)
    for (const peer of TestChannel.instances) if (peer !== this && !peer.closed && peer.name === this.name) peer.onmessage?.({ data: value })
  }
  close() { this.closed = true }
}

let host: EventTarget
let values: Map<string, string>
function storage(key: string, newValue: string | null) {
  const event = new Event('storage')
  Object.assign(event, { key, newValue }); host.dispatchEvent(event)
}
beforeEach(() => {
  host = new EventTarget(); values = new Map(); TestChannel.instances = []
  vi.stubGlobal('window', host)
  vi.stubGlobal('BroadcastChannel', TestChannel)
  vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => values.set(key, value) })
})
afterEach(() => vi.unstubAllGlobals())

describe('device financial generation invalidation signal', () => {
  it('announces only a nonce and fixed type, without user or financial payload', () => {
    const callback = vi.fn(), cleanup = watchDeviceDataChange(callback)
    announceDeviceDataChange()
    expect(callback).toHaveBeenCalledOnce()
    const sender = TestChannel.instances[1]
    expect(sender.name).toBe('mizan-device-data')
    expect(sender.sent).toEqual([{ type: 'device-data-change', nonce: expect.any(String) }])
    expect(sender.closed).toBe(true)
    expect([...values.keys()]).toEqual(['mizan.device-data-change.v1'])
    const nonce = values.get('mizan.device-data-change.v1')!
    storage('mizan.device-data-change.v1', nonce)
    expect(callback).toHaveBeenCalledOnce()
    cleanup()
  })
  it('supports the storage fallback and ignores unrelated or malformed signals', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const callback = vi.fn(), cleanup = watchDeviceDataChange(callback)
    storage('unrelated', 'x'); storage('mizan.device-data-change.v1', null)
    storage('mizan.device-data-change.v1', ''); storage('mizan.device-data-change.v1', 'x'.repeat(129))
    expect(callback).not.toHaveBeenCalled()
    storage('mizan.device-data-change.v1', 'nonce-1')
    storage('mizan.device-data-change.v1', 'nonce-1')
    storage('mizan.device-data-change.v1', 'nonce-2')
    expect(callback).toHaveBeenCalledTimes(2)
    cleanup()
  })
  it('checks the authoritative generation after focus/pageshow and detaches every receiver on cleanup', () => {
    const callback = vi.fn(), cleanup = watchDeviceDataChange(callback)
    const receiver = TestChannel.instances[0]
    receiver.onmessage?.({ data: { type: 'unrelated', nonce: 'x' } })
    receiver.onmessage?.({ data: { type: 'device-data-change', nonce: 1 } })
    host.dispatchEvent(new Event('focus')); host.dispatchEvent(new Event('pageshow'))
    expect(callback).toHaveBeenCalledTimes(2)
    cleanup()
    expect(receiver.closed).toBe(true)
    expect(receiver.onmessage).toBeNull()
    host.dispatchEvent(new Event('focus')); host.dispatchEvent(new Event('pageshow'))
    storage('mizan.device-data-change.v1', 'after-cleanup')
    expect(callback).toHaveBeenCalledTimes(2)
  })
  it('does not block a device clear when optional browser signaling is unavailable', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('blocked') } })
    vi.stubGlobal('BroadcastChannel', class { constructor() { throw new Error('unsupported') } })
    expect(() => announceDeviceDataChange()).not.toThrow()
    const callback = vi.fn(), cleanup = watchDeviceDataChange(callback)
    host.dispatchEvent(new Event('focus'))
    expect(callback).toHaveBeenCalledOnce()
    cleanup()
  })
  it('closes a sender even when its transport cannot deliver the invalidation', () => {
    class FailingChannel extends TestChannel { postMessage() { throw new Error('unavailable') } }
    vi.stubGlobal('BroadcastChannel', FailingChannel)
    expect(() => announceDeviceDataChange()).not.toThrow()
    expect(TestChannel.instances[0].closed).toBe(true)
    expect(values.has('mizan.device-data-change.v1')).toBe(true)
  })
})
