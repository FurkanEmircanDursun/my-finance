import { describe, expect, it } from 'vitest'
import { akbankAdapter } from './akbank'
import { garantiAdapter } from './garanti'
import { isbankAdapter } from './isbank'
import { dunyaKatilimAdapter } from './dunyakatilim'
import { qnbAdapter } from './qnb'
import { halkbankAdapter } from './halkbank'
import { parseStatementText, statementImportProblem } from '../pipeline'
import { buildInstallmentPlans } from '../../analytics/commitments'
import { createEbcdicDecoder, decodeEbcdic } from '../../core/ebcdic'
import { toMinor } from '../../core/money'

const parse = (text: string, engine = 'pdf-text') =>
  parseStatementText(text, { rules: [], engine, fileName: 'synthetic.pdf' })

describe('Türkiye İş Bankası adapter', () => {
  const modern = [
    'KREDİ KARTI HESAP ÖZETİ',
    'Kart Numarası: 6000********1234',
    'TROY KLASİK DİJİTAL Hesap Özetiniz',
    'SN. DENİZ KAYA Hesap Kesim Tarihi: 23.11.2026',
    'Son Ödeme Tarihi: 03.12.2026',
    'Hesap Özeti Borcu: 1.500,00 TL',
    'Ödenmesi Gereken Asgari Tutar: 300,00 TL',
    'Bir Sonraki Hesap Kesim Tarihi: 23.12.2026',
    'Bir Sonraki Son Ödeme Tarihi: 04.01.2027',
    'Toplam MaxiPuan: 1,50 TL',
    'Alışveriş Nakit Çekme',
    'Aylık %3,25 %4,25',
    'İŞLEM TARİHİ AÇIKLAMA TUTAR TAKSİT BİLGİSİ MAXIPUAN',
    '******** BİR ÖNCEKİ HESAP ÖZETİ BAKİYENİZ *** 2.000,00',
    '24/10/2026 WWW.TRENDYOL.COM ISTANBUL TR ⟦-250,00⟧',
    '25/10/2026 WWW.TRENDYOL.COM ISTANBUL TR ⟨400,00⟩ 2/3 taksidi (1.200,00) ⟦0,40⟧',
    '01/11/2026 2122-111111 HESAPTAN AKTARIM 2122 İNTERAKTİF ⟨-2.000,00⟩',
    '05/11/2026 ORNEK MARKET ISTANBUL TR ⟨1.100,00⟩ ⟦1,10⟧',
    'Müşteri Limiti: 50.000,00 TL',
    'Kullanılabilir Müşteri Limiti: 48.500,00 TL Nakit Çekme Limiti: 10.000,00 TL',
    'www.isbank.com.tr',
  ].join('\n')

  it('reconciles exact TL debt while keeping MaxiPuan-only redemptions out of TL spend', () => {
    const res = parse(modern)
    expect(res.bank).toBe('Türkiye İş Bankası')
    expect(res.accountLabel).toBe('İş Bankası Troy Klasik Dijital')
    expect(res.cardholderName).toBe('Deniz Kaya')
    expect(res.reportedCardLast4).toBe('1234')
    expect(res.reconciliation).toMatchObject({ status: 'match', delta: 0 })
    expect(statementImportProblem(res, true)).toBeNull()

    expect(res.transactions).toHaveLength(3)
    expect(res.transactions[0]).toMatchObject({
      merchant: 'TRENDYOL',
      amount: toMinor(400),
      kind: 'expense',
      installment: { current: 2, total: 3, principal: toMinor(1200) },
      reward: toMinor(0.4),
    })
    expect(res.transactions[1]).toMatchObject({ kind: 'payment', amount: toMinor(2000) })
    expect(res.ignored).toHaveLength(1)
    expect(res.ignored[0]).toMatchObject({ reason: 'reward-spent', amount: toMinor(250) })
    expect(res.summary).toMatchObject({
      totalDebt: toMinor(1500),
      previousBalance: toMinor(2000),
      minPayment: toMinor(300),
      creditLimit: toMinor(50000),
      availableLimit: toMinor(48500),
      cashAdvanceLimit: toMinor(10000),
      interestMonthly: 3.25,
      loyalty: { programme: 'MaxiPuan', balance: toMinor(1.5) },
    })
  })

  it('handles glued date+description rows and zero closing balance on older Genç layouts', () => {
    const genc = [
      'KREDİ KARTI HESAP ÖZETİ',
      'Kart Numarası: 4000********9999',
      'ÖĞRENCİ MAXIMUM GENÇ VİSA Hesap Özetiniz',
      'SN. CAN DEMİR Hesap Kesim Tarihi: 15.12.2021',
      'Son Ödeme Tarihi: 27.12.2021',
      'Hesap Özeti Borcu: 0,00 TL',
      'Ödenmesi Gereken Asgari Tutar: 0,00 TL',
      'İŞLEM TARİHİ AÇIKLAMA TUTAR TAKSİT BİLGİSİ MAXIPUAN',
      '******** BİR ÖNCEKİ HESAP ÖZETİ BAKİYENİZ *** 200,00',
      '16/11/20211400-1111449 HESAPTAN AKTARIM 1400 İNTERAKTİF ⟨-200,00⟩',
      '22/11/2021BIM A.S. ORNEK SUBE TR ⟨120,50⟩ ⟦0,05⟧',
      '28/11/20211400-1111449 HESAPTAN AKTARIM 1400 İNTERAKTİF ⟨-120,50⟩',
      'Alışveriş Faiz Oranı: %1,8',
      'www.maximumgenc.com.tr',
    ].join('\n')

    const res = parse(genc)
    expect(res.accountLabel).toBe('İş Bankası Öğrenci Maximum Genç Visa')
    expect(res.reconciliation).toMatchObject({ status: 'match', delta: 0, parsedCharges: toMinor(120.5) })
    expect(res.summary.interestMonthly).toBe(1.8)
    expect(res.transactions.filter((t) => t.kind === 'payment')).toHaveLength(2)
    expect(isbankAdapter.detect(genc)).toBeGreaterThan(0.5)
  })
})

