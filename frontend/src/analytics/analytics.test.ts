import { describe, expect, it } from 'vitest'
import { detectRecurring } from './recurring'
import { buildCommitmentLadder, buildInstallmentPlans } from './commitments'
import { analyze } from './engine'
import { normalizeMerchant } from '../core/text'
import { toMinor } from '../core/money'
import type { Transaction, TxKind } from '../domain/types'
import type { CategoryId } from '../domain/categories'
import { defaultProfile } from '../store/state'

let seq = 0

function tx(
  date: string,
  description: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  const merchant = normalizeMerchant(description)
  return {
    id: `t${seq++}`,
    date,
    description,
    merchant,
    amount: toMinor(amount),
    kind: 'expense' as TxKind,
    category: 'other' as CategoryId,
    categoryLocked: false,
    bank: 'Test',
    accountLabel: 'Test',
    installment: null,
    source: 'statement',
    ...extra,
  }
}

function group(transactions: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const bucket = map.get(t.merchant)
    if (bucket) bucket.push(t)
    else map.set(t.merchant, [t])
  }
  return map
}

describe('recurring detection', () => {
  it('accepts a steady monthly charge', () => {
    const txs = [
      tx('2026-05-03', 'NETFLIX', 229.99, { category: 'subscription' }),
      tx('2026-06-03', 'NETFLIX', 229.99, { category: 'subscription' }),
      tx('2026-07-04', 'NETFLIX', 229.99, { category: 'subscription' }),
      tx('2026-08-03', 'NETFLIX', 279.99, { category: 'subscription' }),
    ]
    const [found] = detectRecurring(group(txs), { asOf: '2026-08-20' })

    expect(found).toBeDefined()
    expect(found.cadence).toBe('monthly')
    expect(found.occurrences).toBe(4)
    expect(found.status).toBe('active')
    expect(found.monthlyEquivalent).toBeGreaterThan(toMinor(220))
    // 229.99 -> 279.99 is a ~21.7% rise.
    expect(found.priceChangePct).toBeGreaterThan(20)
  })

  it('rejects irregular shopping at the same merchant', () => {
    const txs = [
      tx('2026-05-02', 'MIGROS', 412.4),
      tx('2026-05-06', 'MIGROS', 88.9),
      tx('2026-06-19', 'MIGROS', 1240.15),
      tx('2026-07-02', 'MIGROS', 220),
      tx('2026-07-28', 'MIGROS', 905.5),
    ]
    expect(detectRecurring(group(txs), { asOf: '2026-08-01' })).toHaveLength(0)
  })

  it('marks a stopped subscription as lapsed', () => {
    const txs = [
      tx('2026-01-10', 'EXXEN', 150, { category: 'subscription' }),
      tx('2026-02-10', 'EXXEN', 150, { category: 'subscription' }),
      tx('2026-03-10', 'EXXEN', 150, { category: 'subscription' }),
    ]
    const [found] = detectRecurring(group(txs), { asOf: '2026-08-01' })
    expect(found.status).toBe('lapsed')
  })

  it('rejects a steady rhythm with unsteady amounts', () => {
    // Weekly fuel stops: the cadence is regular, the amount is not. Treating
    // this as a fixed commitment inflated the committed-outflow figure.
    const txs = [
      tx('2026-07-01', 'OPET AKARYAKIT', 940),
      tx('2026-07-08', 'OPET AKARYAKIT', 2380),
      tx('2026-07-15', 'OPET AKARYAKIT', 1180),
      tx('2026-07-22', 'OPET AKARYAKIT', 2610),
      tx('2026-07-29', 'OPET AKARYAKIT', 1425),
    ]
    expect(detectRecurring(group(txs), { asOf: '2026-08-01' })).toHaveLength(0)
  })

  it('does not turn two same-priced visits into a weekly commitment', () => {
    // Seen on a real statement: two grocery runs seven days apart at a similar
    // amount were reported as a weekly subscription costing five figures a year.
    const txs = [
      tx('2026-08-18', 'SARDUNYA GIDA', 390, { category: 'market' }),
      tx('2026-08-25', 'SARDUNYA GIDA', 400, { category: 'market' }),
    ]
    expect(detectRecurring(group(txs), { asOf: '2026-08-30' })).toHaveLength(0)
  })

  it('caps confidence when only two charges support the pattern', () => {
    const txs = [
      tx('2026-06-01', 'SPOTIFY', 99.99, { category: 'subscription' }),
      tx('2026-07-01', 'SPOTIFY', 99.99, { category: 'subscription' }),
    ]
    const found = detectRecurring(group(txs), { asOf: '2026-07-10' })
    expect(found[0]?.confidence).toBeLessThanOrEqual(0.62)
  })

  it('normalises a weekly charge to a monthly figure', () => {
    const txs = [
      tx('2026-07-01', 'HAFTALIK SERVIS', 100),
      tx('2026-07-08', 'HAFTALIK SERVIS', 100),
      tx('2026-07-15', 'HAFTALIK SERVIS', 100),
      tx('2026-07-22', 'HAFTALIK SERVIS', 100),
    ]
    const [found] = detectRecurring(group(txs), { asOf: '2026-07-25' })
    expect(found.cadence).toBe('weekly')
    // 100 every 7 days ≈ 434.86 per calendar month.
    expect(found.monthlyEquivalent).toBeGreaterThan(toMinor(420))
    expect(found.monthlyEquivalent).toBeLessThan(toMinor(450))
  })
})

