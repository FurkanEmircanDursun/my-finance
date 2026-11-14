/**
 * Synthetic statements for the test suite.
 *
 * They reproduce the *layout* of real Akbank and Garanti statements — the cover
 * facts, the column-tagged loyalty figures, the section headings, the printed
 * instalment remainders — with invented merchants and round amounts, so the
 * repository holds nothing that belongs to a real person. Each one is built to
 * balance: the charges sum to what its own cover implies.
 */

/** A real no-activity state needs explicit bank wording and a balanced cover. */
export const AKBANK_NO_ACTIVITY = `
AKBANK AXESS HESAP ÖZETİ
Dönem Borcu 0.00 TL
Önceki Dönem Hesap Özeti Bakiyesi 0.00
Ekstre Dönemi 29/08/2026-26/09/2026
Hesap Kesim Tarihi 26/09/2026
Son Ödeme Tarihi 06/10/2026
Bu dönemde işleminiz bulunmamaktadır.
`.trim()

export const GARANTI_NO_ACTIVITY = `
GARANTİ BBVA BONUS HESAP ÖZETİ
Hesap Kesim Tarihi 28 Eylül 2026
Son Ödeme Tarihi 08 Ekim 2026
Bir önceki hesap kesim tarihiniz 28 Ağustos 2026
Dönem Borcunuz 0,00 TL
ÖNCEKİ DÖNEMDEN DEVİR EDİLEN TUTAR 0,00
Bu ekstre döneminde harcamanız bulunmamaktadır.
`.trim()

/**
 * Garanti, as the PDF reader hands it over: the bonus column is already wrapped
 * in ⟦…⟧. Charges: 600 + 400 + 250 + 80 = 1.330, minus a 50 refund = 1.280. The
 * cover says debt 1.280 after a 500 payment of a 500 balance — it balances.
 */
export const GARANTI_COLUMNS = `
Bonus Platinum Trink Bilgileriniz Son Ödeme Tarihi: 08 Ekim 2026
Hesap Kesim Tarihi 28 Eylül 2026
Son Ödeme Tarihi 08 Ekim 2026
Dönem Borcunuz 1.280,00 TL
Min. Ödeme Tutarı 480,00 TL
Kart Limiti 50.000,00 TL
Bu Dönem Kazanılan Bonus 3.010,00 TL
Bu Dönem Harcanan Bonus -36,50 TL
Harcanabilecek Toplam Bonus 12,34 TL
İşlem Tarihi Dönem İçi İşlemler Kalan Borç / Taksit Bonus (TL) Tutar (TL)
ÖNCEKİ DÖNEMDEN DEVİR EDİLEN TUTAR 500,00
05 Eylül 2026 OTOMATİK FATURA BONUS ⟦3.000,00⟧
08 Eylül 2026 ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ 500,00+
07 Eylül 2026 BONUS BEDAVA ALIŞVERİŞ ⟦36,50-⟧
BONUS PROGRAM ORTAKLARI'NDA YAPTIĞINIZ HARCAMALAR
09 Eylül 2026 UBER EATS YEMEK ⟦0,08⟧ 600,00
12 Eylül 2026 MONEYPAY *MIGROSONE ⟦0,10⟧ 400,00
14 Eylül 2026 MİGROS HEMEN ⟦0,28-⟧ 50,00+
Süpermarket
02 Eylül 2026 YEREL MARKET 250,00
Kuaför
03 Eylül 2026 KUAFOR AHMET 80,00
Bir önceki hesap kesim tarihiniz 30 Ağustos
2026 Pazar 'dir.
EKSTRE ÖZETİ Bir sonraki hesap kesiminiz 30 Ekim 2026 Cuma ve son ödemeniz 09 Kasım 2026 Pazartesi 'dir.
Akdi faiz: %3,75 , Gecikme faizi: %4,05, Nakit avans faizi: %4,25
`.trim()

