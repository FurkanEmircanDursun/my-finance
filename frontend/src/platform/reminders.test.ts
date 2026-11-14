import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreditCard } from '../domain/types'
import { planReminders, REMINDER_ID_START } from '../domain/reminders'

const mocks = vi.hoisted(() => ({
  isAndroid: vi.fn(() => true),
  checkPermissions: vi.fn(), getPending: vi.fn(), cancel: vi.fn(),
  createChannel: vi.fn(), schedule: vi.fn(), requestPermissions: vi.fn(), addListener: vi.fn(),
}))
vi.mock('./index', () => ({ isAndroid: mocks.isAndroid }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mocks }))

import { consumePendingReminder, getReminderStatus, onReminderOpen, requestReminderPermission, sendTestReminder, setRemoteReminderDelivery, syncReminders } from './reminders'

const card: CreditCard = {
  id: 'card', bank: 'garanti', name: 'Bonus', statementDay: 10, entryDay: 15, remindersEnabled: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', new EventTarget())
  setRemoteReminderDelivery(false)
  mocks.isAndroid.mockReturnValue(true)
  mocks.checkPermissions.mockResolvedValue({ display: 'granted' })
  mocks.getPending.mockResolvedValue({ notifications: [] })
  mocks.cancel.mockResolvedValue(undefined)
  mocks.createChannel.mockResolvedValue(undefined)
  mocks.schedule.mockResolvedValue({ notifications: [] })
  mocks.requestPermissions.mockResolvedValue({ display: 'granted' })
  mocks.addListener.mockResolvedValue({ remove: vi.fn() })
  consumePendingReminder()
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('native reminder lifecycle', () => {
  it('cancels the local plan while cloud delivery owns reminders and restores it on fallback', async () => {
    mocks.getPending.mockResolvedValue({ notifications: [{ id: REMINDER_ID_START + 2 }] })
    setRemoteReminderDelivery(true)
    await syncReminders([card], { enabled: true, hour: 9 })
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: REMINDER_ID_START + 2 }] })
    expect(mocks.schedule).not.toHaveBeenCalled()
    setRemoteReminderDelivery(false)
    mocks.getPending.mockResolvedValue({ notifications: [] })
    await syncReminders([card], { enabled: true, hour: 9 })
    expect(mocks.schedule).toHaveBeenCalledOnce()
  })
  it('cancels only owned reminders when globally disabled', async () => {
    mocks.getPending.mockResolvedValue({ notifications: [{ id: REMINDER_ID_START }, { id: 42 }] })
    await syncReminders([card], { enabled: false, hour: 9 })
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: REMINDER_ID_START }] })
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
  it('does not prompt or schedule in the background without permission', async () => {
    mocks.checkPermissions.mockResolvedValue({ display: 'denied' })
    await syncReminders([card], { enabled: true, hour: 9 })
    expect(mocks.requestPermissions).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
    expect(await requestReminderPermission()).toBe(true)
    expect(mocks.requestPermissions).toHaveBeenCalledOnce()
  })
  it('uses inexact OS alarms with configured local time and opens no special alarm permission', async () => {
    await syncReminders([card], { enabled: true, hour: 17 })
    const notifications = mocks.schedule.mock.calls[0][0].notifications
    expect(notifications).toHaveLength(24)
    expect(notifications.every((item: { isExactNotification: boolean; schedule: { at: Date } }) =>
      item.isExactNotification === false && item.schedule.at.getHours() === 17)).toBe(true)
    expect(mocks.createChannel.mock.invocationCallOrder[0]).toBeLessThan(mocks.schedule.mock.invocationCallOrder[0])
  })
  it('clears an old card plan when all cards are deleted', async () => {
    mocks.getPending.mockResolvedValue({ notifications: [{ id: REMINDER_ID_START + 7 }] })
    await syncReminders([], { enabled: true, hour: 9 })
    expect(mocks.cancel).toHaveBeenCalledOnce()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
  it('serializes concurrent settings changes, leaving the last plan in charge', async () => {
    const first = syncReminders([card], { enabled: true, hour: 9 })
    const second = syncReminders([card], { enabled: false, hour: 9 })
    await Promise.all([first, second])
    expect(mocks.getPending).toHaveBeenCalledTimes(2)
    expect(mocks.schedule).toHaveBeenCalledOnce()
    expect(mocks.schedule.mock.invocationCallOrder[0]).toBeLessThan(mocks.getPending.mock.invocationCallOrder[1])
  })
  it('exposes scheduling errors and recovers on retry', async () => {
    mocks.schedule.mockRejectedValueOnce(new Error('platform failed'))
    await syncReminders([card], { enabled: true, hour: 9 })
    expect((await getReminderStatus()).error).toContain('planlanamadı')
    await syncReminders([card], { enabled: true, hour: 9 })
    expect((await getReminderStatus()).error).toBeUndefined()
  })
  it('does not imply browser support or invoke native APIs on web', async () => {
    mocks.isAndroid.mockReturnValue(false)
    await syncReminders([card], { enabled: true, hour: 9 })
    expect((await getReminderStatus()).supported).toBe(false)
    expect(await requestReminderPermission()).toBe(false)
    expect(mocks.getPending).not.toHaveBeenCalled()
  })
  it('reads the next reminder from ISO metadata when native dates use a local timezone name', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    mocks.getPending.mockResolvedValue({ notifications: [{
      id: REMINDER_ID_START, schedule: { at: 'Sun Nov 08 09:00:00 TRT 2026' }, extra: { reminderAt: future },
    }] })
    expect((await getReminderStatus()).nextAt?.toISOString()).toBe(future)
  })
  it('sends an immediate test only with permission', async () => {
    mocks.checkPermissions.mockResolvedValueOnce({ display: 'denied' })
    await expect(sendTestReminder()).rejects.toThrow('izin ver')
    expect(mocks.schedule).not.toHaveBeenCalled()
    await sendTestReminder()
    expect(mocks.schedule.mock.calls[0][0].notifications[0].schedule).toBeUndefined()
  })
  it('retains a notification tap until the unlocked shell consumes it once', async () => {
    await onReminderOpen()
    const callback = mocks.addListener.mock.calls[0][1]
    callback({ notification: { id: REMINDER_ID_START, extra: { cardId: 'card', reminderKind: 'entry' } } })
    expect(consumePendingReminder()).toEqual({ cardId: 'card', reminderKind: 'entry' })
    expect(consumePendingReminder()).toBeNull()
  })
  it('preserves a delayed inexact alarm when the app resumes after its requested time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 10, 9, 5))
    const preferences = { enabled: true, hour: 9 }
    const original = planReminders([card], preferences, new Date(2026, 10, 10, 8)).map((item) => ({
      id: item.id, title: item.title, body: item.body, schedule: { at: item.at }, extra: { reminderAt: item.at.toISOString() },
    }))
    const dueToday = original.find((item) => item.schedule.at.getDate() === 10 && item.schedule.at.getMonth() === 10)!
    mocks.getPending.mockResolvedValue({ notifications: original })
    await syncReminders([card], preferences)
    expect(mocks.cancel).not.toHaveBeenCalled()
    const added = mocks.schedule.mock.calls[0][0].notifications
    expect(added.some((item: { id: number }) => item.id === dueToday.id)).toBe(false)
    expect(added).toHaveLength(1) // Only the new twelfth future statement occurrence.
    expect((await getReminderStatus()).pending).toBe(23) // A past stored record is not an upcoming reminder.
  })
  it('cancels and replaces a delayed alarm when the user changes its hour', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 10, 9, 5))
    const original = planReminders([card], { enabled: true, hour: 9 }, new Date(2026, 10, 10, 8)).map((item) => ({
      id: item.id, title: item.title, body: item.body, schedule: { at: item.at }, extra: { reminderAt: item.at.toISOString() },
    }))
    mocks.getPending.mockResolvedValue({ notifications: original })
    await syncReminders([card], { enabled: true, hour: 17 })
    expect(mocks.cancel.mock.calls[0][0].notifications).toHaveLength(24)
    const added = mocks.schedule.mock.calls[0][0].notifications
    expect(added).toHaveLength(24)
    expect(added.every((item: { schedule: { at: Date } }) => item.schedule.at.getHours() === 17)).toBe(true)
  })
  it('also preserves an unchanged delayed month-end alarm across a month boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 11, 1, 0, 5))
    const monthEndCard = { ...card, statementDay: 31 }
    const original = planReminders([monthEndCard], { enabled: true, hour: 23 }, new Date(2026, 10, 30, 22))
      .map((item) => ({ id: item.id, title: item.title, body: item.body, extra: { reminderAt: item.at.toISOString() } }))
    mocks.getPending.mockResolvedValue({ notifications: original })
    await syncReminders([monthEndCard], { enabled: true, hour: 23 })
    expect(mocks.cancel).not.toHaveBeenCalled()
  })
  it('cancels an overdue current-day alarm when its card is deleted or reminders disabled', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 10, 9, 5))
    const original = planReminders([card], { enabled: true, hour: 9 }, new Date(2026, 10, 10, 8))
      .filter((item) => item.at.getTime() < Date.now())
      .map((item) => ({ id: item.id, title: item.title, body: item.body, extra: { reminderAt: item.at.toISOString() } }))
    mocks.getPending.mockResolvedValue({ notifications: original })
    await syncReminders([], { enabled: true, hour: 9 })
    expect(mocks.cancel).toHaveBeenLastCalledWith({ notifications: original.map(({ id }) => ({ id })) })
    await syncReminders([card], { enabled: false, hour: 9 })
    expect(mocks.cancel).toHaveBeenCalledTimes(2)
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
})