describe('instalment plans', () => {
  const txs = [
    tx('2026-07-05', 'TRENDYOL.COM', 355, {
      installment: { current: 2, total: 3, principal: toMinor(1065) },
    }),
  ]

  it('derives the plan window from the billed instalment', () => {
    const [plan] = buildInstallmentPlans(txs, '2026-07')
    expect(plan.startMonth).toBe('2026-06')
    expect(plan.endMonth).toBe('2026-08')
    expect(plan.remainingCount).toBe(1)
    expect(plan.remainingAmount).toBe(toMinor(355))
  })

  it('never schedules an instalment in a month already billed', () => {
    const plans = buildInstallmentPlans(txs, '2026-07')
    const ladder = buildCommitmentLadder(plans, [], { fromMonth: '2026-08', horizonMonths: 3 })

    expect(ladder[0]).toMatchObject({ month: '2026-08', installments: toMinor(355) })
    expect(ladder[1].installments).toBe(0)
    expect(ladder[2].installments).toBe(0)
  })

  it('drops instalments whose due month has already passed within the data', () => {
    // Last seen as 2/3 in July; the data runs to the end of August without a
    // third instalment, so there is nothing left to owe.
    const plans = buildInstallmentPlans(txs, '2026-08')
    expect(plans[0].remainingCount).toBe(0)
    expect(plans[0].remainingAmount).toBe(0)
    expect(plans[0].paidCount).toBe(3)
  })

  it('keeps the outstanding total equal to the ladder', () => {
    const plans = buildInstallmentPlans(txs, '2026-07')
    const ladder = buildCommitmentLadder(plans, [], { fromMonth: '2026-08', horizonMonths: 12 })

    const outstanding = plans.reduce((s, p) => s + p.remainingAmount, 0)
    const scheduled = ladder.reduce((s, m) => s + m.installments, 0)
    expect(scheduled).toBe(outstanding)
  })

  it('ignores single-instalment purchases', () => {
    expect(
      buildInstallmentPlans(
        [tx('2026-07-05', 'X', 100, { installment: { current: 1, total: 1 } })],
        '2026-07',
      ),
    ).toHaveLength(0)
  })
})