describe('Dünya Katılım Paraf adapter', () => {
  const secondMonth = [
    'Dünya Katılım Paraf Kredi Kartı',
    'Hesap Kesim Tarihi : 24.11.2026 Sayın SELİN YILMAZ',
    'Son Ödeme Tarihi : 04.12.2026',
    'Dönem Borcu : 500,00 TL',
    'Asgâri Ödeme Tutarı : 500,00 TL',
    'Bir Sonraki Hesap Kesim Tarihi : 24.12.2026',
    'Bir Sonraki Son Ödeme Tarihi : 04.01.2027',
    'Kart Limiti : 100.000,00 TL',
    'Kart Numarası : 900000******4321',
    'Akdi Kâr Payı Oranı : %0.00 dunyakatilim.com.tr/kampanyalar',
    'Devir Bakiyesi : 0,00 TL',
    'Toplam ParafPara : 0,00 TL',
    'İşlem Tarihi Açıklama Tutar (TL) ParafPara',
    '13/10/2026 A101 MARKET İSTANBUL TR 2/6 Taksit ⟨500,00⟩ ⟦0.00⟧',
    '25/10/2026 Ödeme için teşekkür ederiz ⟨+500,00⟩ ⟦0.00⟧',
    'TOPLAM 500,00 ⟦0.00⟧',
  ].join('\n')

  it('reconstructs gross previous balance from unpaid Devir Bakiyesi + payments and sets billedOn on carried instalments', () => {
    const res = parse(secondMonth)
    expect(res.bank).toBe('Dünya Katılım')
    expect(res.accountLabel).toBe('Dünya Katılım Paraf')
    expect(res.cardholderName).toBe('Selin Yılmaz')
    expect(res.reportedCardLast4).toBe('4321')
    expect(res.reconciliation).toMatchObject({
      status: 'match',
      delta: 0,
      previousBalance: toMinor(500),
      payments: toMinor(500),
      parsedCharges: toMinor(500),
      printedDebt: toMinor(500),
    })
    expect(statementImportProblem(res, true)).toBeNull()
    expect(res.periodStart).toBe('2026-10-25')
    expect(res.periodEnd).toBe('2026-11-24')
    expect(res.transactions[0]).toMatchObject({
      date: '2026-10-13',
      billedOn: '2026-11-24',
      installment: { current: 2, total: 6 },
      category: 'market',
    })
    expect(res.transactions[1]).toMatchObject({ kind: 'payment', amount: toMinor(500) })
    expect(dunyaKatilimAdapter.detect(secondMonth)).toBeGreaterThan(0.5)
  })
})

