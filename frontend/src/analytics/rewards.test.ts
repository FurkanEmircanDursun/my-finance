import { describe, expect, it } from 'vitest'
import { buildRewards } from './rewards'
import { parseStatementText } from '../ingest/pipeline'
import { AKBANK_COLUMNS, GARANTI_COLUMNS } from '../ingest/fixtures'
import { toMinor } from '../core/money'
import type { Statement, StatementSummary, Transaction } from '../domain/types'
import { emptySummary } from '../domain/types'

/** Imports a fixture the way the app does: one statement, its rows pointing back at it. */
function imported(text: string, id: string) {
  const result = parseStatementText(text, { rules: [], engine: 'pdf-text', fileName: `${id}.pdf` })
  const statement: Statement = {
    id,
    label: result.label,
    fileName: `${id}.pdf`,
    bank: result.bank,
    accountLabel: result.accountLabel,
    transactionCount: result.transactions.length,
    skippedCount: result.skipped,
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
    dueDate: result.dueDate,
    importedAt: 0,
    engine: 'pdf-text',
    summary: result.summary,
    reconciliation: result.reconciliation,
    ignored: result.ignored,
  }
  return { statement, transactions: result.transactions.map((tx) => ({ ...tx, statementId: id })) }
}

const garanti = imported(GARANTI_COLUMNS, 'g1')
const akbank = imported(AKBANK_COLUMNS, 'a1')
const both = {
  statements: [garanti.statement, akbank.statement],
  transactions: [...garanti.transactions, ...akbank.transactions],
}

describe('bonus and chip-para, from the statements', () => {
  const report = buildRewards(both)
  const bonus = report.programmes.find((p) => p.programme === 'Bonus')!
  const chip = report.programmes.find((p) => p.programme === 'Chip-para')!

  it('keeps each bank\'s programme apart', () => {
    expect(report.programmes.map((p) => p.programme).sort()).toEqual(['Bonus', 'Chip-para'])
    expect(bonus.bank).toBe(garanti.statement.bank)
    expect(chip.bank).toBe(akbank.statement.bank)
  })

  it('takes the bank\'s printed totals for Garanti and names where the bonus came from', () => {
    expect(bonus.earned).toBe(toMinor(3010))
    expect(bonus.spent).toBe(toMinor(36.5))
    expect(bonus.balance).toBe(toMinor(12.34))
    expect(bonus.earnedBy[0]).toMatchObject({ label: 'Otomatik fatura bonusu', amount: toMinor(3000), count: 1 })
    expect(bonus.spentOn[0]).toMatchObject({ label: 'Bonusla ödenen alışveriş', amount: toMinor(36.5) })
  })

  it('makes the lines add up to the printed total, with shopping as the remainder', () => {
    // The bank's ₺3.010 less the ₺3.000 award line is what shopping earned.
    expect(bonus.earnedBy.find((l) => l.label === 'Alışverişlerden')).toMatchObject({ amount: toMinor(10), count: 2 })
    expect(bonus.earnedBy.reduce((sum, l) => sum + l.amount, 0)).toBe(bonus.earned)
  })

  it('finds Akbank\'s chip-para spending in the credit row, and its earnings in the campaign line', () => {
    // "Chip-Para ile Ödeme 120,00(-)" is a credit row on the statement, not a loyalty line.
    expect(chip.earned).toBe(toMinor(120))
    expect(chip.spent).toBe(toMinor(120))
    expect(chip.spentOn[0]).toMatchObject({ label: 'Chip-para ile ödeme', amount: toMinor(120) })
    expect(chip.earnedBy[0].label).toMatch(/Youtube/)
    expect(chip.balance).toBe(0)
  })

  it('totals across programmes', () => {
    expect(report.earned).toBe(bonus.earned + chip.earned)
    expect(report.spent).toBe(bonus.spent + chip.spent)
  })
})

