import { expect, it } from 'vitest'
import { identifyBank } from './banks'

it.each([
  ['AKBANK AXESS', 'akbank'], ['T. GARANTİ BANKASI A.Ş.', 'garanti'], ['TÜRKİYE İŞ BANKASI A.Ş.', 'isbank'],
  ['yapı ve kredi bankası', 'yapikredi'], ['T.C. Ziraat Bankası', 'ziraat'], ['vakıf bank', 'vakifbank'],
  ['QNB Türkiye', 'qnb'], ['QNB Enpara.com', 'enpara'], ['Türk Ekonomi Bankası', 'teb'],
  ['Deniz Bank', 'denizbank'], ['DÜNYA KATILIM', 'dunyakatilim'], ['T.C. Ziraat Katılım', null], ['Bir özel kart', null],
])('matches the bank %s to %s', (name, expected) => {
  expect(identifyBank(name as string)).toBe(expected)
})