describe('QNB adapter', () => {
  const qnb = [
    'QNB Trendyol',
    'Kredi Kartı Numarası : 5100 00** **** 5678 Son Ödeme Tarihi: 23 Kasım 2026, Pazartesi',
    'Hesap Kesim Tarihi : 12/11/2026',
    'Dönem Borcu : 1,210.00 TL',
    'Asgari Ödeme Tutarı : 484.00 TL',
    'Asgari Ödeme Oranı : TL %40.00 Sn. CAN ÖZTÜRK',
    'Kredi Kartı Limiti : 150,000.00 TL',
    'Nakit Avans Limiti : 25,000.00 TL',
    'Kullanılabilir Limit : 140,000.00 TL',
    'Kazanılan ParaPuan : 0',
    'Kullanılan ParaPuan : 0',
    'Toplam ParaPuan/TL Karşılığı : 0 / 0.00',
    'İşlem Tarihi İşlem Açıklaması Tutar Taksit ParaPuan',
    'Önceki Dönem Bakiyeniz 1,000.00',
    'ASIL KART: 5100 00** **** 5678 - CAN ÖZTÜRK',
    '21/10/2026 Ödeme - Tesekkür Ederiz - ⟨-1,000.00⟩',
    '16/10/2026 STEAMGAMES.COM 4259522 (USD 5.00) ⟨255.00⟩',
    '24/10/2026 ORNEK CORBA EVI 405.00 alşv ind ⟨-45.00⟩',
    '24/10/2026 ORNEK CORBA EVI ⟨450.00⟩',
    '26/02/2026 TRENDYOL PEŞİN ⟨550.00⟩ 9/12',
    'Hesap Özetiniz',
    'Önceki Dönem Harcamalar ve Ücretler Faiz Vergi ve Fon Ödemeler ve Dönem Borcu',
    '1,000.00 1,255.00 0.00 0.00 0.00 -1,045.00 1,210.00 TL',
    '* Bir sonraki hesap kesim tarihiniz 12/12/2026, bir sonraki son ödeme tarihiniz 22/12/2026',
    'Aylık TL %3.25',
    'www.qnbcard.com.tr',
  ].join('\n')

  it('reconciles 7-column Hesap Özetiniz bar with paymentLikeRefunds, USD foreign note, and weekday due date', () => {
    const res = parse(qnb)
    expect(res.bank).toBe('QNB')
    expect(res.accountLabel).toBe('QNB Trendyol')
    expect(res.cardholderName).toBe('Can Öztürk')
    expect(res.reportedCardLast4).toBe('5678')
    expect(res.dueDate).toBe('2026-11-23')
    expect(res.reconciliation).toMatchObject({ status: 'match', delta: 0, parsedCharges: toMinor(1210) })
    expect(res.printedTotalsMismatch).toBeUndefined()
    expect(statementImportProblem(res, true)).toBeNull()

    const steam = res.transactions.find((t) => t.merchant === 'STEAMGAMES')!
    expect(steam).toMatchObject({
      category: 'subscription',
      foreign: { amount: 500, currency: 'USD' },
    })
    const inst = res.transactions.find((t) => t.installment)!
    expect(inst).toMatchObject({
      date: '2026-02-26',
      billedOn: '2026-11-12',
      installment: { current: 9, total: 12 },
    })
    expect(qnbAdapter.detect(qnb)).toBeGreaterThan(0.5)
  })
})

