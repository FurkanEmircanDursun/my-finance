import { describe, expect, it } from 'vitest'
import { migratePersisted, STATE_VERSION } from './migrate'
import { parseStatementText } from '../ingest/pipeline'
import { instalmentStatement } from '../ingest/fixtures'
import { defaultProfile, defaultSettings } from './defaults'
import type { CategoryRule, Statement, Transaction } from '../domain/types'

/**
 * The migration's one job that must be exactly right: after it, the id of every
 * stored row equals the id the importer would give that row today. Anything less
 * and re-importing a statement a person already holds adds all of it again.
 */

function freshImport(statementId: string, index: 1 | 2 | 3) {
  const result = parseStatementText(instalmentStatement(index), { rules: [], engine: 'pdf-ebcdic', fileName: 'x.pdf' })
  const statement: Statement = {
    id: statementId,
    label: result.label,
    fileName: 'x.pdf',
    bank: result.bank,
    accountLabel: result.accountLabel,
    transactionCount: result.transactions.length,
    skippedCount: 0,
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
    dueDate: result.dueDate,
    importedAt: 0,
    engine: 'pdf-ebcdic',
  }
  return { statement, transactions: result.transactions.map((t) => ({ ...t, statementId })) }
}

/** What an older build would have stored for the same rows. */
function asV2(transactions: Transaction[]): Transaction[] {
  return transactions.map((t, i) => {
    const { billedOn, foreign, reward, ...rest } = t
    void billedOn, foreign, reward
    return { ...rest, id: `legacy-${i}`, merchant: t.description.toUpperCase().replace(/\s+/g, '') }
  })
}

const v2 = (over: Partial<Parameters<typeof migratePersisted>[0] & object> = {}) => ({
  version: 2,
  transactions: [] as Transaction[],
  statements: [] as Statement[],
  rules: [] as CategoryRule[],
  profile: defaultProfile,
  settings: defaultSettings,
  ...over,
})

describe('v2 → v3', () => {
  const jul = freshImport('st-jul', 1)
  const aug = freshImport('st-aug', 2)
  const sep = freshImport('st-sep', 3)
  const stored = asV2([...jul.transactions, ...aug.transactions, ...sep.transactions])
  const migrated = migratePersisted(v2({ transactions: stored, statements: [jul.statement, aug.statement, sep.statement] }))!

  it('gives every row the id a fresh import gives it', () => {
    const fresh = [...jul.transactions, ...aug.transactions, ...sep.transactions].map((t) => t.id)
    expect(migrated.state.transactions.map((t) => t.id)).toEqual(fresh)
  })

  it('keeps the three months of one instalment plan as three rows', () => {
    const plan = migrated.state.transactions.filter((t) => t.installment)
    expect(plan).toHaveLength(3)
    expect(new Set(plan.map((t) => t.id)).size).toBe(3)
  })

  it('re-derives the merchant so history benefits from a better normaliser', () => {
    const market = migrated.state.transactions.find((t) => t.description === 'YEREL MARKET')
    expect(market?.merchant).toBe('YEREL MARKET')
  })

  it('stamps instalment rows with the day their statement billed them', () => {
    const second = migrated.state.transactions.find((t) => t.installment?.current === 2)
    expect(second?.billedOn).toBe('2026-08-27')
  })

  it('says what could not be recovered, once, in plain words', () => {
    expect(migrated.migratedFrom).toBe(2)
    expect(migrated.notes).toHaveLength(1)
    expect(migrated.notes[0]).toMatch(/yeniden yüklersen/)
  })

  it('writes the current version', () => {
    expect(migrated.state.version).toBe(STATE_VERSION)
  })
})

describe('what a migration must not touch', () => {
  const manual: Transaction = {
    id: 'manual-1', date: '2026-09-01', description: 'Kira', merchant: 'KIRA', amount: 1_500_000,
    kind: 'expense', category: 'rent', categoryLocked: true, bank: 'Manuel', accountLabel: 'Aylık gider',
    installment: null, source: 'manual',
  }
  const locked: Transaction = {
    id: 'old-1', date: '2026-09-02', description: 'GITHUB, INC.', merchant: 'GITHUB INC', amount: 50_000,
    kind: 'expense', category: 'other', categoryLocked: true, bank: 'Akbank', accountLabel: 'Akbank Axess',
    installment: null, source: 'statement', statementId: 'st-1',
  }
  const unlocked: Transaction = { ...locked, id: 'old-2', categoryLocked: false, date: '2026-09-03' }
  const chosen: Transaction = { ...locked, id: 'old-3', categoryLocked: false, category: 'health', date: '2026-09-04' }

  const result = migratePersisted(v2({ transactions: [manual, locked, unlocked, chosen] }))!.state.transactions

  it('leaves a hand-entered row exactly as it was', () => {
    expect(result.find((t) => t.id === 'manual-1')).toEqual(manual)
  })

  it('does not re-classify a category the person chose', () => {
    expect(result.find((t) => t.description === 'GITHUB, INC.' && t.categoryLocked)?.category).toBe('other')
  })

  it('does not overwrite a category that is already set, even by the automatic classifier', () => {
    expect(result.find((t) => t.date === '2026-09-04')?.category).toBe('health')
  })

  it('does re-classify an automatic "Diğer" that the dictionary can now place', () => {
    expect(result.find((t) => t.date === '2026-09-03')?.category).toBe('subscription')
  })
})

describe('learned rules', () => {
  const tx = (merchant: string, description: string): Transaction => ({
    id: `old-${merchant}`, date: '2026-09-02', description, merchant, amount: 1000, kind: 'expense',
    category: 'bills', categoryLocked: true, bank: 'Garanti BBVA', accountLabel: 'Garanti Bonus', installment: null,
    source: 'statement', statementId: 's',
  })
  const rule = (merchant: string): CategoryRule => ({ id: `r-${merchant}`, merchant, category: 'bills', createdAt: 0 })

  it('follow their merchant to its new key', () => {
    // The old normaliser kept the glued invoice number; the new one does not.
    const migrated = migratePersisted(
      v2({ transactions: [tx('TTNET5551234567020260889', '-TTNET5551234567020260889')], rules: [rule('TTNET5551234567020260889')] }),
    )!
    expect(migrated.state.rules[0].merchant).toBe('TTNET')
  })

  it('stay put when the same old key now splits into different merchants', () => {
    const migrated = migratePersisted(
      v2({
        transactions: [tx('SHOP', 'SHOP ALPHA'), tx('SHOP', 'SHOP BRAVO')],
        rules: [rule('SHOP')],
      }),
    )!
    expect(migrated.state.rules[0].merchant).toBe('SHOP')
  })
})

describe('refusing', () => {
  it('will not guess at a snapshot older than anything it knows', () => {
    expect(migratePersisted({ version: 1, transactions: [] })).toBeNull()
    expect(migratePersisted({ transactions: [] })).toBeNull()
  })

  it('will not read what is not an object', () => {
    expect(migratePersisted(null)).toBeNull()
    expect(migratePersisted('{"version":2}')).toBeNull()
  })

  it('passes a current snapshot through untouched and says nothing', () => {
    const current = { ...v2(), version: STATE_VERSION }
    const result = migratePersisted(current)!
    expect(result.migratedFrom).toBeNull()
    expect(result.notes).toEqual([])
  })

  it('says nothing about instalments when there were none to lose', () => {
    expect(migratePersisted(v2())!.notes).toEqual([])
  })
})
