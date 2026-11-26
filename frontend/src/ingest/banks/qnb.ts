import { parseEnAmount, type Money } from '../../core/money'
import { parseSlashDate, parseTurkishLongDate, type DayKey } from '../../core/date'
import { fold } from '../../core/text'
import { splitBilledTag, splitRewardTags, stripBilledTag } from '../columns'
import { hasUnrecognisedRowDate, parseStatementRowDate, STATEMENT_ROW } from '../rowDate'
import type { AdapterOutput, BankAdapter, RawRow } from './types'
import {
  PAYMENT_PATTERNS, REWARD_ONLY_PATTERNS, readForeignAmount, resolvePeriodStart, stripForeignNote,
} from './types'
import {
  emptySummary, type IgnoredReason, type IgnoredRow, type Installment, type TxKind,
} from '../../domain/types'

/**
 * QNB (QNB Trendyol / CardFinans / Miles&Smiles) statement lines:
 *
 *   21/10/2026 Ödeme - Tesekkür Ederiz - ⟨-1,000.00⟩
 *   22/10/2026 ORNEK HASTANE ⟨500.00⟩ 12/12
 *   (Ana Para: 470.00 Faiz: 20.00 Bsmv: 5.00 Kkdf: 5.00 )
 *   16/10/2026 STEAMGAMES.COM 4259522 (USD 5.00) ⟨255.00⟩
 *   24/10/2026 ORNEK LOKANTA 405.00 alşv ind ⟨-45.00⟩
 *
 * Amounts use Anglo grouping (1,210.00) with a leading `-` for credits
 * (payments, refunds, and campaign discounts). QNB's "Hesap Özetiniz" footer
 * table combines payments and discounts/refunds under "Ödemeler ve Alacaklar",
 * so `printedTotals.paymentLikeRefunds` is reconciled the same way as Garanti.
 */

const AMOUNT_TOKEN_RE = /^-?\d+(?:,\d{3})*\.\d{2}$/
const INSTALLMENT_TOKEN_RE = /^(\d{1,2})\/(\d{1,2})$/
const LONG_DATE = String.raw`\d{1,2}\s+[A-Za-zğüşıöçĞÜŞİÖÇ]+\s+\d{4}`

const CUT_DATE_RE = /(?<!Sonraki\s+)Hesap\s+Kesim\s+Tarihi\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/i
const DUE_DATE_RE = new RegExp(
  String.raw`(?<!Sonraki\s+)Son\s+[ÖO]deme\s+Tarihi\s*:?\s*(${LONG_DATE}|\d{2}[./]\d{2}[./]\d{4})`,
  'i',
)
const CARD_RE = /\bQNB\s+(?:Trendyol|CardFinans(?:\s+\w+)?|Miles&Smiles|First|Fix|Go|Business)\b|\bCardFinans(?:\s+\w+)?\b/i

function parseHeaderDate(raw: string): DayKey | null {
  const cleaned = raw.replace(/,.*$/, '').trim()
  return parseTurkishLongDate(cleaned) ?? parseSlashDate(cleaned)
}

function readAmount(token: string): { value: Money; credit: boolean } {
  const credit = token.startsWith('-')
  return { value: Math.abs(parseEnAmount(token)), credit }
}

function detect(text: string): number {
  const folded = fold(text)
  const dates = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/g)?.length ?? 0
  if (dates < 2) return 0

  let score = Math.min(0.4, dates / 50)
  if (/\bQNB(?:CARD)?\.COM\.TR\b|\bQNB\s+BANK\b|\bQNB\s+(?:TRENDYOL|CARDFINANS|FIRST|FIX|GO)\b/.test(folded)) {
    score += 0.45
  }
  if (/\bPARAPUAN\b|\bCARDFINANS\b/.test(folded)) score += 0.2
  if (/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/.test(text)) score += 0.1
  return Math.min(1, score)
}

