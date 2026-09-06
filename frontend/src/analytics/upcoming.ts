import { addDays, toEpochDay, type DayKey } from '../core/date'
import type { Money } from '../core/money'
import type { Statement } from '../domain/types'
import type { RecurringPayment } from './types'

/**
 * A single chronological list of what is actually due soon — the thing every
 * popular budgeting app leads with under "bills" or "upcoming", and the one
 * question the app could answer from data it already had (`RecurringPayment.
 * nextExpected`, `Statement.dueDate`) but never actually surfaced as a list.
 *
 * Anchored to the real calendar date, not to where the imported data ends —
 * unlike the analytics engine's "asOf", a due date is a real-world commitment
 * that keeps approaching whether or not a new statement has been imported.
 */
export interface UpcomingPayment {
  date: DayKey
  label: string
  /** Known for a detected recurring payment; null for a statement due-date, since the app does not track a statement's own balance. */
  amount: Money | null
  kind: 'recurring' | 'statement'
  daysUntil: number
}

export function buildUpcomingPayments(
  recurring: readonly RecurringPayment[],
  statements: readonly Statement[],
  today: DayKey,
  horizonDays = 45,
): UpcomingPayment[] {
  const endDay = addDays(today, horizonDays)
  const todayEpoch = toEpochDay(today)
  const out: UpcomingPayment[] = []

  for (const item of recurring) {
    if (item.status !== 'active') continue
    if (item.nextExpected <= today || item.nextExpected > endDay) continue
    out.push({
      date: item.nextExpected,
      label: item.label,
      amount: item.medianAmount,
      kind: 'recurring',
      daysUntil: toEpochDay(item.nextExpected) - todayEpoch,
    })
  }

  for (const statement of statements) {
    if (!statement.dueDate || statement.dueDate <= today || statement.dueDate > endDay) continue
    out.push({
      date: statement.dueDate,
      label: statement.label,
      amount: null,
      kind: 'statement',
      daysUntil: toEpochDay(statement.dueDate) - todayEpoch,
    })
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
