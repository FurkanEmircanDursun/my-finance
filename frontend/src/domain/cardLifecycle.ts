import { UserFacingError } from '../core/errors'
import { daysInMonth, makeDayKey, monthOf, type DayKey, type MonthKey } from '../core/date'
import { hash, uid } from '../core/hash'
import { fold } from '../core/text'
import { cardBankLabel, cardDisplayName, cardMatchesBank } from './cards'
import { identifyBank } from './banks'
import { cardOf, effectiveDate, spendAmount, type CardBank, type CreditCard, type ParseResult, type Statement, type Transaction } from './types'

export type CardStatementState = 'ready' | 'missing' | 'upcoming' | 'untracked'
export interface CardPeriod {
  id: string
  name: string
  bank: string
  card?: CreditCard
  archived: boolean
  statements: Statement[]
  transactions: Transaction[]
  netSpend: number
  cutoff: DayKey | null
  status: CardStatementState
}

const labelKey = (label: string) => fold(label.trim()).replace(/\s+/g, ' ')
export function cardBankFromName(bank: string): CardBank | null {
  const id = identifyBank(bank)
  return id === 'other' ? null : id
}
export function legacyCardKey(bank: string, label: string): string {
  const id = cardBankFromName(bank)
  return `legacy-${hash(`${id ?? labelKey(bank)}|${labelKey(label)}`)}`
}
export function cardCutoffDate(month: MonthKey, day: number): DayKey {
  return makeDayKey(Number(month.slice(0, 4)), Number(month.slice(5, 7)), Math.min(day, daysInMonth(month)))
}
export function statementMonth(statement: Statement): MonthKey | null {
  const anchor = statement.periodEnd ?? statement.periodStart
  return anchor ? monthOf(anchor) : null
}

/** Explicit card IDs win. A legacy label is attached only when one physical card owns it. */
export function buildCardPeriods({ cards, archivedCards = [], statements, transactions, month, today }: {
  cards: readonly CreditCard[]
  archivedCards?: readonly CreditCard[]
  statements: readonly Statement[]
  transactions: readonly Transaction[]
  month: MonthKey | 'all'
  today: DayKey
}): CardPeriod[] {
  const configurations = [...cards, ...archivedCards.filter(old => !cards.some(card => card.id === old.id))]
  const activeIds = new Set(cards.map(card => card.id))
  const aliases = new Map<string, string[]>()
  for (const card of configurations) {
    for (const alias of new Set([cardDisplayName(card), card.name].map(labelKey))) {
      const key = `${card.bank}|${alias}`
      aliases.set(key, [...(aliases.get(key) ?? []), card.id])
    }
  }
  const resolve = (row: { cardId?: string; bank: string; accountLabel?: string }): string => {
    if (row.cardId) return row.cardId
    const owners = aliases.get(`${cardBankFromName(row.bank)}|${labelKey(cardOf(row))}`)
    return owners?.length === 1 ? owners[0] : legacyCardKey(row.bank, cardOf(row))
  }
  const all = new Map<string, CardPeriod>()
  for (const card of configurations) all.set(card.id, {
    id: card.id, name: cardDisplayName(card), bank: cardBankLabel(card.bank),
    card, archived: !activeIds.has(card.id), statements: [], transactions: [], netSpend: 0,
    cutoff: month === 'all' ? null : cardCutoffDate(month, card.statementDay), status: 'untracked',
  })
  const ensure = (id: string, row: { bank: string; accountLabel?: string }): CardPeriod | undefined => {
    const existing = all.get(id)
    if (existing) return existing
    if (!cardBankFromName(row.bank)) return undefined
    const created: CardPeriod = { id, name: cardOf(row), bank: row.bank, archived: false, statements: [], transactions: [], netSpend: 0, cutoff: null, status: 'untracked' }
    all.set(id, created)
    return created
  }
  const statementCards = new Map<string, string>()
  for (const statement of statements) {
    const id = resolve(statement)
    statementCards.set(statement.id, id)
    if (month !== 'all' && statementMonth(statement) !== month) continue
    ensure(id, statement)?.statements.push(statement)
  }
  for (const transaction of transactions) {
    if (transaction.source === 'manual' || (month !== 'all' && monthOf(effectiveDate(transaction)) !== month)) continue
    const id = transaction.cardId ?? (transaction.statementId ? statementCards.get(transaction.statementId) : undefined) ?? resolve(transaction)
    ensure(id, transaction)?.transactions.push(transaction)
  }
  return [...all.values()].filter(period => !period.archived || period.statements.length > 0 || period.transactions.length > 0)
    .map(period => ({ ...period,
      transactions: period.transactions.sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a))),
      netSpend: period.transactions.reduce((sum, tx) => sum + spendAmount(tx), 0),
      status: period.statements.length ? 'ready' as const : period.card && !period.archived && period.cutoff
        ? period.cutoff < today ? 'missing' as const : 'upcoming' as const : 'untracked' as const,
    }))
    .sort((a, b) => Number(b.status === 'missing') - Number(a.status === 'missing') || a.name.localeCompare(b.name, 'tr'))
}

