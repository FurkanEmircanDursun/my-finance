/**
 * Smart fuzzy, Turkish-diacritic-insensitive, alias-aware search engine for
 * the top header search dropdown.
 *
 * Pure module with zero React dependencies so it stays fast and trivially
 * testable across Turkish folding, typo tolerance (Damerau-Levenshtein +
 * anchored subsequence), and everyday Turkish finance synonyms.
 */

import { fold } from '../core/text'
import { monthLabel, monthOf } from '../core/date'
import { money2 } from '../core/money'
import { SORTED_CATEGORIES, type CategoryId } from './categories'
import { cardBankLabel } from './cards'
import type { CreditCard, Statement, Transaction } from './types'
import type { ViewId } from '../app/navigation'

export type SearchGroup =
  | 'actions'
  | 'screens'
  | 'categories'
  | 'cards'
  | 'merchants'
  | 'preferences'

export type SearchMatchReason = 'exact' | 'prefix' | 'contains' | 'alias' | 'fuzzy'

export type SearchAction =
  | { kind: 'navigate'; view: ViewId }
  | { kind: 'open-entry'; entryKind: 'expense' | 'income' }
  | { kind: 'open-import' }
  | { kind: 'open-budgets' }
  | { kind: 'open-income' }
  | { kind: 'open-archive' }
  | { kind: 'open-rewards' }
  | { kind: 'open-account' }
  | { kind: 'open-settings' }
  | { kind: 'toggle-privacy' }
  | { kind: 'set-theme'; theme: 'dark' | 'light' | 'system' }
  | { kind: 'open-category'; categoryId: CategoryId }
  | { kind: 'open-card'; cardId: string }
  | { kind: 'open-statement'; statementId: string }
  | { kind: 'open-merchant'; merchant: string; title: string }

export interface SearchDocument {
  id: string
  group: SearchGroup
  title: string
  subtitle?: string
  badge?: string
  /** Optional category color / icon hint for category results. */
  categoryId?: CategoryId
  /** Optional icon key for non-category results. */
  iconKey:
    | 'expense'
    | 'income'
    | 'import'
    | 'overview'
    | 'transactions'
    | 'cards'
    | 'plan'
    | 'analysis'
    | 'assets'
    | 'spending'
    | 'settings'
    | 'budget'
    | 'archive'
    | 'rewards'
    | 'account'
    | 'privacy'
    | 'theme-dark'
    | 'theme-light'
    | 'theme-system'
    | 'category'
    | 'card'
    | 'statement'
    | 'merchant'
  /** Primary searchable phrases (higher weight). */
  keywords: string[]
  /** Everyday Turkish synonyms / aliases. */
  aliases: string[]
  /** Higher priority breaks score ties and orders default suggestions. */
  priority: number
  /** Included in empty-query quick suggestions when the input is focused. */
  featured?: boolean
  action: SearchAction
}

export interface SearchResult {
  doc: SearchDocument
  score: number
  reason: SearchMatchReason
}

export const SEARCH_GROUP_LABELS: Record<SearchGroup, string> = {
  actions: 'Hızlı işlemler',
  screens: 'Ekranlar',
  categories: 'Kategoriler',
  cards: 'Kartlar ve ekstreler',
  merchants: 'İşyerleri ve hareketler',
  preferences: 'Tercihler',
}

export const SEARCH_GROUP_ORDER: SearchGroup[] = [
  'actions',
  'screens',
  'categories',
  'cards',
  'merchants',
  'preferences',
]

/**
 * Normalize text for Turkish-insensitive search:
 * folds Ç/ç, Ğ/ğ, İ/I/ı, Ö/ö, Ş/ş, Ü/ü to ASCII and strips punctuation.
 */
export function normalizeSearchText(input: string): string {
  return fold(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function tokenizeSearchText(input: string): string[] {
  const normalized = normalizeSearchText(input)
  return normalized ? normalized.split(' ') : []
}

/**
 * Optimal String Alignment (restricted Damerau-Levenshtein) distance with early
 * cutoff. Adjacent character transpositions ("markte" <-> "market") cost 1.
 */
export function damerauLevenshtein(a: string, b: string, maxDist = 2): number {
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) > maxDist) return maxDist + 1
  if (a === b) return 0
  if (m === 0) return n
  if (n === 0) return m

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    let rowMin = maxDist + 1
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let val = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + 1)
      }
      dp[i][j] = val
      if (val < rowMin) rowMin = val
    }
    if (rowMin > maxDist) return maxDist + 1
  }
  return dp[m][n]
}

