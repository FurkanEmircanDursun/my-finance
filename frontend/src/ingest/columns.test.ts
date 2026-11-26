import { describe, expect, it } from 'vitest'
import { buildPageLines, groupRows, readPdfTextLayer, toTextGeom, type TextGeom } from './extract'
import { findColumnLayout, splitRewardTags } from './columns'
import { decodeEbcdic } from '../core/ebcdic'
import { akbankAdapter } from './banks/akbank'
import { garantiAdapter } from './banks/garanti'

/**
 * Geometry taken from the shape of two real statements: right-aligned numbers
 * under their header, so the right edge of a number says which column it is in.
 */

const run = (text: string, x: number, w: number, y: number, h = 8): TextGeom => ({ text, x, y, w, h })

/** A Garanti-like page: "Bonus (TL)" ends at x=445, "Tutar (TL)" at x=553. */
function garantiPage(): TextGeom[] {
  return [
    run('Hesap Kesim Tarihi', 36, 70, 668),
    run('Min. Ödeme Tutarı', 36, 70, 640),
    run('11.045,00 TL', 212, 43, 640),

    run('İşlem Tarihi', 105, 41, 545),
    run('Bonus (TL)', 405, 40, 545),
    run('Tutar (TL)', 517, 36, 545),

    // A row with only a bonus figure — loyalty points, not a purchase.
    run('05 Eylül 2026', 105, 42, 507),
    run('OTOMATİK FATURA BONUS', 170, 93, 507),
    run('3.000,00', 418, 27, 507),

    // A purchase: bonus earned, then the billed amount.
    run('09 Eylül 2026', 105, 42, 495),
    run('UBER EATS YEMEK', 170, 66, 495),
    run('0,08', 431, 14, 495),
    run('261,00', 531, 21, 495),

    // A card payment: billed column only.
    run('08 Eylül 2026', 105, 42, 483),
    run('ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ', 170, 120, 483),
    run('500,00+', 524, 28, 483),
  ]
}

describe('column layout', () => {
  it('finds the amount and bonus columns from the header', () => {
    const layout = findColumnLayout(groupRows(garantiPage()), (t) => t)
    expect(layout).not.toBeNull()
    expect(layout!.rewardRight).toBeCloseTo(445, 0)
    expect(layout!.amountRight).toBeCloseTo(553, 0)
  })

  it('does not take a "Min. Ödeme Tutarı" in the cover text for the table header', () => {
    const layout = findColumnLayout(groupRows(garantiPage()), (t) => t)
    // The cover line sits above the real header; it must not move the anchor.
    expect(layout!.headerY).toBe(545)
  })

  it('finds nothing on a page with no such table', () => {
    const prose = [run('Ekstreniz ile ilgili açıklamalar', 36, 200, 700), run('Tutar nedir', 36, 60, 680)]
    expect(findColumnLayout(groupRows(prose), (t) => t)).toBeNull()
  })

  it('reuses an aligned header on the following page when it is omitted', () => {
    const continuation = garantiPage().filter(item => item.y < 545)
    const layer = readPdfTextLayer([garantiPage(), continuation])
    expect(layer.pageText[1]).toContain('⟦0,08⟧ ⟨261,00⟩')
    const shifted = readPdfTextLayer([garantiPage(), continuation.map(item => ({ ...item, x: item.x - 50 }))])
    expect(shifted.pageText[1]).not.toContain('⟨')
  })
})

describe('tagging the transaction columns', () => {
  const lines = buildPageLines(garantiPage())

  it('wraps a bonus-only figure so it cannot pass for a purchase', () => {
    expect(lines).toContain('05 Eylül 2026 OTOMATİK FATURA BONUS ⟦3.000,00⟧')
  })

  it('marks bonus and billed values separately', () => {
    expect(lines).toContain('09 Eylül 2026 UBER EATS YEMEK ⟦0,08⟧ ⟨261,00⟩')
  })

  it('keeps the sign on a payment in the billed column', () => {
    expect(lines).toContain('08 Eylül 2026 ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ ⟨500,00+⟩')
  })

  it('does not touch anything above the table', () => {
    expect(lines.find((l) => l.includes('Min. Ödeme'))).toBe('Min. Ödeme Tutarı 11.045,00 TL')
  })

  it('splits tags back out for an adapter', () => {
    expect(splitRewardTags('UBER ⟦0,08⟧ 261,00')).toEqual({ line: 'UBER 261,00', rewards: ['0,08'] })
    expect(splitRewardTags('PLAIN 100,00')).toEqual({ line: 'PLAIN 100,00', rewards: [] })
  })

  it('keeps a decimal reference in the description when the billed column is present', () => {
    const page = [
      ...garantiPage(),
      run('10 Eylül 2026', 105, 42, 471),
      run('MARKET', 170, 35, 471),
      run('123,45', 330, 21, 471),
      run('250,00', 531, 21, 471),
    ]
    const result = garantiAdapter.parse(buildPageLines(page).join('\n'))
    expect(result.rows[result.rows.length - 1]).toMatchObject({ description: 'MARKET 123,45', amount: 25_000 })
  })
})

