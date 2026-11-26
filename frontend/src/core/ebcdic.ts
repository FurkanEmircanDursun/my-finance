/**
 * EBCDIC decoder for Akbank / Axess statement PDFs.
 *
 * Akbank generates its PDFs on a mainframe and embeds subset fonts whose glyph
 * codes are raw EBCDIC bytes with no usable ToUnicode map. PDF.js therefore
 * returns the bytes reinterpreted as Latin-1, which looks like mojibake:
 *
 *   "ð õ að ÷ aò ð ò ö ãÙÅÕÄèÖÓKÃÖÔ"   ->   "05/07/2026 TRENDYOL.COM"
 *
 * The previous build treated this as an unreadable scan and fell back to OCR,
 * which is slow, lossy and needs an extra service. The text is in fact intact —
 * it only needs the code page applied. Decoding is instant and exact.
 *
 * Base table is the EBCDIC layout common to CP037/CP1026. The Turkish letters
 * are overlaid from the encodings actually observed in Akbank statements; the
 * document mixes several font subsets, so a handful of high bytes are ambiguous
 * between subsets. Those are resolved in favour of the subset used by the
 * transaction table, which is the only part that gets parsed.
 */

const TABLE: string[] = new Array(256).fill('')

function assign(start: number, letters: string): void {
  for (let i = 0; i < letters.length; i++) TABLE[start + i] = letters[i]
}

assign(0x81, 'abcdefghi')
assign(0x91, 'jklmnopqr')
assign(0xa2, 'stuvwxyz')
assign(0xc1, 'ABCDEFGHI')
assign(0xd1, 'JKLMNOPQR')
assign(0xe2, 'STUVWXYZ')
assign(0xf0, '0123456789')

const PUNCTUATION: Record<number, string> = {
  0x40: ' ', 0x4a: '[', 0x4b: '.', 0x4c: '<', 0x4d: '(', 0x4e: '+', 0x4f: '|',
  0x50: '&', 0x5a: '!', 0x5b: '$', 0x5c: '*', 0x5d: ')', 0x5e: ';', 0x5f: '^',
  0x60: '-', 0x61: '/', 0x6a: ']', 0x6b: ',', 0x6c: '%', 0x6d: '_', 0x6e: '>', 0x6f: '?',
  0x7a: ':', 0x7b: '#', 0x7c: '@', 0x7d: "'", 0x7e: '=', 0x7f: '"',
}

/** Turkish glyphs, read off real statements. */
const TURKISH: Record<number, string> = {
  0x48: 'ç', 0x68: 'Ç',
  0xaa: 'ı', 0xab: 'ş', 0xac: 'ğ',
  0xae: 'İ', 0xaf: 'ş',
  0xb0: 'ı', 0xb1: 'Ş', 0xb3: 'İ', 0xb4: 'İ', 0xb6: 'Ş', 0xb7: 'ı', 0xb8: 'İ',
  0xba: 'Ğ', 0xbb: 'ü',
  0xc0: 'Ş', 0xcc: 'ö',
  0xdc: 'ü', 0xec: 'Ö', 0xfc: 'Ü',
}

for (const [code, char] of Object.entries(PUNCTUATION)) TABLE[Number(code)] = char
for (const [code, char] of Object.entries(TURKISH)) TABLE[Number(code)] = char

/**
 * Line breaks and the spaces this project's own line reconstruction inserts are
 * ASCII and must survive decoding untouched — EBCDIC's own space is 0x40.
 */
TABLE[0x0a] = '\n'
TABLE[0x0d] = ''
TABLE[0x09] = ' '
TABLE[0x20] = ' '

/** Byte ranges that carry letters and digits in EBCDIC. */
function isTextByte(code: number): boolean {
  return (
    (code >= 0x81 && code <= 0x89) ||
    (code >= 0x91 && code <= 0x99) ||
    (code >= 0xa2 && code <= 0xa9) ||
    (code >= 0xc1 && code <= 0xc9) ||
    (code >= 0xd1 && code <= 0xd9) ||
    (code >= 0xe2 && code <= 0xe9) ||
    (code >= 0xf0 && code <= 0xf9)
  )
}

/**
 * True when the text is dense with EBCDIC letter/digit bytes and sparse in
 * ASCII letters — the signature of a mainframe-generated PDF read as Latin-1.
 */
export function looksLikeEbcdic(text: string): boolean {
  let ebcdic = 0
  let ascii = 0
  const sample = text.length > 4000 ? text.slice(0, 4000) : text

  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i)
    if (isTextByte(code)) ebcdic++
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || (code >= 0x30 && code <= 0x39)) ascii++
  }

  return ebcdic > 40 && ebcdic > ascii * 2
}

export function decodeEbcdic(text: string): string {
  return decodeWithOverrides(text, null)
}

function decodeWithOverrides(text: string, overrides: Record<number, string> | null): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    // Anything outside the byte range came from a font that already produced
    // real Unicode; pass it through rather than corrupting it.
    if (code < 256) {
      out += overrides && code in overrides ? overrides[code] : TABLE[code]
    } else {
      out += text[i]
    }
  }
  return out
}

/**
 * Calibrates minor Akbank subset shifts from fixed table-header bytes.
 *
 * Akbank embeds Turkish special letters (ı, Ş, ş, İ, ğ) in a dynamic subset
 * font whose slots can shift by one code point between templates: in some
 * PDFs "Borç Tutarı" ends with 0xaf (shifting 0xaf→ı and 0xb0→Ş, as seen on
 * "ŞOK-5665" and "AXESS Chip-Para Kampanyası"). Detecting the exact byte on
 * "Borç Tutar?" keeps both template revisions exact without breaking either.
 */
export function createEbcdicDecoder(sample: string): (text: string) => string {
  const compact = sample.replace(/[\x20\x40\r\n\t]+/g, '')
  // "BorçTutar" in EBCDIC is c2 96 99 48 e3 a4 a3 81 99, followed by the 'ı' byte.
  const shifted = /\xc2\x96\x99\x48\xe3\xa4\xa3\x81\x99\xaf/.test(compact)
  if (!shifted) return decodeEbcdic
  const overrides: Record<number, string> = { 0xaf: 'ı', 0xb0: 'Ş' }
  return (text: string) => decodeWithOverrides(text, overrides)
}
