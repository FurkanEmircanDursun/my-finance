import { addDays, toEpochDay, type DayKey } from '../core/date'
import { clamp, mad, median } from '../core/stats'
import { round, type Money } from '../core/money'
import { displayMerchant } from '../core/text'
import type { Transaction, TxKind } from '../domain/types'
import type { Cadence, RecurringPayment } from './types'

/**
 * Recurring-payment detection.
 *
 * The previous implementation called anything "a subscription" when a merchant
 * appeared twice with amounts within 10% — which labelled two grocery runs a
 * subscription and missed annual renewals entirely. This version scores three
 * independent signals and only accepts a merchant when they agree:
 *
 *   1. cadence regularity — how tight the gaps between charges are (median/MAD)
 *   2. amount stability   — how tight the charge amounts are (median/MAD)
 *   3. evidence           — how many occurrences back the pattern up
 *
 * A monthly charge that drifts a couple of days, or a subscription whose price
 * rose once, still scores high; a merchant visited at random does not.
 */

interface CadenceBand {
  cadence: Cadence
  label: string
  min: number
  max: number
  centre: number
}

const BANDS: CadenceBand[] = [
  { cadence: 'weekly', label: 'Haftalık', min: 6, max: 8, centre: 7 },
  { cadence: 'biweekly', label: 'İki haftada bir', min: 11, max: 18, centre: 14 },
  { cadence: 'monthly', label: 'Aylık', min: 25, max: 38, centre: 30.44 },
  { cadence: 'bimonthly', label: 'İki ayda bir', min: 52, max: 70, centre: 60.9 },
  { cadence: 'quarterly', label: 'Üç ayda bir', min: 80, max: 105, centre: 91.3 },
  { cadence: 'semiannual', label: 'Altı ayda bir', min: 160, max: 200, centre: 182.6 },
  { cadence: 'annual', label: 'Yıllık', min: 330, max: 400, centre: 365.25 },
]

const DAYS_PER_MONTH = 30.44

/** Minimum combined confidence for a merchant to be reported as recurring. */
export const RECURRING_THRESHOLD = 0.6

/**
 * Regularity and amount stability are gates, not just weights.
 *
 * Without them a merchant visited on a steady rhythm but for wildly different
 * amounts — a petrol station filled up every few days — scored high enough on
 * cadence and evidence alone to be reported as a fixed monthly commitment, and
 * its monthly-equivalent figure then dwarfed every real subscription.
 */
const MIN_REGULARITY = 0.5
const MIN_STABILITY = 0.35

function classifyCadence(intervalDays: number): CadenceBand | null {
  for (const band of BANDS) {
    if (intervalDays >= band.min && intervalDays <= band.max) return band
  }
  return null
}

export interface RecurringOptions {
  /** Last day covered by the data — decides active vs lapsed. */
  asOf: DayKey
  /** Transaction kind to scan for a pattern; expenses by default, so a salary or a rent transfer can be detected the same way. */
  kind?: TxKind
}

export function detectRecurring(
  byMerchant: Map<string, Transaction[]>,
  options: RecurringOptions,
): RecurringPayment[] {
  const results: RecurringPayment[] = []
  const asOfEpoch = toEpochDay(options.asOf)
  const kind = options.kind ?? 'expense'

  for (const [merchant, all] of byMerchant) {
    const txs = all.filter((t) => t.kind === kind)
    if (txs.length < 2) continue

    const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    // Charges on the same day are one event (split payments, retries).
    const events: Array<{ date: DayKey; amount: Money; ids: string[] }> = []
    for (const tx of sorted) {
      const last = events[events.length - 1]
      if (last && last.date === tx.date) {
        last.amount += tx.amount
        last.ids.push(tx.id)
      } else {
        events.push({ date: tx.date, amount: tx.amount, ids: [tx.id] })
      }
    }
    if (events.length < 2) continue

    const epochs = events.map((e) => toEpochDay(e.date))
    const intervals: number[] = []
    for (let i = 1; i < epochs.length; i++) intervals.push(epochs[i] - epochs[i - 1])

    const intervalMedian = median(intervals)
    if (intervalMedian < 4) continue // same-week repeats are shopping, not a plan

    const band = classifyCadence(intervalMedian)
    if (!band) continue

    const intervalSpread = mad(intervals, intervalMedian)
    // Allow ±20% drift before regularity starts dropping.
    const regularity = clamp(1 - intervalSpread / (intervalMedian * 0.2), 0, 1)

    const amounts = events.map((e) => e.amount)
    const amountMedian = median(amounts)
    if (amountMedian <= 0) continue
    const amountSpread = mad(amounts, amountMedian)
    // Allow ±10% amount drift (VAT changes, FX-linked pricing).
    const stability = clamp(1 - amountSpread / (amountMedian * 0.1), 0, 1)

    const evidence = clamp((events.length - 1) / 4, 0, 1)

    if (regularity < MIN_REGULARITY || stability < MIN_STABILITY) continue

    // Two charges define an interval but not a pattern: any two same-priced
    // grocery runs a week apart would otherwise be reported as a weekly
    // commitment and extrapolated into a four-figure annual cost. A merchant
    // already recognised as a subscription needs less evidence, but still
    // carries a capped confidence until a third charge arrives.
    const knownSubscription = txs[0].category === 'subscription'
    if (events.length === 2 && !knownSubscription) continue

    let confidence = 0.45 * regularity + 0.35 * stability + 0.2 * evidence
    if (knownSubscription) confidence += 0.12
    if (events.length === 2) confidence = Math.min(confidence, 0.62)
    confidence = clamp(confidence, 0, 1)

    if (confidence < RECURRING_THRESHOLD) continue

    const first = events[0]
    const last = events[events.length - 1]
    const nextExpected = addDays(last.date, Math.round(intervalMedian))
    const lapsed = asOfEpoch - toEpochDay(last.date) > intervalMedian * 1.6

    const priceChangePct =
      events.length >= 2 && first.amount > 0
        ? round(((last.amount - first.amount) / first.amount) * 100, 1)
        : null

    const monthlyEquivalent = Math.round(amountMedian * (DAYS_PER_MONTH / intervalMedian))

    results.push({
      merchant,
      label: displayMerchant(merchant),
      category: txs[0].category,
      cadence: band.cadence,
      cadenceLabel: band.label,
      intervalDays: Math.round(intervalMedian),
      occurrences: events.length,
      lastAmount: last.amount,
      medianAmount: amountMedian,
      monthlyEquivalent,
      annualCost: Math.round(amountMedian * (365.25 / intervalMedian)),
      firstSeen: first.date,
      lastSeen: last.date,
      nextExpected,
      priceChangePct,
      confidence: round(confidence, 2),
      status: lapsed ? 'lapsed' : 'active',
      transactionIds: events.flatMap((e) => e.ids),
    })
  }

  return results.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent)
}
