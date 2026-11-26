import { parseAmountAuto, parseTrAmount, type Money } from '../../core/money'
import { parseSlashDate, type DayKey } from '../../core/date'
import { fold } from '../../core/text'
import { splitBilledTag, splitRewardTags, stripBilledTag } from '../columns'
import { hasUnrecognisedRowDate, parseStatementRowDate, STATEMENT_ROW } from '../rowDate'
import type { AdapterOutput, BankAdapter, RawRow } from './types'
import { PAYMENT_PATTERNS, REWARD_ONLY_PATTERNS, resolvePeriodStart } from './types'
import {
  emptySummary, type IgnoredReason, type IgnoredRow, type Installment, type StatementSummary, type TxKind,
} from '../../domain/types'

/**
 * Dünya Katılım / Paraf Kredi Kartı statement lines:
 *
 *   13/10/2026 A101 MARKET İSTANBUL TR 2/6 Taksit ⟨500,00⟩ ⟦0.00⟧
 *   25/10/2026 Ödeme için teşekkür ederiz ⟨+500,00⟩ ⟦0.00⟧
 *
 * Key accounting nuance (stated verbatim on page 2 of Dünya Katılım statements):
 *   "Devir Bakiyesi: Bir önceki döneme ait hesap özetinden kalan ve ödenmemiş
 *    borç tutarını ifade eder."
 * Unlike Garanti/Akbank/İş Bankası/QNB — which print the gross prior statement
 * balance before this cycle's payments — Dünya Katılım prints only the *unpaid*
 * carry-over after prior-cycle payments. Reconstructing the gross previous
 * balance as `unpaidDevir + payments` keeps the universal ledger identity
 * (`debt = previousBalance − payments + charges`, i.e. `charges = debt − unpaidDevir`)
 * exact without fabricating or hiding any row.
 */

const AMOUNT_TOKEN_RE = /^[+-]?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}[+-]?$/
const REWARD_TOKEN_RE = /^[+-]?(?:\d{1,3}(?:[.,]\d{3})*|\d+)[.,]\d{2}$/
const INSTALLMENT_RE = /(?:^|\s)(\d{1,2})\/(\d{1,2})\s*\.?\s*taksit(?=\s|$)/i

const CUT_DATE_RE = /(?<!Sonraki\s+)Hesap\s+Kesim\s+Tarihi\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/i
const DUE_DATE_RE = /(?<!Sonraki\s+)Son\s+[ÖO]deme\s+Tarihi\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/i

function readAmount(token: string): { value: Money; credit: boolean } {
  const credit = token.startsWith('+') || token.startsWith('-') || token.endsWith('+') || token.endsWith('-')
  return { value: Math.abs(parseTrAmount(token)), credit }
}

function detect(text: string): number {
  const folded = fold(text)
  const dates = text.match(/\b\d{2}[./]\d{2}[./]\d{4}\b/g)?.length ?? 0
  if (dates < 2) return 0

  let score = Math.min(0.35, dates / 30)
  if (/\bDUNYA\s+KATILIM\b|\bDUNYAKATILIM\.COM\.TR\b/.test(folded)) score += 0.5
  if (/\bPARAFPARA\b|\bPARAF\s+KREDI\s+KARTI\b/.test(folded)) score += 0.2
  if (/\bDEVIR\s+BAKIYESI\b/.test(folded)) score += 0.1
  return Math.min(1, score)
}

function readSummary(text: string): { summary: StatementSummary; unpaidDevir: Money | null } {
  const folded = fold(text)
  const summary = emptySummary()
  const AMOUNT = String.raw`(-?[\d.]+,\d{2})`

  const money = (re: RegExp): Money | null => {
    const m = re.exec(folded)
    return m ? parseTrAmount(m[1]) : null
  }
  const date = (re: RegExp): DayKey | null => {
    const m = re.exec(folded)
    return m ? parseSlashDate(m[1]) : null
  }

  summary.totalDebt = money(new RegExp(String.raw`DONEM\s+BORCU\s*:?\s*${AMOUNT}`))
  const unpaidDevir = money(new RegExp(String.raw`DEVIR\s+BAKIYESI\s*:?\s*${AMOUNT}`))
  summary.minPayment = money(new RegExp(String.raw`ASGARI\s+ODEME\s+TUTARI\s*:?\s*${AMOUNT}`))
  summary.creditLimit = money(new RegExp(String.raw`KART\s+LIMITI\s*:?\s*${AMOUNT}`))

  const rate = /AKDI\s+KAR\s+PAYI\s+ORANI\s*:?\s*%\s*(\d{1,2}[.,]\d{1,2})/.exec(folded)
  if (rate) summary.interestMonthly = Number.parseFloat(rate[1].replace(',', '.'))

  summary.nextCutDate = date(/BIR\s+SONRAKI\s+HESAP\s+KESIM\s+TARIHI\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/)
  summary.nextDueDate = date(/BIR\s+SONRAKI\s+SON\s+ODEME\s+TARIHI\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/)

  const parafBalance = money(new RegExp(String.raw`TOPLAM\s+PARAFPARA\s*:?\s*${AMOUNT}`))
  if (parafBalance !== null) {
    summary.loyalty = { programme: 'ParafPara', earned: null, spent: null, balance: parafBalance }
  }

  return { summary, unpaidDevir }
}

