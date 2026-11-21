import { describe, expect, it, vi } from 'vitest'
import { SharedImportHandoff } from './sharedImportHandoff'

const delivery = { id: 'delivery-1', files: [] }

describe('shared PDF review and native acknowledgement', () => {
  it('retains the native file until its own import has been handled and closed', async () => {
    const show = vi.fn(), handoff = new SharedImportHandoff(show)
    const acknowledged = vi.fn()
    const pending = handoff.receive(delivery).then(acknowledged)
    await Promise.resolve()
    expect(show).toHaveBeenCalledWith(delivery)
    expect(acknowledged).not.toHaveBeenCalled()
    handoff.complete('stale-delivery')
    await Promise.resolve()
    expect(acknowledged).not.toHaveBeenCalled()
    handoff.complete(delivery.id)
    await pending
    expect(acknowledged).toHaveBeenCalledOnce()
    expect(show).toHaveBeenLastCalledWith(null)
  })
  it('rejects on session replacement without acknowledging or showing old files again', async () => {
    const show = vi.fn(), handoff = new SharedImportHandoff(show)
    const pending = handoff.receive(delivery)
    const failed = expect(pending).rejects.toThrow('session ended')
    handoff.dispose()
    await failed
    handoff.complete(delivery.id)
    await expect(handoff.receive(delivery)).rejects.toThrow('session ended')
    expect(show).toHaveBeenCalledOnce()
  })
  it('joins duplicate notifications and never replaces the file currently under review', async () => {
    const show = vi.fn(), handoff = new SharedImportHandoff(show)
    const first = handoff.receive(delivery)
    expect(handoff.receive(delivery)).toBe(first)
    await expect(handoff.receive({ id: 'delivery-2', files: [] })).rejects.toThrow('already being reviewed')
    expect(show).toHaveBeenCalledOnce()
    handoff.complete(delivery.id)
    await first
  })
})
