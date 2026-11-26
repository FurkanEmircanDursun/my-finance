import { describe, expect, it } from 'vitest'
import { fold, normalizeMerchant } from './text'

describe('folding', () => {
  it('maps Turkish characters onto ASCII', () => {
    expect(fold('Bahçelievler')).toBe('BAHCELIEVLER')
    expect(fold('ŞİŞLİ')).toBe('SISLI')
    expect(fold('ığdır')).toBe('IGDIR')
    expect(fold('Asgâri')).toBe('ASGARI')
  })
})

describe('merchant normalisation', () => {
  it('collapses branch and city noise onto one key', () => {
    const a = normalizeMerchant('A101 9923 I353 BAHÇELİEVL')
    const b = normalizeMerchant('A101 4417 I112 KADIKOY')
    expect(a).toBe(b)
    expect(a).toBe('A101')
  })

  it('strips payment-processor prefixes including chained ones', () => {
    expect(normalizeMerchant('GOOGLE *YOUTUBEPREMIUM g.co/helppay# ISTANBUL TR')).toBe('YOUTUBEPREMIUM')
    expect(normalizeMerchant('IYZICO*SPOTIFY')).toContain('SPOTIFY')
    expect(normalizeMerchant('IYZICO/IYZICO/AMAZONPRI ISTANBUL TR')).toBe('AMAZONPRI')
    expect(normalizeMerchant('PAY TR./ORNEK FIRMA')).toBe('ORNEK FIRMA')
    expect(normalizeMerchant('LIDIO ODEME/ORNEK ABONELIK ISTANBUL TR')).toBe('ORNEK ABONELIK')
  })

  it('preserves WWW merchant domains instead of deleting them', () => {
    expect(normalizeMerchant('WWW.TRENDYOL.COM ISTANBUL TR')).toBe('TRENDYOL')
    expect(normalizeMerchant('WWW.SAATVESAAT.COM. TR ISTANBUL TR')).toBe('SAATVESAAT')
  })

  it('keeps leading ŞOK as a supermarket brand while dropping street SOK noise', () => {
    expect(normalizeMerchant('ŞOK-5665 İSTANBUL FULYA M')).toBe('SOK FULYA')
    expect(normalizeMerchant('BELEN SOK. KAFE')).toBe('BELEN KAFE')
  })

  it('drops leading store codes so short alphanumeric chains like A101 survive', () => {
    expect(normalizeMerchant('9940 G040 A101 GARAJ IL CANKIRI TR')).toBe('A101 GARAJ')
  })

  it('strips single-letter channel prefixes like E/ while rescuing fragmented PDF glyphs', () => {
    expect(normalizeMerchant('E/ATASUN İSTANBUL')).toBe('ATASUN')
    expect(normalizeMerchant('O/MİGROS GALATA İSTANBUL')).toBe('MIGROS GALATA')
    expect(normalizeMerchant('E/ÖL ME SE ME VE Y')).toBe('OL ME SE ME')
    expect(normalizeMerchant('X Y Z W')).toBe('X Y Z W')
  })

  it('keeps distinct merchants distinct', () => {
    expect(normalizeMerchant('MIGROS MMM')).not.toBe(normalizeMerchant('CARREFOURSA'))
  })

  it('never returns an empty key', () => {
    expect(normalizeMerchant('   ')).toBeTruthy()
    expect(normalizeMerchant('12345')).toBeTruthy()
  })

  it('is stable across repeated calls', () => {
    const input = 'TRENDYOL.COM   ISTANBUL TR'
    expect(normalizeMerchant(input)).toBe(normalizeMerchant(input))
  })
})
