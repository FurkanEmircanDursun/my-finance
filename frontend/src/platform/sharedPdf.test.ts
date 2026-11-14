import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { File as NodeFile } from 'node:buffer'
import { UserFacingError } from '../core/errors'

const mocks = vi.hoisted(() => ({ native: true, available: true, clear: vi.fn(), list: vi.fn(), acknowledge: vi.fn(), add: vi.fn(), remove: vi.fn(), event: null as (() => void) | null, fetch: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native, isPluginAvailable: () => mocks.available, convertFileSrc: (uri: string) => `capacitor://localhost/_capacitor_file_${uri.slice(7)}` },
  registerPlugin: () => ({ listPending: mocks.list, acknowledge: mocks.acknowledge, clear: mocks.clear, addListener: mocks.add }),
}))
const id = '11111111-1111-4111-a111-111111111111'
const file = { name: 'ekstre.pdf', size: 9, uri: `file:///private/shared-pdf-inbox/${id}.pdf` }
const delivery = { id, files: [file] }
beforeEach(() => {
  vi.clearAllMocks(); mocks.native = true; mocks.available = true; mocks.event = null; mocks.clear.mockResolvedValue(undefined)
  mocks.add.mockImplementation(async (_event, callback) => { mocks.event = callback; return { remove: mocks.remove } })
  mocks.list.mockResolvedValue({ deliveries: [delivery] })
  mocks.acknowledge.mockResolvedValue(undefined)
  mocks.fetch.mockResolvedValue({ ok: true, blob: async () => new Blob(['%PDF-1.7\n']) })
  vi.stubGlobal('fetch', mocks.fetch); vi.stubGlobal('File', NodeFile)
})
afterEach(() => vi.unstubAllGlobals())

