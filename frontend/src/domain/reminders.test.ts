import { describe, expect, it } from 'vitest'
import type { CreditCard } from './types'
import { isReminderId, monthlyReminderDate, planReminders } from './reminders'

const card: CreditCard = {
  id: 'akbank-one', bank: 'akbank', name: 'Axess', statementDay: 31, entryDay: 5, remindersEnabled: true,
}
const preferences = { enabled: true, hour: 9 }

describe('monthly reminder calendar', () => {
  it('clamps day 31 in February without moving into March', () => {
    const date = monthlyReminderDate(2027, 1, 31, 9)
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2027, 1, 28, 9])
  })
  it('keeps leap day and rolls December into the following year', () => {
    expect(monthlyReminderDate(2028, 1, 31, 9).getDate()).toBe(29)
    const date = monthlyReminderDate(2026, 12, 31, 17)
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2027, 0, 31, 17])
  })
  it('plans twelve future dates per event, including when today has passed', () => {
    const now = new Date(2026, 10, 5, 10)
    const plan = planReminders([card], preferences, now)
    expect(plan).toHaveLength(24)
    expect(plan.every((item) => item.at > now)).toBe(true)
    const entries = plan.filter((item) => item.kind === 'entry')
    expect(entries[0].at.getMonth()).toBe(11)
    expect(entries[11].at.getFullYear()).toBe(2027)
    expect(entries[11].at.getMonth()).toBe(10)
  })
  it('still schedules this morning when it is ahead', () => {
    const plan = planReminders([card], preferences, new Date(2026, 10, 5, 8))
    expect(plan[0].at.getDate()).toBe(5)
    expect(plan[0].at.getHours()).toBe(9)
    expect(plan[0].at.getMonth()).toBe(10)
  })
  it('combines the two reminders on the same configured day', () => {
    const plan = planReminders([{ ...card, entryDay: 31 }], preferences, new Date(2026, 10, 1))
    expect(plan).toHaveLength(12)
    expect(plan.every((item) => item.kind === 'combined')).toBe(true)
    expect(plan[0].body).toContain('ekstre ve kayıt')
  })
  it('keeps cards independent even within the same bank and dates', () => {
    const second = { ...card, id: 'akbank-two', name: 'İkinci Axess' }
    const plan = planReminders([card, second], preferences, new Date(2026, 10, 1))
    expect(plan).toHaveLength(48)
    expect(new Set(plan.map((item) => item.id)).size).toBe(48)
    expect(plan.every((item) => isReminderId(item.id))).toBe(true)
    expect(plan.filter((item) => item.cardId === second.id)[0].body).toContain(second.name)
  })
  it('merges distinct dates that both fall on a short month end', () => {
    const plan = planReminders([{ ...card, entryDay: 30 }], preferences, new Date(2027, 1, 1))
    const february = plan.filter((item) => item.at.getFullYear() === 2027 && item.at.getMonth() === 1)
    expect(february).toHaveLength(1)
    expect(february[0].kind).toBe('combined')
    expect(february[0].at.getDate()).toBe(28)
  })
  it('does not plan disabled or removed cards or globally disabled reminders', () => {
    expect(planReminders([card], { ...preferences, enabled: false })).toEqual([])
    expect(planReminders([{ ...card, remindersEnabled: false }], preferences)).toEqual([])
    expect(planReminders([], preferences)).toEqual([])
  })
  it('does not turn malformed imported dates into unbounded schedules', () => {
    expect(planReminders([{ ...card, statementDay: NaN, entryDay: 0 }], preferences)).toEqual([])
    expect(planReminders([card], { ...preferences, hour: 99 }, new Date(2026, 10, 1))[0].at.getHours()).toBe(9)
  })
  it('produces stable IDs for an unchanged plan', () => {
    const now = new Date(2026, 10, 1)
    expect(planReminders([card], preferences, now)).toEqual(planReminders([card], preferences, now))
    expect(isReminderId(1_199_999_999)).toBe(false)
    expect(isReminderId(1_300_000_000)).toBe(false)
  })
})
