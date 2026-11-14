import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/** A complete one-page PDF, generated here without personal statement data. */
function syntheticPdf(): string {
  const text = 'BT /F1 12 Tf 72 720 Td (Synthetic PDF compatibility) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let document = '%PDF-1.7\n'
  const offsets = [0]
  for (const [i, object] of objects.entries()) {
    offsets.push(document.length)
    document += `${i + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = document.length
  document += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  document += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(document, 'ascii').toString('base64')
}

function isolatedSdk(script: string): string {
  // Separate processes prevent the main bundle's polyfills from masking a
  // missing worker polyfill, and never change the test runner/app Promise.
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 10000,
  }).trim()
}

describe('PDF.js compatibility in native WebViews missing Promise.withResolvers', () => {
  it('extracts text from a real PDF with the legacy library after removing the native API', () => {
    const result = isolatedSdk(`
      import assert from 'node:assert/strict';
      delete Promise.withResolvers;
      assert.equal(typeof Promise.withResolvers, 'undefined');
      const pdf = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
      assert.equal(typeof Promise.withResolvers, 'function');
      const document = await pdf.getDocument({
        data: new Uint8Array(Buffer.from('${syntheticPdf()}', 'base64')),
        isEvalSupported: false, useSystemFonts: true,
      }).promise;
      try {
        assert.equal(document.numPages, 1);
        const page = await document.getPage(1);
        const content = await page.getTextContent();
        assert.equal(content.items.map(item => item.str).join(''), 'Synthetic PDF compatibility');
        console.log('legacy-main-extracted');
      } finally { await document.destroy(); }
    `)
    expect(result).toContain('legacy-main-extracted')
  }, 15000)

  it('provides the missing API in the worker without loading the main library first', () => {
    const result = isolatedSdk(`
      import assert from 'node:assert/strict';
      delete Promise.withResolvers;
      assert.equal(typeof Promise.withResolvers, 'undefined');
      const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
      assert.equal(typeof worker.WorkerMessageHandler.setup, 'function');
      const { promise, resolve } = Promise.withResolvers();
      resolve('legacy-worker-resolved');
      console.log(await promise);
    `)
    expect(result).toBe('legacy-worker-resolved')
  }, 15000)
})
