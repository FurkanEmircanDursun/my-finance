import { detectAdapter } from './banks'
import { decodeEbcdic, looksLikeEbcdic } from '../core/ebcdic'
import { findColumnLayout, tagRewardColumn } from './columns'

/**
 * Turns a dropped file into plain text.
 *
 * Escalation ladder, cheapest first — each step only runs when the previous one
 * produced text no adapter recognises:
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

async function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist/build/pdf.min.mjs' as string)
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url' as string)).default
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

  const sorted = [...items].sort((a, b) =>
    Math.abs(a.y - b.y) <= rowTolerance ? a.x - b.x : b.y - a.y,
  )

  const rows: TextGeom[][] = []
  let row: TextGeom[] = []
  let baseline: number | null = null

  for (const item of sorted) {
    if (baseline === null || Math.abs(baseline - item.y) <= rowTolerance) {
      row.push(item)
      baseline ??= item.y
    } else {
      rows.push(row)
      row = [item]
      baseline = item.y
    }
  }
  if (row.length) rows.push(row)

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
 * `buildLines` for a real page: reads the table's column header, and wraps
 * every number in the loyalty column in `⟦…⟧` first (see `columns.ts`).
 *
 * `decode` is how to read the page's text — the identity, or the EBCDIC
 * decoder for Akbank's mainframe PDFs. It is used only to *recognise* headers
 * and numbers; the lines it returns keep the original, still-encoded text.
 */
export function buildPageLines(items: TextGeom[], decode: (text: string) => string = (t) => t): string[] {
  const rows = groupRows(items.map((item) => ({ ...item })))
  const layout = findColumnLayout(rows, decode)
  if (layout) tagRewardColumn(rows, layout, decode)

  const lines: string[] = []
  for (const row of rows) {
    const line = rowToLine(row)
    if (line) lines.push(line)
  }
  return lines
}

/**
 * pdf.js text items → positioned runs. Whitespace items are kept only when they
 * have a width, because the width is how the line builder tells a real space from
 * a kerning gap.
 */
export function toTextGeom(items: ReadonlyArray<any>): TextGeom[] {
  return items
    .filter((i) => typeof i.str === 'string' && i.str.length)
    .map((i) => ({
      text: i.str as string,
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
export function pdfPagesToText(pages: readonly TextGeom[][]): string {
  const out: string[] = []
  for (const items of pages) {
    const sample = items.map((i) => i.text).join(' ')
    out.push(...buildPageLines(items, looksLikeEbcdic(sample) ? decodeEbcdic : undefined))
  }
  return out.join('\n')
}

async function extractPdfPages(file: File, onProgress?: ProgressFn): Promise<TextGeom[][]> {
  const pdfjs = await loadPdfjs()
  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise

  const pages: TextGeom[][] = []
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    onProgress?.(`PDF metin katmanı okunuyor · sayfa ${pageNo}/${doc.numPages}`)
    const page = await doc.getPage(pageNo)
    const content = await page.getTextContent()
    pages.push(toTextGeom(content.items))
  }

  await doc.destroy()
  return pages
}

/**
 * Steps 2 and 3 of the ladder: the text layer as it stands, then — when no
 * adapter recognises it — decoded as EBCDIC. Null means neither worked and the
 * caller should reach for OCR.
 */
export function recogniseLayerText(layerText: string, onProgress?: ProgressFn): ExtractResult | null {
  if (isRecognised(layerText)) return { text: layerText, engine: 'pdf-text' }

  // Akbank ships its statements as EBCDIC bytes with no ToUnicode map. The text
  // is complete, just in the wrong code page — decode before reaching for OCR.
  if (looksLikeEbcdic(layerText)) {
    onProgress?.('Ana bilgisayar kodlaması çözülüyor…')
    const decoded = decodeEbcdic(layerText)
    if (isRecognised(decoded)) return { text: decoded, engine: 'pdf-ebcdic' }
  }

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

async function ocrInBrowser(file: File, onProgress?: ProgressFn): Promise<string> {
  onProgress?.('Tarayıcı içi OCR başlatılıyor (bu adım yavaştır)…')

  const pdfjs = await loadPdfjs()
  const Tesseract = (await import('tesseract.js' as string)).default

  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const worker = await Tesseract.createWorker('tur')

  const out: string[] = []
  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      onProgress?.(`OCR · sayfa ${pageNo}/${doc.numPages}`)
      const page = await doc.getPage(pageNo)
      const viewport = page.getViewport({ scale: 2 })

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise

      const { data: result } = await worker.recognize(canvas)
      out.push(result.text)

      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    await worker.terminate()
    await doc.destroy()
  }

  return out.join('\n')
}

export async function extractText(file: File, options: ExtractOptions): Promise<ExtractResult> {
  const { onProgress } = options
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

  if (!isPdf) {
    onProgress?.(`${file.name} okunuyor…`)
    return { text: await readAsText(file), engine: 'text' }
  }

  const layerText = pdfPagesToText(await extractPdfPages(file, onProgress))
  const recognised = recogniseLayerText(layerText, onProgress)
  if (recognised) return recognised

  if (options.useLocalOcr) {
    const serviceText = await ocrViaService(file, options.ocrEndpoint, onProgress)
    if (serviceText && isRecognised(serviceText)) return { text: serviceText, engine: 'ocr-service' }
  }

  const browserText = await ocrInBrowser(file, onProgress)
  if (browserText.trim()) return { text: browserText, engine: 'ocr-browser' }

  // Nothing recognised it; hand back the best text we have so the caller can
  // report a parse failure rather than a silent empty import.
  return { text: layerText, engine: 'pdf-text' }
}
