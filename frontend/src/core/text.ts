/**
 * Merchant text normalisation.
 *
 * Statement descriptions carry branch names, city codes, terminal ids and
 * payment-processor prefixes. Grouping on the raw string splits one merchant
 * across a dozen buckets, which is what made the old "top merchants" panel and
 * the subscription detector unreliable. Normalisation collapses those variants
 * onto a single key; the original description is kept on the transaction.
 */

const DIACRITICS: Record<string, string> = {
  Ç: 'C', Ğ: 'G', İ: 'I', I: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
  ç: 'C', ğ: 'G', ı: 'I', ö: 'O', ş: 'S', ü: 'U',
}

/** Payment processors and wallets that prefix the real merchant name. */
const PROCESSOR_PREFIXES = [
  'IYZICO', 'IYZI', 'PAYTR', 'PAYU', 'PARAM', 'MOKA', 'SIPAY', 'CRAFTGATE',
  'GOOGLE *', 'GOOGLE*', 'APPLE.COM/BILL', 'PAYPAL *', 'PAYPAL*', 'SQ *', 'SUMUP',
  'MP*', 'PAYCELL', 'MONEYPAY',
]

/**
 * Location, legal-form and domain noise that varies between two visits to the
 * same shop. Everything here was observed in real Akbank and Garanti
 * statements, where the merchant column carries city, branch and country code.
 */
const NOISE_TOKENS = new Set([
  // Cities and districts
  'ISTANBUL', 'ANKARA', 'IZMIR', 'BURSA', 'ANTALYA', 'ADANA', 'KONYA', 'MERSIN',
  'KAYSERI', 'ESKISEHIR', 'GAZIANTEP', 'SAMSUN', 'DENIZLI', 'KOCAELI', 'SAKARYA',
  'BALIKESIR', 'CANKIRI', 'ILGAZ', 'TRABZON', 'MALATYA', 'ERZURUM', 'AYDIN',
  'MUGLA', 'TEKIRDAG', 'MANISA', 'HATAY', 'ORDU', 'RIZE', 'VAN', 'SIVAS',
  'BAHCELIEVL', 'BAHCELIEVLER', 'KADIKOY', 'BESIKTAS', 'SISLI', 'UMRANIYE',
  'ZIVERBEY', 'AKARETLER', 'LEVENT', 'MASLAK', 'ATASEHIR', 'BAKIRKOY',
  // Country codes printed after the merchant
  'TUR', 'TR', 'TURKIYE', 'TURKEY', 'GBR', 'USA', 'DEU', 'NLD', 'IRL', 'LONDON',
  // Branch and address words
  'SUBE', 'SUBESI', 'MAGAZA', 'MAGAZASI', 'MAH', 'MAHALLESI', 'CAD', 'CADDESI',
  'SOK', 'SOKAK', 'AVM', 'PLAZA', 'MERKEZ', 'IST',
  // Legal forms
  'SAN', 'TIC', 'LTD', 'STI', 'AS', 'ANONIM', 'SIRKETI', 'LIMITED', 'INC',
  // Domain suffixes — "TRENDYOL.COM" and "TRENDYOL" are one merchant
  'COM', 'NET', 'ORG', 'WWW',
])

/** Uppercase, strip Turkish diacritics, drop punctuation. */
export function fold(input: string): string {
  let out = ''
  for (const ch of input) {
    const mapped = DIACRITICS[ch]
    out += mapped ?? ch
  }
  return out.toUpperCase()
}

const normalCache = new Map<string, string>()
const MAX_CACHE = 4000

/**
 * "GOOGLE *YOUTUBEPREMIUM g.co/helppay# 12345 ISTANBUL TR"
 *   -> "YOUTUBEPREMIUM"
 */
export function normalizeMerchant(description: string): string {
  const cached = normalCache.get(description)
  if (cached !== undefined) return cached

  let s = fold(description)

  // Drop URLs, e-mails and help strings the processors append.
  s = s.replace(/\b(?:HTTPS?:\/\/|WWW\.)\S+/g, ' ')
  s = s.replace(/\b[\w.-]+@[\w.-]+\b/g, ' ')
  s = s.replace(/\bG\.CO\/\S*/g, ' ')

  for (const prefix of PROCESSOR_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length)
      break
    }
  }

  // Punctuation to spaces, then token filtering.
  s = s.replace(/[^A-Z0-9]+/g, ' ').trim()

  const tokens = s.split(' ').filter(Boolean)
  const kept: string[] = []

  for (const token of tokens) {
    if (NOISE_TOKENS.has(token)) continue
    // Pure digits are terminal ids or store numbers, never a brand.
    if (/^\d+$/.test(token)) continue

    if (!kept.length) {
      // The first surviving token is the brand anchor and is kept whatever its
      // shape: chains like A101 and N11 look exactly like a store code, and the
      // same shop is printed both as "A101 9923 I353 …" and "9923-A101-I353-…".
      kept.push(token)
      continue
    }

    // After the anchor, keep only tokens that read as words. This drops the
    // terminal ids ("I353"), branch codes and single letters that follow.
    if (token.replace(/[^A-Z]/g, '').length < 3) continue

    kept.push(token)
    if (kept.length === 4) break // Merchant identity never needs more.
  }

  const result = (kept.length ? kept.join(' ') : s || fold(description).trim()) || 'BILINMEYEN'

  if (normalCache.size >= MAX_CACHE) normalCache.clear()
  normalCache.set(description, result)
  return result
}

/** Title-cased merchant name for display: "YOUTUBEPREMIUM" -> "Youtubepremium". */
export function displayMerchant(normalized: string): string {
  return normalized
    .split(' ')
    .map((w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ')
}

export function tokens(normalized: string): string[] {
  return normalized.split(' ').filter(Boolean)
}

/** Case- and diacritic-insensitive substring test, for the search box. */
export function matchesQuery(haystack: string, foldedQuery: string): boolean {
  if (!foldedQuery) return true
  return fold(haystack).includes(foldedQuery)
}
