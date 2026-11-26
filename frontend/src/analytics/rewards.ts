import type { DayKey } from '../core/date'
import type { Money } from '../core/money'
import { fold } from '../core/text'
import type { IgnoredRow, Statement, Transaction } from '../domain/types'

/**
 * Bonus, Chip-para: what the card gave back, and what it was spent on.
 *
 * Both programmes count in lira — "Bonus (TL)" on a Garanti statement, "chip-para
 * ile ödediniz 120,00 TL" on an Akbank one — so a figure here is money, just not
 * money that was spent: it never enters the spending analysis, and it never
 * leaves the statement it came from. What the parser already keeps apart (the
 * loyalty column, the cover's totals, the rows that carry nothing else) is put
 * back together here into the three numbers a person actually wants:
 *
 *   kazanılan   what was credited this period, and from what
 *   harcanan    what was used to pay for things
 *   bakiye      what is left to spend, as of the newest statement
 *
 * Where the bank prints its own totals they are the answer and the itemised lines
 * are the explanation; the part of a printed total the lines do not account for
 * is shown as "Diğer" rather than dropped, so the lines always add up to it.
 */

export interface RewardLine {
  label: string
  amount: Money
  count: number
}

export interface ProgrammeRewards {
  /** "Bonus" or "Chip-para". */
  programme: string
  bank: string
  /** How many statements this covers. */
  statements: number
  earned: Money
  spent: Money
  /** What was left at the newest statement that prints it. */
  balance: Money | null
  balanceAsOf: DayKey | null
  earnedBy: RewardLine[]
  spentOn: RewardLine[]
}

export interface RewardsReport {
  programmes: ProgrammeRewards[]
  earned: Money
  spent: Money
}

export const EMPTY_REWARDS: RewardsReport = { programmes: [], earned: 0, spent: 0 }

/** What each bank calls its programme, for a statement whose cover does not say. */
function programmeOf(statement: Statement): string | null {
  const printed = statement.summary?.loyalty?.programme
  if (printed) return printed
  const bank = fold(statement.bank)
  if (bank.includes('AKBANK')) return 'Chip-para'
  if (bank.includes('GARANTI')) return 'Bonus'
  if (bank.includes('IS BANKASI')) return 'MaxiPuan'
  if (bank.includes('DUNYA KATILIM')) return 'ParafPara'
  if (bank.includes('HALKBANK')) return 'ParafPara'
  if (bank.includes('QNB')) return 'ParaPuan'
  return null
}

/** Nicer words for the lines every statement has; anything else is title-cased as printed. */
const LABELS: Array<[RegExp, string]> = [
  [/BONUS BEDAVA/, 'Bonusla ödenen alışveriş'],
  [/CHIP-?\s?PARA\s+ILE\s+ODEME/, 'Chip-para ile ödeme'],
  [/OTOMATIK\s+FATURA/, 'Otomatik fatura bonusu'],
  [/BASVURU\s+KAMPANYA/, 'Başvuru kampanyası'],
]

function titleCase(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/(^|\s)(\S)/gu, (_, space: string, letter: string) => space + letter.toLocaleUpperCase('tr'))
}

function labelOf(description: string): { key: string; label: string } {
  const key = fold(description).replace(/\s+/g, ' ').trim().toUpperCase()
  const known = LABELS.find(([pattern]) => pattern.test(key))
  return { key, label: known ? known[1] : titleCase(description.replace(/\s+/g, ' ').trim()) }
}

/** An Akbank chip-para payment arrives as a credit row, not as a loyalty line. */
const CHIP_PAYMENT = /CHIP-?\s?PARA\s+ILE\s+ODEME/i

class Lines {
  private readonly byKey = new Map<string, RewardLine>()

  /** A row as the statement printed it: its words decide which line it joins. */
  add(description: string, amount: Money): void {
    if (amount <= 0) return
    const { key, label } = labelOf(description)
    this.put(key, label, amount, 1)
  }

  /** A line that already has its name — a total, or one carried over from another statement. */
  addLine(label: string, amount: Money, count: number): void {
    if (amount <= 0) return
    this.put(label, label, amount, count)
  }

  private put(key: string, label: string, amount: Money, count: number): void {
    const line = this.byKey.get(key)
    if (line) {
      line.amount += amount
      line.count += count
    } else {
      this.byKey.set(key, { label, amount, count })
    }
  }

  get total(): Money {
    let sum = 0
    for (const line of this.byKey.values()) sum += line.amount
    return sum
  }

  /** Largest first; "Diğer" always last, whatever its size. */
  toArray(): RewardLine[] {
    return [...this.byKey.values()].sort((a, b) => {
      if (a.label === OTHER) return 1
      if (b.label === OTHER) return -1
      return b.amount - a.amount
    })
  }
}