/** Checks whether all characters of `needle` appear in order inside `haystack`. */
function isOrderedSubsequence(needle: string, haystack: string): boolean {
  if (needle.length > haystack.length) return false
  let i = 0
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (needle[i] === haystack[j]) i++
  }
  return i === needle.length
}

/** Everyday Turkish synonyms for categories (beyond auto-categorizer brand tokens). */
const CATEGORY_ALIASES: Record<CategoryId, string[]> = {
  market: ['süpermarket', 'alışveriş', 'manav', 'bakkal', 'gıda', 'yiyecek', 'erzak', 'mutfak alışverişi', 'kasap', 'bim', 'a101', 'şok', 'migros', 'carrefour'],
  dining: ['yemek', 'restoran', 'lokanta', 'kafe', 'kahve', 'çay', 'tatlı', 'pasta', 'kahvaltı', 'öğle yemeği', 'akşam yemeği', 'paket servis', 'sipariş', 'yemeksepeti', 'starbucks', 'fast food'],
  subscription: ['abonelik', 'üyelik', 'dijital', 'netflix', 'spotify', 'youtube', 'icloud', 'bulut', 'müzik', 'film', 'dizi', 'oyun', 'steam', 'yapay zeka', 'chatgpt', 'claude'],
  ecommerce: ['online alışveriş', 'internet alışverişi', 'kargo', 'sipariş', 'trendyol', 'hepsiburada', 'amazon', 'n11', 'pazar yeri', 'alışveriş'],
  bills: ['fatura', 'elektrik', 'su', 'doğalgaz', 'internet', 'telefon', 'gsm', 'hat', 'mobil', 'turkcell', 'vodafone', 'türk telekom', 'telekom', 'iski', 'igdaş'],
  transport: ['ulaşım', 'benzin', 'mazot', 'motorin', 'akaryakıt', 'yakıt', 'petrol', 'taksi', 'otobüs', 'metro', 'metrobüs', 'tramvay', 'istanbulkart', 'otopark', 'köprü', 'otoyol', 'hgs', 'araç', 'araba'],
  health: ['sağlık', 'hastane', 'eczane', 'ilaç', 'doktor', 'muayene', 'diş', 'optik', 'gözlük', 'klinik', 'tahlil', 'tedavi'],
  education: ['eğitim', 'kitap', 'kurs', 'okul', 'kırtasiye', 'üniversite', 'ders', 'udemy', 'sınav', 'yayın'],
  entertainment: ['eğlence', 'sinema', 'konser', 'tiyatro', 'bilet', 'müze', 'kültür', 'etkinlik', 'hobi'],
  clothing: ['giyim', 'kıyafet', 'ayakkabı', 'kozmetik', 'bakım', 'parfüm', 'moda', 'tekstil', 'mağaza', 'zara', 'mavi', 'lcw', 'gratis'],
  rent: ['kira', 'aidat', 'ev kirası', 'apartman', 'site aidatı', 'konut', 'emlak'],
  home: ['ev', 'mobilya', 'dekorasyon', 'yapı market', 'beyaz eşya', 'tamir', 'tadilat', 'ikea', 'koçtaş', 'ev eşyası'],
  travel: ['seyahat', 'tatil', 'uçak', 'uçuş', 'bilet', 'otel', 'konaklama', 'thy', 'pegasus', 'obilet', 'airbnb', 'gezi'],
  tax: ['vergi', 'mtv', 'ceza', 'trafik cezası', 'belediye', 'noter', 'harç', 'resmi', 'devlet', 'sgk', 'e-devlet'],
  insurance: ['sigorta', 'kasko', 'dask', 'bes', 'bireysel emeklilik', 'trafik sigortası', 'poliçe'],
  fintech: ['cüzdan', 'papara', 'paycell', 'kripto', 'borsa', 'yatırım', 'havale', 'eft', 'transfer', 'midas', 'binance'],
  cash: ['nakit', 'atm', 'para çekme', 'avans', 'nakit avans', 'nakit çekim'],
  fees: ['faiz', 'komisyon', 'ücret', 'gecikme', 'kart aidatı', 'masraf', 'bsmv', 'kkdf'],
  rewards: ['iade', 'puan', 'ödül', 'bonus', 'chip para', 'cashback', 'kampanya', 'indirim', 'geri ödeme'],
  other: ['diğer', 'çeşitli', 'sınıflandırılmamış', 'genel', 'belirsiz'],
}

