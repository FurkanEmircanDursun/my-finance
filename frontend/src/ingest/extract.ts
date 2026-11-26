import { detectAdapter } from './banks'
import { createEbcdicDecoder, looksLikeEbcdic } from '../core/ebcdic'
import { createControlTurkishDecoder, decodeControlTurkish } from '../core/qnbFont'
import { continuationLayout, findColumnLayout, tagStatementColumns, type ColumnLayout } from './columns'
import type { Block } from 'tesseract.js'
import { hasReadableText, isPdfFile } from './validation'

/**
 * Turns a dropped file into plain text.
 *
 * Escalation ladder, cheapest first — each step only runs when the previous one
 * produced no usable text (document validation happens before transaction parsing):
 *   1. UTF-8 read            (.txt, .csv)
 *   2. PDF.js text layer     (digitally generated statements)
 *   3. EBCDIC decode         (Akbank mainframe PDFs — instant and lossless)
 *   4. local OCR service     (true scans, opt-in, stays on localhost)
 *   5. Tesseract.js          (same, but in-browser; slow, last resort)
 *
 * pdfjs-dist and tesseract.js are dynamically imported so neither lands in the
 * initial bundle. A user who only ever drops .txt files downloads neither.
 */

export type ProgressFn = (message: string) => void

export interface ExtractResult {
  text: string
  engine: string
}

export interface ExtractOptions {
  useLocalOcr: boolean
  ocrEndpoint: string
  onProgress?: ProgressFn
  /** Reading can fail validation even when the extracted text looks legible. */
  assessReadable?: (result: ExtractResult) => 'accept' | 'retry' | 'reject'
}

function isRecognised(text: string): boolean {
  return text.trim().length > 0 && detectAdapter(text) !== null
}

async function readAsText(file: File): Promise<string> {
  // Statements exported from Turkish banking portals are sometimes windows-1254.
  const buffer = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (!utf8.includes('�')) return utf8
  try {
    return new TextDecoder('windows-1254').decode(buffer)
  } catch {
    return utf8
  }
}

let pdfjsPromise: Promise<any> | null = null

export async function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // Native WebViews can lack newer APIs such as Promise.withResolvers.
      // Both realms need PDF.js's bundled compatibility code: a legacy main
      // bundle paired with a modern worker still fails during PDF extraction.
      const lib = await import('pdfjs-dist/legacy/build/pdf.min.mjs' as string)
      const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' as string)).default
      lib.GlobalWorkerOptions.workerSrc = workerUrl
      return lib
    })()
  }
  return pdfjsPromise
}

/**
 * Reconstructs visual lines from the PDF text layer.
 *
 * Two details decide whether the output is parseable:
 *
 * 1. Row grouping. Items are bucketed by baseline with a tolerance derived from
 *    the page's own median glyph height rather than a hard-coded pixel value —
 *    statements printed at small sizes were merging two rows into one.
 *
 * 2. Word joining. PDF viewers emit one item per glyph run, so a statement row
 *    arrives as a dozen fragments. Joining every fragment with a space shatters
 *    words ("TREN DY OL"); joining with nothing welds columns together
 *    ("355.00355.00x1"). A space is inserted only where the horizontal gap is
 *    wide enough to be a real one, measured against the item's own font size.
 */
export interface TextGeom {
  text: string
  fontName?: string
  /** Left edge, in PDF user units. */
  x: number
  /** Baseline. */
  y: number
  /** Advance width of the run. */
  w: number
  /** Font size, used for both the row tolerance and the space threshold. */
  h: number
}

/**
 * Buckets positioned text runs into visual rows, each sorted left to right.
 * Exported so the column detector reads rows exactly as the line builder does.
 */
export function groupRows(items: TextGeom[]): TextGeom[][] {
  if (!items.length) return []

  const heights = items.map((i) => i.h).sort((a, b) => a - b)
  const rowTolerance = Math.max(2, heights[heights.length >> 1] * 0.6)

  // Sort baselines and columns separately. A fuzzy pairwise comparator is
  // non-transitive and may mix two lines when PDF glyphs arrive out of order.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)

  const rows: TextGeom[][] = []
  let row: TextGeom[] = []
  let baseline: number | null = null

  for (const item of sorted) {
    if (baseline === null || Math.abs(baseline - item.y) <= rowTolerance) {
      row.push(item)
      baseline ??= item.y
    } else {
      rows.push(row.sort((a, b) => a.x - b.x || b.y - a.y))
      row = [item]
      baseline = item.y
    }
  }
  if (row.length) rows.push(row.sort((a, b) => a.x - b.x || b.y - a.y))

  return rows
}

