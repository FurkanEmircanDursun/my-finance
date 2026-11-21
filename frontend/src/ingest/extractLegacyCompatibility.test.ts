import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPdfTextItems } from './extract'

afterEach(() => { vi.unstubAllGlobals() })

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

  it('extracts real SDK text without stream async iteration using the app reader fallback', () => {
    const result = isolatedSdk(`
      import assert from 'node:assert/strict';
      delete Promise.withResolvers;
      delete ReadableStream.prototype[Symbol.asyncIterator];
      const pdf = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
      assert.equal(typeof ReadableStream.prototype[Symbol.asyncIterator], 'undefined');
      const readPdfTextItems = ${readPdfTextItems.toString()};
      const document = await pdf.getDocument({
        data: new Uint8Array(Buffer.from('${syntheticPdf()}', 'base64')),
        isEvalSupported: false, useSystemFonts: true,
      }).promise;
      try {
        const page = await document.getPage(1);
        const items = await readPdfTextItems(page);
        assert.equal(items.map(item => item.str).join(''), 'Synthetic PDF compatibility');
        assert.equal(typeof ReadableStream.prototype[Symbol.asyncIterator], 'undefined');
        console.log('legacy-reader-extracted');
      } finally { await document.destroy(); }
    `)
    expect(result).toContain('legacy-reader-extracted')
  }, 15000)
})

function readerPage() {
  const reader = { read: vi.fn(), cancel: vi.fn(async () => {}), releaseLock: vi.fn() }
  const page = {
    getTextContent: vi.fn(async () => ({ items: ['standard'] })),
    streamTextContent: vi.fn(() => ({ getReader: () => reader }) as unknown as ReadableStream<{ items: unknown[] }>),
  }
  return { reader, page }
}

describe('PDF text stream reader cleanup', () => {
  it('preserves the normal getTextContent path when stream async iteration exists', async () => {
    const { page } = readerPage()
    await expect(readPdfTextItems(page)).resolves.toEqual(['standard'])
    expect(page.getTextContent).toHaveBeenCalledOnce()
    expect(page.streamTextContent).not.toHaveBeenCalled()
  })

  it('joins stream chunks in order and releases a normally completed reader', async () => {
    vi.stubGlobal('ReadableStream', class {})
    const { page, reader } = readerPage()
    reader.read.mockResolvedValueOnce({ done: false, value: { items: ['first', 'second'] } })
      .mockResolvedValueOnce({ done: false, value: { items: ['third'] } })
      .mockResolvedValueOnce({ done: true })
    await expect(readPdfTextItems(page)).resolves.toEqual(['first', 'second', 'third'])
    expect(page.getTextContent).not.toHaveBeenCalled()
    expect(reader.cancel).not.toHaveBeenCalled()
    expect(reader.releaseLock).toHaveBeenCalledOnce()
  })

  it('cancels and unlocks after a stream read rejects', async () => {
    vi.stubGlobal('ReadableStream', class {})
    const { page, reader } = readerPage(), failure = new Error('Synthetic read failure')
    reader.read.mockRejectedValueOnce(failure)
    await expect(readPdfTextItems(page)).rejects.toBe(failure)
    expect(reader.cancel).toHaveBeenCalledOnce()
    expect(reader.releaseLock).toHaveBeenCalledOnce()
  })

  it('preserves the read failure and unlocks even if stream cancellation rejects', async () => {
    vi.stubGlobal('ReadableStream', class {})
    const { page, reader } = readerPage(), failure = new Error('Synthetic read failure')
    reader.read.mockRejectedValueOnce(failure)
    reader.cancel.mockRejectedValueOnce(new Error('Synthetic cancellation failure'))
    await expect(readPdfTextItems(page)).rejects.toBe(failure)
    expect(reader.releaseLock).toHaveBeenCalledOnce()
  })
})
