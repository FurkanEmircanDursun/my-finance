import { describe, expect, it } from 'vitest'
import { buildLines, type TextGeom } from './extract'
import { decodeEbcdic, looksLikeEbcdic } from '../core/ebcdic'
import { detectAdapter } from './banks'
import { toMinor } from '../core/money'

/**
 * Fixtures reproduce what PDF.js actually returns for the two statement
 * generators this project supports. Both were captured from real files and then
 * rewritten with invented amounts and merchants, so the repository holds no
 * personal financial data.
 */

/** Akbank writes EBCDIC bytes; PDF.js hands them back as Latin-1 code points. */
const AKBANK_EBCDIC = [
  // AKBANK AXESS HESAP ÖZETİ
  '\u00C1\u00D2\u00C2\u00C1\u00D5\u00D2\u0040\u00C1\u00E7\u00C5\u00E2\u00E2\u0040\u00C8\u00C5\u00E2\u00C1\u00D7\u0040\u00EC\u00E9\u00C5\u00E3\u00AE',
  // Son Ödeme Tarihi: 07/09/2026
  '\u00E2\u0096\u0095\u0040\u00EC\u0084\u0085\u0094\u0085\u0040\u00E3\u0081\u0099\u0089\u0088\u0089\u007A\u0040\u00F0\u00F7\u0061\u00F0\u00F9\u0061\u00F2\u00F0\u00F2\u00F6',
  // 05/07/2026 TRENDYOL.COM (1,065.00 TL) 3/2.taksit 355.00 355.00x1
  '\u00F0\u00F5\u0061\u00F0\u00F7\u0061\u00F2\u00F0\u00F2\u00F6\u0040\u00E3\u00D9\u00C5\u00D5\u00C4\u00E8\u00D6\u00D3\u004B\u00C3\u00D6\u00D4\u0040\u004D\u00F1\u006B\u00F0\u00F6\u00F5\u004B\u00F0\u00F0\u0040\u00E3\u00D3\u005D\u0040\u00F3\u0061\u00F2\u004B\u00A3\u0081\u0092\u00A2\u0089\u00A3\u0040\u00F3\u00F5\u00F5\u004B\u00F0\u00F0\u0040\u00F3\u00F5\u00F5\u004B\u00F0\u00F0\u00A7\u00F1',
  // 26/07/2026 A101 9923 I353 BAHÇELİEVBALIKESİR TR 473.00
  '\u00F2\u00F6\u0061\u00F0\u00F7\u0061\u00F2\u00F0\u00F2\u00F6\u0040\u00C1\u00F1\u00F0\u00F1\u0040\u00F9\u00F9\u00F2\u00F3\u0040\u00C9\u00F3\u00F5\u00F3\u0040\u00C2\u00C1\u00C8\u0068\u00C5\u00D3\u00AE\u00C5\u00E5\u00C2\u00C1\u00D3\u00C9\u00D2\u00C5\u00E2\u00AE\u00D9\u0040\u00E3\u00D9\u0040\u00F4\u00F7\u00F3\u004B\u00F0\u00F0',
  // 06/08/2026 İNTERNET Şb-Ödemeniz için Teşekkürler 45,725.64(-)
  '\u00F0\u00F6\u0061\u00F0\u00F8\u0061\u00F2\u00F0\u00F2\u00F6\u0040\u00AE\u00D5\u00E3\u00C5\u00D9\u00D5\u00C5\u00E3\u0040\u00B1\u0082\u0060\u00EC\u0084\u0085\u0094\u0085\u0095\u0089\u00A9\u0040\u0089\u0048\u0089\u0095\u0040\u00E3\u0085\u00AF\u0085\u0092\u0092\u00DC\u0099\u0093\u0085\u0099\u0040\u00F4\u00F5\u006B\u00F7\u00F2\u00F5\u004B\u00F6\u00F4\u004D\u0060\u005D',
  // 17/08/2026 Ev Ekleme Kampanyasi 100.00
  '\u00F1\u00F7\u0061\u00F0\u00F8\u0061\u00F2\u00F0\u00F2\u00F6\u0040\u00C5\u00A5\u0040\u00C5\u0092\u0093\u0085\u0094\u0085\u0040\u00D2\u0081\u0094\u0097\u0081\u0095\u00A8\u0081\u00A2\u0089\u0040\u00F1\u00F0\u00F0\u004B\u00F0\u00F0',
  // 17/08/2026 Chip-Para ile Ödeme 220.00(-) 220.00(-)
  '\u00F1\u00F7\u0061\u00F0\u00F8\u0061\u00F2\u00F0\u00F2\u00F6\u0040\u00C3\u0088\u0089\u0097\u0060\u00D7\u0081\u0099\u0081\u0040\u0089\u0093\u0085\u0040\u00EC\u0084\u0085\u0094\u0085\u0040\u00F2\u00F2\u00F0\u004B\u00F0\u00F0\u004D\u0060\u005D\u0040\u00F2\u00F2\u00F0\u004B\u00F0\u00F0\u004D\u0060\u005D',
  // 28/08/2026 Toplam Dönem Faizi 675.17
  '\u00F2\u00F8\u0061\u00F0\u00F8\u0061\u00F2\u00F0\u00F2\u00F6\u0040\u00E3\u0096\u0097\u0093\u0081\u0094\u0040\u00C4\u00CC\u0095\u0085\u0094\u0040\u00C6\u0081\u0089\u00A9\u0089\u0040\u00F6\u00F7\u00F5\u004B\u00F1\u00F7',
].join('\n')

