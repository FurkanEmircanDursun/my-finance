import { describe, expect, it } from 'vitest'
import { buildCommitmentLadder, buildInstallmentPlans } from './commitments'
import { detectRecurring } from './recurring'
import { detectAnomalies, detectDuplicates } from './anomaly'
import { analyze } from './engine'
import { buildInsights } from './insights'
import { normalizeMerchant } from '../core/text'
import { toMinor } from '../core/money'
import { defaultProfile } from '../store/defaults'
import { classify } from '../ingest/categorize'
import type { Transaction, TxKind } from '../domain/types'

let seq = 0
function tx(date: string, description: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: `b${seq++}`,
    date,
    description,
    merchant: normalizeMerchant(description),
    amount: toMinor(amount),
    kind: 'expense' as TxKind,
    category: 'other',
    categoryLocked: false,
    bank: 'Akbank',
    accountLabel: 'Akbank Axess',
    installment: null,
    source: 'statement',
    ...extra,
  }
}

const group = (txs: Transaction[]) => {
  const map = new Map<string, Transaction[]>()
  for (const t of txs) map.set(t.merchant, [...(map.get(t.merchant) ?? []), t])
  return map
}

/* ── Where an instalment plan stands ──────────────────────────────────────── */

describe('instalment plans stand where their statement says', () => {
  // The case that mattered: a flight bought 23 August, its 2nd of 3 instalments billed on
  // the statement that closes 26 September.
  const flight = tx('2026-08-23', 'SKYLINE AIR TRAVEL', 900, {
    installment: { current: 2, total: 3, principal: toMinor(2700), remaining: { count: 1, amount: toMinor(900) } },
    billedOn: '2026-09-26',
    statementId: 'st-sep',
  })
  const septemberStatement = () => '2026-09'

  it('puts the third instalment in the month after the statement that billed the second', () => {
    const plans = buildInstallmentPlans([flight], '2026-09', septemberStatement)
    expect(plans[0]).toMatchObject({ paidCount: 2, totalCount: 3, remainingCount: 1, remainingAmount: toMinor(900) })

    const ladder = buildCommitmentLadder(plans, [], { fromMonth: '2026-10', horizonMonths: 3 })
    expect(ladder[0]).toMatchObject({ month: '2026-10', installments: toMinor(900) })
    expect(ladder[1].installments).toBe(0)
  })

  it('without the statement it would read the purchase date and call the plan finished', () => {
    // Left as a regression note: reading the printed date (August) puts the 2nd
    // instalment in August, so by September the 3rd looks already billed and the whole
    // instalment vanishes from next month's commitments.
    const plans = buildInstallmentPlans([{ ...flight, billedOn: undefined }], '2026-09')
    expect(plans[0].remainingCount).toBe(0)
  })

  it("trusts the bank's own count of instalments still to come", () => {
    const stated = tx('2026-09-13', 'AUDIO LIBRARY', 55, {
      installment: { current: 1, total: 3, remaining: { count: 2, amount: toMinor(54.99) } },
      statementId: 'st-sep',
    })
    const [plan] = buildInstallmentPlans([stated], '2026-09', septemberStatement)
    expect(plan.remainingCount).toBe(2)
    // The bank's remaining instalment (54,99), not the billed one (55,00).
    expect(plan.remainingAmount).toBe(toMinor(54.99) * 2)
    const ladder = buildCommitmentLadder([plan], [], { fromMonth: '2026-10', horizonMonths: 3 })
    expect(ladder[0].installments).toBe(toMinor(54.99))
    expect(ladder[1].installments).toBe(toMinor(54.99))
    expect(ladder[2].installments).toBe(0)
  })

  it('infers the remainder from the plan length when the bank prints none', () => {
    const plain = tx('2026-09-13', 'X SHOP', 100, { installment: { current: 1, total: 4 }, statementId: 'st' })
    expect(buildInstallmentPlans([plain], '2026-09', septemberStatement)[0].remainingCount).toBe(3)
  })

  it('drops a remainder whose months have already gone by in the data', () => {
    const old = tx('2026-06-10', 'OLD SHOP', 100, { installment: { current: 1, total: 3 }, statementId: 'st-jun' })
    const plans = buildInstallmentPlans([old], '2026-09', () => '2026-06')
    expect(plans[0].remainingCount).toBe(0)
  })

  it('anchors the whole analysis to the newest statement month, not the newest printed date', () => {
    const result = analyze(
      [
        flight,
        tx('2026-09-20', 'YEREL MARKET', 100, { statementId: 'st-sep' }),
      ],
      defaultProfile,
      { billedMonthOf: () => '2026-09' },
    )
    expect(result.commitments[0]).toMatchObject({ month: '2026-10', installments: toMinor(900) })
  })
})

