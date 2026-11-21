import type { CreditCard } from './types'

export interface ReminderPreferences {
  enabled: boolean
  hour: number
}

export const defaultReminders: ReminderPreferences = { enabled: false, hour: 20 }
export const REMINDER_ID_START = 1_200_000_000
const REMINDER_ID_COUNT = 100_000_000

export interface PlannedReminder {
  id: number
  at: Date
  title: string
  body: string
  cardId: string
  kind: 'statement' | 'entry' | 'combined'
}

/** Namespaced identifiers let us cancel our reminders without deleting other notifications. */
export function isReminderId(id: number): boolean {
  return Number.isInteger(id) && id >= REMINDER_ID_START && id < REMINDER_ID_START + REMINDER_ID_COUNT
}

function reminderId(key: string): number {
  let hash = 2166136261
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return REMINDER_ID_START + ((hash >>> 0) % REMINDER_ID_COUNT)
}

/** A missing 29th–31st falls on that month's last day, never the following month. */
export function monthlyReminderDate(year: number, month: number, day: number, hour: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(Math.max(Math.trunc(day), 1), lastDay), hour, 0, 0, 0)
}

/** Twelve future occurrences per card and event; refreshed whenever the app resumes. */
export function planReminders(
  cards: CreditCard[],
  preferences: ReminderPreferences,
  now = new Date(),
): PlannedReminder[] {
  if (!preferences.enabled) return []
  const hour = Number.isInteger(preferences.hour) && preferences.hour >= 0 && preferences.hour <= 23
    ? preferences.hour : defaultReminders.hour
  const planned: PlannedReminder[] = []
  const usedIds = new Set<number>()
  const byCardAndTime = new Map<string, PlannedReminder>()
  for (const card of cards) {
    if (card.remindersEnabled === false) continue
    const days = new Map<number, 'statement' | 'entry' | 'combined'>()
    if (Number.isInteger(card.statementDay) && card.statementDay >= 1 && card.statementDay <= 31) {
      days.set(card.statementDay, 'statement')
    }
    if (Number.isInteger(card.entryDay) && card.entryDay >= 1 && card.entryDay <= 31) {
      days.set(card.entryDay, days.has(card.entryDay) ? 'combined' : 'entry')
    }
    for (const [day, kind] of days) {
      let occurrences = 0
      for (let offset = 0; occurrences < 12; offset++) {
        const at = monthlyReminderDate(now.getFullYear(), now.getMonth() + offset, day, hour)
        if (at.getTime() <= now.getTime()) continue
        let id = reminderId(`${card.id}:${kind}:${at.getFullYear()}-${at.getMonth()}`)
        while (usedIds.has(id)) id = REMINDER_ID_START + ((id - REMINDER_ID_START + 1) % REMINDER_ID_COUNT)
        usedIds.add(id)
        const item: PlannedReminder = {
          id, at, cardId: card.id, kind,
          title: kind === 'entry' ? 'Aylık kayıt zamanı' : 'Ekstre günü',
          body: kind === 'statement'
            ? 'Ekstre kesim günün geldi. Ekstren hazır olduğunda uygulamaya ekleyebilirsin.'
            : kind === 'combined'
              ? 'Ekstre ve kayıt günün geldi. Ekstreni ekleyip aylık kayıtlarını tamamla.'
              : 'Aylık veri giriş günün geldi. Ekstreni ve gelir-gider kayıtlarını tamamla.',
        }
        const key = `${card.id}:${at.getTime()}`
        const existing = byCardAndTime.get(key)
        if (existing) {
          // Different configured days can both clamp to February's final day.
          existing.kind = 'combined'
          existing.title = 'Ekstre günü'
          existing.body = 'Ekstre ve kayıt günün geldi. Ekstreni ekleyip aylık kayıtlarını tamamla.'
        } else {
          byCardAndTime.set(key, item)
          planned.push(item)
        }
        occurrences++
      }
    }
  }
  return planned.sort((left, right) => left.at.getTime() - right.at.getTime() || left.id - right.id)
}
