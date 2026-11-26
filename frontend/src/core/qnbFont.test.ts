import { describe, expect, it } from 'vitest'
import { buildControlTurkishMap, decodeControlTurkish, looksLikeControlTurkish } from './qnbFont'

describe('QNB control-byte Turkish glyph decoder', () => {
  const sample = [
    'QNB Trendyol',
    'Hesap Kesim Tarihi : 12/11/2026',
    'Son \u0007deme Tarihi : 23 Kas\u0131m 2026',
    'D\u0006nem Borcu : 1,250.00 TL',
    'M\u0004\u0005teri Numaras\u0131 : 0001234567',
    'Hesap \u0007zetiniz',
    '\u0002\u0005lem Tarihi \u0002\u0005lem A\u0017\u0131klamas\u0131 Tutar',
    '\u0003cretler 40.00',
    '15/10/2026 D\u0003R\u0003MC\u0003 USTA 250.00',
    '18/10/2026 \u0018OK-1234 \u0002STANBUL 80.00',
    'www.qnb.com.tr QNB Bank A.\u0018. \u0018i\u0005li/\u0002stanbul',
  ].join('\n')

  it('calibrates shifted control-byte slots directly from Turkish cover labels', () => {
    expect(looksLikeControlTurkish(sample)).toBe(true)
    const map = buildControlTurkishMap(sample)
    expect(map).not.toBeNull()
    expect(map!.get('\u0007')).toBe('Ö')
    expect(map!.get('\u0006')).toBe('ö')
    expect(map!.get('\u0004')).toBe('ü')
    expect(map!.get('\u0005')).toBe('ş')
    expect(map!.get('\u0002')).toBe('İ')
    expect(map!.get('\u0003')).toBe('Ü')
    expect(map!.get('\u0018')).toBe('Ş')
    expect(map!.get('\u0017')).toBe('ç')

    const decoded = decodeControlTurkish(sample)
    expect(decoded).toContain('Son Ödeme Tarihi')
    expect(decoded).toContain('Dönem Borcu')
    expect(decoded).toContain('Müşteri Numarası')
    expect(decoded).toContain('İşlem Tarihi İşlem Açıklaması')
    expect(decoded).toContain('Ücretler 40.00')
    expect(decoded).toContain('DÜRÜMCÜ USTA 250.00')
    expect(decoded).toContain('ŞOK-1234 İSTANBUL 80.00')
  })

  it('works equally when glyph IDs shift to different control bytes', () => {
    const shifted = sample
      .replace(/\u0007/g, '\u0011')
      .replace(/\u0006/g, '\u0012')
      .replace(/\u0004/g, '\u0013')
      .replace(/\u0005/g, '\u0014')
    const decoded = decodeControlTurkish(shifted)
    expect(decoded).toContain('Son Ödeme Tarihi')
    expect(decoded).toContain('Müşteri Numarası')
  })

  it('rejects genuinely corrupt binary streams with no Turkish anchors', () => {
    expect(decodeControlTurkish('\u0000\u0001\u0002\u0003\u0004\u0005')).toBeNull()
    expect(decodeControlTurkish('random english text with \u0001 and \u0002 and \u0003 bytes only here')).toBeNull()
  })
})
