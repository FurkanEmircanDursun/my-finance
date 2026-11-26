import { describe, expect, it } from 'vitest'
import {
  assessStatementWarnings,
  extractCardholderName,
  findOwnershipMismatch,
  matchesTypedCardholderName,
  namesLikelyMatch,
} from './ownership'

describe('extractCardholderName', () => {
  it('extracts cardholder from Turkish Sayın header line', () => {
    const cover = [
      'T. GARANTİ BANKASI A.Ş.',
      'SAYIN FURKAN DURSUN',
      'HESAP KESİM TARİHİ: 28/10/2026',
    ].join('\n')
    expect(extractCardholderName(cover)).toBe('Furkan Dursun')
  })

  it('extracts cardholder from Kart Hamili label on inline or next line', () => {
    const inline = 'AKBANK T.A.Ş.\nKart Hamili: AHMET CAN YILMAZ   Müşteri No: 12345'
    expect(extractCardholderName(inline)).toBe('Ahmet Can Yılmaz')

    const nextLine = 'AKBANK AXESS\nMÜŞTERİ ADI SOYADI:\nZEYNEP DEMİR\nADRES: İSTANBUL'
    expect(extractCardholderName(nextLine)).toBe('Zeynep Demir')
  })

  it('ignores bank boilerplate and address lines', () => {
    const boilerplate = 'SAYIN MÜŞTERİMİZ\nAKBANK T.A.Ş. GENEL MÜDÜRLÜK\nKART HAMİLİ: İSTANBUL ŞUBESİ'
    expect(extractCardholderName(boilerplate)).toBeUndefined()
  })

  it('extracts cardholder from inline columnar Sayın, Sn., Akbank, and QNB headers', () => {
    expect(extractCardholderName('Müşteri Numarası 12345678 Sayın DENİZ YILMAZ')).toBe('Deniz Yılmaz')
    expect(extractCardholderName('SN. SELİN KAYA Hesap Kesim Tarihi: 23.11.2026')).toBe('Selin Kaya')
    expect(extractCardholderName('Asgari Ödeme Oranı : TL %40.00 Sn. CAN ÖZTÜRK')).toBe('Can Öztürk')
    expect(extractCardholderName('****  ****  ****  1234  MERT    ARSLAN  Harcamaları')).toBe('Mert Arslan')
    expect(extractCardholderName('ASIL KART: 4000 00** **** 1234 - DEFNE AYDIN')).toBe('Defne Aydın')
  })
})

describe('namesLikelyMatch', () => {
  it('matches Turkish diacritics, case, middle names, and initials', () => {
    expect(namesLikelyMatch('FURKAN DURSUN', 'Furkan Dursun')).toBe(true)
    expect(namesLikelyMatch('ÖMER FARUK ŞAHİN', 'Omer Sahin')).toBe(true)
    expect(namesLikelyMatch('F. DURSUN', 'Furkan Dursun')).toBe(true)
  })

  it('distinguishes completely different people and family members sharing a surname', () => {
    expect(namesLikelyMatch('AHMET YILMAZ', 'Furkan Dursun')).toBe(false)
    expect(namesLikelyMatch('AYŞE DURSUN', 'Furkan Dursun')).toBe(false)
    expect(namesLikelyMatch('MEHMET DURSUN', 'Furkan Dursun')).toBe(false)
  })
})

describe('matchesTypedCardholderName', () => {
  it('accepts exact full-name confirmation tolerating Turkish case/diacritics and whitespace', () => {
    expect(matchesTypedCardholderName('Ayşe Dursun', 'Ayşe Dursun')).toBe(true)
    expect(matchesTypedCardholderName('  ayse   dursun ', 'Ayşe Dursun')).toBe(true)
    expect(matchesTypedCardholderName('BURAK SAHIN', 'Burak Şahin')).toBe(true)
  })

  it('rejects empty, partial, or different names', () => {
    expect(matchesTypedCardholderName('', 'Ayşe Dursun')).toBe(false)
    expect(matchesTypedCardholderName('Ayşe', 'Ayşe Dursun')).toBe(false)
    expect(matchesTypedCardholderName('Furkan Dursun', 'Ayşe Dursun')).toBe(false)
  })
})

describe('assessStatementWarnings', () => {
  it('requires explicit confirmation with expectedConfirmName when statement belongs to a different person', () => {
    const warnings = assessStatementWarnings({
      cardholderName: 'Ahmet Yılmaz',
      accountDisplayName: 'Furkan Dursun',
      existingCardholders: [],
      batchCardholders: [],
      periodEnd: '2026-10-28',
      today: '2026-11-25',
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      code: 'different_holder_account',
      requiresExplicitConfirm: true,
      expectedConfirmName: 'Ahmet Yılmaz',
    })
  })

  it('flags mismatch against previously imported statements when account has no displayName', () => {
    const warnings = assessStatementWarnings({
      cardholderName: 'Ayşe Dursun',
      accountDisplayName: null,
      existingCardholders: ['Furkan Dursun'],
      batchCardholders: [],
      periodEnd: '2026-10-28',
      today: '2026-11-25',
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      code: 'different_holder_existing',
      requiresExplicitConfirm: true,
      expectedConfirmName: 'Ayşe Dursun',
    })
  })

  it('flags mixed cardholders uploaded in the same batch and old archive files', () => {
    const warnings = assessStatementWarnings({
      cardholderName: 'Zeynep Kaya',
      accountDisplayName: null,
      existingCardholders: [],
      batchCardholders: ['Furkan Dursun'],
      periodEnd: '2024-01-15',
      today: '2026-11-25',
    })
    expect(warnings.map((w) => w.code)).toEqual(['mixed_batch_holders', 'stale_statement'])
    expect(warnings[0].requiresExplicitConfirm).toBe(true)
    expect(warnings[0].expectedConfirmName).toBe('Zeynep Kaya')
    expect(warnings[1].requiresExplicitConfirm).toBeUndefined()
  })

  it('emits no warnings for matching holder and recent period', () => {
    const warnings = assessStatementWarnings({
      cardholderName: 'FURKAN DURSUN',
      accountDisplayName: 'Furkan Dursun',
      existingCardholders: ['Furkan Dursun'],
      batchCardholders: ['Furkan Dursun'],
      periodEnd: '2026-10-28',
      reportedCardLast4: '4821',
      sameBankCardCount: 2,
      today: '2026-11-25',
    })
    expect(warnings).toEqual([])
  })
})

describe('findOwnershipMismatch', () => {
  it('detects different holders against account name, existing statements, or current batch', () => {
    expect(
      findOwnershipMismatch({
        cardholderName: 'Ayşe Dursun',
        accountDisplayName: 'Furkan Dursun',
        existingCardholders: [],
        batchCardholders: [],
      }),
    ).toMatchObject({ code: 'different_holder_account', expectedConfirmName: 'Ayşe Dursun' })

    expect(
      findOwnershipMismatch({
        cardholderName: 'Furkan Can Dursun',
        accountDisplayName: 'Furkan Dursun',
        existingCardholders: [],
        batchCardholders: [],
      }),
    ).toBeNull()

    expect(
      findOwnershipMismatch({
        cardholderName: 'Mert Demir',
        accountDisplayName: null,
        existingCardholders: ['Deniz Kaya'],
        batchCardholders: [],
      }),
    ).toMatchObject({ code: 'different_holder_existing', expectedConfirmName: 'Mert Demir' })
  })
})