/** Renders one visual row as text, deciding where the spaces are. */
function rowToLine(row: TextGeom[]): string {
  let line = ''
  let cursor: number | null = null

  for (const item of row) {
    const blank = !item.text.trim()

    if (blank) {
      // PDF generators emit whitespace items for kerning as well as for real
      // word gaps. Akbank's statements are full of 0.24pt "spaces" at a 9.6pt
      // font size; emitting those verbatim shatters every word and number
      // ("0 5 /0 7 /2 0 2 6 T REN DY OL"). Only a gap wide enough to read as
      // a space at this font size becomes one.
      if (item.w >= item.h * 0.12 && line && !/\s$/.test(line)) line += ' '
      cursor = item.x + item.w
      continue
    }

    if (cursor !== null) {
      const gap = item.x - cursor
      // Columns separated by position alone, with no whitespace item between.
      if (gap > item.h * 0.25 && line && !/\s$/.test(line)) line += ' '
    }

    line += item.text
    cursor = item.x + item.w
  }

  return line.replace(/[ 	]{2,}/g, '  ').trim()
}

/**
 * Groups positioned text runs into lines. Exported so it can be exercised
 * against real statement PDFs in the test suite rather than re-implemented
 * there.
 */
export function buildLines(items: TextGeom[]): string[] {
  const lines: string[] = []
  for (const row of groupRows(items)) {
    const line = rowToLine(row)
    if (line) lines.push(line)
  }
  return lines
}

/**
 * `buildLines` for a real page, with annotations for the billed and loyalty
 * columns where the page layout identifies them (see `columns.ts`).
 *
 * `decode` is how to read the page's text — the identity, or the EBCDIC
 * decoder for Akbank's mainframe PDFs. It is used only to *recognise* headers
 * and numbers; the lines it returns keep the original, still-encoded text.
 */
export function buildPageLines(items: TextGeom[], decode: (text: string) => string = (t) => t): string[] {
  return pageLines(items, decode).lines
}

function pageLines(items: TextGeom[], decode: (text: string) => string, previous?: ColumnLayout) {
  const rows = groupRows(items.map((item) => ({ ...item })))
  const layout = findColumnLayout(rows, decode)
    ?? (previous ? continuationLayout(rows, previous, decode) : null)
  if (layout) tagStatementColumns(rows, layout, decode)

  const lines: string[] = []
  for (const row of rows) {
    const line = rowToLine(row)
    if (line) lines.push(line)
  }
  return { lines, layout }
}

/**
 * pdf.js text items → positioned runs. Whitespace items are kept only when they
 * have a width, because the width is how the line builder tells a real space from
 * a kerning gap.
 */
export function toTextGeom(items: ReadonlyArray<any>): TextGeom[] {
  return items
    .filter((i) => typeof i.str === 'string' && i.str.length)
    // Skip 90°-rotated vertical margin stamps ("Belge Numarası", vertical V.D.
    // footers, form IDs) that share a y coordinate with horizontal transaction
    // rows and otherwise weld onto the date or description.
    .filter((i) => {
      const tr = i.transform
      if (!Array.isArray(tr) || tr.length < 6) return true
      return Math.abs(tr[1]) <= Math.abs(tr[0]) && Math.abs(tr[2]) <= Math.abs(tr[3])
    })
    .map((i) => ({
      text: i.str as string,
      fontName: typeof i.fontName === 'string' ? i.fontName : undefined,
      x: i.transform[4] as number,
      y: i.transform[5] as number,
      w: (i.width ?? 0) as number,
      h: Math.abs(i.transform[3]) || 8,
    }))
    .filter((i) => i.text.trim() || i.w > 0)
}

/**
 * A document's pages, as text. Pure — no pdf.js, no DOM — so the browser, the
 * tests and the command-line verifier all turn the same geometry into the same
 * lines.
 *
 * EBCDIC is decided per page: an Akbank page is mojibake throughout, and the
 * column detector can only recognise "Tutar" and digits once decoded.
 */
