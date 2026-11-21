import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { UserFacingError } from '../core/errors'

export const MAX_SHARED_PDF_BYTES = 25 * 1024 * 1024
export const MAX_SHARED_PDF_FILES = 5
interface SharedPdfDescriptor { name: string; size: number; uri: string }
interface NativeDelivery { id: string; files?: SharedPdfDescriptor[]; error?: string }
interface SharedPdfPlugin {
  listPending(): Promise<{ deliveries: NativeDelivery[] }>
  acknowledge(options: { id: string }): Promise<void>
  clear(): Promise<void>
  addListener(event: 'sharedPdfReceived', listener: () => void): Promise<PluginListenerHandle>
}
const SharedPdf = registerPlugin<SharedPdfPlugin>('SharedPdf')
/** Called before an intentional account/device boundary; failures must block that boundary. */
export async function discardSharedPdfs(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('SharedPdf')) return
  try { await SharedPdf.clear() }
  catch { throw new UserFacingError('Paylaşılan PDF dosyaları temizlenemedi. Yeniden dene.') }
}
export interface SharedPdfDelivery { id: string; files: File[] }
export interface SharedPdfReceiverOptions {
  /** Resolve only when import, dismissal, or another explicit UI outcome owns the files. */
  onFiles: (delivery: SharedPdfDelivery) => Promise<void>
  onError: (message: string) => void
}

const NATIVE_ERROR_MESSAGES = new Set([
  'Paylaşılan PDF bağlantısı okunamadı.', 'Tek seferde en fazla 5 PDF paylaşabilirsin.',
  'Yalnızca PDF dosyaları paylaşılabilir.', 'PDF güvenli bir dosya bağlantısıyla paylaşılmalı.',
  'Paylaşılan PDF 25 MB sınırını aşıyor.', 'Paylaşılan dosya geçerli bir PDF değil.',
  'Paylaşılan dosya boş veya geçerli bir PDF değil.', 'Paylaşılan PDF okunamadı.',
  'PDF kuyruğu dolu. Bekleyen içe aktarmayı tamamlayıp yeniden dene.',
  'Paylaşılan PDF alınamadı. Dosya iznini kontrol edip yeniden dene.',
  'PDF kuyruğu oluşturulamadı.', 'PDF kuyruğu kaydedilemedi.',
])
function nativeErrorMessage(message: string): string {
  return NATIVE_ERROR_MESSAGES.has(message) ? message : 'Paylaşılan PDF alınamadı. Dosya iznini kontrol edip yeniden dene.'
}

function safeName(value: string): string {
  const name = value.replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 160).trim()
  return /\.pdf$/i.test(name) ? name : `${name || 'ekstre'}.pdf`
}

async function readPdf(file: SharedPdfDescriptor): Promise<File> {
  if (!Number.isSafeInteger(file.size) || file.size < 5 || file.size > MAX_SHARED_PDF_BYTES) throw new UserFacingError('Paylaşılan PDF 25 MB sınırını aşıyor veya boş.')
  // Native is the authority for the private inbox. Do not turn a malformed bridge
  // payload into an arbitrary remote request, content-provider read, or URL load.
  let local: URL
  try { local = new URL(file.uri) } catch { throw new UserFacingError('Paylaşılan PDF güvenli alandan okunamadı.') }
  if (local.protocol !== 'file:' || local.hostname || local.search || local.hash || !/\/shared-pdf-inbox\/[a-f0-9-]{36}\.pdf$/i.test(local.pathname)) throw new UserFacingError('Paylaşılan PDF güvenli alandan okunamadı.')
  const response = await fetch(Capacitor.convertFileSrc(file.uri))
  if (!response.ok) throw new UserFacingError('Paylaşılan PDF okunamadı. Yeniden dene.')
  const blob = await response.blob()
  if (blob.size !== file.size || blob.size > MAX_SHARED_PDF_BYTES) throw new UserFacingError('Paylaşılan PDF eksik veya boyutu değişmiş.')
  const header = new TextDecoder('latin1').decode(await blob.slice(0, 1024).arrayBuffer())
  if (!/%PDF-\d\.\d\b/.test(header)) throw new UserFacingError('Paylaşılan dosya geçerli bir PDF değil.')
  return new File([blob], safeName(file.name), { type: 'application/pdf', lastModified: Date.now() })
}

/** Durable native queue -> File API. Register before listing so cold and warm arrivals cannot race. */
export function watchSharedPdfs(options: SharedPdfReceiverOptions): { dispose: () => void; retry: () => Promise<void> } {
  let disposed = false
  let listener: PluginListenerHandle | undefined
  let requested = false
  let running: Promise<void> | undefined
  const delivered = new Set<string>()
  const failed = new Set<string>()
  const native = Capacitor.isNativePlatform()
  const report = (message: string) => { if (!disposed) options.onError(message) }

  const drain = (): Promise<void> => {
    if (disposed || !native) return Promise.resolve()
    requested = true
    if (running) return running
    running = (async () => {
      while (requested && !disposed) {
        requested = false
        const { deliveries } = await SharedPdf.listPending()
        for (const delivery of deliveries) {
          if (disposed) break
          if (!/^[a-f0-9-]{36}$/i.test(delivery.id) || failed.has(delivery.id)) continue
          try {
            if (!delivered.has(delivery.id)) {
              if (delivery.error) {
                report(nativeErrorMessage(delivery.error))
              } else {
                if (!delivery.files?.length || delivery.files.length > MAX_SHARED_PDF_FILES) throw new UserFacingError('Tek seferde en fazla 5 PDF paylaşabilirsin.')
                const files: File[] = []
                // Keep peak memory bounded and preserve the share-sheet order.
                for (const file of delivery.files) files.push(await readPdf(file))
                if (disposed) break
                await options.onFiles({ id: delivery.id, files })
              }
              if (disposed) break
              delivered.add(delivery.id)
            }
            await SharedPdf.acknowledge({ id: delivery.id })
          } catch (error) {
            failed.add(delivery.id)
            report(error instanceof UserFacingError ? error.message : 'Paylaşılan PDF alınamadı. Yeniden dene.')
          }
        }
      }
    })().catch(() => report('Paylaşılan PDF kuyruğu okunamadı. Mizan’ı yeniden açıp dene.')).finally(() => {
      running = undefined
      // A warm event or retry can arrive after the loop finishes but before this
      // microtask runs. Carry that request into a fresh drain and await it.
      if (requested && !disposed) return drain()
    })
    return running
  }

  const ready = native ? SharedPdf.addListener('sharedPdfReceived', () => { void drain() }).then(async (handle) => {
    if (disposed) { await handle.remove(); return }
    listener = handle
    await drain()
  }).catch(() => report('PDF paylaşım bağlantısı kurulamadı. Mizan’ı yeniden açıp dene.')) : Promise.resolve()

  return {
    dispose: () => { disposed = true; void listener?.remove() },
    retry: async () => { await ready; failed.clear(); await drain() },
  }
}