/** Draft dates come from the statement cover; an unknown cutoff stays explicitly unset. */
export function importedCardDraft(statement: Statement, archivedCards: readonly CreditCard[] = [], savedCardIds?: readonly string[]): CreditCard | null {
  if (statement.cardId && (!savedCardIds || savedCardIds.includes(statement.cardId))) return null
  const bank = cardBankFromName(statement.bank)
  if (!bank) return null
  // A name or last four digits is not proof of physical-card identity.
  const previous = statement.cardId ? archivedCards.find(card => card.id === statement.cardId) : undefined
  if (previous) return previous
  const day = statement.periodEnd ? Number(statement.periodEnd.slice(8, 10)) : 0
  const rawName = cardOf(statement)
  const suffixMatch = /^(.*?)\s*·\s*(\d{4})$/.exec(rawName)
  const name = suffixMatch ? suffixMatch[1].trim() || rawName : rawName
  const last4 = suffixMatch?.[2]
  return {
    id: statement.cardId ?? uid('card-'),
    bank,
    name,
    ...(last4 ? { last4 } : {}),
    statementDay: day,
    entryDay: day ? Math.min(31, day + 1) : 0,
    remindersEnabled: true,
  }
}

export interface ImportCardChoice { card: CreditCard; saved: boolean; fileName?: string }

/** Declining reminder setup must not make an imported physical card unselectable. */
export function importCardChoices(cards: readonly CreditCard[], statements: readonly Statement[]): ImportCardChoice[] {
  const choices = new Map<string, ImportCardChoice>(cards.map(card => [card.id, { card, saved: true }]))
  for (const statement of [...statements].sort((a, b) => b.importedAt - a.importedAt)) {
    const bank = cardBankFromName(statement.bank)
    if (!bank) continue
    const id = statement.cardId ?? legacyCardKey(statement.bank, cardOf(statement))
    if (choices.has(id)) continue
    const day = statement.periodEnd ? Number(statement.periodEnd.slice(8, 10)) : 0
    choices.set(id, { saved: false, fileName: statement.fileName, card: { id, bank, name: cardOf(statement),
      statementDay: day, entryDay: day ? Math.min(31, day + 1) : 0, remindersEnabled: true } })
  }
  return [...choices.values()]
}

