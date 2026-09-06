import { describe, expect, it } from 'vitest'
import { akbankAdapter } from './akbank'
import { garantiAdapter } from './garanti'
import { csvAdapter } from './csv'
import { detectAdapter } from './index'
import { normalizeMerchant } from '../../core/text'

const AKBANK = `
AKBANK AXESS HESAP ÖZETİ
Son Ödeme Tarihi: 10/08/2026
05/07/2026 TRENDYOL.COM (1,065.00 TL) 3/2.taksit 355.00 355.00x1
12/07/2026 SPOTIFY AB STOCKHOLM 149.99
18/07/2026 KENT ECZANESI ISTANBUL TUR (1,012.53 TL +Vade Farkı) 3/2.taksit 337.51 337.51x1
22/07/2026 NAKİL VAS. VERGİ DAİRESİ (6,460.72 TL) 3/2.taksit 2,153.57 2,153.57x1
25/07/2026 IADE - TRENDYOL.COM 220.00(-)
28/07/2026 Ödemeniz için Teşekkürler 5,000.00
`.trim()

const GARANTI = `
GARANTİ BBVA BONUS KREDİ KARTI EKSTRESİ
Hesap Kesim Tarihi 16 Ağustos 2026
08 Ağustos 2026 A101 9923 I353 BAHÇELİEVL 0,09 788,50
09 Ağustos 2026 MIGROS 5023 KADIKOY 1,20 1.245,30
10 Ağustos 2026 IKEA TAKSIT 2/6 1.250,00
16 Ağustos 2026 BONUS BEDAVA ALIŞVERİŞ 0,39-
12 Ağustos 2026 Google makromusic for 899,99 TL 899,99
`.trim()

const CSV = `Tarih;Açıklama;Tutar
05/07/2026;MIGROS MMM;-1.245,30
06/07/2026;MAAŞ ÖDEMESİ;45.000,00
`

describe('akbank adapter', () => {
  const output = akbankAdapter.parse(AKBANK)

  it('claims the document', () => {
    expect(akbankAdapter.detect(AKBANK)).toBeGreaterThan(0.5)
    expect(detectAdapter(AKBANK)?.adapter.id).toBe('akbank')
  })

  it('reads the statement amount, not the instalment principal', () => {
    const trendyol = output.rows.find((r) => r.description.includes('TRENDYOL'))
    expect(trendyol?.amount).toBe(35500)
    expect(trendyol?.installment).toEqual({ current: 2, total: 3, principal: 106500 })
  })

  it('keeps grouped thousands intact', () => {
    const tax = output.rows.find((r) => r.description.includes('VERGİ'))
    expect(tax?.amount).toBe(215357)
  })

  it('marks refunds and card payments by kind rather than sign', () => {
    const refund = output.rows.find((r) => r.description.includes('IADE'))
    expect(refund?.kind).toBe('refund')
    expect(refund?.amount).toBe(22000)

    const payment = output.rows.find((r) => r.description.includes('Teşekkürler'))
    expect(payment?.kind).toBe('payment')
  })

  it('strips instalment and principal text from the description', () => {
    const trendyol = output.rows.find((r) => r.description.includes('TRENDYOL'))
    expect(trendyol?.description).toBe('TRENDYOL.COM')
  })

  it('picks up the due date', () => {
    expect(output.dueDate).toBe('2026-08-10')
  })
})

describe('garanti adapter', () => {
  const output = garantiAdapter.parse(GARANTI)

  it('claims the document', () => {
    expect(detectAdapter(GARANTI)?.adapter.id).toBe('garanti')
  })

  it('takes the last number as the billed amount, not the bonus column', () => {
    const a101 = output.rows.find((r) => r.description.includes('A101'))
    expect(a101?.amount).toBe(78850)

    const migros = output.rows.find((r) => r.description.includes('MIGROS'))
    expect(migros?.amount).toBe(124530)
  })

  it('drops loyalty-only lines', () => {
    expect(output.rows.some((r) => r.description.includes('BONUS BEDAVA'))).toBe(false)
  })

  it('reads instalments as current/total', () => {
    const ikea = output.rows.find((r) => r.description.includes('IKEA'))
    expect(ikea?.installment).toEqual({ current: 2, total: 6 })
  })

  it('collapses the echoed price format', () => {
    const music = output.rows.find((r) => r.description.includes('makromusic'))
    expect(music?.amount).toBe(89999)
  })

  it('reads the statement cut date', () => {
    expect(output.periodEnd).toBe('2026-08-16')
  })
})

