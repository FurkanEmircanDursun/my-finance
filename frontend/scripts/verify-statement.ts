/**
 * Reads real statements with the app's own code and says whether they add up.
 *
 *   npm run verify -- "C:\Users\me\Downloads\ekstre.pdf" [more files…] [--rows] [--json]
 *
 * It runs exactly what the browser runs — the same line builder, the same EBCDIC
 * decoder, the same bank adapters, the same reconciliation — minus the page. For
 * each file it prints the parsed statement and one verdict:
 *
 *   MATCH       the parsed charges equal what the bank's own cover implies
 *   MISMATCH    they do not; the difference is the size of the mistake
 *   UNVERIFIED  the cover printed no total to compare against
 *
 * Nothing is written anywhere and nothing leaves the machine. Exit status is 1
 * when any file fails to parse or does not match, so it can sit in a script.
 *
 * `--rows` lists every parsed row; `--json` prints the full parse result instead
 * of the report; `--text` prints the text the parser was handed (what the PDF
 * reader produced, with the loyalty column wrapped in ⟦…⟧) — the first thing to
 * look at when a statement does not reconcile.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readPdfTextLayer, recogniseLayerText, toTextGeom } from '../src/ingest/extract'
import { parseStatementText, statementImportProblem } from '../src/ingest/pipeline'
import type { ParseResult } from '../src/domain/types'

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const files = args.filter((a) => !a.startsWith('--'))

if (!files.length) {
  console.error('Kullanım: npm run verify -- <ekstre.pdf|.txt|.csv> [...] [--rows] [--json]')
  process.exit(2)
}

const tl = (minor: number | null): string =>
  minor === null ? '—' : (minor / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function loadPdfText(file: string): Promise<{ text: string; engine: string }> {
  // The legacy build runs on Node; the browser build needs a DOM.
  const pdfjs = await import(
    pathToFileURL(path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href
  )
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(file)),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise

  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    pages.push(toTextGeom((await (await doc.getPage(n)).getTextContent()).items))
  }
  await doc.destroy()

  const layer = readPdfTextLayer(pages)
  const recognised = layer.engine === 'pdf-ebcdic' ? layer : recogniseLayerText(layer.text)
  if (!recognised) {
    throw new Error('PDF metni tanınmadı (taranmış olabilir; uygulamadaki OCR yolu gerekir).')
  }
  return recognised
}

async function load(file: string): Promise<{ text: string; engine: string }> {
  if (/\.pdf$/i.test(file)) return loadPdfText(file)
  return { text: fs.readFileSync(file, 'utf8'), engine: 'text' }
}

function report(file: string, r: ParseResult, withRows: boolean): void {
  const rec = r.reconciliation
  const verdict = rec.status.toUpperCase()

  console.log(`\n${'═'.repeat(78)}`)
  console.log(`${path.basename(file)}`)
  console.log(`${r.label} · ${r.bank} · okuma: ${r.engine}`)
  console.log(`Dönem ${r.periodStart ?? '?'} → ${r.periodEnd ?? '?'} · son ödeme ${r.dueDate ?? '?'}`)
  console.log(
    `${r.transactions.length} satır okundu · ${r.skipped} okunamadı · ${r.ignored.length} satır sayılmadı (bonus/kampanya)`,
  )

  console.log(`\n  Ekstredeki dönem borcu            ${tl(rec.printedDebt).padStart(14)}`)
  console.log(`  − Önceki dönemden devir           ${tl(rec.previousBalance).padStart(14)}`)
  console.log(`  + Karttan ödenen (satırlarda)     ${tl(rec.payments).padStart(14)}`)
  console.log(`  = Bankanın kaydettiği harcama     ${tl(rec.expectedCharges).padStart(14)}`)
  console.log(`    Okunan harcama (alışveriş−iade) ${tl(rec.parsedCharges).padStart(14)}`)
  console.log(`    Fark                            ${tl(rec.delta).padStart(14)}   → ${verdict}`)

  const spend = new Map<string, number>()
  for (const tx of r.transactions) {
    if (tx.kind === 'expense') spend.set(tx.category, (spend.get(tx.category) ?? 0) + tx.amount)
    if (tx.kind === 'refund') spend.set(tx.category, (spend.get(tx.category) ?? 0) - tx.amount)
  }
  const top = [...spend.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  console.log(`\n  Kategori (net): ${top.map(([c, v]) => `${c} ${tl(v)}`).join(' · ')}`)

  const unclassified = r.transactions.filter((t) => t.kind === 'expense' && t.category === 'other')
  if (unclassified.length) {
    console.log(`  Sınıflanmayan (${unclassified.length}): ${unclassified.map((t) => t.description).slice(0, 6).join(' | ')}`)
  }

  if (withRows) {
    console.log('')
    for (const tx of r.transactions) {
      const plan = tx.installment ? `${tx.installment.current}/${tx.installment.total}` : '   '
      console.log(
        `  ${tx.date} ${tx.kind.padEnd(8)} ${tl(tx.amount).padStart(12)} ${plan.padEnd(4)} ${tx.category.padEnd(13)} ${tx.description}`,
      )
    }
    for (const row of r.ignored) {
      console.log(`  ${row.date} ${row.reason.padEnd(14)} ${tl(row.amount).padStart(12)}      ${row.description}  (sayılmadı)`)
    }
  }
}

let failed = false
const results: Array<{ file: string; result?: ParseResult; error?: string }> = []

for (const file of files) {
  try {
    const { text, engine } = await load(file)
    if (flags.has('--text')) console.log(text)
    const result = parseStatementText(text, { rules: [], engine, fileName: path.basename(file) })
    results.push({ file, result })
    if (statementImportProblem(result, /\.pdf$/i.test(file))) failed = true
  } catch (error) {
    failed = true
    results.push({ file, error: error instanceof Error ? error.message : String(error) })
  }
}

if (flags.has('--json')) {
  console.log(JSON.stringify(results, null, 2))
} else {
  for (const { file, result, error } of results) {
    if (result) report(file, result, flags.has('--rows'))
    else console.error(`\n${path.basename(file)}: OKUNAMADI — ${error}`)
  }
  console.log('')
}

process.exit(failed ? 1 : 0)
