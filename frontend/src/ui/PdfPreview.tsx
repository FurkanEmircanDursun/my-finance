import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Modal } from './Modal'
import { Skeleton } from './primitives'
import { loadPdfjs } from '../ingest/extract'

const MIN_ZOOM = 0.6
const MAX_ZOOM = 2.2
const ZOOM_STEP = 0.2

export interface PdfPreviewModalProps {
  file: File | null
  subtitle?: string
  onClose: () => void
}

/**
 * In-app PDF page preview rendered onto a HiDPI canvas via the app's own lazy
 * PDF.js loader. Works identically on desktop web, mobile browsers, and native
 * Capacitor WebViews without opening external tabs or relying on blob iframes.
 */
export function PdfPreviewModal({ file, subtitle, onClose }: PdfPreviewModalProps) {
  const [pageCount, setPageCount] = useState(0)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<any>(null)

  // Load the PDF document whenever `file` changes.
  useEffect(() => {
    if (!file) {
      setPageCount(0)
      setPage(1)
      setZoom(1)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setPage(1)
    setZoom(1)
    setPageCount(0)

    void (async () => {
      try {
        const pdfjs = await loadPdfjs()
        const data = new Uint8Array(await file.arrayBuffer())
        if (cancelled) return
        const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
        if (cancelled) {
          await doc.destroy().catch(() => undefined)
          return
        }
        docRef.current = doc
        setPageCount(doc.numPages)
      } catch (err) {
        if (cancelled) return
        const name = err instanceof Error ? err.name : ''
        setError(
          name === 'PasswordException'
            ? 'Bu PDF şifreyle korunuyor; önizleme oluşturulamadı.'
            : 'PDF önizlemesi açılamadı. Dosya bozulmuş veya geçersiz olabilir.',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      const doc = docRef.current
      docRef.current = null
      if (doc) void doc.destroy().catch(() => undefined)
    }
  }, [file])

  // Render the active page onto the canvas when page/zoom/document updates.
  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || pageCount === 0) return

    let cancelled = false
    let renderTask: { cancel?: () => void; promise: Promise<void> } | null = null
    setRendering(true)

    void (async () => {
      try {
        const pdfPage = await doc.getPage(page)
        if (cancelled) return

        const baseViewport = pdfPage.getViewport({ scale: 1 })
        const availableWidth = Math.max(280, (containerRef.current?.clientWidth ?? 640) - 32)
        const fitScale = Math.min(1.5, availableWidth / baseViewport.width)
        const cssScale = fitScale * zoom
        const dpr = Math.min(window.devicePixelRatio || 1, 2)

        const viewport = pdfPage.getViewport({ scale: cssScale * dpr })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`

        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        const task = pdfPage.render({ canvasContext: ctx, viewport })
        renderTask = task
        await task.promise
      } catch (err) {
        if (!cancelled && (err as { name?: string })?.name !== 'RenderingCancelledException') {
          setError('Sayfa görüntülenirken bir hata oluştu.')
        }
      } finally {
        if (!cancelled) setRendering(false)
      }
    })()

    return () => {
      cancelled = true
      renderTask?.cancel?.()
    }
  }, [page, zoom, pageCount])

  const canPrev = page > 1
  const canNext = page < pageCount

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      title={file?.name ?? 'PDF Önizleme'}
      description={subtitle}
      size="lg"
    >
      <div className="space-y-3">
        {/* Compact toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-line bg-sunken px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!canPrev || loading}
              aria-label="Önceki sayfa"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raised text-ink transition hover:bg-hover disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="num min-w-[92px] text-center text-label font-medium text-ink">
              {pageCount > 0 ? `Sayfa ${page} / ${pageCount}` : 'Yükleniyor…'}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={!canNext || loading}
              aria-label="Sonraki sayfa"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raised text-ink transition hover:bg-hover disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Number((z - ZOOM_STEP).toFixed(2))))}
              disabled={zoom <= MIN_ZOOM || loading || Boolean(error)}
              aria-label="Uzaklaştır"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raised text-ink transition hover:bg-hover disabled:opacity-40"
            >
              <ZoomOut size={15} />
            </button>
            <span className="num min-w-[48px] text-center text-label font-medium text-muted">
              %{Math.round(zoom * 100)}
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Number((z + ZOOM_STEP).toFixed(2))))}
              disabled={zoom >= MAX_ZOOM || loading || Boolean(error)}
              aria-label="Yakınlaştır"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raised text-ink transition hover:bg-hover disabled:opacity-40"
            >
              <ZoomIn size={15} />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="Varsayılan boyut"
                className="flex h-9 items-center gap-1 rounded-lg border border-line bg-raised px-2.5 text-label font-medium text-muted transition hover:bg-hover hover:text-ink"
              >
                <RotateCcw size={13} /> Sığdır
              </button>
            )}
          </div>
        </div>

        {/* Canvas viewport */}
        <div
          ref={containerRef}
          className="relative flex max-h-[62vh] min-h-[340px] justify-center overflow-auto rounded-[var(--radius-lg)] border border-line bg-sunken p-4"
        >
          {error ? (
            <div className="my-auto flex max-w-sm flex-col items-center gap-2.5 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-negative/30 bg-negative-soft text-negative">
                <AlertCircle size={20} />
              </span>
              <p className="text-body font-medium text-ink">Önizleme oluşturulamadı</p>
              <p className="text-label text-muted">{error}</p>
            </div>
          ) : loading ? (
            <div className="my-auto flex w-full max-w-md flex-col items-center gap-3 py-8">
              <FileText size={24} className="text-accent-text" />
              <p className="text-label text-muted">PDF sayfaları hazırlanıyor…</p>
              <Skeleton className="h-56 w-full rounded-[var(--radius)]" />
            </div>
          ) : (
            <div className="relative inline-block self-start">
              <canvas
                ref={canvasRef}
                className="block rounded-md border border-line bg-white shadow-sm"
                aria-label={`${file?.name ?? 'PDF'} sayfa ${page}`}
              />
              {rendering && (
                <div className="pointer-events-none absolute inset-0 rounded-md bg-white/40" />
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