describe('Garanti & Akbank real-layout regressions', () => {
  it('parses Garanti AxN=P M.Taksit format and undated interest/tax rows', () => {
    const text = [
      'Bonus Classic Troy Bilgileriniz Son Ödeme Tarihi: 03 Aralık 2026',
      'Müşteri Numarası 12345678 Sayın MERT ARSLAN',
      'Kart Numarası 9000 00** **** 1111',
      'Hesap Kesim Tarihi 23 Kasım 2026',
      'Son Ödeme Tarihi 03 Aralık 2026',
      'Dönem Borcunuz 1.346,57 TL',
      'İşlem Tarihi Dönem İçi İşlemler Kalan Borç / Taksit Bonus (TL) Tutar (TL)',
      'ÖNCEKİ DÖNEMDEN DEVİR EDİLEN TUTAR 2.000,00',
      'DÖNEM FAİZİ 72,82',
      'GEÇ ÖDEME FAİZİ 1,47',
      'KKDF + BSMV 22,28',
      '04 Kasım 2026 ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ ⟨2.000,00+⟩',
      '22 Kasım 2026 DESA-ORNEK 1.250,00x2=2.500,00 1.Taksit ⟨1.250,00⟩',
      'Toplam 1.346,57',
    ].join('\n')

    const res = parse(text)
    expect(res.accountLabel).toBe('Garanti Bonus Classic Troy')
    expect(res.reconciliation).toMatchObject({ status: 'match', delta: 0 })
    expect(res.transactions.filter((t) => t.category === 'fees')).toHaveLength(3)
    const desa = res.transactions.find((t) => t.merchant === 'DESA ORNEK')!
    expect(desa).toMatchObject({
      category: 'clothing',
      installment: { current: 1, total: 2, principal: toMinor(2500) },
    })
    expect(garantiAdapter.detect(text)).toBeGreaterThanOrEqual(0.25)
  })

  it('infers zero previousBalance on an Akbank first statement and handles EBCDIC 0xaf/0xb0 shift', () => {
    const firstStatement = [
      'Axess Platinum Hesap Özeti',
      'Kart Numarası 4000 00** **** 2222',
      'Dönem Borcu 1,250.00 TL',
      'Son Ödeme Tarihi 09/11/2026',
      'Ekstre Dönemi 07/10/2026-30/10/2026',
      'Hesap Kesim Tarihi 30/10/2026',
      'Hesap Özeti Detayları',
      'İşlem Tarihi Dönem İçi İşlemler Borç Tutarı (TL)',
      '**** **** **** 2222 MERT ARSLAN Harcamaları',
      '27/10/2026 ŞOK-5665 İSTANBUL 500.00',
      '29/10/2026 CARREFOURSA İSTANBUL 750.00',
      'Genel Toplam 1,250.00',
    ].join('\n')

    const res = parse(firstStatement)
    expect(res.reconciliation).toMatchObject({ status: 'match', delta: 0, previousBalance: 0 })
    expect(statementImportProblem(res, true)).toBeNull()
    expect(akbankAdapter.detect(firstStatement)).toBeGreaterThanOrEqual(0.4)

    // Shifted Akbank subset font where 0xaf='ı' and 0xb0='Ş' ("Borç Tutar\xaf", "\xb0OK-5665").
    const inverse = new Map<string, string>()
    for (let code = 0; code < 256; code++) {
      const ch = String.fromCharCode(code)
      const decoded = decodeEbcdic(ch)
      if (decoded.length === 1 && !inverse.has(decoded)) inverse.set(decoded, ch)
    }
    const enc = (s: string) => [...s].map((c) => (c === 'ı' ? '\xaf' : c === 'Ş' ? '\xb0' : inverse.get(c) ?? c)).join('')
    const shiftedSample = enc('Borç Tutarı (TL)\nŞOK-5665 Kampanyası')
    const decode = createEbcdicDecoder(shiftedSample)
    expect(decode(enc('ŞOK-5665 Kampanyası'))).toBe('ŞOK-5665 Kampanyası')
  })
})