describe('shared PDF receiver lifecycle', () => {
  it('discards private native files at an account boundary and reports cleanup failure', async () => {
    const { discardSharedPdfs } = await import('./sharedPdf')
    await discardSharedPdfs(); expect(mocks.clear).toHaveBeenCalledOnce()
    mocks.clear.mockRejectedValueOnce(new Error('/private/financial-secret.pdf'))
    await expect(discardSharedPdfs()).rejects.toThrow('Paylaşılan PDF dosyaları temizlenemedi. Yeniden dene.')
    mocks.available = false; await discardSharedPdfs(); expect(mocks.clear).toHaveBeenCalledTimes(2)
    mocks.native = false; await discardSharedPdfs(); expect(mocks.clear).toHaveBeenCalledTimes(2)
  })
  it('subscribes before reading the cold-start queue and acknowledges after UI resolves', async () => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    let finish!: () => void
    const onFiles = vi.fn((_delivery: { id: string; files: File[] }) => new Promise<void>((resolve) => { finish = resolve }))
    const watcher = watchSharedPdfs({ onFiles, onError: vi.fn() })
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledOnce())
    expect(mocks.add.mock.invocationCallOrder[0]).toBeLessThan(mocks.list.mock.invocationCallOrder[0])
    const received = onFiles.mock.calls[0][0] as unknown as { id: string; files: File[] }
    expect(received.id).toBe(id); expect(received.files[0].type).toBe('application/pdf')
    expect(await received.files[0].text()).toBe('%PDF-1.7\n')
    expect(mocks.acknowledge).not.toHaveBeenCalled()
    finish(); await vi.waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledWith({ id }))
    watcher.dispose()
  })
  it('processes warm arrivals and deduplicates repeated native notifications', async () => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    mocks.list.mockResolvedValueOnce({ deliveries: [] })
    const onFiles = vi.fn(async () => {})
    const watcher = watchSharedPdfs({ onFiles, onError: vi.fn() })
    await vi.waitFor(() => expect(mocks.list).toHaveBeenCalledOnce())
    mocks.event!(); mocks.event!(); mocks.event!()
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledOnce())
    await watcher.retry()
    expect(onFiles).toHaveBeenCalledOnce()
    watcher.dispose()
  })
  it('retains failed UI delivery and retries it explicitly', async () => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    const onError = vi.fn(), onFiles = vi.fn().mockRejectedValueOnce(new UserFacingError('İçe aktarma iptal edildi.')).mockResolvedValue(undefined)
    const watcher = watchSharedPdfs({ onFiles, onError })
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('İçe aktarma iptal edildi.'))
    expect(mocks.acknowledge).not.toHaveBeenCalled()
    mocks.event!(); await vi.waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2))
    expect(onFiles).toHaveBeenCalledOnce()
    await watcher.retry(); expect(onFiles).toHaveBeenCalledTimes(2); expect(mocks.acknowledge).toHaveBeenCalledOnce()
    watcher.dispose()
  })
  it('retries acknowledgement without re-importing an already handled delivery', async () => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    mocks.acknowledge.mockRejectedValueOnce(new Error('cleanup failed'))
    const onFiles = vi.fn(async () => {}), onError = vi.fn()
    const watcher = watchSharedPdfs({ onFiles, onError })
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
    await watcher.retry(); expect(onFiles).toHaveBeenCalledOnce(); expect(mocks.acknowledge).toHaveBeenCalledTimes(2)
    watcher.dispose()
  })
  it('does not acknowledge the previous session when disposed during UI work', async () => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    let finish!: () => void
    const onFiles = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const watcher = watchSharedPdfs({ onFiles, onError: vi.fn() })
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledOnce())
    watcher.dispose(); finish(); await watcher.retry()
    expect(mocks.acknowledge).not.toHaveBeenCalled(); expect(mocks.remove).toHaveBeenCalledOnce()
  })
  it('removes a late subscription after immediate unmount without reading any document', async () => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    const watcher = watchSharedPdfs({ onFiles: vi.fn(), onError: vi.fn() })
    watcher.dispose(); await watcher.retry()
    expect(mocks.remove).toHaveBeenCalledOnce(); expect(mocks.list).not.toHaveBeenCalled()
  })
  it.each([
    [{ ...file, uri: 'https://evil.test/statement.pdf' }, 'güvenli'],
    [{ ...file, uri: `file://remote-server/shared-pdf-inbox/${id}.pdf` }, 'güvenli'],
    [{ ...file, uri: 'file:///private/shared-pdf-inbox/../secret.pdf' }, 'güvenli'],
    [{ ...file, size: 26 * 1024 * 1024 }, '25 MB'],
    [{ ...file, size: 10 }, 'eksik'],
  ])('rejects unsafe URI or inconsistent size before handing files to UI', async (descriptor, message) => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    mocks.list.mockResolvedValue({ deliveries: [{ id, files: [descriptor] }] })
    const onFiles = vi.fn(), onError = vi.fn()
    const watcher = watchSharedPdfs({ onFiles, onError })
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining(message)))
    expect(onFiles).not.toHaveBeenCalled(); expect(mocks.acknowledge).not.toHaveBeenCalled(); watcher.dispose()
  })
  it('rejects spoofed PDF content without acknowledging the inbox', async () => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    mocks.fetch.mockResolvedValue({ ok: true, blob: async () => new Blob(['<html>bad']) })
    const onError = vi.fn(), onFiles = vi.fn()
    const watcher = watchSharedPdfs({ onFiles, onError })
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('geçerli bir PDF')))
    expect(onFiles).not.toHaveBeenCalled(); expect(mocks.acknowledge).not.toHaveBeenCalled(); watcher.dispose()
  })
  it('accepts a bank PDF with a BOM/preamble inside the first 1024 bytes', async () => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    const bytes = new Blob(['\ufeffbank export\n%PDF-1.7\nstatement'])
    mocks.list.mockResolvedValue({ deliveries: [{ id, files: [{ ...file, size: bytes.size }] }] })
    mocks.fetch.mockResolvedValue({ ok: true, blob: async () => bytes })
    const onFiles = vi.fn(async () => {}), watcher = watchSharedPdfs({ onFiles, onError: vi.fn() })
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledOnce())
    watcher.dispose()
  })
  it('surfaces and acknowledges a native permission/validation error', async () => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    mocks.list.mockResolvedValue({ deliveries: [{ id, error: 'PDF izni verilmedi.' }] })
    const onError = vi.fn(), onFiles = vi.fn()
    const watcher = watchSharedPdfs({ onFiles, onError })
    await vi.waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledOnce())
    expect(onError).toHaveBeenCalledWith('Paylaşılan PDF alınamadı. Dosya iznini kontrol edip yeniden dene.'); expect(onFiles).not.toHaveBeenCalled(); watcher.dispose()
  })
  it('does not display arbitrary provider or filesystem error details', async () => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    mocks.fetch.mockRejectedValue(new Error('/private/account-name/statement-secret.pdf'))
    const onError = vi.fn(), watcher = watchSharedPdfs({ onFiles: vi.fn(), onError })
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('Paylaşılan PDF alınamadı. Yeniden dene.'))
    expect(JSON.stringify(onError.mock.calls)).not.toContain('statement-secret')
    watcher.dispose()
  })
  it('does not subscribe or read anything on web', async () => {
    const { watchSharedPdfs } = await import('./sharedPdf')
    mocks.native = false
    const watcher = watchSharedPdfs({ onFiles: vi.fn(), onError: vi.fn() })
    await watcher.retry(); watcher.dispose()
    expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled()
  })
})
