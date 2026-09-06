import { describe, expect, it } from 'vitest'
import { parseTrAmount, parseEnAmount, parseAmountAuto, toMinor, money, money2, moneyCompact } from './money'

describe('amount parsing', () => {
  it('reads Turkish grouping', () => {
    expect(parseTrAmount('1.234,56')).toBe(123456)
    expect(parseTrAmount('788,50')).toBe(78850)
    expect(parseTrAmount('0,09')).toBe(9)
  })

  it('reads Anglo grouping', () => {
    expect(parseEnAmount('1,065.00')).toBe(106500)
    expect(parseEnAmount('2,153.57')).toBe(215357)
    expect(parseEnAmount('355.00')).toBe(35500)
  })

  it('infers the convention from the string shape', () => {
    expect(parseAmountAuto('1.234,56')).toBe(123456)
    expect(parseAmountAuto('1,234.56')).toBe(123456)
  })

  it('never drifts when summed', () => {
    // The float equivalent of this sum is 0.30000000000000004.
    const total = toMinor(0.1) + toMinor(0.2)
    expect(total).toBe(30)
  })
})

describe('formatting', () => {
  it('formats without decimals by default, rounding rather than truncating', () => {
    expect(money(123456)).toBe('₺1.235')
    expect(money(123400)).toBe('₺1.234')
  })

  it('formats with decimals on request', () => {
    expect(money2(123456)).toBe('₺1.234,56')
  })

  it('uses a minus sign for negatives', () => {
    expect(money(-5000)).toBe('−₺50')
  })

  it('compacts large figures', () => {
    expect(moneyCompact(2_500_00)).toBe('₺2,5 B')
    expect(moneyCompact(25_000_00)).toBe('₺25 B')
    expect(moneyCompact(250_000_00)).toBe('₺250 B')
    expect(moneyCompact(2_500_000_00)).toBe('₺2,5 Mn')
  })
})