/**
 * Semantic query-level synonyms so typing an alternate everyday word expands
 * cleanly even for dynamic user data (cards, statements, merchants).
 */
const QUERY_SYNONYMS: Record<string, string[]> = {
  maas: ['gelir'],
  kazanc: ['gelir'],
  ucret: ['gelir', 'faiz'],
  harcama: ['gider', 'islem'],
  masraf: ['gider'],
  odeme: ['gider', 'fatura', 'kart'],
  borc: ['kart', 'ekstre'],
  pdf: ['ekstre', 'yukle'],
  csv: ['ekstre', 'arsiv', 'yedek'],
  dosya: ['ekstre', 'yukle', 'arsiv'],
  doviz: ['varlik', 'altin', 'dolar', 'euro'],
  dolar: ['varlik', 'doviz'],
  euro: ['varlik', 'doviz'],
  usd: ['varlik', 'doviz'],
  eur: ['varlik', 'doviz'],
  altin: ['varlik', 'portfoy'],
  gram: ['altin', 'varlik'],
  ceyrek: ['altin', 'varlik'],
  kur: ['varlik', 'doviz'],
  birikim: ['plan', 'butce', 'varlik'],
  tasarruf: ['plan', 'butce'],
  hedef: ['plan', 'butce'],
  taksit: ['plan', 'butce', 'islem'],
  abonelik: ['plan', 'abonelik'],
  takvim: ['islem', 'gunluk'],
  grafik: ['analiz', 'trend'],
  rapor: ['analiz'],
  karanlik: ['koyu', 'tema'],
  gece: ['koyu', 'tema'],
  dark: ['koyu', 'tema'],
  aydinlik: ['acik', 'tema'],
  gunduz: ['acik', 'tema'],
  light: ['acik', 'tema'],
  gizle: ['gizlilik', 'maskele'],
  sakla: ['gizlilik'],
  yedek: ['arsiv', 'json'],
  export: ['arsiv', 'yedek'],
  import: ['ekstre', 'yukle'],
  sifre: ['ayarlar', 'pin'],
  kilit: ['ayarlar', 'pin'],
}

interface IndexedField {
  text: string
  tokens: string[]
  isAlias: boolean
}

function scoreTokenAgainstField(
  qToken: string,
  field: IndexedField,
): { score: number; reason: SearchMatchReason } | null {
  if (!field.text) return null

  const aliasFactor = field.isAlias ? 0.86 : 1

  // 1. Exact token match
  for (const t of field.tokens) {
    if (t === qToken) {
      return {
        score: Math.round(100 * aliasFactor),
        reason: field.isAlias ? 'alias' : 'exact',
      }
    }
  }

  // 2. Prefix match on a token
  for (const t of field.tokens) {
    if (t.startsWith(qToken)) {
      const tightness = Math.min(1, qToken.length / Math.max(t.length, 1))
      return {
        score: Math.round((82 + tightness * 10) * aliasFactor),
        reason: field.isAlias ? 'alias' : 'prefix',
      }
    }
  }

  // 3. Substring match inside the normalized phrase (for 3+ char tokens)
  if (qToken.length >= 3 && field.text.includes(qToken)) {
    return {
      score: Math.round(70 * aliasFactor),
      reason: field.isAlias ? 'alias' : 'contains',
    }
  }

  // 4. Fuzzy match (typo tolerance) for tokens of length >= 3
  if (qToken.length >= 3) {
    const maxDist = qToken.length >= 6 ? 2 : 1
    let bestFuzzy = 0

    for (const t of field.tokens) {
      if (t.length < 3) continue

      // Direct Damerau-Levenshtein on full token
      const fullDist = damerauLevenshtein(qToken, t, maxDist)
      if (fullDist <= maxDist) {
        const candidate = fullDist === 1 ? 64 : 52
        if (candidate > bestFuzzy) bestFuzzy = candidate
        continue
      }

      // Prefix-fuzzy for partial typed words with a typo (e.g. "markte" vs "marketi", "ekstr" vs "ekstreler")
      if (qToken.length >= 4 && t.length > qToken.length) {
        const prefixSlice = t.slice(0, qToken.length)
        const prefDist = damerauLevenshtein(qToken, prefixSlice, 1)
        if (prefDist <= 1) {
          if (58 > bestFuzzy) bestFuzzy = 58
          continue
        }
        const prefixSlicePlus = t.slice(0, qToken.length + 1)
        const prefPlusDist = damerauLevenshtein(qToken, prefixSlicePlus, 1)
        if (prefPlusDist <= 1 && 55 > bestFuzzy) {
          bestFuzzy = 55
          continue
        }
      }

      // Anchored subsequence for consonant abbreviations ("ftra" -> "fatura", "mrkt" -> "market", "abnlk" -> "abonelik")
      if (
        qToken.length >= 4 &&
        t.length > qToken.length &&
        qToken[0] === t[0] &&
        qToken.length / t.length >= 0.5 &&
        isOrderedSubsequence(qToken, t)
      ) {
        if (50 > bestFuzzy) bestFuzzy = 50
      }
    }

    if (bestFuzzy > 0) {
      return {
        score: Math.round(bestFuzzy * aliasFactor),
        reason: 'fuzzy',
      }
    }
  }

  return null
}