/**
 * Layout quirks taken from a real Bonus statement: template spacer cells that
 * render as the literal word "bosluk", the bank's own section headings, and the
 * closing paragraph that contains a date but no transaction.
 */
const GARANTI_REAL = `
GARANTİ BBVA BONUS PLATINUM EKSTRE
Hesap Kesim Tarihi 30 Ağustos 2026
Son Ödeme Tarihi 09 Eylül 2026
bosluk 08 Ağustos 2026 A101 9923 I353 BAHÇELİEVL 0,09 788,50
10 Ağustos 2026 9923-A101-I353-BAHÇELİEVL 0,04 196,00
14 Ağustos 2026 UBER EATS-TRENDYOL GO-GET 0,07- 370,00+
Süpermarket
15 Ağustos 2026 AYDIN MINI MARKET 340,00
Cafe & Restaurant
11 Ağustos 2026 VOLKING ET VE TAVUK 1.400,00
09 Ağustos 2026 ROMA DONDURMA 150,00
DİĞER HARCAMALARINIZ
28 Temmuz 2026 -TTNET7046196931020260731 1.181,00
16 Ağustos 2026 BONUS BEDAVA ALIŞVERİŞ 0,39-
Bir sonraki hesap kesiminiz 28 Eylül 2026 Pazartesi ve son ödemeniz 08 Ekim 2026 Perşembe 'dir.
`.trim()

describe('garanti layout quirks', () => {
  const output = garantiAdapter.parse(GARANTI_REAL)

  it('reads rows that sit behind a template spacer', () => {
    const a101 = output.rows.filter((r) => r.description.includes('A101'))
    expect(a101).toHaveLength(2)
    expect(a101[0].amount).toBe(78850)
  })

  it('gives both spellings of a shop the same merchant key', () => {
    const keys = output.rows
      .filter((r) => r.description.includes('A101'))
      .map((r) => normalizeMerchant(r.description))
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toBe('A101')
  })

  it('reads a trailing plus as a refund', () => {
    const uber = output.rows.find((r) => r.description.includes('UBER'))
    expect(uber).toMatchObject({ kind: 'refund', amount: 37000 })
  })

  it('carries the section heading as a hint, without overriding our own rules', () => {
    const volking = output.rows.find((r) => r.description.includes('VOLKING'))
    // Our keywords have no opinion here, so the heading decides.
    expect(volking?.categoryHint).toBe('dining')

    const roma = output.rows.find((r) => r.description.includes('ROMA'))
    // Filed by the bank under "Süpermarket"; the heading is only a fallback and
    // our DONDURMA rule wins downstream.
    expect(roma?.categoryHint).toBe('dining')
  })

  it('clears the hint at an untyped heading', () => {
    const ttnet = output.rows.find((r) => r.description.includes('TTNET'))
    expect(ttnet?.categoryHint).toBeUndefined()
  })

  it('ignores prose that merely contains a date', () => {
    expect(output.rows.some((r) => r.description.includes('Pazartesi'))).toBe(false)
    expect(output.skipped).toBe(0)
  })

  it('still drops loyalty-only rows', () => {
    expect(output.rows.some((r) => r.description.includes('BONUS BEDAVA'))).toBe(false)
  })
})

describe('csv adapter', () => {
  it('only claims delimited files', () => {
    expect(csvAdapter.detect(AKBANK)).toBe(0)
    expect(csvAdapter.detect(CSV)).toBeGreaterThan(0)
  })

  it('reads sign as direction', () => {
    const output = csvAdapter.parse(CSV)
    expect(output.rows).toHaveLength(2)
    expect(output.rows[0]).toMatchObject({ amount: 124530, kind: 'expense' })
    expect(output.rows[1]).toMatchObject({ amount: 4500000, kind: 'income' })
  })
})

describe('detection', () => {
  it('returns null rather than guessing on unrelated text', () => {
    expect(detectAdapter('lorem ipsum dolor sit amet')).toBeNull()
  })
})