describe('Halkbank Paraf adapter', () => {
  const halkbank = [
    'Müşteri Bilgileriniz',
    'Sayın BURAK ŞAHİN',
    'Kart Numarası : 4900-00##- 34000 İSTANBUL SUBE KODU: 0100',
    '####-7788',
    'Hesap Kesim Tarihi : 10/09/2026',
    'Son Ödeme Tarihi : 21/09/2026',
    'Hesap Bakiyesi : 1,299.33 TL',
    'Asgari Ödeme Tutarı : 519.73 TL',
    'Toplam Kredi Limiti : 100,000.00 TL',
    'Nakit Avans Limiti : 20,000.00 TL',
    'Kullanılabilir Limit : 98,700.67 TL',
    'ParafPara Bilgileriniz',
    'Bir Önceki Dönem : 1,000.00 TL Devreden : 10.00',
    'Ekstre Borcu ParafPara',
    'Dönem İçi Borç Tutarı : 1,349.33 TL Kazanılan : 100.50',
    'Toplam Faiz, Ücret, ParafPara',
    'Vergiler : 100.00 TL Özel Kazanımlar : 0.00',
    'Dönemsel Alacak : 1,150.00 TL Harcama : 5.00',
    'Kayıtları Düzeltme : 0.00',
    'Hesap Bakiyesi : 1,299.33 TL Toplam ParafPara : 105.50',
    'Türkiye Halk Bankası A.Ş. www.paraf.com.tr',
    'Alışveriş Faiz Oranı % 3.75 % 45.00',
    'İşlem Tarihi Açıklama TUTAR(TL) KALAN BORÇ(TL) / TAKSİT ParafPara',
    'KART NO :4900-00##-',
    '####-7788/ BURAK SAHIN',
    '15/08/2026 Hesaptan Ödeme - Teşekkür Ederiz - + 1,000.00 ⟦0.00⟧',
    '20/08/2026 E/TRENDYOL Puan Kullanım ⟨0.00⟩ ⟦-5.00⟧',
    '21/08/2026 Seyahat Kamp. ParafPara ⟨0.00⟩ ⟦100.00⟧',
    '22/08/2026 O BİLET İSTANBUL ⟨1,000.00⟩ ⟦0.50⟧',
    '23/08/2026 PARAF’TAN HAFTA SONU RESTORAN + 150.00 ⟦0.00⟧',
    'İNDİRİMİ',
    '10/09/2026 E/ATASUN İSTANBUL ⟨349.33⟩ 698.67/3- ⟦0.00⟧',
    '01.Taksit',
    '10/09/2026 Kredi faizi ⟨80.00⟩ ⟦0.00⟧',
    '10/09/2026 KKDF ⟨10.00⟩ ⟦0.00⟧',
    '10/09/2026 BSMV (Faiz) ⟨10.00⟩ ⟦0.00⟧',
    'Bir Sonraki',
    'Hesap : 10/10/2026 - 1,299.33 698.67 100.50',
    'Kesim Cumartesi',
    'Bir Sonraki 20/10/2026 -',
    'Son Ödeme :',
  ].join('\n')

  it('reconciles Anglo totals, multi-line instalments, space-signed credits, wrapped # card suffix, and ParafPara', () => {
    const res = parse(halkbank)
    expect(res.bank).toBe('Halkbank')
    expect(res.accountLabel).toBe('Halkbank Paraf')
    expect(res.cardholderName).toBe('Burak Şahin')
    expect(res.reportedCardLast4).toBe('7788')
    expect(res.periodEnd).toBe('2026-09-10')
    expect(res.dueDate).toBe('2026-09-21')
    expect(res.reconciliation).toMatchObject({ status: 'match', delta: 0 })
    expect(res.printedTotalsMismatch).toBeUndefined()
    expect(statementImportProblem(res, true)).toBeNull()

    expect(res.summary).toMatchObject({
      totalDebt: toMinor(1299.33),
      previousBalance: toMinor(1000),
      minPayment: toMinor(519.73),
      creditLimit: toMinor(100000),
      availableLimit: toMinor(98700.67),
      cashAdvanceLimit: toMinor(20000),
      interestMonthly: 3.75,
      nextCutDate: '2026-10-10',
      nextDueDate: '2026-10-20',
      loyalty: {
        programme: 'ParafPara',
        earned: toMinor(100.5),
        spent: toMinor(5),
        balance: toMinor(105.5),
      },
    })

    const atasun = res.transactions.find((t) => t.merchant === 'ATASUN')!
    expect(atasun).toMatchObject({
      category: 'health',
      installment: { current: 1, total: 3 },
      amount: toMinor(349.33),
    })
    const discount = res.transactions.find((t) => t.kind === 'refund')!
    expect(discount.description).toContain('İNDİRİMİ')
    expect(discount.category).toBe('rewards')
    expect(res.ignored).toHaveLength(2)
    expect(res.ignored.map((i) => i.reason).sort()).toEqual(['reward-earned', 'reward-spent'])
    expect(halkbankAdapter.detect(halkbank)).toBeGreaterThan(0.5)

    // Final-instalment ±1 kuruş rounding merges into one plan rather than duplicating.
    const step3 = { ...atasun, id: 'step-3', billedOn: '2026-11-10', amount: toMinor(349.34), installment: { current: 3, total: 3 } }
    const plans = buildInstallmentPlans([atasun, step3], '2026-11')
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ paidCount: 3, totalCount: 3, remainingCount: 0 })
  })
})
