/**
 * Centralized formatting utilities for My Finance
 */

const currencyFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const currencyDecimalFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('tr-TR')

export function fmt(n: number): string {
  if (isNaN(n)) return '0'
  return currencyFormatter.format(n)
}

export function fmt2(n: number): string {
  if (isNaN(n)) return '0,00'
  return currencyDecimalFormatter.format(n)
}

export function fmtNum(n: number): string {
  if (isNaN(n)) return '0'
  return numberFormatter.format(n)
}

export function fmtPercent(n: number, decimals: number = 1): string {
  if (isNaN(n)) return '%0'
  return `%${n.toFixed(decimals)}`
}

export function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date()
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const [day, month, year] = parts
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10))
  }
  const isoParts = dateStr.split('-')
  if (isoParts.length === 3) {
    const [year, month, day] = isoParts
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10))
  }
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? new Date() : d
}

export function formatMonthYear(date: Date, short: boolean = false): string {
  return date.toLocaleDateString('tr-TR', {
    month: short ? 'short' : 'long',
    year: 'numeric',
  })
}

/**
 * Generate a unique ID for a transaction to prevent duplicates.
 */
export function generateTransactionId(date: string, amount: number, description: string): string {
  const cleanDesc = description.replace(/\s+/g, '').toLowerCase().substring(0, 20)
  return btoa(unescape(encodeURIComponent(`${date}_${amount}_${cleanDesc}`)))
}