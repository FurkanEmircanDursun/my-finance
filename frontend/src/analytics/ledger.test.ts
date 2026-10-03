import { describe, expect, it } from 'vitest'
import { buildLedger, buildLedgers } from './ledger'
import { parseStatementText } from '../ingest/pipeline'
import { AKBANK_COLUMNS, GARANTI_COLUMNS } from '../ingest/fixtures'
import { toMinor } from '../core/money'
import type { Statement, Transaction } from '../domain/types'

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

describe('a statement laid out as the bank lays it out', () => {
  const ledger = buildLedger(garanti.statement, garanti.transactions)

  it('closes: debt = previous balance − payments + charges, to the kuruş', () => {
    expect(ledger.previousBalance).toBe(toMinor(500))
    expect(ledger.payments).toBe(toMinor(500))
    expect(ledger.printedDebt).toBe(toMinor(1280))
    expect(ledger.charges).toBe(toMinor(1280))
    expect(ledger.delta).toBe(0)
    expect(ledger.status).toBe('match')
    // The identity itself, spelled out.
    expect(ledger.previousBalance! - ledger.payments + ledger.charges).toBe(ledger.printedDebt)
  })

  it('sections add up to the charges, with refunds coming off', () => {
    const counted = ledger.sections.reduce((sum, s) => sum + s.sign * s.total, 0)
    expect(counted).toBe(ledger.charges)
    expect(ledger.sections.find((s) => s.id === 'refunds')?.total).toBe(toMinor(50))
    expect(ledger.sections.find((s) => s.id === 'payments')?.total).toBe(toMinor(500))
  })

  it('every row of the statement is in exactly one section', () => {
    const placed = ledger.sections.reduce((sum, s) => sum + s.count, 0)
    expect(placed).toBe(garanti.transactions.length)
  })

  it('lists each section oldest first', () => {
    for (const section of ledger.sections) {
      const dates = section.rows.map((r) => r.date)
      expect(dates).toEqual([...dates].sort())
    }
  })
})

describe('an instalment and a chip-para payment', () => {
  const ledger = buildLedger(akbank.statement, akbank.transactions)

  it('puts the instalment in its own section and the chip-para credit among refunds', () => {
    expect(ledger.sections.find((s) => s.id === 'instalments')?.total).toBe(toMinor(300))
    expect(ledger.sections.find((s) => s.id === 'refunds')?.total).toBe(toMinor(120))
  })

  it('still closes', () => {
    expect(ledger.charges).toBe(toMinor(1300))
    expect(ledger.delta).toBe(0)
  })
})

describe('what the ledger notices that the import could not', () => {
  it('stops matching the moment a line is deleted', () => {
    const rows = garanti.transactions.filter((tx) => !tx.description.includes('KUAFOR'))
    const ledger = buildLedger(garanti.statement, rows)
    expect(ledger.status).toBe('mismatch')
    expect(ledger.delta).toBe(-toMinor(80))
  })

  it('says "unverified" when the cover printed nothing to compare with', () => {
    const bare: Statement = { ...garanti.statement, summary: undefined, reconciliation: undefined }
    const ledger = buildLedger(bare, garanti.transactions)
    expect(ledger.status).toBe('unverified')
    expect(ledger.delta).toBeNull()
  })

  it('falls back to the stored check for data from before cover summaries were kept', () => {
    const old: Statement = { ...garanti.statement, summary: undefined }
    expect(buildLedger(old, garanti.transactions).status).toBe('match')
  })

  it('ignores rows that belong to another statement and hand-entered rows', () => {
    const stranger = { ...akbank.transactions[0] } as Transaction
    const manual = { ...akbank.transactions[1], statementId: undefined } as Transaction
    const ledger = buildLedger(garanti.statement, [...garanti.transactions, stranger, manual])
    expect(ledger.rowCount).toBe(garanti.transactions.length)
    expect(ledger.status).toBe('match')
  })
})

describe('several statements together', () => {
  const { ledgers, totals } = buildLedgers(
    [garanti.statement, akbank.statement],
    [...garanti.transactions, ...akbank.transactions],
  )

  it('adds charges and debts across cards', () => {
    expect(ledgers).toHaveLength(2)
    expect(totals.charges).toBe(toMinor(1280) + toMinor(1300))
    expect(totals.printedDebt).toBe(toMinor(1280) + toMinor(1300))
    expect(totals.status).toBe('match')
  })

  it('reports the worst status of the lot', () => {
    const broken = buildLedgers(
      [garanti.statement, akbank.statement],
      [...garanti.transactions.slice(1), ...akbank.transactions],
    )
    expect(broken.totals.status).toBe('mismatch')
  })

  it('is empty-safe', () => {
    expect(buildLedgers([], []).totals).toMatchObject({ charges: 0, printedDebt: null, status: null })
  })
})
