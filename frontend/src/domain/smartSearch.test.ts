import { describe, expect, it } from 'vitest'
import {
  buildSearchCorpus,
  damerauLevenshtein,
  normalizeSearchText,
  runSmartSearch,
} from './smartSearch'
import type { CreditCard, Statement, Transaction } from './types'

const SAMPLE_CARDS: CreditCard[] = [
  {
    id: 'card-garanti',
    bank: 'garanti',
    name: 'Garanti Bonus Gold',
    last4: '4821',
    statementDay: 20,
    entryDay: 21,
    remindersEnabled: true,
  },
  {
    id: 'card-akbank',
    bank: 'akbank',
    name: 'Axess Platinum',
    last4: '9012',
    statementDay: 15,
    entryDay: 16,
    remindersEnabled: true,
  },
]

const SAMPLE_STATEMENTS: Statement[] = [
  {
    id: 'stmt-1',
    label: 'Garanti BBVA · Ekim 2026',
    bank: 'Garanti BBVA',
    accountLabel: 'Garanti Bonus Gold',
    cardId: 'card-garanti',
    fileName: 'garanti-ekim-2026.pdf',
    periodStart: '2026-09-21',
    periodEnd: '2026-10-20',
    dueDate: '2026-10-30',
    importedAt: 1792922400000,
    engine: 'garanti',
    transactionCount: 14,
    skippedCount: 0,
    summary: {
      totalDebt: 2845000,
      previousBalance: 0,
      minPayment: null,
      creditLimit: null,
      availableLimit: null,
      cashAdvanceLimit: null,
      interestMonthly: null,
      previousCutDate: null,
      nextCutDate: null,
      nextDueDate: null,
      loyalty: null,
    },
  },
]

const SAMPLE_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    date: '2026-10-03',
    description: 'MIGROS TICARET ISTANBUL',
    merchant: 'MIGROS',
    amount: 64000,
    kind: 'expense',
    category: 'market',
    categoryLocked: false,
    bank: 'Garanti BBVA',
    accountLabel: 'Garanti Bonus Gold',
    installment: null,
    source: 'statement',
    cardId: 'card-garanti',
  },
  {
    id: 'tx-2',
    date: '2026-10-05',
    description: 'TRENDYOL.COM ISTANBUL',
    merchant: 'TRENDYOL',
    amount: 129000,
    kind: 'expense',
    category: 'ecommerce',
    categoryLocked: false,
    bank: 'Garanti BBVA',
    accountLabel: 'Garanti Bonus Gold',
    installment: null,
    source: 'statement',
    cardId: 'card-garanti',
  },
  {
    id: 'tx-3',
    date: '2026-10-07',
    description: 'ÇİÇEKSEPETİ ONLINE',
    merchant: 'CICEKSEPETI',
    amount: 45000,
    kind: 'expense',
    category: 'ecommerce',
    categoryLocked: false,
    bank: 'Akbank',
    accountLabel: 'Axess Platinum',
    installment: null,
    source: 'statement',
    cardId: 'card-akbank',
  },
]

const CORPUS = buildSearchCorpus({
  cards: SAMPLE_CARDS,
  statements: SAMPLE_STATEMENTS,
  transactions: SAMPLE_TRANSACTIONS,
  privateMode: false,
  theme: 'light',
})

describe('smartSearch', () => {
  it('folds Turkish diacritics cleanly regardless of case', () => {
    expect(normalizeSearchText('Çalışma & Öğün — İğne Şehir Ücret')).toBe(
      'calisma ogun igne sehir ucret',
    )
    expect(normalizeSearchText('Ulaşım & Akaryakıt')).toBe('ulasim akaryakit')
  })

  it('computes Damerau-Levenshtein distance with transposition = 1', () => {
    expect(damerauLevenshtein('markte', 'market')).toBe(1)
    expect(damerauLevenshtein('kartlra', 'kartlar')).toBe(1)
    expect(damerauLevenshtein('fatura', 'fatura')).toBe(0)
  })

  it('matches Turkish characters without diacritics (c/ç, i/ı, g/ğ, o/ö, s/ş, u/ü)', () => {
    const ulasim = runSmartSearch(CORPUS, 'ulasim')
    expect(ulasim.some((r) => r.doc.id === 'cat-transport')).toBe(true)

    const saglik = runSmartSearch(CORPUS, 'saglik')
    expect(saglik.some((r) => r.doc.id === 'cat-health')).toBe(true)

    const eglence = runSmartSearch(CORPUS, 'eglence')
    expect(eglence.some((r) => r.doc.id === 'cat-entertainment')).toBe(true)

    const islem = runSmartSearch(CORPUS, 'islemler')
    expect(islem.some((r) => r.doc.id === 'nav-transactions')).toBe(true)

    const cicek = runSmartSearch(CORPUS, 'ciceksepeti')
    expect(cicek.some((r) => r.doc.id === 'merch-CICEKSEPETI')).toBe(true)
  })

  it('tolerates common typing mistakes and abbreviations (fuzzy search)', () => {
    expect(runSmartSearch(CORPUS, 'markte').some((r) => r.doc.id === 'cat-market')).toBe(true)
    expect(runSmartSearch(CORPUS, 'abnelik').some((r) => r.doc.id === 'cat-subscription')).toBe(true)
    expect(runSmartSearch(CORPUS, 'ekstr').some((r) => r.doc.id === 'act-import')).toBe(true)
    expect(runSmartSearch(CORPUS, 'ftra').some((r) => r.doc.id === 'cat-bills')).toBe(true)
    expect(runSmartSearch(CORPUS, 'kartlra').some((r) => r.doc.id === 'nav-cards')).toBe(true)
    expect(runSmartSearch(CORPUS, 'trndyol').some((r) => r.doc.id === 'merch-TRENDYOL')).toBe(true)
  })

  it('matches everyday Turkish synonyms and aliases', () => {
    expect(runSmartSearch(CORPUS, 'benzin').some((r) => r.doc.id === 'cat-transport')).toBe(true)
    expect(runSmartSearch(CORPUS, 'kahve').some((r) => r.doc.id === 'cat-dining')).toBe(true)
    expect(runSmartSearch(CORPUS, 'elektrik').some((r) => r.doc.id === 'cat-bills')).toBe(true)
    expect(runSmartSearch(CORPUS, 'maaş').some((r) => r.doc.id === 'act-income')).toBe(true)
    expect(runSmartSearch(CORPUS, 'dolar').some((r) => r.doc.id === 'nav-assets')).toBe(true)
    expect(runSmartSearch(CORPUS, 'karanlık').some((r) => r.doc.id === 'pref-theme-dark')).toBe(true)
    expect(runSmartSearch(CORPUS, 'gizle').some((r) => r.doc.id === 'pref-privacy')).toBe(true)
    expect(runSmartSearch(CORPUS, 'yedek').some((r) => r.doc.id === 'act-archive')).toBe(true)
  })

  it('finds user cards, statements and merchants', () => {
    expect(runSmartSearch(CORPUS, 'bonus 4821').some((r) => r.doc.id === 'card-card-garanti')).toBe(true)
    expect(runSmartSearch(CORPUS, 'ekim garanti').some((r) => r.doc.id === 'stmt-stmt-1')).toBe(true)
    expect(runSmartSearch(CORPUS, 'migrs').some((r) => r.doc.id === 'merch-MIGROS')).toBe(true)
  })

  it('returns curated featured shortcuts when query is empty', () => {
    const empty = runSmartSearch(CORPUS, '')
    expect(empty.length).toBeGreaterThanOrEqual(4)
    expect(empty.every((r) => r.doc.featured)).toBe(true)
  })
})
