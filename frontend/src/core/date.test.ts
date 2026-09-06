import { describe, expect, it } from 'vitest'
import {
  addMonths, daysInMonth, eachDay, monthDiff, monthOf, parseSlashDate,
  parseTurkishLongDate, toEpochDay, weekdayIndex,
} from './date'

describe('date parsing', () => {
  it('reads slash dates', () => {
    expect(parseSlashDate('05/07/2026')).toBe('2026-07-05')
    expect(parseSlashDate('22/07/2026')).toBe('2026-07-22')
  })

  it('reads Turkish long dates including dotless i', () => {
    expect(parseTurkishLongDate('08 Ağustos 2026')).toBe('2026-08-08')
    expect(parseTurkishLongDate('01 Aralık 2026')).toBe('2026-12-01')
    expect(parseTurkishLongDate('15 Şubat 2026')).toBe('2026-02-15')
  })

  it('rejects malformed input instead of guessing', () => {
    expect(parseSlashDate('2026-07-05')).toBeNull()
    expect(parseTurkishLongDate('Ağustos 2026')).toBeNull()
    expect(parseSlashDate('35/13/2026')).toBeNull()
  })
})

describe('date arithmetic', () => {
  it('does not shift days across timezones', () => {
    // The previous implementation round-tripped through toISOString(), which
    // moved a local date back one day for UTC+3 users.
    const days = eachDay('2026-07-05', '2026-07-08')
    expect(days).toEqual(['2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08'])
  })

  it('walks months across a year boundary', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-02', -3)).toBe('2025-11')
    expect(monthDiff('2026-11', '2027-02')).toBe(3)
  })

  it('knows month lengths including leap years', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-07')).toBe(31)
  })

  it('indexes weekdays from Monday', () => {
    // 2026-08-08 is a Saturday.
    expect(weekdayIndex('2026-08-08')).toBe(5)
    // 2026-08-10 is a Monday.
    expect(weekdayIndex('2026-08-10')).toBe(0)
  })

  it('measures whole-day intervals', () => {
    expect(toEpochDay('2026-07-08') - toEpochDay('2026-07-05')).toBe(3)
  })

  it('derives the month key by slicing', () => {
    expect(monthOf('2026-07-05')).toBe('2026-07')
  })
})
