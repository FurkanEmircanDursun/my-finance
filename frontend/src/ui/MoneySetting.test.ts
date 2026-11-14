import { describe, expect, it } from 'vitest'
import { settingAmount, settingAmountText } from './MoneySetting'
describe('profile money input', () => {
  it('preserves Turkish thousands and decimal separators', () => {
    expect(settingAmount('15.000,50')).toBe(1500050)
    expect(settingAmount('15.000')).toBe(1500000)
    expect(settingAmount('125,50')).toBe(12550)
    expect(settingAmountText(1500050)).toBe('15.000,5')
  })
  it('permits disabling a preference but refuses partially parsed values', () => {
    expect(settingAmount('')).toBe(0)
    expect(settingAmount('0,00')).toBe(0)
    expect(settingAmount('12abc')).toBeNull()
    expect(settingAmount('-5')).toBeNull()
    expect(settingAmount('12.5')).toBeNull()
  })
})
