/**
 * Garanti BBVA ekstre parser — garanti_parser.py'nin TypeScript karşılığı.
 * Format: "08 Ağustos 2026 A101 9923 I353 BAHÇELİEVL 0,09 788,50"
 */

import type { Transaction } from '../types/finance'
import { categorizeTransaction } from './categorizer'

const TR_MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6,
  temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
}

const DATE_RE = /(?:^|\s)(\d{2}\s+[a-zA-ZğüşıöçĞÜŞİÖÇ]+\s+\d{4})\s+(.*)$/
const NUM_RE = /^[\d.,]+[+-]?$/

/** Türk formatı: "788,50" → 788.50  |  "788,50-" → -788.50 */
function parseAmount(str: string): number {
  const negative = str.endsWith('-')
  const clean = str.replace(/\./g, '').replace(',', '.').replace(/[+-]/g, '')
  const val = parseFloat(clean)
  return isNaN(val) ? 0 : (negative ? -val : val)
}

/** "08 Ağustos 2026" → "08/08/2026" formatına çevir (UI tutarlılığı için) */
export function normalizeDateGaranti(dateStr: string): string {
  const parts = dateStr.trim().split(/\s+/)
  if (parts.length < 3) return dateStr
  const day = parts[0].padStart(2, '0')
  // ToLowerCase with some manual mapping for Turkish I/İ
  let mName = parts[1].toLowerCase().replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
  const month = TR_MONTHS[mName] || TR_MONTHS[parts[1].toLowerCase()]
  if (!month) return dateStr
  const year = parts[2]
  return `${day}/${String(month).padStart(2, '0')}/${year}`
}

export function parseGaranti(text: string): Transaction[] {
  const transactions: Transaction[] = []

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    const dateMatch = DATE_RE.exec(line)
    if (!dateMatch) continue

    const dateStr = normalizeDateGaranti(dateMatch[1])
    const parts = dateMatch[2].trim().split(/\s+/)

    let amountStr = ''
    let description = ''

    // Garanti: satır sonunda 1 veya 2 sayısal değer olabilir
    // Son değer = Tutar, ondan önceki = Bonus (varsa)
    if (parts.length >= 2 && NUM_RE.test(parts[parts.length - 1]) && NUM_RE.test(parts[parts.length - 2])) {
      amountStr = parts[parts.length - 1]
      // bonus = parts[parts.length - 2] — kullanmıyoruz
      description = parts.slice(0, -2).join(' ')
    } else if (parts.length >= 1 && NUM_RE.test(parts[parts.length - 1])) {
      amountStr = parts[parts.length - 1]
      description = parts.slice(0, -1).join(' ')
    } else {
      description = parts.join(' ')
    }

    // "BONUS BEDAVA ALIŞVERİŞ" satırları özel
    if (description.toUpperCase().includes('BONUS BEDAVA')) {
      description = 'BONUS BEDAVA ALIŞVERİŞ'
    }

    // Google Pay formatı: "Google makromusic for 899,99 TL 899,99" → son tekrar değeri at
    if (/\d+,\d+\s+TL\s+\d+,\d+$/.test(dateMatch[2])) {
      const m = /^(.*?)\s+[\d.,]+\s+TL\s+([\d.,]+)$/.exec(dateMatch[2])
      if (m) {
        description = m[1].trim()
        amountStr = m[2]
      }
    }

    const amount = parseAmount(amountStr)
    const category = categorizeTransaction(description)
    
    // Generate unique ID
    const cleanDescForId = description.trim().replace(/\s+/g, '').toLowerCase().substring(0, 20)
    const txId = btoa(unescape(encodeURIComponent(`${dateStr}_${amount}_${cleanDescForId}`)))

    transactions.push({
      id: txId,
      type: 'expense',
      isManual: false,
      bank: 'Garanti',
      date: dateStr,
      description: description.trim(),
      amount,
      installment: null,
      category,
      raw_line: line,
    })
  }

  return transactions
}