function scoreDocument(doc: SearchDocument, rawQuery: string): SearchResult | null {
  const normQuery = normalizeSearchText(rawQuery)
  if (!normQuery) return null
  const queryTokens = normQuery.split(' ').filter(Boolean)
  if (!queryTokens.length) return null

  const titleField: IndexedField = {
    text: normalizeSearchText(doc.title),
    tokens: tokenizeSearchText(doc.title),
    isAlias: false,
  }
  const subtitleField: IndexedField = {
    text: normalizeSearchText(doc.subtitle ?? ''),
    tokens: tokenizeSearchText(doc.subtitle ?? ''),
    isAlias: false,
  }
  const keywordFields: IndexedField[] = doc.keywords.map((kw) => ({
    text: normalizeSearchText(kw),
    tokens: tokenizeSearchText(kw),
    isAlias: false,
  }))
  const aliasFields: IndexedField[] = doc.aliases.map((al) => ({
    text: normalizeSearchText(al),
    tokens: tokenizeSearchText(al),
    isAlias: true,
  }))

  const allFields = [titleField, subtitleField, ...keywordFields, ...aliasFields]

  // Whole-phrase boost when the user types an exact or prefix title match
  let phraseBonus = 0
  if (titleField.text === normQuery) phraseBonus = 45
  else if (titleField.text.startsWith(normQuery)) phraseBonus = 28
  else if (titleField.text.includes(normQuery)) phraseBonus = 14

  let totalScore = 0
  let strongestReason: SearchMatchReason = 'fuzzy'
  const reasonRank: Record<SearchMatchReason, number> = {
    exact: 5,
    prefix: 4,
    contains: 3,
    alias: 2,
    fuzzy: 1,
  }

  for (const qToken of queryTokens) {
    // Expand with query-level synonyms as fallback candidates
    const expanded = [qToken, ...(QUERY_SYNONYMS[qToken] ?? [])]
    let bestForToken: { score: number; reason: SearchMatchReason } | null = null

    for (let variantIdx = 0; variantIdx < expanded.length; variantIdx++) {
      const candidate = expanded[variantIdx]
      const isSynonymVariant = variantIdx > 0
      for (let fieldIdx = 0; fieldIdx < allFields.length; fieldIdx++) {
        const res = scoreTokenAgainstField(candidate, allFields[fieldIdx])
        if (!res) continue
        // Title matches weigh slightly higher than subtitle/keyword matches
        const fieldBoost = fieldIdx === 0 ? 12 : fieldIdx === 1 ? 4 : 0
        const synPenalty = isSynonymVariant ? 0.84 : 1
        const weighted = Math.round((res.score + fieldBoost) * synPenalty)
        const reason: SearchMatchReason = isSynonymVariant ? 'alias' : res.reason
        if (!bestForToken || weighted > bestForToken.score) {
          bestForToken = { score: weighted, reason }
        }
      }
    }

    if (!bestForToken) return null
    totalScore += bestForToken.score
    if (reasonRank[bestForToken.reason] > reasonRank[strongestReason]) {
      strongestReason = bestForToken.reason
    }
  }

  const avgScore = totalScore / queryTokens.length
  return {
    doc,
    score: Math.round(avgScore + phraseBonus + doc.priority * 0.25),
    reason: strongestReason,
  }
}

