/**
 * Single source of truth for categories: identity, label, colour, spending
 * nature and the keywords that classify into it.
 *
 * The previous build defined the category list in four places (analyzer colour
 * map, dashboard badge map, drawer dropdown, CSS classes) which drifted apart.
 * Everything now derives from `CATEGORIES`.
 */

export type CategoryId =
  | 'market'
  | 'dining'
  | 'subscription'
  | 'ecommerce'
  | 'bills'
  | 'transport'
  | 'health'
  | 'education'
  | 'entertainment'
  | 'clothing'
  | 'rent'
  | 'home'
  | 'travel'
  | 'tax'
  | 'insurance'
  | 'fintech'
  | 'cash'
  | 'fees'
  | 'rewards'
  | 'other'

/**
 * `need`    — hard to compress in the short term (rent-like, utilities, health)
 * `mixed`   — partly compressible (groceries, transport)
 * `want`    — discretionary
 * `neutral` — not really consumption (transfers, refunds, cash withdrawals)
 */
export type SpendNature = 'need' | 'mixed' | 'want' | 'neutral'

export interface CategoryDef {
  id: CategoryId
  label: string
  nature: SpendNature
  /** Chart / badge colour. Chosen for ≥3:1 contrast on both themes. */
  color: string
  /** Single-token keywords — matched by hash lookup. */
  tokens: string[]
  /** Multi-token or partial keywords — matched by substring. */
  phrases: string[]
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'market', label: 'Market', nature: 'mixed', color: '#2f9e5e',
    tokens: ['MIGROS', 'MIGROSONE', 'A101', 'BIM', 'SOK', 'CARREFOUR', 'CARREFOURSA', 'MACROCENTER', 'MARKET', 'MARKETI', 'BAKKAL', 'MANAV', 'KASAP', 'METRO', 'TARIM', 'GIDA', 'TEKEL'],
    phrases: ['MIGROS', 'CARREFOUR', 'SOK MARKET', 'HAPPY CENTER', 'FILE MARKET', 'ONUR MARKET', 'GETIR BUYUK', 'MINI MARKET'],
  },
  {
    id: 'dining', label: 'Yeme & İçme', nature: 'want', color: '#e06c2b',
    tokens: ['RESTORAN', 'RESTAURANT', 'CAFE', 'KAFE', 'PIZZA', 'BURGER', 'DONER', 'KEBAP', 'LOKANTA', 'MUTFAGI', 'MUTFADI', 'DONDURMA', 'PASTANE', 'FIRIN', 'BISTRO', 'STARBUCKS', 'KAHVE', 'YEMEK', 'BUFE', 'TAVUK', 'WAFFLE', 'SIMIT'],
    phrases: ['UBER EATS', 'YEMEKSEPETI', 'GETIR YEMEK', 'GETIRYEMEK', 'TRENDYOL GO', 'TRENDYOLGO', 'UBERTRENDYOLGO', 'KAHVE DUNYASI', 'KAHVECISI', 'COFFEE', 'KFC', 'MCDONALD', 'BURGER KING', 'DOMINO', 'YEMEKPAY', 'CAY BAHCES'],
  },
  {
    id: 'subscription', label: 'Abonelik & Dijital', nature: 'want', color: '#7c5cd6',
    tokens: ['NETFLIX', 'SPOTIFY', 'EXXEN', 'GAIN', 'BLUTV', 'MUBI', 'DISNEY', 'ICLOUD', 'DROPBOX', 'NOTION', 'FIGMA', 'CANVA', 'GITHUB', 'OPENAI', 'ANTHROPIC', 'CLAUDE', 'MAKROMUSIC', 'YOUTUBEPREMIUM'],
    phrases: ['YOUTUBE PREMIUM', 'YOUTUBEPREMIUM', 'YOUTUBE MEMBER', 'AMAZON PRIME', 'APPLE COM BILL', 'GOOGLE STORAGE', 'MICROSOFT', 'ADOBE', 'PLAYSTATION', 'XBOX', 'STEAM'],
  },
  {
    id: 'ecommerce', label: 'E-Ticaret', nature: 'want', color: '#2f6fd0',
    tokens: ['TRENDYOL', 'HEPSIBURADA', 'N11', 'AMAZON', 'CICEKSEPETI', 'MORHIPO', 'GITTIGIDIYOR', 'DOLAP', 'SHEIN', 'TEMU', 'ALIEXPRESS', 'TURKTICARETNET'],
    phrases: ['TRENDYOL COM', 'HEPSIBURADA COM', 'TRENDYOL PLUS'],
  },
  {
    id: 'bills', label: 'Fatura & Telekom', nature: 'need', color: '#0d8fa8',
    tokens: ['TURKCELL', 'VODAFONE', 'AVEA', 'TTNET', 'SUPERONLINE', 'TURKNET', 'ISKI', 'ISKIFO', 'ASKI', 'IZSU', 'BUSKI', 'ASAT', 'BEDAS', 'AYEDAS', 'AESAS', 'IGDAS', 'FATURA', 'DOGALGAZ', 'ELEKTRIK', 'TELCOM'],
    // Providers append the subscriber number with no separator
    // ("TTNET7046196931020260731"), so these have to match as substrings.
    phrases: ['TURK TELEKOM', 'FATURA', 'AVEA', 'TTNET', 'SUPERONLINE', 'ISKIFO', 'AESAS', 'TURKCELL', 'VODAFONE'],
  },
  {
    id: 'transport', label: 'Ulaşım & Akaryakıt', nature: 'mixed', color: '#c09216',
    tokens: ['OPET', 'SHELL', 'BP', 'TOTAL', 'AYTEMIZ', 'LUKOIL', 'BELBIM', 'ISTANBULKART', 'OTOPARK', 'OTOYOL', 'HGS', 'OGS', 'MARTI', 'BITAKSI', 'AKARYAKIT', 'TASIMA'],
    phrases: ['PETROL OFISI', 'ISTANBUL KART', 'ISTANBULKART', 'TOPLU TASIMA', 'TAKSI', 'DURAK', 'BELBIM'],
  },
  {
    id: 'health', label: 'Sağlık', nature: 'need', color: '#d1477f',
    tokens: ['ECZANE', 'ECZANESI', 'HASTANE', 'HASTANESI', 'MEDICANA', 'ACIBADEM', 'MEMORIAL', 'POLIKLINIK', 'LABORATUVAR', 'DIS', 'OPTIK', 'SAGLIK'],
    phrases: ['TIP MERKEZI', 'AGIZ VE DIS'],
  },
  {
    id: 'education', label: 'Eğitim & Kitap', nature: 'need', color: '#12968c',
    tokens: ['KITAP', 'KITABEVI', 'KITAPEVI', 'KIRTASIYE', 'UDEMY', 'COURSERA', 'DERSHANE', 'KURS', 'YAYINLARI', 'DR', 'OKUL'],
    phrases: ['D&R', 'KITAP YURDU', 'KITAPYURDU', 'IDEFIX'],
  },
  {
    id: 'entertainment', label: 'Eğlence & Kültür', nature: 'want', color: '#b4489b',
    tokens: ['SINEMA', 'CINEMAXIMUM', 'CINEMA', 'TIYATRO', 'KONSER', 'BILETIX', 'BILETINIAL', 'PASSO', 'MUZE', 'BOWLING', 'OYUN'],
    phrases: ['BUBILET', 'MOBILET'],
  },
  {
    id: 'clothing', label: 'Giyim & Kozmetik', nature: 'want', color: '#c2557a',
    tokens: ['LCW', 'LCWAIKIKI', 'DEFACTO', 'KOTON', 'MAVI', 'ZARA', 'BERSHKA', 'PULLBEAR', 'STRADIVARIUS', 'HM', 'BOYNER', 'FLO', 'GRATIS', 'WATSONS', 'ROSSMANN', 'SEPHORA'],
    phrases: ['LC WAIKIKI', 'PULL BEAR', 'MAC COSMETICS'],
  },
  {
    // Rent and dues almost never appear on a card statement, so this category
    // exists mainly for the monthly entries people add by hand in Gelir–Gider.
    id: 'rent', label: 'Kira & Aidat', nature: 'need', color: '#6f5b9e',
    tokens: ['KIRA', 'AIDAT', 'APARTMAN', 'SITE', 'EMLAK', 'KONUT'],
    phrases: ['EV KIRASI', 'KIRA ODEMESI', 'SITE AIDAT', 'APARTMAN AIDAT'],
  },
  {
    id: 'home', label: 'Ev & Yapı Market', nature: 'mixed', color: '#8a7a4e',
    tokens: ['IKEA', 'KOCTAS', 'BAUHAUS', 'TEKZEN', 'MADAME', 'ENGLISHHOME', 'MUDO', 'ARZUM', 'VESTEL', 'ARCELIK', 'BOSCH', 'MOBILYA'],
    phrases: ['ENGLISH HOME', 'YAPI MARKET', 'KOCTAS YAPI'],
  },
  {
    id: 'travel', label: 'Seyahat & Konaklama', nature: 'want', color: '#3d7fb5',
    tokens: ['THY', 'PEGASUS', 'AJET', 'SUNEXPRESS', 'OBILET', 'ENUYGUN', 'BOOKING', 'AIRBNB', 'ETSTUR', 'JOLLY', 'TATIL', 'OTEL', 'HOTEL'],
    phrases: ['TURK HAVA YOLLARI', 'BOOKING COM', 'TATIL BUDUR', 'TATILBUDUR'],
  },
  {
    id: 'tax', label: 'Vergi & Resmi', nature: 'need', color: '#6b7f8f',
    tokens: ['VERGI', 'DAIRESI', 'MTV', 'TRAFIK', 'CEZA', 'BELEDIYE', 'NOTER', 'HARC', 'SGK', 'PTT'],
    phrases: ['VERGI DAIRESI', 'GELIR IDARESI', 'E DEVLET', 'NAKIL VAS'],
  },
  {
    id: 'insurance', label: 'Sigorta', nature: 'need', color: '#5c7f6b',
    tokens: ['SIGORTA', 'ALLIANZ', 'ANADOLU', 'AKSIGORTA', 'AXA', 'MAPFRE', 'DASK', 'KASKO', 'BES'],
    phrases: ['HAYAT SIGORTA', 'SAGLIK SIGORTA', 'BIREYSEL EMEKLILIK'],
  },
  {
    id: 'fintech', label: 'Finans & Cüzdan', nature: 'neutral', color: '#c98a1e',
    tokens: ['PAYCELL', 'MONEYPAY', 'IYZICO', 'PAPARA', 'ININAL', 'TOSLA', 'PAYNKOLAY', 'BINANCE', 'PARIBU', 'BTCTURK', 'MIDAS'],
    phrases: ['PAY NKOLAY', 'ODEME KURULUSU'],
  },
  {
    id: 'cash', label: 'Nakit Avans', nature: 'neutral', color: '#8a8a8a',
    tokens: ['ATM', 'AVANS', 'NAKIT'],
    phrases: ['NAKIT AVANS', 'NAKIT CEKIM', 'PARA CEKME'],
  },
  {
    id: 'fees', label: 'Faiz & Ücret', nature: 'need', color: '#a2503c',
    tokens: ['FAIZ', 'FAIZI', 'KOMISYON', 'AIDAT', 'BSMV', 'KKDF', 'GECIKME'],
    phrases: ['ISLEM UCRETI', 'UYELIK UCRETI', 'YILLIK UCRET', 'KART UCRETI', 'DONEM FAIZI', 'GECIKME FAIZI', 'NAKIT AVANS UCRETI'],
  },
  {
    id: 'rewards', label: 'Ödül & İade', nature: 'neutral', color: '#3fa07a',
    tokens: ['IADE', 'ODUL', 'PUAN', 'MILEPUAN', 'KAMPANYA', 'KAMPANYASI'],
    phrases: ['CHIP PARA', 'CHIP-PARA', 'BONUS BEDAVA', 'PARAPUAN', 'WORLDPUAN', 'MAXIPUAN'],
  },
  {
    id: 'other', label: 'Diğer', nature: 'mixed', color: '#8b8b8b',
    tokens: [],
    phrases: [],
  },
]

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id)