describe('EBCDIC statements', () => {
  it('is recognised without being confused for a scan', () => {
    expect(looksLikeEbcdic(AKBANK_EBCDIC)).toBe(true)
    expect(looksLikeEbcdic('05/07/2026 TRENDYOL.COM 355,00')).toBe(false)
  })

  it('decodes to the original Turkish text', () => {
    const decoded = decodeEbcdic(AKBANK_EBCDIC).split('\n')
    expect(decoded[0]).toBe('AKBANK AXESS HESAP ÖZETİ')
    expect(decoded[2]).toBe('05/07/2026 TRENDYOL.COM (1,065.00 TL) 3/2.taksit 355.00 355.00x1')
    expect(decoded[4]).toContain('Ödemeniz için Teşekkürler')
  })

  it('is claimed by the Akbank adapter once decoded, and by nobody before', () => {
    expect(detectAdapter(AKBANK_EBCDIC)).toBeNull()
    expect(detectAdapter(decodeEbcdic(AKBANK_EBCDIC))?.adapter.id).toBe('akbank')
  })

  it('reconciles to the statement total', () => {
    const decoded = decodeEbcdic(AKBANK_EBCDIC)
    const adapter = detectAdapter(decoded)!.adapter
    const { rows } = adapter.parse(decoded)

    const spend = rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0)
    const refund = rows.filter((r) => r.kind === 'refund').reduce((s, r) => s + r.amount, 0)

    // 355.00 purchase + 473.00 purchase + 675.17 interest − 220.00 chip-para.
    expect(spend).toBe(toMinor(355 + 473 + 675.17))
    expect(refund).toBe(toMinor(220))

    // The card payment is present but is not spending.
    expect(rows.find((r) => r.kind === 'payment')?.amount).toBe(toMinor(45_725.64))

    // The chip-para award is excluded: counting it would inflate the period by
    // exactly the amount later redeemed.
    expect(rows.some((r) => /Kampanyasi/i.test(r.description))).toBe(false)
  })

  it('reads the instalment plan and its principal', () => {
    const decoded = decodeEbcdic(AKBANK_EBCDIC)
    const adapter = detectAdapter(decoded)!.adapter
    const trendyol = adapter.parse(decoded).rows.find((r) => r.description.includes('TRENDYOL'))

    expect(trendyol?.amount).toBe(toMinor(355))
    expect(trendyol?.installment).toEqual({ current: 2, total: 3, principal: toMinor(1065) })
  })
})

describe('line reconstruction', () => {
  const font = 9.6

  /** Helper mirroring how PDF.js reports a run: left edge, baseline, advance. */
  const run = (text: string, x: number, w: number, y = 700, h = font): TextGeom => ({ text, x, y, w, h })

  it('ignores hair-width whitespace runs used for kerning', () => {
    // Akbank emits 0.24pt "spaces" between glyph groups at a 9.6pt font size.
    // Rendering those as real spaces shattered every number and word.
    const line = buildLines([
      run('0', 100, 5),
      run(' ', 105, 0.24),
      run('5', 105.2, 5),
      run('/', 110.2, 3),
      run('0', 113.2, 5),
      run(' ', 118.2, 0.24),
      run('7', 118.4, 5),
    ])
    expect(line).toEqual(['05/07'])
  })

  it('keeps whitespace runs wide enough to be real spaces', () => {
    const line = buildLines([
      run('TRENDYOL', 100, 40),
      run(' ', 140, 2.16),
      run('COM', 142.2, 15),
    ])
    expect(line).toEqual(['TRENDYOL COM'])
  })

  it('separates columns that abut with no whitespace run at all', () => {
    // Two amount columns printed side by side once produced "355.00355.00".
    const line = buildLines([run('355.00', 100, 28), run('355.00', 140, 28)])
    expect(line).toEqual(['355.00 355.00'])
  })

  it('splits rows by baseline, not by a fixed pixel distance', () => {
    const lines = buildLines([
      run('ilk satır', 100, 40, 700),
      run('ikinci satır', 100, 40, 688),
    ])
    expect(lines).toEqual(['ilk satır', 'ikinci satır'])
  })

  it('keeps a row together when baselines drift within the font size', () => {
    const lines = buildLines([
      run('aynı', 100, 20, 700),
      run(' ', 120, 2.16, 700),
      run('satır', 122.2, 20, 699.4),
    ])
    expect(lines).toEqual(['aynı satır'])
  })
})