/** Reserve physical identity before deduplication, supporting 1-to-N cards per bank automatically. */
export function resolveImportCard(result: ParseResult, { selectedId, newCard = false, cards, statements, reservations, interruptedCard, claimedLast4ByCardId }: {
  selectedId?: string
  newCard?: boolean
  cards: readonly CreditCard[]
  statements: readonly Statement[]
  reservations: Map<string, CreditCard>
  interruptedCard?: { id: string; name: string }
  /** Card IDs already claimed by a specific printed last4 during the current batch. */
  claimedLast4ByCardId?: ReadonlyMap<string, string>
}): CreditCard | undefined {
  if (interruptedCard && (newCard || (selectedId && interruptedCard.id !== selectedId))) {
    throw new UserFacingError('Bu PDF’nin aktarımı başlamış. Devam etmek için aynı kartı kullan.')
  }
  const bank = cardBankFromName(result.bank)
  if (interruptedCard && bank) {
    const day = result.periodEnd ? Number(result.periodEnd.slice(8, 10)) : 0
    const card = cards.find(item => item.id === interruptedCard.id) ?? {
      ...interruptedCard, bank, statementDay: day, entryDay: day ? Math.min(31, day + 1) : 0, remindersEnabled: true,
    }
    reservations.set(`${bank}|${labelKey(result.accountLabel)}`, card)
    return card
  }
  if (selectedId) {
    const selected = importCardChoices(cards, statements).find(choice => choice.card.id === selectedId)?.card
    if (!selected) throw new UserFacingError('Seçilen kart bulunamadı. Kartını yeniden seç.')
    return selected
  }
  if (!bank) return undefined

  const last4 = result.reportedCardLast4
  const bankCards = cards.filter(card => cardMatchesBank(card, result.bank))
  const claimedConflict = (cardId: string) =>
    Boolean(last4 && claimedLast4ByCardId?.has(cardId) && claimedLast4ByCardId.get(cardId) !== last4)

  if (!newCard && bankCards.length > 0) {
    if (last4) {
      // 1. Exact physical match by printed last 4 digits.
      const exactLast4 = bankCards.filter(card => card.last4 === last4)
      if (exactLast4.length === 1) return exactLast4[0]

      // 2. Match a saved card of the same bank without last4 when its product name matches.
      const byName = bankCards.filter(
        card => !card.last4 && !claimedConflict(card.id) && labelKey(card.name) === labelKey(result.accountLabel),
      )
      if (byName.length === 1) return byName[0]

      // 3. If the user has a single saved card for this bank with no last4 recorded
      //    and it has not been claimed by another physical card in this batch, bind to it.
      if (bankCards.length === 1 && !bankCards[0].last4 && !claimedConflict(bankCards[0].id)) {
        return bankCards[0]
      }
      // Otherwise this PDF belongs to a distinct physical card in the same bank (1-to-N):
      // fall through to reserve/create its own provisional card identity automatically.
    } else {
      // No last4 on statement (e.g. plain text / legacy export): bind when unambiguous.
      if (bankCards.length === 1) return bankCards[0]
      const byName = bankCards.filter(card => labelKey(card.name) === labelKey(result.accountLabel))
      if (byName.length === 1) return byName[0]
    }
  }

  const key = last4 ? `${bank}|last4:${last4}` : `${bank}|${labelKey(result.accountLabel)}`
  const reserved = reservations.get(key)
  if (reserved) return reserved

  // Reuse an existing provisional card identity from prior statements when it does not
  // conflict with a saved card that has a different last4.
  const conflictingSavedIds = new Set(
    last4 ? bankCards.filter(card => card.last4 && card.last4 !== last4).map(card => card.id) : [],
  )
  const previousCandidates = newCard ? [] : statements.filter(statement => {
    if (cardBankFromName(statement.bank) !== bank) return false
    if (statement.cardId && (conflictingSavedIds.has(statement.cardId) || claimedConflict(statement.cardId))) return false
    if (last4 && statement.accountLabel?.endsWith(`· ${last4}`)) return true
    return labelKey(cardOf(statement)) === labelKey(result.accountLabel)
  })
  const previousIdentities = new Set(
    previousCandidates.map(statement => statement.cardId ?? legacyCardKey(statement.bank, cardOf(statement))),
  )
  if (!last4 && previousIdentities.size > 1) {
    throw new UserFacingError('Bu bankaya ait aynı isimli birden fazla kart ekstresi var. Ekstrenin ait olduğu kartı seçip tekrar dene.')
  }
  const previous = previousIdentities.size === 1 ? previousCandidates.find(statement => statement.cardId) : undefined
  const day = result.periodEnd ? Number(result.periodEnd.slice(8, 10)) : 0
  const provisional: CreditCard = {
    id: previous?.cardId ?? uid('card-'),
    bank,
    name: result.accountLabel,
    ...(last4 ? { last4 } : {}),
    statementDay: day,
    entryDay: day ? Math.min(31, day + 1) : 0,
    remindersEnabled: true,
  }
  reservations.set(key, provisional)
  return provisional
}

export function linkImportedCard(statement: Statement, card: CreditCard): Statement {
  const label = cardDisplayName(card)
  return { ...statement, cardId: card.id, accountLabel: label,
    label: `${label}${statementMonth(statement) ? ` · ${statementMonth(statement)}` : ''}`,
  }
}