export interface SearchCorpusInput {
  cards: CreditCard[]
  statements: Statement[]
  transactions: Transaction[]
  privateMode: boolean
  theme: 'dark' | 'light' | 'system'
}

/** Builds the complete searchable corpus from static navigation/actions + live user data. */
export function buildSearchCorpus(input: SearchCorpusInput): SearchDocument[] {
  const docs: SearchDocument[] = []

  // 1. Quick Actions
  docs.push(
    {
      id: 'act-expense',
      group: 'actions',
      title: 'Gider ekle',
      subtitle: 'Yeni nakit veya kart harcaması kaydet',
      iconKey: 'expense',
      keywords: ['Gider ekle', 'Harcama ekle', 'Yeni işlem'],
      aliases: ['masraf', 'harcama', 'ödeme ekle', 'manuel işlem', 'nakit harcama', 'fiş'],
      priority: 100,
      featured: true,
      action: { kind: 'open-entry', entryKind: 'expense' },
    },
    {
      id: 'act-income',
      group: 'actions',
      title: 'Gelir ekle',
      subtitle: 'Maaş, prim veya ek gelir kaydet',
      iconKey: 'income',
      keywords: ['Gelir ekle', 'Maaş ekle'],
      aliases: ['maaş', 'kazanç', 'prim', 'ek gelir', 'tahsilat', 'para girişi'],
      priority: 95,
      featured: true,
      action: { kind: 'open-entry', entryKind: 'income' },
    },
    {
      id: 'act-import',
      group: 'actions',
      title: 'Ekstre yükle',
      subtitle: 'PDF, TXT veya CSV banka ekstresi aktar',
      iconKey: 'import',
      keywords: ['Ekstre yükle', 'PDF aktar', 'Dosya yükle'],
      aliases: ['pdf', 'csv', 'txt', 'banka ekstresi', 'içeri aktar', 'import', 'dosya seç'],
      priority: 98,
      featured: true,
      action: { kind: 'open-import' },
    },
    {
      id: 'act-budgets',
      group: 'actions',
      title: 'Kategori bütçe limitleri',
      subtitle: 'Aylık harcama sınırlarını düzenle',
      iconKey: 'budget',
      keywords: ['Bütçe limitleri', 'Kategori limiti'],
      aliases: ['limit', 'sınır', 'bütçe ayarla', 'hedef belirle', 'aylık bütçe'],
      priority: 82,
      action: { kind: 'open-budgets' },
    },
    {
      id: 'act-income-plan',
      group: 'actions',
      title: 'Gelirlerim ve aylık plan',
      subtitle: 'Kayıtlı maaş ve düzenli gelir kalemleri',
      iconKey: 'income',
      keywords: ['Gelirlerim', 'Aylık gelir planı'],
      aliases: ['düzenli gelir', 'maaşlar', 'nakit akışı'],
      priority: 74,
      action: { kind: 'open-income' },
    },
    {
      id: 'act-archive',
      group: 'actions',
      title: 'Veri arşivi ve yedek',
      subtitle: 'JSON yedek al, CSV indir veya geri yükle',
      iconKey: 'archive',
      keywords: ['Veri arşivi', 'Yedek al', 'Dışa aktar'],
      aliases: ['yedekle', 'json', 'csv', 'export', 'geri yükle', 'kopya', 'excel'],
      priority: 72,
      action: { kind: 'open-archive' },
    },
    {
      id: 'act-rewards',
      group: 'actions',
      title: 'Kazanılan puanlar ve iadeler',
      subtitle: 'Kart kampanyaları, chip para ve nakit iade',
      iconKey: 'rewards',
      keywords: ['Puanlar', 'Ödüller', 'İadeler'],
      aliases: ['bonus', 'chip para', 'cashback', 'kampanya', 'worldpuan', 'maxipuan'],
      priority: 68,
      action: { kind: 'open-rewards' },
    },
    {
      id: 'act-account',
      group: 'actions',
      title: 'Hesap ve bulut eşitleme',
      subtitle: 'Oturum, Firebase eşitleme ve profil',
      iconKey: 'account',
      keywords: ['Hesap', 'Bulut eşitleme', 'Profil'],
      aliases: ['oturum', 'giriş', 'çıkış', 'firebase', 'senkron', 'bulut'],
      priority: 65,
      action: { kind: 'open-account' },
    },
  )

  // 2. Navigation Screens
  docs.push(
    {
      id: 'nav-overview',
      group: 'screens',
      title: 'Kokpit',
      subtitle: 'Aylık denge, özet ve harcama dağılımı',
      iconKey: 'overview',
      keywords: ['Kokpit', 'Ana sayfa', 'Genel bakış'],
      aliases: ['özet', 'dashboard', 'durum', 'bakiye', 'ayın dengesi', 'harcama dağılımı', 'başlangıç'],
      priority: 92,
      featured: true,
      action: { kind: 'navigate', view: 'overview' },
    },
    {
      id: 'nav-transactions',
      group: 'screens',
      title: 'İşlemler ve Takvim',
      subtitle: 'Tüm hareketler, filtreler ve aylık takvim',
      iconKey: 'transactions',
      keywords: ['İşlemler', 'Takvim', 'Hareketler'],
      aliases: ['harcamalar', 'defter', 'liste', 'geçmiş', 'günlük', 'filtre', 'işlem ara'],
      priority: 90,
      featured: true,
      action: { kind: 'navigate', view: 'transactions' },
    },
    {
      id: 'nav-cards',
      group: 'screens',
      title: 'Kartlar ve Ekstreler',
      subtitle: 'Kredi kartları, kesim günleri ve ekstre geçmişi',
      iconKey: 'cards',
      keywords: ['Kartlar', 'Ekstreler', 'Kredi kartı'],
      aliases: ['kartlarım', 'banka kartı', 'borç', 'kesim tarihi', 'son ödeme', 'banka'],
      priority: 89,
      action: { kind: 'navigate', view: 'cards' },
    },
    {
      id: 'nav-future',
      group: 'screens',
      title: 'Plan ve Bütçe',
      subtitle: '50/30/20 dengesi, taksitler, abonelikler ve hedefler',
      iconKey: 'plan',
      keywords: ['Plan & Bütçe', 'Taksitler', 'Abonelikler', 'Hedefler'],
      aliases: ['bütçe', 'tasarruf', 'birikim', 'gelecek', 'simülatör', 'what-if', 'taahhüt', 'planlama'],
      priority: 88,
      action: { kind: 'navigate', view: 'future' },
    },
    {
      id: 'nav-analysis',
      group: 'screens',
      title: 'Varlık ve Analiz Merkezi',
      subtitle: 'Harcama trendi, aydan aya değişim ve portföy',
      iconKey: 'analysis',
      keywords: ['Varlık & Analiz', 'Harcama trendi', 'Aydan aya'],
      aliases: ['analiz', 'grafik', 'istatistik', 'rapor', 'karşılaştırma', 'trend', 'değişim'],
      priority: 87,
      featured: true,
      action: { kind: 'navigate', view: 'analysis' },
    },
    {
      id: 'nav-assets',
      group: 'screens',
      title: 'Altın ve Döviz Portföyü',
      subtitle: 'Canlı kurlar, çevirici ve varlık dağılımı',
      iconKey: 'assets',
      keywords: ['Altın & Döviz', 'Varlıklar', 'Portföy'],
      aliases: ['altın', 'gram altın', 'çeyrek', 'dolar', 'usd', 'euro', 'eur', 'sterlin', 'döviz', 'kur', 'çevirici', 'yatırım'],
      priority: 84,
      action: { kind: 'navigate', view: 'assets' },
    },
    {
      id: 'nav-spending',
      group: 'screens',
      title: 'İşyeri ve Alışkanlık Radarı',
      subtitle: 'En sık gidilen işyerleri ve tekrarlayan harcamalar',
      iconKey: 'spending',
      keywords: ['İşyeri & Alışkanlık', 'Alışkanlık radarı'],
      aliases: ['işyerleri', 'mağazalar', 'satıcı', 'marka', 'tekrarlayan', 'en çok harcanan'],
      priority: 76,
      action: { kind: 'navigate', view: 'spending' },
    },
    {
      id: 'nav-settings',
      group: 'screens',
      title: 'Ayarlar',
      subtitle: 'Tema, uygulama kilidi, bildirimler ve güvenlik',
      iconKey: 'settings',
      keywords: ['Ayarlar', 'Tercihler'],
      aliases: ['pin', 'kilit', 'şifre', 'güvenlik', 'bildirim', 'hatırlatıcı', 'tema', 'gizlilik'],
      priority: 75,
      action: { kind: 'open-settings' },
    },
  )

  // 3. Categories (with spend count context from user's transactions)
  const categoryCounts = new Map<CategoryId, number>()
  for (const tx of input.transactions) {
    if (tx.kind === 'expense') {
      categoryCounts.set(tx.category, (categoryCounts.get(tx.category) ?? 0) + 1)
    }
  }
  for (const cat of SORTED_CATEGORIES) {
    const count = categoryCounts.get(cat.id) ?? 0
    docs.push({
      id: `cat-${cat.id}`,
      group: 'categories',
      title: cat.label,
      subtitle: count > 0 ? `${count} harcama kaydını incele` : 'Kategori işlemlerini aç',
      badge: count > 0 ? `${count}` : undefined,
      categoryId: cat.id,
      iconKey: 'category',
      keywords: [cat.label, ...cat.tokens.slice(0, 8)],
      aliases: [...(CATEGORY_ALIASES[cat.id] ?? []), ...cat.phrases.slice(0, 6)],
      priority: count > 0 ? 70 : 50,
      action: { kind: 'open-category', categoryId: cat.id },
    })
  }

  // 4. User Cards
  for (const card of input.cards) {
    const bank = cardBankLabel(card.bank)
    docs.push({
      id: `card-${card.id}`,
      group: 'cards',
      title: card.name,
      subtitle: [bank, card.last4 ? `•••• ${card.last4}` : null].filter(Boolean).join(' · '),
      badge: 'Kart',
      iconKey: 'card',
      keywords: [card.name, bank, card.last4 ?? ''].filter(Boolean),
      aliases: ['kart', 'kredi kartı', 'ekstre'],
      priority: 78,
      action: { kind: 'open-card', cardId: card.id },
    })
  }

  // 5. Recent Statements (limit to latest 16 so corpus stays compact)
  const cardById = new Map(input.cards.map((c) => [c.id, c]))
  const sortedStatements = [...input.statements]
    .sort((a, b) => (b.periodEnd ?? b.periodStart ?? '').localeCompare(a.periodEnd ?? a.periodStart ?? ''))
    .slice(0, 16)
  for (const stmt of sortedStatements) {
    const card = stmt.cardId ? cardById.get(stmt.cardId) : undefined
    const periodText = stmt.periodEnd ? monthLabel(monthOf(stmt.periodEnd)) : stmt.label || stmt.fileName
    const bank = stmt.accountLabel ?? stmt.bank
    const debt = stmt.summary?.totalDebt ?? stmt.reconciliation?.printedDebt ?? null
    docs.push({
      id: `stmt-${stmt.id}`,
      group: 'cards',
      title: card ? `${card.name} · ${periodText}` : stmt.label || `${bank} · ${periodText}`,
      subtitle: debt !== null ? `Ekstre borcu ${money2(debt)}` : stmt.fileName,
      badge: 'Ekstre',
      iconKey: 'statement',
      keywords: [card?.name ?? '', stmt.label, bank, stmt.bank, periodText, stmt.periodEnd ?? '', stmt.fileName].filter(Boolean),
      aliases: ['ekstre', 'dönem borcu', 'pdf'],
      priority: 66,
      action: { kind: 'open-statement', statementId: stmt.id },
    })
  }

  // 6. Top Merchants (deduplicated from transactions, capped at 160 most active)
  const merchantStats = new Map<
    string,
    {
      merchant: string
      display: string
      total: number
      count: number
      lastDate: string
      descriptions: Set<string>
      category: CategoryId
    }
  >()
  for (const tx of input.transactions) {
    if (!tx.merchant) continue
    const existing = merchantStats.get(tx.merchant)
    if (!existing) {
      merchantStats.set(tx.merchant, {
        merchant: tx.merchant,
        display: tx.description || tx.merchant,
        total: tx.kind === 'expense' ? tx.amount : 0,
        count: 1,
        lastDate: tx.date,
        descriptions: new Set([tx.description]),
        category: tx.category,
      })
    } else {
      existing.count += 1
      if (tx.kind === 'expense') existing.total += tx.amount
      if (tx.date > existing.lastDate) {
        existing.lastDate = tx.date
        existing.display = tx.description || existing.display
      }
      if (existing.descriptions.size < 4) existing.descriptions.add(tx.description)
    }
  }

  const topMerchants = [...merchantStats.values()]
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 160)

  for (const m of topMerchants) {
    const cleanTitle = m.merchant
      .split(' ')
      .map((w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()))
      .join(' ')
    docs.push({
      id: `merch-${m.merchant}`,
      group: 'merchants',
      title: cleanTitle,
      subtitle: `${m.count} işlem${m.total > 0 ? ` · ${money2(m.total)}` : ''}`,
      categoryId: m.category,
      iconKey: 'merchant',
      keywords: [cleanTitle, m.merchant, ...m.descriptions],
      aliases: CATEGORY_ALIASES[m.category]?.slice(0, 3) ?? [],
      priority: 60 + Math.min(15, m.count),
      action: { kind: 'open-merchant', merchant: m.merchant, title: cleanTitle },
    })
  }

  // 7. Preferences
  docs.push(
    {
      id: 'pref-privacy',
      group: 'preferences',
      title: input.privateMode ? 'Tutarları göster' : 'Gizlilik modunu aç',
      subtitle: input.privateMode ? 'Gizlenen rakamları yeniden görünür yap' : 'Ekrandaki tüm tutarları maskele',
      iconKey: 'privacy',
      keywords: ['Gizlilik modu', 'Tutarları gizle', 'Tutarları göster'],
      aliases: ['gizle', 'maskele', 'sakla', 'bulanıklaştır', 'mahremiyet', 'göz'],
      priority: 62,
      action: { kind: 'toggle-privacy' },
    },
    {
      id: 'pref-theme-dark',
      group: 'preferences',
      title: 'Koyu temaya geç',
      subtitle: input.theme === 'dark' ? 'Şu an aktif' : 'Karanlık arayüz görünümü',
      iconKey: 'theme-dark',
      keywords: ['Koyu tema', 'Karanlık mod'],
      aliases: ['gece', 'dark', 'siyah', 'tema', 'görünüm'],
      priority: 55,
      action: { kind: 'set-theme', theme: 'dark' },
    },
    {
      id: 'pref-theme-light',
      group: 'preferences',
      title: 'Açık temaya geç',
      subtitle: input.theme === 'light' ? 'Şu an aktif' : 'Aydınlık arayüz görünümü',
      iconKey: 'theme-light',
      keywords: ['Açık tema', 'Aydınlık mod'],
      aliases: ['gündüz', 'light', 'beyaz', 'tema', 'görünüm'],
      priority: 55,
      action: { kind: 'set-theme', theme: 'light' },
    },
    {
      id: 'pref-theme-system',
      group: 'preferences',
      title: 'Sistem temasını kullan',
      subtitle: input.theme === 'system' ? 'Şu an aktif' : 'Cihaz ayarına göre otomatik tema',
      iconKey: 'theme-system',
      keywords: ['Sistem teması', 'Otomatik tema'],
      aliases: ['oto', 'otomatik', 'cihaz', 'tema'],
      priority: 52,
      action: { kind: 'set-theme', theme: 'system' },
    },
  )

  return docs
}

/**
 * Searches the corpus with Turkish folding, typo tolerance and alias matching.
 * Returns featured shortcuts when query is blank so focusing the search input
 * immediately surfaces helpful destinations.
 */
export function runSmartSearch(
  corpus: SearchDocument[],
  query: string,
  limit = 12,
): SearchResult[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return corpus
      .filter((doc) => doc.featured)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 6)
      .map((doc) => ({ doc, score: doc.priority, reason: 'exact' as const }))
  }

  const hits: SearchResult[] = []
  for (const doc of corpus) {
    const match = scoreDocument(doc, trimmed)
    if (match) hits.push(match)
  }

  hits.sort((a, b) => b.score - a.score || b.doc.priority - a.doc.priority || a.doc.title.localeCompare(b.doc.title, 'tr'))
  return hits.slice(0, limit)
}
