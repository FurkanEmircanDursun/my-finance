import { describe, expect, it } from 'vitest'
import { garantiAdapter } from './banks/garanti'
import { akbankAdapter } from './banks/akbank'
import { parseStatementText } from './pipeline'
import { assignIds, descriptionKey, identityKey } from './identity'
import { reconcile } from './reconcile'
import { emptySummary } from '../domain/types'
import { toMinor } from '../core/money'
import { AKBANK_COLUMNS, GARANTI_COLUMNS, GARANTI_FIRST, instalmentStatement } from './fixtures'

const parse = (text: string, engine = 'pdf-text') => parseStatementText(text, { rules: [], engine, fileName: 'x.pdf' })

/* ── Garanti ──────────────────────────────────────────────────────────────── */

describe('garanti, with column information', () => {
  const out = garantiAdapter.parse(GARANTI_COLUMNS)

  it('does not count a bonus-only row as spending', () => {
    // 3.000 bonus points are not a ₺3.000 purchase. A few of these put thousands
    // of lira of phantom spend on a real statement.
    expect(out.rows.some((r) => /FATURA BONUS/.test(r.description))).toBe(false)
  })

  it('keeps what it set aside, with the reason', () => {
    expect(out.ignored).toEqual([
      expect.objectContaining({ description: 'OTOMATİK FATURA BONUS', amount: toMinor(3000), reason: 'reward-earned' }),
      expect.objectContaining({ description: 'BONUS BEDAVA ALIŞVERİŞ', amount: toMinor(36.5), reason: 'reward-spent' }),
    ])
  })

  it('reads the billed amount whichever column the bonus sits in, and keeps the bonus as a detail', () => {
    const uber = out.rows.find((r) => r.description.includes('UBER'))
    expect(uber).toMatchObject({ amount: toMinor(600), kind: 'expense', reward: toMinor(0.08) })
  })

  it('treats a trailing minus on the bonus of a refund as a clawback, not an award', () => {
    const refund = out.rows.find((r) => r.description.includes('MİGROS HEMEN'))
    expect(refund).toMatchObject({ kind: 'refund', amount: toMinor(50) })
    expect(refund?.reward).toBeUndefined()
  })

  it('clears the section hint at a heading it does not know', () => {
    // "Süpermarket" sets one; "Kuaför" is not in the table. The old hint must
    // not carry over onto a row that was never in that section.
    expect(out.rows.find((r) => r.description.includes('YEREL'))?.categoryHint).toBe('market')
    expect(out.rows.find((r) => r.description.includes('KUAFOR'))?.categoryHint).toBeUndefined()
  })

  it('starts the period the day after the previous cut date, across a line break', () => {
    expect(out.periodStart).toBe('2026-08-31')
    expect(out.periodEnd).toBe('2026-09-28')
    expect(out.dueDate).toBe('2026-10-08')
  })

  it('reads the cover', () => {
    expect(out.summary).toMatchObject({
      totalDebt: toMinor(1280),
      previousBalance: toMinor(500),
      minPayment: toMinor(480),
      creditLimit: toMinor(50_000),
      interestMonthly: 3.75,
      previousCutDate: '2026-08-30',
      nextCutDate: '2026-10-30',
      nextDueDate: '2026-11-09',
      loyalty: { programme: 'Bonus', earned: toMinor(3010), spent: toMinor(36.5), balance: toMinor(12.34) },
    })
  })
})

describe('garanti, text with no column information', () => {
  const text = `
GARANTİ BBVA BONUS PLATINUM EKSTRE
Hesap Kesim Tarihi 28 Eylül 2026
05 Eylül 2026 OTOMATİK FATURA BONUS 3.000,00
09 Eylül 2026 UBER EATS YEMEK 0,08 261,00
12 Eylül 2026 YEREL MARKET 100,00
`.trim()

  it('falls back to wording: a row ending in BONUS is a loyalty entry', () => {
    const out = garantiAdapter.parse(text)
    expect(out.rows.map((r) => r.description)).toEqual(['UBER EATS YEMEK', 'YEREL MARKET'])
    expect(out.ignored).toHaveLength(1)
  })

  it('and still reads "bonus, then billed" when two numbers close the row', () => {
    const uber = garantiAdapter.parse(text).rows.find((r) => r.description.includes('UBER'))
    expect(uber?.amount).toBe(toMinor(261))
  })

  it('trusts the columns over the wording when the document has them', () => {
    // A merchant whose name happens to end in BONUS, with its amount plainly in
    // the billed column, is a purchase — the wording rule must stand down.
    const mixed = `${GARANTI_COLUMNS}\n13 Eylül 2026 CAGRI BONUS 150,00`
    const out = garantiAdapter.parse(mixed)
    expect(out.rows.find((r) => r.description === 'CAGRI BONUS')).toMatchObject({ amount: toMinor(150) })
  })
})

