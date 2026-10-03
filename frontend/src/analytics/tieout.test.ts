import { describe, expect, it } from 'vitest'
import { analyze } from './engine'
import { buildLedgers } from './ledger'
import { parseStatementText } from '../ingest/pipeline'
import { AKBANK_COLUMNS, GARANTI_COLUMNS, instalmentStatement } from '../ingest/fixtures'
import { applyFilters, buildStatementMonthIndex, periodMonthOf, statementsInScope } from '../store/selectors'
import { cardOf, emptyFilters, type Statement, type Transaction } from '../domain/types'
import { defaultProfile } from '../store/defaults'
import { toMinor } from '../core/money'

/**
 * Every figure on screen has to add up, and add up to the same thing: the
 * categories to the headline, the headline to the statements, the statements to
 * the bank's own debt. These tests state those identities and then break the
 * data in the ways real statements do (a chip-para credit, a refund with no
 * purchase to come off) to prove they still hold.
 */

function imported(text: string, id: string) {
  const r = parseStatementText(text, { rules: [], engine: 'pdf-text', fileName: `${id}.pdf` })
  const statement: Statement = {
    id, label: r.label, fileName: `${id}.pdf`, bank: r.bank, accountLabel: r.accountLabel,
    transactionCount: r.transactions.length, skippedCount: r.skipped,
    periodStart: r.periodStart, periodEnd: r.periodEnd, dueDate: r.dueDate, importedAt: 0, engine: 'pdf-text',
    summary: r.summary, reconciliation: r.reconciliation, ignored: r.ignored,
  }
  return { statement, transactions: r.transactions.map((tx) => ({ ...tx, statementId: id })) as Transaction[] }
}

const garanti = imported(GARANTI_COLUMNS, 'g1')
const akbank = imported(AKBANK_COLUMNS, 'a1')
const statements = [garanti.statement, akbank.statement]
const transactions = [...garanti.transactions, ...akbank.transactions]

const analysisFor = (rows: Transaction[]) => analyze(rows, defaultProfile)

describe('the category list adds up to the headline', () => {
  it('categories less the refunds none of them absorbed equal the net spending, to the kuruş', () => {
    const a = analysisFor(transactions)
    const sum = a.categories.reduce((s, c) => s + c.total, 0)
    expect(sum - a.totals.unallocatedRefunds).toBe(a.totals.netSpend)
  })

  it('holds when a refund exceeds anything bought in its category', () => {
    // A 300 return filed under a category that has only a 100 purchase: 200 is
    // left over, and must be reported rather than silently dropped.
    const base = garanti.transactions.find((tx) => tx.kind === 'expense')!
    const rows: Transaction[] = [
      { ...base, id: 'p', category: 'dining', amount: toMinor(100), kind: 'expense' },
      { ...base, id: 'r', category: 'dining', amount: toMinor(300), kind: 'refund' },
      { ...base, id: 'q', category: 'market', amount: toMinor(1000), kind: 'expense' },
    ]
    const a = analysisFor(rows)
    expect(a.totals.netSpend).toBe(toMinor(800))
    expect(a.totals.unallocatedRefunds).toBe(toMinor(200))
    expect(a.categories.reduce((s, c) => s + c.total, 0) - a.totals.unallocatedRefunds).toBe(a.totals.netSpend)
  })

  it('holds when a refund has no purchase at all in its category (a chip-para credit)', () => {
    const a = analysisFor(akbank.transactions)
    const sum = a.categories.reduce((s, c) => s + c.total, 0)
    expect(sum - a.totals.unallocatedRefunds).toBe(a.totals.netSpend)
    expect(a.totals.unallocatedRefunds).toBeGreaterThan(0)
  })
})

describe('the headline adds up to the statements, and the statements to the bank\'s debt', () => {
  const a = analysisFor(transactions)
  const { ledgers, totals } = buildLedgers(statements, transactions)

  it('net spending is the sum of the statements\' charges', () => {
    expect(a.totals.netSpend).toBe(totals.charges)
  })

  it('and each statement closes: previous balance − payments + charges = printed debt', () => {
    for (const ledger of ledgers) {
      expect(ledger.previousBalance! - ledger.payments + ledger.charges).toBe(ledger.printedDebt)
    }
  })

  it('a single card is exactly one statement\'s figures', () => {
    const one = analysisFor(garanti.transactions)
    const { ledgers: gl } = buildLedgers([garanti.statement], transactions)
    expect(one.totals.netSpend).toBe(gl[0].charges)
  })
})

