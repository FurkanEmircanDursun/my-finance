import { describe, expect, it } from 'vitest'
import { buildUpcomingPayments } from './upcoming'
import { toMinor } from '../core/money'
import type { RecurringPayment } from './types'
import { emptySummary, type Statement } from '../domain/types'

function recurring(overrides: Partial<RecurringPayment> = {}): RecurringPayment {
  return {
    merchant: 'netflix',
    label: 'Netflix',
    category: 'subscription',
    cadence: 'monthly',
    cadenceLabel: 'Aylık',
    intervalDays: 30,
    occurrences: 4,
    lastAmount: toMinor(230),
    medianAmount: toMinor(230),
    monthlyEquivalent: toMinor(230),
    annualCost: toMinor(2760),
    firstSeen: '2026-05-03',
    lastSeen: '2026-08-03',
    nextExpected: '2026-09-02',
    priceChangePct: null,
    confidence: 0.9,
    status: 'active',
    transactionIds: [],
    ...overrides,
  }
}

function statement(overrides: Partial<Statement> = {}): Statement {
  return {
    id: 's1',
    label: 'Akbank Axess · Ağustos 2026',
    fileName: 'a.pdf',
    bank: 'Akbank',
    transactionCount: 40,
    skippedCount: 0,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-28',
    dueDate: '2026-09-07',
    importedAt: 0,
    engine: 'pdf-text',
    ...overrides,
  }
}

const TODAY = '2026-09-01'

describe('buildUpcomingPayments', () => {
  it('lists an active recurring payment landing within the horizon', () => {
    const out = buildUpcomingPayments([recurring()], [], TODAY)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ label: 'Netflix', amount: toMinor(230), kind: 'recurring', daysUntil: 1 })
  })

  it('excludes a lapsed recurring payment', () => {
    const out = buildUpcomingPayments([recurring({ status: 'lapsed' })], [], TODAY)
    expect(out).toHaveLength(0)
  })

  it('lists a statement due date with no amount when the cover printed none', () => {
    // An import that predates the cover summary: the date is known, the debt is not.
    const out = buildUpcomingPayments([], [statement()], TODAY)
    expect(out).toEqual([
      {
        date: '2026-09-07', label: 'Akbank Axess · Ağustos 2026', amount: null, minimum: null,
        kind: 'statement', daysUntil: 6,
      },
    ])
  })

  it("puts the statement's printed debt and minimum payment on its due date", () => {
    const out = buildUpcomingPayments(
      [],
      [statement({ summary: { ...emptySummary(), totalDebt: toMinor(15_309.58), minPayment: toMinor(6_123.84) } })],
      TODAY,
    )
    expect(out[0]).toMatchObject({ amount: toMinor(15_309.58), minimum: toMinor(6_123.84), kind: 'statement' })
  })

  it('drops a statement with no due date on file', () => {
    const out = buildUpcomingPayments([], [statement({ dueDate: null })], TODAY)
    expect(out).toHaveLength(0)
  })

  it('excludes anything already due today or in the past', () => {
    const out = buildUpcomingPayments(
      [recurring({ nextExpected: TODAY })],
      [statement({ dueDate: '2026-08-20' })],
      TODAY,
    )
    expect(out).toHaveLength(0)
  })

  it('excludes anything beyond the horizon', () => {
    const out = buildUpcomingPayments([recurring({ nextExpected: '2026-12-01' })], [], TODAY, 45)
    expect(out).toHaveLength(0)
  })

  it('merges both sources into one chronological list', () => {
    const out = buildUpcomingPayments(
      [recurring({ nextExpected: '2026-09-10' })],
      [statement({ dueDate: '2026-09-07' })],
      TODAY,
    )
    expect(out.map((p) => p.kind)).toEqual(['statement', 'recurring'])
  })
})