/**
 * Akbank writes EBCDIC bytes, so headers and digits only become recognisable
 * once decoded — and its two-line "Dönem İçi / Chip-para" header is one word.
 */
describe('an EBCDIC page', () => {
  // Inverse of the decoder, built from the decoder so the two can never disagree.
  const inverse = new Map<string, string>()
  for (let code = 0; code < 256; code++) {
    const ch = String.fromCharCode(code)
    const decoded = decodeEbcdic(ch)
    if (decoded.length === 1 && !inverse.has(decoded)) inverse.set(decoded, ch)
  }
  const enc = (text: string) => [...text].map((c) => inverse.get(c) ?? c).join('')

  const page: TextGeom[] = [
    // The header as the PDF sets it: separate words, and a two-line loyalty
    // header whose lines overlap, so "İçi" and "Chip-para" arrive as one word.
    run(enc('Borç'), 410, 14, 508, 9.6),
    run(enc('Tutarı'), 427, 17, 508, 9.6),
    run(enc('(TL)'), 447, 11, 508, 9.6),
    run(enc('Dönem'), 539, 25, 512, 9.6),
    run(enc('İçiChip-para'), 536, 30, 504, 9.6),

    run(enc('21/09/2026 Kampanya'), 56, 100, 480, 9.6),
    run(enc('120.00'), 540, 26, 480, 9.6),

    run(enc('24/09/2026 Chip-Para ile Ödeme'), 56, 100, 468, 9.6),
    run(enc('120.00(-)'), 428, 35, 468, 9.6),
    run(enc('120.00(-)'), 530, 36, 468, 9.6),
  ]

  const lines = buildPageLines(page, decodeEbcdic).map(decodeEbcdic)

  it('tags the chip-para figure once decoded', () => {
    expect(lines.find((l) => l.includes('Kampanya'))).toBe('21/09/2026 Kampanya ⟦120.00⟧')
  })

  it('keeps the billed and loyalty copies of a credit separate', () => {
    expect(lines.find((l) => l.includes('Ödeme'))).toBe('24/09/2026 Chip-Para ile Ödeme ⟨120.00(-)⟩ ⟦120.00(-)⟧')
  })

  it('reads the billed column and remainder when the description ends in a decimal reference', () => {
    const extra = [
      run(enc('25/09/2026 Ornek Kampanyasi 123.45 (750.00 TL) 3/1.taksit'), 56, 344, 450, 9.6),
      run(enc('250.00'), 431, 26, 450, 9.6),
      run(enc('250.00x2'), 470, 40, 450, 9.6),
      run(enc('26/09/2026 GAZ ABONE'), 56, 104, 438, 9.6),
      run(enc('987.65'), 375, 26, 438, 9.6),
      run(enc('25.00'), 432, 25, 438, 9.6),
    ]
    const result = akbankAdapter.parse(buildPageLines([...page, ...extra], decodeEbcdic).map(decodeEbcdic).join('\n'))
    expect(result.rows.slice(-2)).toMatchObject([
      { description: 'Ornek Kampanyasi 123.45', amount: 25_000, installment: { remaining: { count: 2, amount: 25_000 } } },
      { description: 'GAZ ABONE 987.65', amount: 2_500 },
    ])
  })
})

it('groups adjacent baselines the same way regardless of PDF glyph order', () => {
  const page = [run('top', 90, 12, 100), run('top-left', 20, 30, 96), run('bottom', 10, 20, 92)]
  const expected = [['top-left', 'top'], ['bottom']]
  expect(groupRows(page).map(row => row.map(item => item.text))).toEqual(expected)
  expect(groupRows([...page].reverse()).map(row => row.map(item => item.text))).toEqual(expected)
})

it('tags leading-signed amounts under TUTAR and MAXIPUAN headers', () => {
  const page: TextGeom[] = [
    run('İŞLEM TARİHİ', 30, 50, 500),
    run('AÇIKLAMA', 90, 60, 500),
    run('TUTAR', 395, 33, 500),
    run('MAXIPUAN', 520, 47, 500),
    run('24/10/2026', 30, 40, 480),
    run('WWW.TRENDYOL.COM', 90, 80, 480),
    run('-324,95', 537, 30, 480),
    run('01/11/2026', 30, 40, 468),
    run('HESAPTAN AKTARIM', 90, 80, 468),
    run('-1.500,00', 390, 38, 468),
  ]
  const lines = buildPageLines(page)
  expect(lines).toContain('24/10/2026 WWW.TRENDYOL.COM ⟦-324,95⟧')
  expect(lines).toContain('01/11/2026 HESAPTAN AKTARIM ⟨-1.500,00⟩')
})

it('filters 90-degree rotated vertical margin stamps out of horizontal text geometry', () => {
  const items = [
    { str: '23/11/2026', transform: [8, 0, 0, 8, 30, 500], width: 40, height: 8 },
    { str: 'Belge Numarası: 999999', transform: [0, 8, -8, 0, 12, 500], width: 0, height: 8 },
  ]
  expect(toTextGeom(items).map((g) => g.text)).toEqual(['23/11/2026'])
})
