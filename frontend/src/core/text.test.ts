import { describe, expect, it } from 'vitest'
import { fold, normalizeMerchant } from './text'

describe('folding', () => {
  it('maps Turkish characters onto ASCII', () => {
    expect(fold('Bahçelievler')).toBe('BAHCELIEVLER')
    expect(fold('ŞİŞLİ')).toBe('SISLI')
    expect(fold('ığdır')).toBe('IGDIR')
  })
})

describe('merchant normalisation', () => {
  it('collapses branch and city noise onto one key', () => {
    const a = normalizeMerchant('A101 9923 I353 BAHÇELİEVL')
    const b = normalizeMerchant('A101 4417 I112 KADIKOY')
    expect(a).toBe(b)
    expect(a).toBe('A101')
  })

  it('strips payment-processor prefixes', () => {
    expect(normalizeMerchant('GOOGLE *YOUTUBEPREMIUM g.co/helppay# ISTANBUL TR')).toBe('YOUTUBEPREMIUM')
    expect(normalizeMerchant('IYZICO*SPOTIFY')).toContain('SPOTIFY')
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