/** Akbank, decoded, with the chip-para column tagged. 1.000 + 300 + 120 − 120 = 1.300. */
export const AKBANK_COLUMNS = `
AKBANK AXESS HESAP ÖZETİ
Dönem  Borcu 1,300.00  TL
Son  Ödeme  Tarihi 06/10/2026
En  Az  Ödeme  Tutarz 520.00  TL
Ekstre  Dönemi 29/08/2026-26/09/2026
Hesap  Kesim  Tarihi 26/09/2026
Bir  Sonraki  Hesap  Kesim  Tarihi 26/10/2026
Bir  Sonraki  Son  Ödeme  Tarihi 05/11/2026
Kart  Limiti 100,000.00  TL Son  Ödeme  Tarihi  :    06/10/2026
Kullanzlabilir  Kart  Limiti 90,000.00  TL
Chip  Para  Bakiyeniz 0.00  TL
Önceki  Dönem  Hesap  Özeti  Bakiyesi 500.00
07/09/2026 İNTERNET  Şb-Ödemeniz  için  Teşekkürler   500.00(-)
23/08/2026 TKPAY./AJET  HAVA  TASIMACI  (900.00  TL)  3/2.taksit   300.00 300.00x1
01/09/2026 STEAMGAMES.COM  4259522  BELLEVUE  USA  (orjinal  tutar3.99  $  )   120.00
05/09/2026 YEREL  MARKET   1,000.00
21/09/2026 Mobilin  Akbanklısı  Youtube  Kampanyası ⟦120.00⟧
24/09/2026 Chip-Para  ile  Ödeme   120.00(-) ⟦120.00(-)⟧
Genel  Toplam 1,300.00 300.00 0.00
Kullanzlabilir  Kart  Limiti 90,000.00  TL
Akdi  Faiz  Oranİ* Gecikme  Faiz Uygulanacak Uygulanacak
%3,25 Oranİ*  %3,55
`.trim()

/**
 * Three consecutive statements of one three-month plan. Every row prints the
 * same original purchase date, the same amount and the same merchant — only the
 * instalment index differs, which is all that tells the months apart.
 */
export function instalmentStatement(index: 1 | 2 | 3): string {
  const month = ['', '07', '08', '09'][index]
  const left = 3 - index
  const tail = left > 0 ? ` 355.00x${left}` : ''
  return `
AKBANK AXESS HESAP ÖZETİ
Ekstre  Dönemi 28/${String(Number(month) - 1).padStart(2, '0')}/2026-27/${month}/2026
Hesap  Kesim  Tarihi 27/${month}/2026
Son  Ödeme  Tarihi 06/${String(Number(month) + 1).padStart(2, '0')}/2026
05/05/2026 TRENDYOL.COM  (1,065.00  TL)  3/${index}.taksit   355.00${tail}
15/${month}/2026 YEREL  MARKET   200.00
20/${month}/2026 BASKA  MARKET   150.00
`.trim()
}

/**
 * A card's very first statement: nothing is carried forward, so the "ÖNCEKİ
 * DÖNEMDEN DEVİR" row is simply not printed. The only place the zero appears is
 * the one-line ledger under the cover's column titles.
 */
export const GARANTI_FIRST = `
T. Garanti Bankası A.Ş. Genel Müdürlük
Bonus Platinum Trink Bilgileriniz Son Ödeme Tarihi: 09 Eylül 2026
Hesap Kesim Tarihi 30 Ağustos 2026
Son Ödeme Tarihi 09 Eylül 2026
Dönem Borcunuz 1.000,00 TL
Min. Ödeme Tutarı 400,00 TL
İşlem Tarihi Dönem İçi İşlemler Kalan Borç / Taksit Bonus (TL) Tutar (TL)
BONUS PROGRAM ORTAKLARI'NDA YAPTIĞINIZ HARCAMALAR
08 Ağustos 2026 YEREL MARKET ⟦0,09⟧ 600,00
12 Ağustos 2026 PETROL ISTASYONU ⟦0,20⟧ 350,00
04 Ağustos 2026 OTOM. FATURA İŞLEM FAİZİ 50,00
bosluk
Önceki Bakiye Dönem Harcamaları Faiz ve Ücretler Ödemeleriniz Dönem Borcunuz Min. Ödeme Tutarınız
0,00 TL + 950,00 TL + 50,00 TL - 0,00 TL = 1.000,00 TL 400,00 TL
bosluk
`.trim()
