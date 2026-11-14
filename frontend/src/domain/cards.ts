import { hash } from '../core/hash'
import type { CardBank, CreditCard, ParseResult, Transaction } from './types'

export function cardBankLabel(bank: CardBank): string {
  return bank === 'akbank' ? 'Akbank' : 'Garanti BBVA'
}

export function cardDisplayName(card: CreditCard): string {
  return `${card.name}${card.last4 ? ` · ${card.last4}` : ''}`
}

export function isCardDay(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 31
}

/** Read older/edited profiles without allowing invalid days into scheduling. */
export function sanitizeCards(value: unknown): CreditCard[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((raw): CreditCard[] => {
    if (!raw || typeof raw !== 'object') return []
    const card = raw as Partial<CreditCard>
    if (typeof card.id !== 'string' || !card.id || seen.has(card.id)) return []
    if (card.bank !== 'akbank' && card.bank !== 'garanti') return []
    if (typeof card.name !== 'string' || !card.name.trim()) return []
    if (!isCardDay(card.statementDay!) || !isCardDay(card.entryDay!)) return []
    seen.add(card.id)
    return [{
      id: card.id, bank: card.bank, name: card.name.trim().slice(0, 40),
      ...(typeof card.last4 === 'string' && /^\d{4}$/.test(card.last4) ? { last4: card.last4 } : {}),
      statementDay: card.statementDay!, entryDay: card.entryDay!, remindersEnabled: card.remindersEnabled !== false,
    }]
  })
}

/** Calendar occurrence, including today; short months use their last day. */
export function nextCardDate(day: number, now = new Date()): Date {
  if (!isCardDay(day)) throw new RangeError('Kart günü 1–31 arasında olmalı.')
  const occurrence = (offset: number) => {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0).getDate()
    return new Date(now.getFullYear(), now.getMonth() + offset, Math.min(day, lastDay), 9)
  }
  const current = occurrence(0)
  return current.getDate() >= now.getDate() ? current : occurrence(1)
}

export function cardMatchesBank(card: CreditCard, bank: string): boolean {
  const normalized = bank.toLocaleLowerCase('tr-TR')
  return card.bank === 'akbank' ? normalized.includes('akbank') : normalized.includes('garanti')
}

/** Scope parser identities to a physical card, so identical purchases on two cards survive. */
export function assignResultCard(result: ParseResult, card: CreditCard): ParseResult {
  if (!cardMatchesBank(card, result.bank)) throw new Error(`Bu dosya ${cardBankLabel(card.bank)} kartına ait değil. Doğru kartı seçip tekrar dene.`)
  const accountLabel = cardDisplayName(card)
  return {
    ...result,
    accountLabel,
    label: result.label.replace(result.accountLabel, accountLabel),
    transactions: result.transactions.map((tx): Transaction => ({
      ...tx, id: `tx-card-${hash(`${card.id}|${tx.id}`)}`, cardId: card.id, accountLabel,
    })),
  }
}