/* ── Time-based analysis uses the day a charge was billed ─────────────────── */

describe('an instalment is dated by when it was charged', () => {
  const rows = [
    tx('2026-05-05', 'TRENDYOL', 355, { installment: { current: 3, total: 3 }, billedOn: '2026-09-26' }),
    tx('2026-09-10', 'YEREL MARKET', 200),
  ]
  const result = analyze(rows, defaultProfile)

  it('does not stretch the period back to the purchase date', () => {
    expect(result.meta.from).toBe('2026-09-10')
    expect(result.meta.to).toBe('2026-09-26')
    expect(result.daily[0].date).toBe('2026-09-10')
  })

  it('puts the charge in the month that billed it', () => {
    expect(result.monthly.map((m) => m.month)).toEqual(['2026-09'])
    expect(result.monthly[0].spend).toBe(toMinor(555))
  })
})

/* ── Detectors leave instalments alone ────────────────────────────────────── */

describe('detectors and instalments', () => {
  const plan = (month: string, current: number) =>
    tx(`2026-${month}-05`, 'TRENDYOL.COM', 355, { installment: { current, total: 3 }, category: 'ecommerce' })

  it('does not report an instalment plan as a subscription as well', () => {
    // Equal, regular, monthly — exactly what a subscription looks like. It is
    // already counted once, as a plan; counting it again doubled the ladder.
    const rows = [plan('07', 1), plan('08', 2), plan('09', 3)]
    expect(detectRecurring(group(rows), { asOf: '2026-09-10' })).toHaveLength(0)
  })

  it('does not flag an instalment as an unusual purchase', () => {
    const many = Array.from({ length: 8 }, (_, i) => tx(`2026-09-0${i + 1}`, `SHOP ${i}`, 100, { category: 'dining' }))
    const big = tx('2026-09-09', 'BIG PLAN', 5000, { category: 'dining', installment: { current: 2, total: 3 } })
    const byCategory = new Map([['dining', [...many, big]]])
    expect(detectAnomalies(byCategory, group([...many, big]))).toHaveLength(0)
  })
})

/* ── Double charges ───────────────────────────────────────────────────────── */