export function readPdfTextLayer(pages: readonly TextGeom[][]) {
  const fontText = new Map<string, string>()
  for (const items of pages) for (const { fontName, text } of items) {
    if (!fontName) continue
    const collected = fontText.get(fontName) ?? ''
    if (collected.length < 4000) fontText.set(fontName, (collected + text).slice(0, 4000))
  }
  const encodedFonts = new Set([...fontText].filter(([, sample]) => looksLikeEbcdic(sample)).map(([name]) => name))
  const fullRawSample = pages.map((items) => items.map((i) => i.text).join('')).join('\n')
  const ebcdicDecode = createEbcdicDecoder(fullRawSample)
  const controlDecode = encodedFonts.size === 0 && !looksLikeEbcdic(fullRawSample)
    ? createControlTurkishDecoder(pages.map((items) => buildLines(items).join('\n')).join('\n'))
    : null
  const identity = (text: string) => text
  let previousLayout: ColumnLayout | undefined
  let encoded = false
  const pageText = pages.map(items => {
    const sample = items.map((i) => i.text).join(' ')
    const hasEncodedFont = items.some(item => item.fontName && encodedFonts.has(item.fontName))
    const hasUnicodeFont = items.some(item =>
      item.fontName && !encodedFonts.has(item.fontName) && /[A-Za-z]{3,}/.test(item.text))
    const encodedSample = looksLikeEbcdic(sample)
    const byFont = hasEncodedFont && (hasUnicodeFont || !encodedSample)
    const pageEncoded = !byFont && encodedSample
    const input = byFont ? items.map(item => item.fontName && encodedFonts.has(item.fontName)
      ? { ...item, text: ebcdicDecode(item.text) } : item) : items
    const decode = pageEncoded ? ebcdicDecode : (controlDecode ?? identity)
    const { lines, layout } = pageLines(input, decode, previousLayout)
    previousLayout = layout ?? undefined
    encoded ||= byFont || pageEncoded
    const rendered = lines.join('\n')
    return pageEncoded ? ebcdicDecode(rendered) : controlDecode ? controlDecode(rendered) : rendered
  })
  const text = pageText.join('\n')
  return { pageText, text, engine: encoded ? 'pdf-ebcdic' : 'pdf-text' }
}

interface PdfTextPage {
  getTextContent(): Promise<{ items: unknown[] }>
  streamTextContent(): ReadableStream<{ items: unknown[] }>
}

/** PDF.js uses stream async iteration internally; older native WebViews need its reader API. */
export async function readPdfTextItems(page: PdfTextPage): Promise<unknown[]> {
  if (typeof ReadableStream !== 'undefined' &&
      typeof (ReadableStream.prototype as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
    return (await page.getTextContent()).items
  }
  const reader = page.streamTextContent().getReader()
  const items: unknown[] = []
  let complete = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) { complete = true; return items }
      items.push(...value.items)
    }
  } finally {
    if (!complete) {
      // An errored stream may also reject cancellation. Preserve the read error.
      try { await reader.cancel() } catch { /* The reader still must release its lock. */ }
    }
    reader.releaseLock()
  }
}

async function extractPdfPages(file: File, onProgress?: ProgressFn): Promise<TextGeom[][]> {
  const pdfjs = await loadPdfjs()
  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise

  try {
    const pages: TextGeom[][] = []
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      onProgress?.(`PDF metin katmanı okunuyor · sayfa ${pageNo}/${doc.numPages}`)
      const page = await doc.getPage(pageNo)
      pages.push(toTextGeom(await readPdfTextItems(page)))
    }
    return pages
  } finally {
    await doc.destroy()
  }
}

/**
 * Steps 2 and 3 of the ladder: the text layer as it stands, then — when no
 * adapter recognises it — decoded as EBCDIC. Readable unrelated documents also
 * return their text so validation can reject them without running OCR. Null
 * means neither worked and the caller should reach for OCR.
 */
export function recogniseLayerText(layerText: string, onProgress?: ProgressFn): ExtractResult | null {
  const cleaned = decodeControlTurkish(layerText) ?? layerText
  if (isRecognised(cleaned)) return { text: cleaned, engine: 'pdf-text' }

  // Akbank ships its statements as EBCDIC bytes with no ToUnicode map. The text
  // is complete, just in the wrong code page — decode before reaching for OCR.
  if (looksLikeEbcdic(layerText)) {
    onProgress?.('Ana bilgisayar kodlaması çözülüyor…')
    const decoded = createEbcdicDecoder(layerText)(layerText)
    if (isRecognised(decoded) || hasReadableText(decoded)) return { text: decoded, engine: 'pdf-ebcdic' }
  }

  if (hasReadableText(cleaned)) return { text: cleaned, engine: 'pdf-text' }

  return null
}

