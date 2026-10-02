import { describe, expect, it } from 'vitest'
import { buildPageLines, groupRows, type TextGeom } from './extract'
import { findColumnLayout, splitRewardTags } from './columns'
import { decodeEbcdic } from '../core/ebcdic'

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
})

describe('tagging the loyalty column', () => {
  const lines = buildPageLines(garantiPage())

  it('wraps a bonus-only figure so it cannot pass for a purchase', () => {
    expect(lines).toContain('05 Eylül 2026 OTOMATİK FATURA BONUS ⟦3.000,00⟧')
  })

  it('wraps the bonus beside a purchase and leaves the billed amount bare', () => {
    expect(lines).toContain('09 Eylül 2026 UBER EATS YEMEK ⟦0,08⟧ 261,00')
  })

  it('leaves a number in the billed column alone', () => {
    expect(lines).toContain('08 Eylül 2026 ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ 500,00+')
  })

  it('does not touch anything above the table', () => {
    expect(lines.find((l) => l.includes('Min. Ödeme'))).toBe('Min. Ödeme Tutarı 11.045,00 TL')
  })

  it('splits tags back out for an adapter', () => {
    expect(splitRewardTags('UBER ⟦0,08⟧ 261,00')).toEqual({ line: 'UBER 261,00', rewards: ['0,08'] })
    expect(splitRewardTags('PLAIN 100,00')).toEqual({ line: 'PLAIN 100,00', rewards: [] })
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

  it('keeps the charge column and tags only the chip-para copy of a credit', () => {
    expect(lines.find((l) => l.includes('Ödeme'))).toBe('24/09/2026 Chip-Para ile Ödeme 120.00(-) ⟦120.00(-)⟧')
  })
})
