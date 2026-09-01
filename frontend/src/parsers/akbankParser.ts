/**
 * Akbank ekstre parser — TypeScript implementasyonu.
 */

import type { Transaction } from '../types/finance'
import { categorizeTransaction } from './categorizer'

const DATE_RE       = /^(\d{2}\/\d{2}\/\d{4})\s+(.*)/
const PAREN_AMT_RE  = /\(([\d.,]+)\s+TL(?:[^)]*?)?\)/
const INSTALLMENT_RE = /(\d+)\/(\d+)\.taksit/i
const AMOUNT_X_RE   = /^[\d.,]+x\d+$/
const AMT_MINUS_RE  = /^[\d.,]+\(-\)$/
const AMT_ONLY_RE   = /^[\d.,]+$/

function parseAmount(str: string): number {
  const negative = str.includes('(-)')
  const clean = str.replace(/x\d+$/, '').replace(/,/g, '').replace('(-)', '').trim()
  const val = parseFloat(clean)
  return isNaN(val) ? 0 : negative ? -val : val
}

export function parseAkbank(text: string): Transaction[] {
  const transactions: Transaction[] = []

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    const dateMatch = DATE_RE.exec(line)
    if (!dateMatch) continue

    const dateStr = dateMatch[1]
    const rest = dateMatch[2].trim()
    const parts = rest.split(/\s+/)
    if (parts.length === 0) continue

    const parenMatch = PAREN_AMT_RE.exec(rest)

    const last = parts[parts.length - 1] ?? ''
    const secondLast = parts.length >= 2 ? parts[parts.length - 2] : ''

    let amount = 0
    let descEnd = parts.length

    if (AMOUNT_X_RE.test(last)) {
      if (AMT_MINUS_RE.test(secondLast)) {
        amount = parseAmount(secondLast)
        descEnd = parts.length - 2
      } else if (AMT_ONLY_RE.test(secondLast)) {
        const periodAmt = parseAmount(secondLast)
        descEnd = parts.length - 2
        amount = parenMatch ? parseAmount(parenMatch[1]) : periodAmt
      } else {
        descEnd = parts.length - 1
        amount = parenMatch ? parseAmount(parenMatch[1]) : parseAmount(last)
      }
    } else if (AMT_MINUS_RE.test(last)) {
      amount = parseAmount(last)
      descEnd = parts.length - 1
    } else if (AMT_ONLY_RE.test(last)) {
      if (AMT_ONLY_RE.test(secondLast) && last === secondLast) {
        amount = parseAmount(last)
        descEnd = parts.length - 2
      } else {
        amount = parseAmount(last)
        descEnd = parts.length - 1
      }
    }

    let description = parts.slice(0, descEnd).join(' ')

    const instMatch = INSTALLMENT_RE.exec(description)
    const installment = instMatch
      ? `${instMatch[2]}/${instMatch[1]}`
      : null

    description = description
      .replace(PAREN_AMT_RE, '')
      .replace(INSTALLMENT_RE, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    if (description && amount !== 0) {
      const category = categorizeTransaction(description)
      
      const cleanDescForId = description.replace(/\s+/g, '').toLowerCase().substring(0, 20)
      const txId = btoa(unescape(encodeURIComponent(`${dateStr}_${amount}_${cleanDescForId}`)))

      transactions.push({
        id: txId,
        type: 'expense',
        isManual: false,
        bank: 'Akbank',
        date: dateStr,
        description,
        amount,
        installment,
        category,
        raw_line: line,
      })
    }
  }

  return transactions
}