function parse(text: string): AdapterOutput {
  const rows: RawRow[] = []
  const ignored: IgnoredRow[] = []
  let skipped = 0
  let minDate: DayKey | null = null
  let minCurrentCycleDate: DayKey | null = null
  let maxDate: DayKey | null = null

  for (const rawLine of text.split('\n')) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    const { line, rewards } = splitRewardTags(trimmed)
    if (!line) continue

    const match = STATEMENT_ROW.exec(line)
    if (!match) {
      if (hasUnrecognisedRowDate(line)) skipped++
      continue
    }

    const date = parseStatementRowDate(match[1])
    if (!date) {
      skipped++
      continue
    }

    const body = match[2]?.trim() ?? ''
    if (!body) continue

    const billed = splitBilledTag(body)
    let description = ''
    let amountToken = ''

    if (billed && AMOUNT_TOKEN_RE.test(billed.token)) {
      description = billed.before
      amountToken = billed.token
    } else if (!billed) {
      const parts = body.split(/\s+/).filter(Boolean)
      const last = parts[parts.length - 1]
      const prev = parts[parts.length - 2]

      if (!rewards.length && parts.length >= 3 && REWARD_TOKEN_RE.test(last) && AMOUNT_TOKEN_RE.test(prev)) {
        // Text without column tags: Tutar (TL) followed by ParafPara.
        amountToken = prev
        rewards.push(last)
        description = parts.slice(0, -2).join(' ')
      } else if (parts.length >= 2 && AMOUNT_TOKEN_RE.test(last)) {
        amountToken = last
        description = parts.slice(0, -1).join(' ')
      } else if (rewards.length && body) {
        const rewardToken = rewards[0]
        const reason: IgnoredReason = rewardToken.startsWith('-') ? 'reward-spent' : 'reward-earned'
        ignored.push({
          date,
          description: body,
          amount: Math.abs(parseAmountAuto(rewardToken)),
          reason,
          raw: line,
        })
        continue
      } else {
        skipped++
        continue
      }
    } else {
      skipped++
      continue
    }

    let installment: Installment | null = null
    const instMatch = INSTALLMENT_RE.exec(description)
    if (instMatch) {
      const current = Number(instMatch[1])
      const total = Number(instMatch[2])
      if (current > 0 && total > 0 && current <= total) {
        installment = { current, total }
        description = description.replace(instMatch[0], ' ')
      }
    }

    description = description.replace(/\s{2,}/g, ' ').trim()
    if (!description) {
      skipped++
      continue
    }

    const { value: amount, credit } = readAmount(amountToken)

    if (!billed && REWARD_ONLY_PATTERNS.test(description)) {
      ignored.push({
        date,
        description,
        amount,
        reason: credit ? 'reward-spent' : 'campaign',
        raw: line,
      })
      continue
    }
    if (amount === 0) continue

    let kind: TxKind = credit ? 'refund' : 'expense'
    if (credit && PAYMENT_PATTERNS.test(fold(description))) kind = 'payment'

    if (!minDate || date < minDate) minDate = date
    if ((!installment || installment.current <= 1) && (!minCurrentCycleDate || date < minCurrentCycleDate)) {
      minCurrentCycleDate = date
    }
    if (!maxDate || date > maxDate) maxDate = date

    const reward = rewards.length && !rewards[0].startsWith('-') ? Math.abs(parseAmountAuto(rewards[0])) : 0

    rows.push({
      date,
      description,
      amount,
      kind,
      installment,
      raw: stripBilledTag(line),
      ...(reward > 0 ? { reward } : {}),
    })
  }

  const cutMatch = CUT_DATE_RE.exec(text)
  const dueMatch = DUE_DATE_RE.exec(text)
  const { summary, unpaidDevir } = readSummary(text)

  const totalPayments = rows
    .filter((row) => row.kind === 'payment')
    .reduce((sum, row) => sum + row.amount, 0)
  if (unpaidDevir !== null) {
    summary.previousBalance = unpaidDevir + totalPayments
  }

  const periodEnd = (cutMatch ? parseSlashDate(cutMatch[1]) : null) ?? maxDate
  const isParaf = /\bPARAF\b/i.test(text)

  return {
    rows,
    skipped,
    ignored,
    periodStart: resolvePeriodStart({
      printed: null,
      earliestRow: minCurrentCycleDate,
      periodEnd,
    }),
    periodEnd,
    dueDate: dueMatch ? parseSlashDate(dueMatch[1]) : null,
    accountLabel: isParaf ? 'Dünya Katılım Paraf' : 'Dünya Katılım',
    summary,
  }
}

export const dunyaKatilimAdapter: BankAdapter = {
  id: 'dunyakatilim',
  bank: 'Dünya Katılım',
  detect,
  parse,
}
