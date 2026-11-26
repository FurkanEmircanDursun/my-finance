import { mad, median } from '../core/stats'
import { money, round, type Money } from '../core/money'
import { displayMerchant } from '../core/text'
import { toEpochDay } from '../core/date'
import { categoryLabel, type CategoryId } from '../domain/categories'
import type { Transaction } from '../domain/types'
import type { Anomaly, DuplicateGroup, HabitStat } from './types'

const OUTLIER_Z = 3.5
const MIN_SAMPLE = 6
/** Ignore statistical outliers below this, they are noise not news. */
const MIN_INTERESTING: Money = 20_000 // ₺200

function robustScore(value: number, centre: number, spread: number): number {
  if (spread === 0) return 0
  return (0.6745 * (value - centre)) / spread
}

/**
 * Flags charges that are unusual against two independent baselines:
 * the category's normal ticket size, and the merchant's own history.
 *
 * Robust statistics (median/MAD) are used because one rent-sized payment would
 * otherwise inflate a mean-based threshold enough to hide everything else.
 */
export function detectAnomalies(
  byCategory: Map<string, Transaction[]>,
  byMerchant: Map<string, Transaction[]>,
): Anomaly[] {
  const found = new Map<string, Anomaly>()

  // An instalment charge repeats a decision made once, at purchase; it is not a
  // fresh unusual spend, and the date it prints is not when it was charged.
  //
  // Interest and card fees are not purchases either: nobody chose to spend them,
  // and "your membership fee is large for a fee" is not news. They have their own
  // finding (see insights.ts, `card-cost`).
  for (const [categoryId, all] of byCategory) {
    if (categoryId === 'fees') continue
    const txs = all.filter((t) => t.kind === 'expense' && !t.installment)
    if (txs.length < MIN_SAMPLE) continue

    const amounts = txs.map((t) => t.amount)
    const centre = median(amounts)
    const spread = mad(amounts, centre)
    if (spread === 0) continue

    for (const tx of txs) {
      if (tx.amount < MIN_INTERESTING) continue
      const score = robustScore(tx.amount, centre, spread)
      if (score < OUTLIER_Z) continue

      found.set(tx.id, {
        transaction: tx,
        reason: 'category-outlier',
        score: round(score, 1),
        baseline: centre,
        note: `${categoryLabel(categoryId as CategoryId)} kategorisinde tipik işlem ${money(centre)} · bu işlem ${round(tx.amount / centre, 1)}×`,
      })
    }
  }

  for (const [merchant, all] of byMerchant) {
    const txs = all.filter((t) => t.kind === 'expense' && !t.installment && t.category !== 'fees')
    if (txs.length < 4) continue

    const amounts = txs.map((t) => t.amount)
    const centre = median(amounts)
    const spread = mad(amounts, centre)
    if (spread === 0) continue

    for (const tx of txs) {
      if (tx.amount < MIN_INTERESTING) continue
      const score = robustScore(tx.amount, centre, spread)
      if (score < OUTLIER_Z) continue

      // A merchant-level signal is more specific, so it wins over a category one.
      found.set(tx.id, {
        transaction: tx,
        reason: 'merchant-outlier',
        score: round(score, 1),
        baseline: centre,
        note: `${displayMerchant(merchant)} genelde ${money(centre)} · bu işlem ${round(tx.amount / centre, 1)}×`,
      })
    }
  }

  return [...found.values()].sort((a, b) => b.transaction.amount - a.transaction.amount)
}

/**
 * Contactless public-transit fare taps naturally charge the exact same small
 * ticket multiple times on the same day (e.g. Ankara EGO, İstanbulkart, Belbim).
 */
const TRANSIT_FARE_RE = /\b(?:EGO\s+KART|ARAC\s+ICI\s+GECIS|ISTANBULKART|ISTANBUL\s+KART|BELBIM|TOPLU\s+TASIMA|ANKARAKART|IZMIRIM|KENTKART|BURSAKART)\b/
const MAX_TRANSIT_FARE: Money = 15_000 // ₺150