async function ocrViaService(file: File, endpoint: string, onProgress?: ProgressFn): Promise<string | null> {
  try {
    onProgress?.('Yerel OCR servisi ile taranıyor…')
    const body = new FormData()
    body.append('file', file)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)
    const res = await fetch(endpoint, { method: 'POST', body, signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) return null
    const json = await res.json()
    return typeof json?.text === 'string' && json.text.trim() ? json.text : null
  } catch {
    // Service not running — fall through to the in-browser engine.
    return null
  }
}

function ocrWords(blocks: Block[], scale: number): TextGeom[] {
  return blocks.flatMap(block => block.paragraphs.flatMap(paragraph =>
    paragraph.lines.flatMap(line => line.words.map(({ text, bbox }) => ({
      text,
      x: bbox.x0 / scale,
      y: -bbox.y1 / scale,
      w: (bbox.x1 - bbox.x0) / scale,
      h: (bbox.y1 - bbox.y0) / scale,
    }))),
  ))
}

async function ocrInBrowser(file: File, targets: number[] | null, initialPages: string[], onProgress?: ProgressFn): Promise<string> {
  onProgress?.('Tarayıcı içi OCR başlatılıyor (bu adım yavaştır)…')

  const pdfjs = await loadPdfjs()
  const Tesseract = (await import('tesseract.js' as string)).default

  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const pageNumbers = targets ?? Array.from({ length: doc.numPages }, (_, index) => index + 1)
  const out = [...initialPages]
  try {
    // Keep the fallback bounded and refuse to return a silently truncated scan.
    if (pageNumbers.length > 40) return ''
    const worker = await Tesseract.createWorker('tur')
    try {
      for (const pageNo of pageNumbers) {
        onProgress?.(`OCR · sayfa ${pageNo}/${doc.numPages}`)
        const page = await doc.getPage(pageNo)
        const pageSize = page.getViewport({ scale: 1 })
        const scale = Math.min(2, Math.sqrt(4_000_000 / (pageSize.width * pageSize.height)), 4096 / Math.max(pageSize.width, pageSize.height))
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return ''
        try {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvasContext: ctx, viewport }).promise
          const { data: result } = await worker.recognize(canvas, {}, { text: true, blocks: true })
          const words = ocrWords(result.blocks ?? [], scale)
          out[pageNo - 1] = words.length ? buildPageLines(words).join('\n') : result.text
        } finally {
          canvas.width = 0
          canvas.height = 0
        }
      }
    } finally {
      await worker.terminate()
    }
  } finally {
    await doc.destroy()
  }

  return out.join('\n')
}

export async function extractText(file: File, options: ExtractOptions): Promise<ExtractResult> {
  const { onProgress } = options
  const isPdf = isPdfFile(file)

  if (!isPdf) {
    onProgress?.(`${file.name} okunuyor…`)
    return { text: await readAsText(file), engine: 'text' }
  }

  const layer = readPdfTextLayer(await extractPdfPages(file, onProgress))
  const recognised = layer.engine === 'pdf-ebcdic' && hasReadableText(layer.text)
    ? { text: layer.text, engine: layer.engine }
    : recogniseLayerText(layer.text, onProgress)
  const assess = options.assessReadable ?? (() => 'accept')
  if (recognised && assess(recognised) !== 'retry') return recognised

  let best = recognised
  if (!best && options.useLocalOcr) {
    const serviceText = await ocrViaService(file, options.ocrEndpoint, onProgress)
    if (serviceText && (isRecognised(serviceText) || hasReadableText(serviceText))) {
      const service = { text: serviceText, engine: 'ocr-service' }
      if (assess(service) !== 'retry') return service
      best = service
    }
  }

  const weakPages = layer.pageText.flatMap((text, index) => hasReadableText(text) ? [] : [index + 1])
  const selectPages = recognised && weakPages.length > 0 ? weakPages : null
  try {
    const browserText = await ocrInBrowser(file, selectPages, selectPages ? layer.pageText : [], onProgress)
    const browser = { text: browserText, engine: selectPages ? 'pdf-ocr' : 'ocr-browser' }
    if (browserText.trim() && (!best || assess(browser) === 'accept')) return browser
  } catch (error) {
    if (!best) throw error
  }

  // Nothing recognised it; hand back the best text we have so the caller can
  // report a parse failure rather than a silent empty import.
  return best ?? { text: layer.text, engine: layer.engine }
}