describe('engine', () => {
  const txs = [
    tx('2026-07-02', 'MIGROS', 1000, { category: 'market' }),
    tx('2026-07-15', 'TRENDYOL.COM', 500, { category: 'ecommerce' }),
    tx('2026-07-20', 'IADE TRENDYOL', 100, { category: 'ecommerce', kind: 'refund' }),
    tx('2026-07-25', 'KART BORCU', 1200, { kind: 'payment' }),
    tx('2026-07-28', 'MAAS', 40000, { kind: 'income' }),
  ]

  const result = analyze(txs, defaultProfile)

  it('separates the four transaction kinds', () => {
    expect(result.totals.spend).toBe(toMinor(1500))
    expect(result.totals.refunds).toBe(toMinor(100))
    expect(result.totals.netSpend).toBe(toMinor(1400))
    expect(result.totals.income).toBe(toMinor(40000))
    expect(result.totals.payments).toBe(toMinor(1200))
  })

  it('keeps card payments out of the categories, and the categories add up to the headline', () => {
    const total = result.categories.reduce((s, c) => s + c.total, 0)
    // ₺1.500 spent − ₺100 refunded; the ₺1.200 card payment is in neither.
    expect(total).toBe(result.totals.netSpend)
    expect(total - result.totals.unallocatedRefunds).toBe(result.totals.netSpend)
  })

  it('takes a refund off the category it was spent in', () => {
    const shop = result.categories.find((c) => c.id === 'ecommerce')
    expect(shop).toMatchObject({ gross: toMinor(500), refunded: toMinor(100), total: toMinor(400) })
  })

  it('gap-fills the daily series', () => {
    expect(result.daily).toHaveLength(27) // 2 July to 28 July inclusive
    expect(result.daily[0].date).toBe('2026-07-02')
    expect(result.daily[result.daily.length - 1].date).toBe('2026-07-28')
  })

  it('reports classification coverage', () => {
    expect(result.meta.classifiedShare).toBe(1)
  })

  it('handles an empty portfolio without throwing', () => {
    const empty = analyze([], defaultProfile)
    expect(empty.totals.spend).toBe(0)
    expect(empty.daily).toEqual([])
    expect(empty.health.score).toBeGreaterThanOrEqual(0)
  })
})

describe('month bucketing', () => {
  // A statement running 27 Jul – 26 Aug is "the August statement", so under
  // statement grouping its July charges belong to August too.
  const txs = [
    tx('2026-07-29', 'MIGROS', 300, { category: 'market' }),
    tx('2026-08-10', 'MIGROS', 700, { category: 'market' }),
  ]

  it('buckets by calendar month by default', () => {
    const result = analyze(txs, defaultProfile)
    expect(result.monthly.map((m) => m.month)).toEqual(['2026-07', '2026-08'])
    expect(result.monthly[0].spend).toBe(toMinor(300))
  })

  it('follows the injected mapping so charts agree with the period chips', () => {
    const result = analyze(txs, defaultProfile, {
      monthOfTx: () => '2026-08',
      key: 'statement:2026-08',
    })

    expect(result.monthly.map((m) => m.month)).toEqual(['2026-08'])
    expect(result.monthly[0].spend).toBe(toMinor(1000))
    // "Month end" is a calendar idea; under a custom mapping it stands down
    // rather than extrapolating to a day the period does not end on.
    expect(result.trend.projectedMonthEnd).toBeNull()
  })
})

describe('savings basis', () => {
  it('falls back to the profile income for months with no income rows', () => {
    const result = analyze([tx('2026-07-10', 'MIGROS', 1000, { category: 'market' })], {
      ...defaultProfile,
      monthlyIncome: toMinor(30_000),
    })
    const july = result.monthly[0]

    expect(july.income).toBe(0) // no salary row on a card statement
    expect(july.incomeAssumed).toBe(true)
    expect(july.savings).toBe(toMinor(29_000))
    expect(july.covered).toBe(true)
  })

  it('reports a period cash result that agrees with the goal, not with the raw rows', () => {
    const result = analyze([tx('2026-07-10', 'MIGROS', 1000, { category: 'market' })], {
      ...defaultProfile,
      monthlyIncome: toMinor(30_000),
    })

    // `net` reads the rows and says −1.000; `savings` uses the same basis the
    // savings goal does and says +29.000. The overview and the goal tile used
    // to show these two side by side and contradict each other.
    expect(result.totals.net).toBe(toMinor(-1000))
    expect(result.totals.savings).toBe(toMinor(29_000))
    expect(result.totals.incomeAssumed).toBe(true)
  })

  it('marks a month holding only income as uncovered, and never projects from it', () => {
    const result = analyze(
      [
        tx('2026-07-10', 'MIGROS', 1000, { category: 'market' }),
        tx('2026-08-03', 'MAAS', 30_000, { kind: 'income' }),
      ],
      defaultProfile,
    )
    const august = result.monthly[1]

    expect(august.covered).toBe(false)
    expect(result.trend.projectedMonthEnd).toBeNull()
  })
})