/**
 * Same merchant, same amount, within a few days — the shape of a double charge
 * or an accidental repeat order. Recurring payments are excluded by the caller
 * passing their merchant keys in `ignoreMerchants`.
 */
export function detectDuplicates(
  byMerchant: Map<string, Transaction[]>,
  ignoreMerchants: ReadonlySet<string>,
  windowDays = 3,
): DuplicateGroup[] {
  const groups: DuplicateGroup[] = []

  for (const [merchant, all] of byMerchant) {
    if (ignoreMerchants.has(merchant)) continue
    const txs = all.filter((t) => t.kind === 'expense' && !t.installment)
    if (txs.length < 2) continue

    const isTransitFareMerchant =
      TRANSIT_FARE_RE.test(merchant) || txs.some((t) => TRANSIT_FARE_RE.test(t.description.toUpperCase()))

    const byAmount = new Map<Money, Transaction[]>()
    for (const tx of txs) {
      const bucket = byAmount.get(tx.amount)
      if (bucket) bucket.push(tx)
      else byAmount.set(tx.amount, [tx])
    }

    for (const [amount, bucket] of byAmount) {
      if (bucket.length < 2 || amount < 1_000) continue // below ₺10 not worth a flag
      if (isTransitFareMerchant && amount <= MAX_TRANSIT_FARE) continue

      const sorted = [...bucket].sort((a, b) => (a.date < b.date ? -1 : 1))
      let run: Transaction[] = [sorted[0]]

      const flush = () => {
        if (run.length >= 2) {
          const span = toEpochDay(run[run.length - 1].date) - toEpochDay(run[0].date)
          // The same amount twice in one day, or next day at a shop visited
          // rarely, is what a double charge looks like. The same amount a day or
          // two apart at a shop visited every other day is a habit — a standard
          // delivery order, a usual basket — and calling it a double charge put
          // a false "critical" at the top of a real month.
          const likely = span === 0 || (span <= 1 && txs.length <= 4)
          groups.push({
            merchant,
            label: displayMerchant(merchant),
            amount,
            transactions: [...run],
            spanDays: span,
            likelihood: likely ? 'high' : 'low',
          })
        }
      }

      for (let i = 1; i < sorted.length; i++) {
        const gap = toEpochDay(sorted[i].date) - toEpochDay(sorted[i - 1].date)
        if (gap <= windowDays) {
          run.push(sorted[i])
        } else {
          flush()
          run = [sorted[i]]
        }
      }
      flush()
    }
  }

  return groups.sort((a, b) => b.amount * b.transactions.length - a.amount * a.transactions.length)
}

/**
 * "Small leaks": low-value purchases repeated often enough that the annual
 * total is material. This is the spend people are most surprised by, and it is
 * invisible in a top-merchants-by-total ranking.
 */
export function detectHabits(
  byMerchant: Map<string, Transaction[]>,
  monthsCovered: number,
  maxTicket: Money = 40_000, // ₺400
  minCount = 5,
): HabitStat[] {
  const months = Math.max(monthsCovered, 1)
  const habits: HabitStat[] = []

  for (const [merchant, all] of byMerchant) {
    const txs = all.filter((t) => t.kind === 'expense' && !t.installment)
    if (txs.length < minCount) continue

    const amounts = txs.map((t) => t.amount)
    const medianAmount = median(amounts)
    if (medianAmount > maxTicket) continue

    const total = amounts.reduce((a, b) => a + b, 0)
    const perMonth = txs.length / months

    habits.push({
      merchant,
      label: displayMerchant(merchant),
      category: txs[0].category,
      count: txs.length,
      medianAmount,
      total,
      perMonth: round(perMonth, 1),
      annualProjection: Math.round((total / months) * 12),
    })
  }

  return habits.sort((a, b) => b.annualProjection - a.annualProjection)
}