/* ── Akbank ───────────────────────────────────────────────────────────────── */

describe('akbank, with column information', () => {
  const out = akbankAdapter.parse(AKBANK_COLUMNS)

  it('sets aside a chip-para award because of its column, not its wording', () => {
    expect(out.ignored).toEqual([
      expect.objectContaining({ description: 'Mobilin Akbanklısı Youtube Kampanyası', reason: 'reward-earned' }),
    ])
  })

  it('keeps a chip-para payment as the credit it is, ignoring its loyalty copy', () => {
    const credit = out.rows.find((r) => r.description.startsWith('Chip-Para'))
    expect(credit).toMatchObject({ kind: 'refund', amount: toMinor(120) })
  })

  it('reads the original foreign price and strips the note from the description', () => {
    const steam = out.rows.find((r) => r.description.startsWith('STEAMGAMES'))
    expect(steam?.foreign).toEqual({ amount: 399, currency: 'USD' })
    expect(steam?.description).toBe('STEAMGAMES.COM 4259522 BELLEVUE USA')
    expect(steam?.amount).toBe(toMinor(120))
  })

  it("keeps the bank's own count of instalments still to come", () => {
    const plan = out.rows.find((r) => r.description.startsWith('TKPAY'))
    expect(plan?.installment).toEqual({
      current: 2, total: 3, principal: toMinor(900), remaining: { count: 1, amount: toMinor(300) },
    })
  })

  it("takes this statement's due date, not the next cycle's", () => {
    expect(out.dueDate).toBe('2026-10-06')
    expect(out.summary.nextDueDate).toBe('2026-11-05')
    expect(out.periodEnd).toBe('2026-09-26')
  })

  it('reads the cover, tolerating mojibake in the labels', () => {
    expect(out.summary).toMatchObject({
      totalDebt: toMinor(1300),
      previousBalance: toMinor(500),
      minPayment: toMinor(520),
      creditLimit: toMinor(100_000),
      availableLimit: toMinor(90_000),
      interestMonthly: 3.25,
      nextCutDate: '2026-10-26',
    })
  })
})

/* ── The pipeline, and the check ──────────────────────────────────────────── */

describe('reconciliation against the cover', () => {
  it('balances a Garanti statement to the kuruş', () => {
    expect(parse(GARANTI_COLUMNS).reconciliation).toMatchObject({
      status: 'match', delta: 0, parsedCharges: toMinor(1280), expectedCharges: toMinor(1280),
    })
  })

  it('balances an Akbank statement to the kuruş', () => {
    expect(parse(AKBANK_COLUMNS, 'pdf-ebcdic').reconciliation).toMatchObject({
      status: 'match', delta: 0, parsedCharges: toMinor(1300), expectedCharges: toMinor(1300),
    })
  })

  it('says exactly how wrong a parse is when a loyalty row is counted as spending', () => {
    // The same Garanti statement with the column information stripped *and* the
    // wording rule defeated — the failure the check exists to catch.
    const blind = GARANTI_COLUMNS.replace(/[⟦⟧]/g, '').replace('OTOMATİK FATURA BONUS', 'OTOMATİK FATURA ÖDÜL')
    const result = parse(blind)
    expect(result.reconciliation.status).toBe('mismatch')
    expect(result.reconciliation.delta).toBe(toMinor(3000))
  })

  it("checks a card's first statement, which prints no balance carried forward", () => {
    // No "devir" row exists to read the previous balance from; the cover's own
    // ledger line says it was nothing. Without that this was merely "unverified".
    const result = parse(GARANTI_FIRST)
    expect(result.summary.previousBalance).toBe(0)
    expect(result.reconciliation).toMatchObject({
      status: 'match', delta: 0, previousBalance: 0, parsedCharges: toMinor(1000), expectedCharges: toMinor(1000),
    })
  })

  it('is unverified, not wrong, when the cover prints nothing to compare against', () => {
    const bare = 'GARANTİ BBVA BONUS\n05 Eylül 2026 A 100,00\n06 Eylül 2026 B 100,00\n07 Eylül 2026 C 100,00'
    expect(parse(bare).reconciliation.status).toBe('unverified')
  })
})

