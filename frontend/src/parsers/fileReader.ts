import type { Transaction } from '../types/finance'
import { parseAkbank } from './akbankParser'
import { parseGaranti } from './garantiParser'

export type BankType = 'akbank' | 'garanti' | 'unknown'

const AKBANK_DATE_RE = /\d{2}\/\d{2}\/\d{4}/g
const GARANTI_DATE_RE = /\d{2}\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+\d{4}/gi

export function detectBank(text: string): BankType {
  const garantiMatches = (text.match(GARANTI_DATE_RE) || []).length
  const akbankMatches = (text.match(AKBANK_DATE_RE) || []).length

  if (garantiMatches > 0 && garantiMatches >= akbankMatches) return 'garanti'
  if (akbankMatches > 0) return 'akbank'
  return 'unknown'
}

/** Standard PDF.js text layer extraction */
async function extractTextFromPdf(file: File): Promise<string> {
  // @ts-ignore
  const pdfjsLib = await import('pdfjs-dist/build/pdf.min.mjs')
  // @ts-ignore
  const pdfWorkerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  let fullText = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()

    const allItems = textContent.items
      .filter((item: any) => 'str' in item && item.str.trim() !== '')
      .map((item: any) => ({ text: item.str, x: item.transform[4], y: item.transform[5] }))
      .sort((a: { y: number }, b: { y: number }) => b.y - a.y)

    const lines: { text: string; x: number; y: number }[][] = []
    let currentLine: { text: string; x: number; y: number }[] = []
    let currentY: number | null = null

    for (const item of allItems) {
      if (currentY === null || Math.abs(currentY - item.y) <= 5) {
        currentLine.push(item)
        if (currentY === null) currentY = item.y
      } else {
        lines.push(currentLine)
        currentLine = [item]
        currentY = item.y
      }
    }
    if (currentLine.length > 0) lines.push(currentLine)

    for (const line of lines) {
      line.sort((a, b) => a.x - b.x)
      const lineStr = line.map((item) => item.text).join(' ')
      fullText += lineStr + '\n'
    }
  }

  return fullText
}

/** High-accuracy PaddleOCR (Deep Learning) extraction via local FastAPI service */
async function extractTextWithPaddleOcr(
  file: File,
  onProgress?: (msg: string) => void
): Promise<string | null> {
  try {
    if (onProgress) onProgress('PaddleOCR (Derin Öğrenme) ile yüksek doğrulukla taranıyor...')
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('http://127.0.0.1:8000/api/ocr', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) return null
    const data = await res.json()
    if (data && data.text) {
      return data.text
    }
    return null
  } catch {
    // Backend service not reachable or errored
    return null
  }
}

/** In-browser Tesseract.js OCR fallback */
async function extractTextFromPdfOcr(
  file: File,
  onProgress?: (msg: string) => void
): Promise<string> {
  if (onProgress) onProgress('Tarayıcı OCR analizi yapılıyor (Lütfen bekleyin)...')

  // @ts-ignore
  const pdfjsLib = await import('pdfjs-dist/build/pdf.min.mjs')
  // @ts-ignore
  const pdfWorkerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

  // @ts-ignore
  const Tesseract = (await import('tesseract.js')).default

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let fullText = ''

  const worker = await Tesseract.createWorker('tur')
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
  })

  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress(`OCR: Sayfa ${i} / ${pdf.numPages} taranıyor...`)
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    canvas.width = viewport.width
    canvas.height = viewport.height

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvasContext: ctx, viewport }).promise

    const {
      data: { text },
    } = await worker.recognize(canvas)
    fullText += text + '\n'
  }

  await worker.terminate()
  return fullText
}

async function extractTextFromTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('TXT dosyası okunamadı.'))
    reader.readAsText(file, 'utf-8')
  })
}

/**
 * Dosyayı okur ve parse eder:
 * 1. Standard text extraction (PDF.js)
 * 2. Akbank gibi şifreli fontlu dosyalarda: PaddleOCR (RapidOCR Deep Learning)
 * 3. Fallback: Browser Tesseract.js
 */
export async function parseFile(
  file: File,
  onProgress?: (msg: string) => void
): Promise<{ bank: string; transactions: Transaction[] }> {
  let text = ''

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    if (onProgress) onProgress(`${file.name} standart okunuyor...`)
    text = await extractTextFromPdf(file)

    // Fallback to high-accuracy PaddleOCR if standard text extraction yields gibberish (e.g. Akbank CID fonts)
    if (detectBank(text) === 'unknown') {
      const paddleText = await extractTextWithPaddleOcr(file, onProgress)
      if (paddleText && detectBank(paddleText) !== 'unknown') {
        text = paddleText
      } else {
        // Fallback to in-browser Tesseract if backend is not active
        text = await extractTextFromPdfOcr(file, onProgress)
      }
    }
  } else {
    text = await extractTextFromTxt(file)
  }

  if (!text) {
    throw new Error('Dosya içeriği okunamadı veya boş.')
  }

  const bankType = detectBank(text)
  if (bankType === 'unknown') {
    throw new Error('Ekstre formatı tanınamadı. Dosya metni bozuk olabilir veya desteklenmeyen bir banka.')
  }

  if (onProgress) onProgress('İşlemler kategorize ediliyor...')

  const transactions =
    bankType === 'garanti' ? parseGaranti(text) : parseAkbank(text)

  if (transactions.length === 0) {
    throw new Error('Hiç işlem bulunamadı. Lütfen ekstrenin boş olmadığından emin olun.')
  }

  return {
    bank: bankType === 'garanti' ? 'Garanti BBVA' : 'Akbank',
    transactions,
  }
}