describe('possible double charges', () => {
  it('is confident about the same amount twice on one day', () => {
    const rows = [tx('2026-09-10', 'RARE SHOP', 400), tx('2026-09-10', 'RARE SHOP', 400)]
    const [g] = detectDuplicates(group(rows), new Set())
    expect(g).toMatchObject({ spanDays: 0, likelihood: 'high' })
  })

  it('is confident about the next day at a shop that is rarely visited', () => {
    const rows = [tx('2026-09-10', 'RARE SHOP', 400), tx('2026-09-11', 'RARE SHOP', 400)]
    expect(detectDuplicates(group(rows), new Set())[0].likelihood).toBe('high')
  })

  it('treats the same basket a couple of days apart at a shop used constantly as a habit', () => {
    // A real month: a delivery app ordered 13 times, two of them ₺435 two days apart.
    const rows = Array.from({ length: 10 }, (_, i) => tx(`2026-09-${String(i * 2 + 1).padStart(2, '0')}`, 'UBER EATS', 300 + i))
    rows.push(tx('2026-09-15', 'UBER EATS', 435), tx('2026-09-17', 'UBER EATS', 435))
    const [g] = detectDuplicates(group(rows), new Set())
    expect(g).toMatchObject({ spanDays: 2, likelihood: 'low' })
  })

  it('never lets a likely habit lead the findings as "critical"', () => {
    const rows = Array.from({ length: 10 }, (_, i) => tx(`2026-09-${String(i * 2 + 1).padStart(2, '0')}`, 'UBER EATS', 300 + i))
    rows.push(tx('2026-09-15', 'UBER EATS', 435), tx('2026-09-17', 'UBER EATS', 435))
    const insight = analyze(rows, defaultProfile).insights.find((i) => i.id === 'duplicates')
    expect(insight?.severity).toBe('info')
    expect(insight?.weight).toBeLessThan(50)
  })

  it('does flag a same-day repeat, as a warning', () => {
    const rows = [tx('2026-09-10', 'RARE SHOP', 400), tx('2026-09-10', 'RARE SHOP', 400)]
    const insight = analyze(rows, defaultProfile).insights.find((i) => i.id === 'duplicates')
    expect(insight?.severity).toBe('warning')
    expect(insight?.body).toMatch(/aynı gün/)
  })

  it('is exercised by buildInsights directly too', () => {
    const base = analyze([tx('2026-09-10', 'A', 10)], defaultProfile)
    const out = buildInsights({ ...base, duplicates: [] }, defaultProfile)
    expect(out.some((i) => i.id === 'duplicates')).toBe(false)
  })
})

/* ── Merchant keys ────────────────────────────────────────────────────────── */

describe('merchant keys', () => {
  it('drops the invoice number a utility glues onto its name, so the bill can recur', () => {
    // Three months of one internet bill, three different invoice numbers.
    const keys = ['-TTNET5551234567020260731', '-TTNET5551234567020260831', '-TTNET5551234567020260930'].map(normalizeMerchant)
    expect(new Set(keys)).toEqual(new Set(['TTNET']))
  })

  it('does the same for a water bill', () => {
    expect(normalizeMerchant('İSKİFÖ998877665544332211')).toBe('ISKIFO')
  })

  it('keeps store codes that are short enough to be part of the name', () => {
    expect(normalizeMerchant('A101 9923 I353 BAHÇELİEVL')).toBe('A101')
    expect(normalizeMerchant('HERA645KK2')).toBe('HERA645KK2')
  })

  it('files a return under the shop it came from', () => {
    expect(normalizeMerchant('IYZICO/storytel.com-iade')).toBe(normalizeMerchant('IYZICO/storytel.com'))
    expect(normalizeMerchant('MEDİCANA HASTANE KAD İSTANBUL TR-iade')).toBe(normalizeMerchant('MEDİCANA HASTANE KAD İSTANBUL TR'))
    expect(normalizeMerchant('IADE - TRENDYOL.COM')).toBe('TRENDYOL')
  })

  it('recognises a monthly utility once the invoice number is gone', () => {
    const bills = [
      tx('2026-07-16', '-TTNET5551234567020260731', 1250, { category: 'bills' }),
      tx('2026-08-16', '-TTNET5551234567020260831', 1250, { category: 'bills' }),
      tx('2026-09-16', '-TTNET5551234567020260930', 1250, { category: 'bills' }),
    ]
    const [found] = detectRecurring(group(bills), { asOf: '2026-09-20' })
    expect(found).toMatchObject({ label: 'Ttnet', cadence: 'monthly', occurrences: 3, status: 'active' })
  })
})

/* ── Categories net of refunds ────────────────────────────────────────────── */

