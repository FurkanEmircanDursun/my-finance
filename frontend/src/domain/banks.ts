import { fold } from '../core/text'

export const BANKS = {
  akbank: { label: 'Akbank', aliases: ['Akbank', 'Axess'] },
  garanti: { label: 'Garanti BBVA', aliases: ['Garanti', 'Garanti BBVA', 'T. Garanti Bankası'] },
  isbank: { label: 'Türkiye İş Bankası', aliases: ['İş Bankası', 'İşbank', 'Türkiye İş Bankası'] },
  yapikredi: { label: 'Yapı Kredi', aliases: ['Yapı Kredi', 'Yapı ve Kredi Bankası'] },
  ziraat: { label: 'Ziraat Bankası', aliases: ['Ziraat', 'T.C. Ziraat Bankası'] },
  vakifbank: { label: 'VakıfBank', aliases: ['VakıfBank', 'Vakıflar Bankası', 'Türkiye Vakıflar Bankası'] },
  qnb: { label: 'QNB', aliases: ['QNB', 'Finansbank', 'QNB Finansbank', 'QNB Türkiye'] },
  enpara: { label: 'Enpara', aliases: ['Enpara', 'Enpara.com', 'QNB Enpara'] },
  teb: { label: 'TEB', aliases: ['TEB', 'Türk Ekonomi Bankası', 'CEPTETEB'] },
  denizbank: { label: 'DenizBank', aliases: ['DenizBank', 'Deniz Bank'] },
  dunyakatilim: { label: 'Dünya Katılım', aliases: ['Dünya Katılım'] },
  halkbank: { label: 'Halkbank', aliases: ['Halkbank', 'Halk Bankası', 'Türkiye Halk Bankası'] },
  kuveytturk: { label: 'Kuveyt Türk', aliases: ['Kuveyt Türk'] },
  other: { label: 'Diğer banka', aliases: [] },
} as const

export type CardBank = keyof typeof BANKS
export const cardBanks = Object.keys(BANKS) as CardBank[]

function bankKey(value: string): string {
  return fold(value.normalize('NFC')).replace(/[^A-Z0-9]/g, '')
}

const aliases = cardBanks.flatMap(bank =>
  [bank, ...BANKS[bank].aliases].map(name => ({ bank, key: bankKey(name) })),
).sort((left, right) => right.key.length - left.key.length)

export function identifyBank(value: string): CardBank | null {
  const key = bankKey(value)
  // Katılım is a separate bank. Its wordmark must not be attributed to Ziraat Bankası.
  if (key.includes('ZIRAATKATILIM') || key.includes('VAKIFKATILIM')) return null
  return aliases.find(alias => key === alias.key || (alias.key.length > 3 && key.startsWith(alias.key)))?.bank ?? null
}