describe('what the pipeline attaches to a row', () => {
  it('gives an instalment row the cut date as the day it was billed', () => {
    const rows = parse(instalmentStatement(2), 'pdf-ebcdic').transactions
    const plan = rows.find((t) => t.installment)
    // Printed 05/05, billed on the 27/08 statement.
    expect(plan?.date).toBe('2026-05-05')
    expect(plan?.billedOn).toBe('2026-08-27')
    expect(rows.find((t) => t.merchant === 'YEREL MARKET')?.billedOn).toBeUndefined()
  })

  it('puts a purchase and its return under one merchant', () => {
    const text = `${AKBANK_COLUMNS}\n13/09/2026 IYZICO/storytel.com  164.99\n13/09/2026 IYZICO/storytel.com-iade  164.99(-)`
    const rows = parse(text, 'pdf-ebcdic').transactions.filter((t) => t.description.includes('storytel'))
    expect(new Set(rows.map((t) => t.merchant))).toEqual(new Set(['STORYTEL']))
    expect(rows.map((t) => t.kind).sort()).toEqual(['expense', 'refund'])
  })

  it('carries the statement summary onto the result', () => {
    const result = parse(GARANTI_COLUMNS)
    expect(result.summary.totalDebt).toBe(toMinor(1280))
    expect(result.ignored).toHaveLength(2)
    expect(result.accountLabel).toBe('Garanti Bonus Platinum')
  })
})

/* ── Identity ─────────────────────────────────────────────────────────────── */

describe('transaction identity', () => {
  it('keeps the months of one instalment plan apart', () => {
    // Same original date, same amount, same merchant on three statements. Under
    // the old key all three hashed alike and imports 2 and 3 were thrown away.
    const ids = [1, 2, 3].map((n) => parse(instalmentStatement(n as 1 | 2 | 3), 'pdf-ebcdic').transactions.find((t) => t.installment)!.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('gives the same statement the same ids every time', () => {
    const a = parse(GARANTI_COLUMNS).transactions.map((t) => t.id)
    const b = parse(GARANTI_COLUMNS).transactions.map((t) => t.id)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
  })

  const base = {
    bank: 'Akbank', accountLabel: 'Akbank Axess', date: '2026-09-05', amount: 49_900,
    description: 'MONEYPAY MIGROSONE', kind: 'expense' as const, installment: null,
  }

  it('numbers identical charges within a statement, so two are two', () => {
    const [a, b] = assignIds([base, base])
    expect(a).not.toBe(b)
  })

  it('tells the banks apart', () => {
    expect(identityKey({ ...base, bank: 'Garanti BBVA' })).not.toBe(identityKey(base))
  })

  it('tells a purchase from its same-day refund', () => {
    expect(identityKey({ ...base, kind: 'refund' })).not.toBe(identityKey(base))
  })

  it('is blind to the city and branch a bank appends, and to diacritics', () => {
    expect(descriptionKey('TRENDYOL.COM İSTANBUL TR')).toBe(descriptionKey('trendyol.com ISTANBUL TUR'))
    expect(descriptionKey('Ödemeniz için Teşekkürler')).toBe('ODEMENIZICINTESE') // first 16 letters and digits
  })

  it('does not depend on how the merchant normaliser reads the description', () => {
    // The key is frozen on purpose: improving the normaliser must never change
    // the id of a row that is already stored.
    expect(descriptionKey('TTNET5551234567020260889')).toBe('TTNET55512345670')
  })
})

describe('reconcile()', () => {
  const summary = { ...emptySummary(), totalDebt: 100_000, previousBalance: 50_000 }

  it('matches when charges equal debt − previous balance + payments', () => {
    const rows = [
      { kind: 'expense' as const, amount: 70_000 },
      { kind: 'payment' as const, amount: 20_000 },
    ]
    // debt 1.000 = previous 500 − paid 200 + charges 700
    expect(reconcile(rows, summary)).toMatchObject({ status: 'match', expectedCharges: 70_000, delta: 0 })
  })

  it('reports a positive delta when too much was read', () => {
    expect(reconcile([{ kind: 'expense', amount: 80_000 }], { ...summary, previousBalance: 0 })).toMatchObject({
      status: 'mismatch', delta: -20_000,
    })
  })

  it('nets refunds against purchases', () => {
    const rows = [
      { kind: 'expense' as const, amount: 100_000 },
      { kind: 'refund' as const, amount: 10_000 },
    ]
    expect(reconcile(rows, { ...summary, previousBalance: 10_000 }).parsedCharges).toBe(90_000)
  })

  it('has nothing to check without both cover figures', () => {
    expect(reconcile([], { ...emptySummary(), totalDebt: 1000 }).status).toBe('unverified')
    expect(reconcile([], emptySummary()).delta).toBeNull()
  })
})