describe('refunds and the category list', () => {
  const rows = [
    tx('2026-09-02', 'AUDIO LIBRARY', 164.99, { category: 'subscription' }),
    tx('2026-09-03', 'AUDIO LIBRARY', 164.99, { category: 'subscription', kind: 'refund' }),
    tx('2026-09-04', 'MIGROS', 1000, { category: 'market' }),
    tx('2026-09-24', 'CHIP PARA ILE ODEME', 120, { category: 'rewards', kind: 'refund' }),
  ]
  const result = analyze(rows, defaultProfile)

  it('lists a fully returned purchase as nothing', () => {
    expect(result.categories.find((c) => c.id === 'subscription')).toBeUndefined()
    expect(result.merchants.find((m) => m.merchant === 'AUDIO LIBRARY')).toBeUndefined()
  })

  it('shows a credit with no purchase beside it as unallocated rather than as a negative category', () => {
    expect(result.categories.some((c) => c.total < 0)).toBe(false)
    expect(result.totals.unallocatedRefunds).toBe(toMinor(120))
  })

  it('still adds up: categories − unallocated = the headline', () => {
    const sum = result.categories.reduce((s, c) => s + c.total, 0)
    // ₺1.000 of market, minus a ₺120 credit that no category can absorb.
    expect(sum).toBe(toMinor(1000))
    expect(sum - result.totals.unallocatedRefunds).toBe(result.totals.netSpend)
    expect(result.totals.netSpend).toBe(toMinor(880))
  })

  it('shares add up to a whole', () => {
    expect(result.categories.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 6)
  })
})

/* ── What the card costs, and truncated names ─────────────────────────────── */

describe('the card itself', () => {
  const fee = (date: string, description: string, amount: number) =>
    tx(date, description, amount, { category: 'fees' })

  it('names what interest and fees took, once, when it is worth saying', () => {
    const rows = [
      tx('2026-09-02', 'MIGROS', 1000, { category: 'market' }),
      fee('2026-09-05', 'TOPLAM DONEM FAIZI', 675.17),
      fee('2026-09-06', 'UYELIK UCRETI', 271.5),
    ]
    const insight = analyze(rows, defaultProfile).insights.find((i) => i.id === 'card-cost')!
    expect(insight.title).toBe('Faiz ve ücretlere ₺947 gitti')
    expect(insight.severity).toBe('warning')
    expect(insight.body).toMatch(/Toplam Donem Faizi ₺675/)
  })

  it('says nothing about a few lira of fees', () => {
    const rows = [tx('2026-09-02', 'MIGROS', 1000, { category: 'market' }), fee('2026-09-05', 'ISLEM UCRETI', 4)]
    expect(analyze(rows, defaultProfile).insights.some((i) => i.id === 'card-cost')).toBe(false)
  })

  it('does not call an interest charge an unusual purchase', () => {
    const fees = [10, 12, 11, 9, 13, 10, 400].map((a, i) => fee(`2026-09-0${i + 1}`, `FEE ${i}`, a))
    const byCategory = new Map([['fees', fees]])
    expect(detectAnomalies(byCategory, group(fees))).toHaveLength(0)
  })
})

describe('names a bank truncates', () => {
  it('keeps the words around a lone trailing fragment', () => {
    expect(normalizeMerchant('1022 İSTANBUL ZİVERBEY MA')).toBe('ISTANBUL ZIVERBEY MA')
  })

  it('does not disturb a short brand at the start of the line', () => {
    expect(normalizeMerchant('BP ISTANBUL TUR')).toBe('BP')
  })

  it('files a truncated "mini market" under Market', () => {
    const rows = [tx('2026-09-02', 'VEZİRODLU ET MİNİ MA İSTANBUL TR', 300)]
    const { categories } = analyze(rows.map((r) => ({ ...r, category: classify(r.description, r.merchant) })), defaultProfile)
    expect(categories[0].id).toBe('market')
  })
})
