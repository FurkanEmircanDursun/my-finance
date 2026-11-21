import { describe, expect, it, vi } from 'vitest'
import { leaveSession } from './sessionBoundary'

function boundary() {
  const order: string[] = []
  return { order,
    suspend: vi.fn(async (checkpoint: boolean) => { order.push(`suspend:${checkpoint}`) }),
    signOut: vi.fn(async () => { order.push('signOut') }),
    clearDevice: vi.fn(async () => { order.push('clearDevice') }),
    resume: vi.fn(() => { order.push('resume') }),
  }
}
describe('account exit boundary', () => {
  it('stops local sync bookkeeping before logout and never clears retained device data', async () => {
    const ports = boundary()
    await leaveSession(ports, false)
    expect(ports.order).toEqual(['suspend:true', 'signOut', 'resume'])
    expect(ports.clearDevice).not.toHaveBeenCalled()
  })
  it('clears a device only after signout, without creating cloud deletion intents', async () => {
    const ports = boundary()
    await leaveSession(ports, true)
    expect(ports.order).toEqual(['suspend:false', 'signOut', 'clearDevice', 'resume'])
  })
  it('preserves local data when logout fails and resumes the still-signed-in session', async () => {
    const ports = boundary()
    ports.signOut.mockRejectedValueOnce(new Error('offline auth failure'))
    await expect(leaveSession(ports, true)).rejects.toThrow('offline auth failure')
    expect(ports.clearDevice).not.toHaveBeenCalled()
    expect(ports.resume).toHaveBeenCalledOnce()
  })
  it('does not continue to auth or erase if pending local bookkeeping fails', async () => {
    const ports = boundary()
    ports.suspend.mockRejectedValueOnce(new Error('disk unavailable'))
    await expect(leaveSession(ports, true)).rejects.toThrow('disk unavailable')
    expect(ports.signOut).not.toHaveBeenCalled()
    expect(ports.clearDevice).not.toHaveBeenCalled()
    expect(ports.resume).toHaveBeenCalledOnce()
  })
  it('reports failed local clearing instead of reporting a successful reset', async () => {
    const ports = boundary()
    ports.clearDevice.mockRejectedValueOnce(new Error('close other tabs'))
    await expect(leaveSession(ports, true)).rejects.toThrow('close other tabs')
    expect(ports.order).toEqual(['suspend:false', 'signOut', 'resume'])
  })
})