const OTHER = 'Diğer'
const PURCHASES = 'Alışverişlerden'

/**
 * `statements` is the selection to report on: the caller picks the month and
 * card (see `statementsInScope`), because bonus is a per-statement figure and
 * belongs to whichever statements the screen is showing.
 */
export function buildRewards(input: {
  statements: readonly Statement[]
  transactions: readonly Transaction[]
}): RewardsReport {
  const { statements: chosen, transactions } = input
  if (chosen.length === 0) return EMPTY_REWARDS

  const byStatement = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (!tx.statementId) continue
    const list = byStatement.get(tx.statementId)
    if (list) list.push(tx)
    else byStatement.set(tx.statementId, [tx])
  }

  interface Accumulator {
    programme: string
    bank: string
    statements: number
    earned: number
    spent: number
    earnedBy: Lines
    spentOn: Lines
    balance: { value: Money; asOf: DayKey } | null
  }
  const byProgramme = new Map<string, Accumulator>()

  for (const statement of chosen) {
    const programme = programmeOf(statement)
    if (!programme) continue

    const rows = byStatement.get(statement.id) ?? []
    const ignored: IgnoredRow[] = statement.ignored ?? []
    const printed = statement.summary?.loyalty ?? null

    const earnedLines = new Lines()
    for (const row of ignored) {
      if (row.reason === 'reward-earned' || row.reason === 'campaign') earnedLines.add(row.description, row.amount)
    }
    const itemised = earnedLines.total

    let rewardedRows = 0
    let rewardOnRows = 0
    for (const tx of rows) {
      if (tx.kind === 'expense' && tx.reward) {
        rewardOnRows += tx.reward
        rewardedRows += 1
      }
    }

    // What shopping earned is the bank's total less the separate award lines —
    // net of the clawbacks printed on refunds, which a purchase row cannot show
    // (summing the rows alone read ₺12,60 where the bank printed ₺12,53). Without
    // a printed total the rows are all there is.
    const printedEarned = printed?.earned ?? null
    const earned = printedEarned !== null ? Math.max(printedEarned, itemised) : itemised + rewardOnRows
    earnedLines.addLine(PURCHASES, earned - itemised, rewardedRows)

    const spentLines = new Lines()
    for (const row of ignored) if (row.reason === 'reward-spent') spentLines.add(row.description, row.amount)
    for (const tx of rows) {
      if (tx.kind === 'refund' && CHIP_PAYMENT.test(fold(tx.description))) spentLines.add(tx.description, tx.amount)
    }

    // Spending has no such blind spot, so the lines are expected to add up to
    // the printed total; whatever they do not explain is shown as "Diğer"
    // rather than dropped.
    const spent = Math.max(printed?.spent ?? 0, spentLines.total)
    spentLines.addLine(OTHER, spent - spentLines.total, 0)

    if (earned === 0 && spent === 0 && (printed?.balance ?? null) === null) continue

    const key = `${statement.bank}|${programme}`
    let acc = byProgramme.get(key)
    if (!acc) {
      acc = {
        programme, bank: statement.bank, statements: 0, earned: 0, spent: 0,
        earnedBy: new Lines(), spentOn: new Lines(), balance: null,
      }
      byProgramme.set(key, acc)
    }

    acc.statements += 1
    acc.earned += earned
    acc.spent += spent
    for (const line of earnedLines.toArray()) acc.earnedBy.addLine(line.label, line.amount, line.count)
    for (const line of spentLines.toArray()) acc.spentOn.addLine(line.label, line.amount, line.count)

    const asOf = statement.periodEnd ?? statement.periodStart
    if (printed?.balance != null && asOf && (!acc.balance || asOf >= acc.balance.asOf)) {
      acc.balance = { value: printed.balance, asOf }
    }
  }

  const programmes: ProgrammeRewards[] = [...byProgramme.values()]
    .map((acc) => ({
      programme: acc.programme,
      bank: acc.bank,
      statements: acc.statements,
      earned: acc.earned,
      spent: acc.spent,
      balance: acc.balance?.value ?? null,
      balanceAsOf: acc.balance?.asOf ?? null,
      earnedBy: acc.earnedBy.toArray(),
      spentOn: acc.spentOn.toArray(),
    }))
    .sort((a, b) => b.earned + b.spent - (a.earned + a.spent))

  return {
    programmes,
    earned: programmes.reduce((sum, p) => sum + p.earned, 0),
    spent: programmes.reduce((sum, p) => sum + p.spent, 0),
  }
}

/** The name of a programme as a person would say it in a sentence: "bonus", "chip-para". */
export function programmeWord(programme: string): string {
  return programme.toLocaleLowerCase('tr')
}