describe('reading the bank\'s total rather than adding up the rows', () => {
  const statement = (id: string, periodEnd: string, loyalty: StatementSummary['loyalty']): Statement => ({
    id, label: id, fileName: `${id}.pdf`, bank: 'Garanti BBVA', transactionCount: 0, skippedCount: 0,
    periodStart: null, periodEnd, dueDate: null, importedAt: 0, engine: 'pdf-text',
    summary: { ...emptySummary(), loyalty },
  })
  const purchase = (id: string, reward: number): Transaction =>
    ({ ...garanti.transactions[0], id, statementId: 'aug', kind: 'expense', reward: toMinor(reward) }) as Transaction

  it('does not over-count shopping when a refund clawed some bonus back', () => {
    // The purchase rows say ₺12,60; the bank says ₺12,53 because a refund took ₺0,07
    // back — and that clawback is on a refund row, where no purchase shows it.
    const aug = statement('aug', '2026-08-28', { programme: 'Bonus', earned: toMinor(12.53), spent: 0, balance: toMinor(9.6) })
    const report = buildRewards({ statements: [aug], transactions: [purchase('a', 7.6), purchase('b', 5)] })
    expect(report.programmes[0].earned).toBe(toMinor(12.53))
    expect(report.programmes[0].earnedBy[0]).toMatchObject({ label: 'Alışverişlerden', amount: toMinor(12.53), count: 2 })
  })

  it('falls back to the rows when the cover printed no total', () => {
    const bare = statement('aug', '2026-08-28', { programme: 'Bonus', earned: null, spent: null, balance: toMinor(1) })
    const report = buildRewards({ statements: [bare], transactions: [purchase('a', 1.5)] })
    expect(report.programmes[0].earned).toBe(toMinor(1.5))
  })
})

describe('what is reported', () => {
  const statement = (id: string, periodEnd: string, loyalty: StatementSummary['loyalty']): Statement => ({
    id, label: id, fileName: `${id}.pdf`, bank: 'Garanti BBVA', transactionCount: 0, skippedCount: 0,
    periodStart: null, periodEnd, dueDate: null, importedAt: 0, engine: 'pdf-text',
    summary: { ...emptySummary(), loyalty },
  })
  const aug = statement('aug', '2026-08-28', { programme: 'Bonus', earned: toMinor(12.53), spent: toMinor(2.93), balance: toMinor(9.6) })
  const sep = statement('sep', '2026-09-28', { programme: 'Bonus', earned: toMinor(7735.2), spent: toMinor(7740.46), balance: toMinor(4.34) })

  it('reports exactly the statements it is handed', () => {
    const report = buildRewards({ statements: [sep], transactions: [] })
    expect(report.programmes[0]).toMatchObject({ earned: toMinor(7735.2), spent: toMinor(7740.46), balance: toMinor(4.34), statements: 1 })
  })

  it('adds statements up and reports the newest balance', () => {
    const report = buildRewards({ statements: [sep, aug], transactions: [] })
    expect(report.programmes[0]).toMatchObject({
      earned: toMinor(12.53) + toMinor(7735.2),
      spent: toMinor(2.93) + toMinor(7740.46),
      balance: toMinor(4.34),
      balanceAsOf: '2026-09-28',
      statements: 2,
    })
  })

  it('says nothing for no statements, or for a card with no programme activity', () => {
    expect(buildRewards({ statements: [], transactions: [] }).programmes).toEqual([])
    const quiet = statement('q', '2026-09-28', { programme: 'Bonus', earned: 0, spent: 0, balance: null })
    expect(buildRewards({ statements: [quiet], transactions: [] }).programmes).toEqual([])
  })

  it('ignores hand-entered rows, which belong to no statement', () => {
    const manual = { ...garanti.transactions[0], statementId: undefined, reward: toMinor(5) } as Transaction
    const report = buildRewards({ statements: [aug], transactions: [manual] })
    expect(report.programmes[0].earned).toBe(toMinor(12.53))
  })

  it('infers default programme names across all supported banks when cover omits loyalty summary', () => {
    const makeSt = (id: string, bank: string): Statement => ({
      id, label: id, fileName: `${id}.pdf`, bank, transactionCount: 1, skippedCount: 0,
      periodStart: '2026-10-01', periodEnd: '2026-10-31', dueDate: null, importedAt: 0, engine: 'pdf-text',
      summary: emptySummary(),
    })
    const stIs = makeSt('is1', 'Türkiye İş Bankası')
    const stDk = makeSt('dk1', 'Dünya Katılım')
    const stQnb = makeSt('qnb1', 'QNB')
    const txs: Transaction[] = [
      { ...garanti.transactions[0], id: 't1', statementId: 'is1', bank: 'Türkiye İş Bankası', kind: 'expense', reward: toMinor(2) },
      { ...garanti.transactions[0], id: 't2', statementId: 'dk1', bank: 'Dünya Katılım', kind: 'expense', reward: toMinor(3) },
      { ...garanti.transactions[0], id: 't3', statementId: 'qnb1', bank: 'QNB', kind: 'expense', reward: toMinor(4) },
    ]
    const report = buildRewards({ statements: [stIs, stDk, stQnb], transactions: txs })
    expect(report.programmes.map((p) => p.programme).sort()).toEqual(['MaxiPuan', 'ParaPuan', 'ParafPara'])
    expect(report.earned).toBe(toMinor(9))
  })
})