const BY_ID = new Map<CategoryId, CategoryDef>(CATEGORIES.map((c) => [c.id, c]))

export function category(id: CategoryId): CategoryDef {
  return BY_ID.get(id) ?? BY_ID.get('other')!
}

export function categoryLabel(id: CategoryId): string {
  return category(id).label
}

export function categoryColor(id: CategoryId): string {
  return category(id).color
}

export function categoryNature(id: CategoryId): SpendNature {
  return category(id).nature
}

export const NATURE_LABEL: Record<SpendNature, string> = {
  need: 'Zorunlu',
  mixed: 'Karma',
  want: 'İsteğe bağlı',
  neutral: 'Nötr',
}

export const NATURE_COLOR: Record<SpendNature, string> = {
  need: '#3d7fb5',
  mixed: '#c09216',
  want: '#c2557a',
  neutral: '#8b8b8b',
}

// ─── Keyword index ────────────────────────────────────────────────────────────

/**
 * Built once at module load. Classifying a description is then a handful of
 * hash lookups over its tokens plus a short phrase scan, instead of running
 * every category's regex list against every row.
 */
const TOKEN_INDEX = new Map<string, CategoryId>()
const PHRASES: Array<[string, CategoryId]> = []

for (const def of CATEGORIES) {
  for (const token of def.tokens) {
    // First definition wins, so earlier categories in the list take precedence.
    if (!TOKEN_INDEX.has(token)) TOKEN_INDEX.set(token, def.id)
  }
  for (const phrase of def.phrases) PHRASES.push([phrase, def.id])
}

// Longer phrases first: "BURGER KING" must beat "BURGER".
PHRASES.sort((a, b) => b[0].length - a[0].length)

export function lookupToken(token: string): CategoryId | undefined {
  return TOKEN_INDEX.get(token)
}

export function lookupPhrase(normalized: string): CategoryId | undefined {
  for (let i = 0; i < PHRASES.length; i++) {
    if (normalized.includes(PHRASES[i][0])) return PHRASES[i][1]
  }
  return undefined
}
