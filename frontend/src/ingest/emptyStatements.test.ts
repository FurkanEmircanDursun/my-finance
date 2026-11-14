import { describe, expect, it } from 'vitest'
import { AKBANK_NO_ACTIVITY, GARANTI_NO_ACTIVITY } from './fixtures'
import { parseStatementText } from './pipeline'

const parse = (text: string) => parseStatementText(text, { rules: [], engine: 'text', fileName: 'no-activity.txt' })

describe('verified no-activity statement acceptance', () => {
  it.each([AKBANK_NO_ACTIVITY, GARANTI_NO_ACTIVITY])('accepts a supported bank cover with explicit no-activity wording and balanced figures', text => {
    expect(parse(text)).toMatchObject({ transactions: [], skipped: 0, periodEnd: expect.stringMatching(/^2026-09-/), reconciliation: { status: 'match', expectedCharges: 0 } })
  })
  it('accepts unchanged carried debt without inventing a purchase', () => {
    expect(parse(AKBANK_NO_ACTIVITY.replace(/0\.00/g, '500.00'))).toMatchObject({ transactions: [], summary: { totalDebt: 50000, previousBalance: 50000 } })
  })
  it.each([
    AKBANK_NO_ACTIVITY.replace('Bu dönemde işleminiz bulunmamaktadır.', ''),
    AKBANK_NO_ACTIVITY.replace('Önceki Dönem Hesap Özeti Bakiyesi 0.00', ''),
    AKBANK_NO_ACTIVITY.replace('Dönem Borcu 0.00', 'Dönem Borcu 50.00'),
    `${AKBANK_NO_ACTIVITY}\n05/09/2026 MARKET OKUNAMAYAN-TUTAR`,
    'Tarih,Açıklama,Tutar\n',
    'Bu dönemde işleminiz bulunmamaktadır.',
  ])('rejects incomplete, contradictory or unsupported empty documents', text => {
    expect(() => parse(text)).toThrow()
  })
})