function readSummary(text: string): Pick<AdapterOutput, 'summary' | 'printedTotals'> {
  const folded = fold(text)
  const summary = emptySummary()
  const AMOUNT = String.raw`(-?[\d,]+\.\d{2})`

  const money = (re: RegExp): Money | null => {
    const m = re.exec(folded)
    return m ? parseEnAmount(m[1]) : null
  }
  const date = (re: RegExp): DayKey | null => {
    const m = re.exec(folded)
    return m ? parseSlashDate(m[1]) : null
  }

  summary.totalDebt = money(new RegExp(String.raw`DONEM\s+BORCU\s*:?\s*${AMOUNT}`))
  summary.previousBalance = money(new RegExp(String.raw`ONCEKI\s+DONEM\s+BAKIYENIZ\s*:?\s*${AMOUNT}`))
  summary.minPayment = money(new RegExp(String.raw`ASGARI\s+ODEME\s+TUTARI\s*:?\s*${AMOUNT}`))
  summary.creditLimit = money(new RegExp(String.raw`KREDI\s+KARTI\s+LIMITI\s*:?\s*${AMOUNT}`))
  summary.availableLimit = money(new RegExp(String.raw`KULLANILABILIR\s+LIMIT\s*:?\s*${AMOUNT}`))
  summary.cashAdvanceLimit = money(new RegExp(String.raw`NAKIT\s+AVANS\s+LIMITI\s*:?\s*${AMOUNT}`))

  // Page 2 footer: "Hesap Özetiniz" 7-column summary bar
  //   Önceki Dönem Bakiye | Harcamalar ve Nakit Avans | Ücretler | Faiz | Vergi ve Fon | Ödemeler ve Alacaklar | Dönem Borcu
  //   1,000.00 1,255.00 0.00 0.00 0.00 -1,045.00 1,210.00 TL
  const ledger = new RegExp(
    String.raw`HESAP\s+OZETINIZ[\s\S]{0,220}?\n\s*${AMOUNT}\s+${AMOUNT}\s+${AMOUNT}\s+${AMOUNT}\s+${AMOUNT}\s+${AMOUNT}\s+${AMOUNT}\s*TL`,
  ).exec(folded)
  if (ledger) {
    summary.previousBalance ??= parseEnAmount(ledger[1])
    summary.totalDebt ??= parseEnAmount(ledger[7])
  }

  const rate = /AYLIK\s+TL\s+%\s*(\d{1,2}[.,]\d{1,2})/.exec(folded)
  if (rate) summary.interestMonthly = Number.parseFloat(rate[1].replace(',', '.'))

  summary.nextCutDate = date(/BIR\s+SONRAKI\s+HESAP\s+KESIM\s+TARIHINIZ\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/)
  summary.nextDueDate = date(/BIR\s+SONRAKI\s+SON\s+ODEME\s+TARIHINIZ\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/)

  const earnedMatch = /KAZANILAN\s+PARAPUAN\s*:?\s*([\d.,]+)/.exec(folded)
  const spentMatch = /KULLANILAN\s+PARAPUAN\s*:?\s*([\d.,]+)/.exec(folded)
  const balanceMatch = /TOPLAM\s+PARAPUAN\/TL\s+KARSIL[A-Z\s]{0,6}:?\s*[\d.,]+\s*\/\s*([\d,]+\.\d{2})/.exec(folded)
  if (earnedMatch || spentMatch || balanceMatch) {
    summary.loyalty = {
      programme: 'ParaPuan',
      earned: earnedMatch ? parseEnAmount(earnedMatch[1]) : null,
      spent: spentMatch ? parseEnAmount(spentMatch[1]) : null,
      balance: balanceMatch ? parseEnAmount(balanceMatch[1]) : null,
    }
  }

  return {
    summary,
    ...(ledger
      ? {
          printedTotals: {
            charges:
              parseEnAmount(ledger[2]) +
              parseEnAmount(ledger[3]) +
              parseEnAmount(ledger[4]) +
              parseEnAmount(ledger[5]),
            payments: Math.abs(parseEnAmount(ledger[6])),
          },
        }
      : {}),
  }
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
    let installmentToken = ''

    if (billed && AMOUNT_TOKEN_RE.test(billed.token)) {
      description = billed.before
      amountToken = billed.token
      const afterFirst = billed.after.split(/\s+/)[0] ?? ''
      if (INSTALLMENT_TOKEN_RE.test(afterFirst)) installmentToken = afterFirst
    } else if (!billed) {
      const parts = body.split(/\s+/).filter(Boolean)
      if (parts.length >= 2 && INSTALLMENT_TOKEN_RE.test(parts[parts.length - 1])) {
        installmentToken = parts.pop()!
      }
      const last = parts[parts.length - 1]
      if (parts.length >= 2 && AMOUNT_TOKEN_RE.test(last)) {
        amountToken = parts.pop()!
        description = parts.join(' ')
      } else if (rewards.length && parts.length) {
        const rewardToken = rewards[0]
        const reason: IgnoredReason = rewardToken.startsWith('-') ? 'reward-spent' : 'reward-earned'
        ignored.push({
          date,
          description: parts.join(' '),
          amount: Math.abs(parseEnAmount(rewardToken)),
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
    if (installmentToken) {
      const instMatch = INSTALLMENT_TOKEN_RE.exec(installmentToken)
      if (instMatch) {
        const current = Number(instMatch[1])
        const total = Number(instMatch[2])
        if (current > 0 && total > 0 && current <= total) {
          installment = { current, total }
        }
      }
    }

    const foreign = readForeignAmount(description)
    description = stripForeignNote(description).replace(/\s{2,}/g, ' ').trim()
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

    const reward = rewards.length && !rewards[0].startsWith('-') ? Math.abs(parseEnAmount(rewards[0])) : 0

    rows.push({
      date,
      description,
      amount,
      kind,
      installment,
      raw: stripBilledTag(line),
      ...(foreign ? { foreign } : {}),
      ...(reward > 0 ? { reward } : {}),
    })
  }

  const cutMatch = CUT_DATE_RE.exec(text)
  const dueMatch = DUE_DATE_RE.exec(text)
  const cardMatch = CARD_RE.exec(text)
  const { summary, printedTotals } = readSummary(text)

  if (printedTotals) {
    // QNB's "Ödemeler ve Alacaklar" column combines card payments with refunds
    // and discounts (e.g. "ORNEK LOKANTA 405.00 alşv ind -45.00").
    printedTotals.paymentLikeRefunds = rows
      .filter((row) => row.kind === 'refund')
      .reduce((total, row) => total + row.amount, 0)
  }

  const periodEnd = (cutMatch ? parseSlashDate(cutMatch[1]) : null) ?? maxDate

  return {
    rows,
    skipped,
    ignored,
    periodStart: resolvePeriodStart({
      printed: null,
      earliestRow: minCurrentCycleDate ?? minDate,
      periodEnd,
    }),
    periodEnd,
    dueDate: dueMatch ? parseHeaderDate(dueMatch[1]) : null,
    accountLabel: cardMatch ? cardMatch[0].trim() : 'QNB',
    summary,
    printedTotals,
  }
}

export const qnbAdapter: BankAdapter = {
  id: 'qnb',
  bank: 'QNB',
  detect,
  parse,
}