describe('choosing a month and a card names exactly one statement', () => {
  // The same card two months running, as instalmentStatement builds them.
  const may = imported(instalmentStatement(1), 'i1')
  const jun = imported(instalmentStatement(2), 'i2')
  const all = [garanti, akbank, may, jun]
  const allStatements = all.map((x) => x.statement)
  const allTx = all.flatMap((x) => x.transactions)
  const months = buildStatementMonthIndex(allStatements)

  it('narrows by card', () => {
    const picked = statementsInScope(allStatements, { month: 'all', cards: [cardOf(akbank.statement)] })
    expect(picked.every((s) => cardOf(s) === cardOf(akbank.statement))).toBe(true)
    expect(picked.length).toBeGreaterThanOrEqual(1)
  })

  it('narrows by month and card together', () => {
    const month = months.get(garanti.statement.id)!
    const card = cardOf(garanti.statement)
    const picked = statementsInScope(allStatements, { month, cards: [card] })
    expect(picked.map((s) => s.id)).toContain(garanti.statement.id)
    expect(picked.every((s) => months.get(s.id) === month && cardOf(s) === card)).toBe(true)
  })

  it('the rows the filter keeps are exactly the rows of the statements in scope', () => {
    const month = months.get(garanti.statement.id)!
    const card = cardOf(garanti.statement)
    const filters = { ...emptyFilters, month, cards: [card] }
    const kept = applyFilters(allTx, filters, { periodGrouping: 'statement', statements: allStatements })
    const inScope = statementsInScope(allStatements, filters)
    const ids = new Set(inScope.map((s) => s.id))

    expect(kept.length).toBeGreaterThan(0)
    expect(kept.every((tx) => tx.statementId && ids.has(tx.statementId))).toBe(true)
    // …and nothing of those statements was left out.
    const expected = allTx.filter((tx) => tx.statementId && ids.has(tx.statementId) && periodMonthOf(tx, 'statement', months) === month)
    expect(kept.length).toBe(expected.length)
  })

  it('and the filtered spending equals those statements\' charges', () => {
    const month = months.get(garanti.statement.id)!
    const card = cardOf(garanti.statement)
    const filters = { ...emptyFilters, month, cards: [card] }
    const kept = applyFilters(allTx, filters, { periodGrouping: 'statement', statements: allStatements })
    const { totals } = buildLedgers(statementsInScope(allStatements, filters), allTx)
    expect(analysisFor(kept).totals.netSpend).toBe(totals.charges)
  })

  it('excludes hand-entered rows once a card is chosen', () => {
    const manual: Transaction = {
      ...garanti.transactions[0], id: 'm', statementId: undefined, source: 'manual', bank: 'Manuel', accountLabel: 'Manuel kayıt',
    }
    const kept = applyFilters(
      [...allTx, manual],
      { ...emptyFilters, cards: [cardOf(garanti.statement)] },
      { periodGrouping: 'statement', statements: allStatements },
    )
    expect(kept.some((tx) => tx.id === 'm')).toBe(false)
  })
})

describe('the span being analysed', () => {
  it('is the span of the spending, not the day last month was paid', () => {
    const base = garanti.transactions.find((tx) => tx.kind === 'expense')!
    const rows: Transaction[] = [
      { ...base, id: 'pay', kind: 'payment', date: '2026-08-28', amount: toMinor(500), category: 'other' },
      { ...base, id: 'a', date: '2026-09-02', amount: toMinor(100), kind: 'expense', installment: null },
      { ...base, id: 'b', date: '2026-09-20', amount: toMinor(100), kind: 'expense', installment: null },
    ]
    const a = analysisFor(rows)
    expect(a.meta.from).toBe('2026-09-02')
    expect(a.meta.to).toBe('2026-09-20')
  })

  it('still has a span when payments are all there is', () => {
    const base = garanti.transactions.find((tx) => tx.kind === 'expense')!
    const a = analysisFor([{ ...base, id: 'pay', kind: 'payment', date: '2026-08-28', amount: toMinor(500), category: 'other' }])
    expect(a.meta.from).toBe('2026-08-28')
  })
})
