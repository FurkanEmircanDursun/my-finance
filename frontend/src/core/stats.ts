/**
 * Small statistics kit used by the analytics engine.
 *
 * Everything here is robust-first (median / MAD rather than mean / stdev):
 * personal spending is heavily right-skewed, so a single rent payment would
 * otherwise dominate a mean-based outlier test and hide the real anomalies.
 */

export function sum(values: readonly number[]): number {
  let total = 0
  for (let i = 0; i < values.length; i++) total += values[i]
  return total
}

export function mean(values: readonly number[]): number {
  return values.length ? sum(values) / values.length : 0
}

/** Sorts a copy; safe to call with the caller's array. */
export function median(values: readonly number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Linear-interpolated quantile, q in [0,1]. */
export function quantile(values: readonly number[], q: number): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return s[lo]
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

/** Median absolute deviation — the robust analogue of standard deviation. */
export function mad(values: readonly number[], centre = median(values)): number {
  if (!values.length) return 0
  return median(values.map((v) => Math.abs(v - centre)))
}

export function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(sum(values.map((v) => (v - m) ** 2)) / (values.length - 1))
}

/** Coefficient of variation — unitless spread, comparable across categories. */
export function cv(values: readonly number[]): number {
  const m = mean(values)
  return m === 0 ? 0 : stdev(values) / Math.abs(m)
}

/**
 * Robust z-score. 0.6745 rescales MAD so the score matches a classic z-score
 * for normally distributed input; |score| > 3.5 is the usual outlier threshold.
 */
export function robustZ(value: number, values: readonly number[]): number {
  const centre = median(values)
  const spread = mad(values, centre)
  if (spread === 0) return 0
  return (0.6745 * (value - centre)) / spread
}

/** Ordinary least squares over (index, value) pairs. */
export function linearTrend(values: readonly number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 }

  const xMean = (n - 1) / 2
  const yMean = mean(values)

  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = i - xMean
    const dy = values[i] - yMean
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }

  const slope = sxx === 0 ? 0 : sxy / sxx
  return {
    slope,
    intercept: yMean - slope * xMean,
    r2: sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy),
  }
}

/**
 * Herfindahl-Hirschman index, normalised to 0-1.
 * 0 = perfectly spread across many merchants, 1 = everything at one merchant.
 */
export function concentration(shares: readonly number[]): number {
  const total = sum(shares)
  if (total <= 0 || shares.length < 2) return shares.length ? 1 : 0
  const hhi = sum(shares.map((s) => (s / total) ** 2))
  const floor = 1 / shares.length
  return Math.max(0, (hhi - floor) / (1 - floor))
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Maps a value onto 0-100 where `good` scores 100 and `bad` scores 0. */
export function scoreBand(value: number, good: number, bad: number): number {
  if (good === bad) return 50
  const t = (value - bad) / (good - bad)
  return clamp(t * 100, 0, 100)
}
