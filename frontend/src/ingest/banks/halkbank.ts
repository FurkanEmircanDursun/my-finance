import { parseAmountAuto, type Money } from '../../core/money'
import { parseSlashDate, type DayKey } from '../../core/date'
import { fold } from '../../core/text'
import { splitBilledTag, splitRewardTags, stripBilledTag } from '../columns'
import { hasUnrecognisedRowDate, parseStatementRowDate, STATEMENT_ROW } from '../rowDate'
import type { AdapterOutput, BankAdapter, RawRow } from './types'
import { PAYMENT_PATTERNS, resolvePeriodStart } from './types'
import {
  emptySummary, type IgnoredReason, type IgnoredRow, type Installment, type StatementSummary, type TxKind,
} from '../../domain/types'

/**
 * Halkbank / Paraf Kredi Kartı statement lines:
 *
 *   22/05/2026 PARLAK DENTAL DİYARBAKIR ⟨39,500.00⟩ 0.00/4- ⟦0.00⟧
 *   04.Taksit
 *   15/08/2026 Hesaptan Ödeme - Teşekkür Ederiz - + 71,000.00 ⟦0.00⟧
 *   13/08/2026 E/TRENDYOL Puan Kullanım ⟨0.00⟩ ⟦-3.06⟧
 *   23/08/2026 Seyahat Kamp. ParafPara ⟨0.00⟩ ⟦750.00⟧
 *
 * Notes:
 * - Halkbank formats currency with Anglo grouping (`155,174.82`) and labels the
 *   cycle balance "Hesap Bakiyesi".
 * - Credits (payments, campaign discounts, instalment refunds) print a space
 *   between `+` and the amount (`+ 71,000.00`), so the column tagger leaves them
 *   untagged; both tagged and space-signed amounts are handled here.
 * - Instalment rows print `<remaining>/<total>-` on the main line and
 *   `<current>.Taksit` on the immediately following line.
 */

const AMOUNT_TOKEN_RE = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+|\d+)[.,]\d{2}$/
const REWARD_TOKEN_RE = /^[+-]?(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2}$/
const SPACE_CREDIT_RE = /^(.*?)\s+\+\s*((?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+|\d+)[.,]\d{2})(?:\s+(.*))?$/
const REMAINING_TOTAL_RE = /(?:^|\s)([\d.,]+)\/(\d{1,2})-?(?:\s|$)/
const INLINE_TAKSIT_RE = /(?:^|\s)0?(\d{1,2})\.\s*taksit(?:\s|$)/i
const NEXT_TAKSIT_RE = /^0?(\d{1,2})\.\s*taksit$/i

const CUT_DATE_RE = /(?<!BIR\s+SONRAKI\s+)HESAP\s+KESIM\s+TARIHI\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/
const DUE_DATE_RE = /(?<!BIR\s+SONRAKI\s+)SON\s+ODEME\s+TARIHI\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/

/** Lines that belong to page headers/footers or cover blocks, never to a wrapped merchant name. */
const NON_CONTINUATION_RE =
  /^(?:TURKIYE\s+HALK|BUYUK\s+MUKELLEF|TICARET\s+SICIL|ISLEM$|TARIHI\b|TAKSIT$|BIR\s+(?:ONCEKI|SONRAKI)|EKSTRE\s+ILE|KART\s+NO|FAIZ\s+ORAN|ALISVERIS\s+FAIZ|NAKIT\s+AVANS|GECIKME\s+FAIZ|KESIM\b|SON\s+ODEME|MUSTERI\b|KART\s+BILG|HESAP\s+(?:KESIM|BAKIYE)|ASGARI\s+ODEME|TOPLAM\s+|KULLANILABILIR|PARAFPARA\b|DONEM\s+ICI|DONEMSEL\s+ALACAK|KAYITLARI\b|VERGILER\b|SAYIN\b)/

function detect(text: string): number {
  const folded = fold(text)
  const dates = text.match(/\b\d{2}[./]\d{2}[./]\d{4}\b/g)?.length ?? 0
  if (dates < 2) return 0

  let score = Math.min(0.3, dates / 30)
  if (/\bTURKIYE\s+HALK\s+BANKASI\b|\bHALKBANK\b|\bPARAF\.COM\.TR\b/.test(folded)) score += 0.55
  if (/\bPARAFPARA\b/.test(folded) && /\b(?:HESAP\s+BAKIYESI|DONEM\s+ICI\s+BORC\s+TUTARI)\b/.test(folded)) score += 0.2
  if (/\bDONEMSEL\s+ALACAK\b/.test(folded)) score += 0.1
  return Math.min(1, score)
}

function readSummary(text: string): {
  summary: StatementSummary
  printedDebits: Money | null
  printedFees: Money | null
  printedCredits: Money | null
} {
  const folded = fold(text).replace(/\r/g, '')
  const summary = emptySummary()
  const AMOUNT = String.raw`(-?(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+|\d+)[.,]\d{2})`

  const money = (re: RegExp): Money | null => {
    const m = re.exec(folded)
    return m ? parseAmountAuto(m[1]) : null
  }

  summary.totalDebt = money(new RegExp(String.raw`HESAP\s+BAKIYESI\s*:?\s*${AMOUNT}`))
  summary.previousBalance =
    money(new RegExp(String.raw`BIR\s+ONCEKI\s+DONEM(?:\s+EKSTRE\s+BORCU)?\s*:\s*${AMOUNT}`)) ??
    money(new RegExp(String.raw`BIR\s+ONCEKI\s+DONEM\s*(?:\(\d{2}[./]\d{2}[./]\d{4}\)\s*)?${AMOUNT}`))
  summary.minPayment = money(new RegExp(String.raw`ASGARI\s+ODEME\s+TUTARI\s*:?\s*${AMOUNT}`))
  summary.creditLimit = money(new RegExp(String.raw`TOPLAM\s+KREDI\s+LIMITI\s*:?\s*${AMOUNT}`))
  summary.cashAdvanceLimit = money(new RegExp(String.raw`NAKIT\s+AVANS\s+LIMITI\s*:?\s*${AMOUNT}`))
  summary.availableLimit = money(new RegExp(String.raw`KULLANILABILIR\s+LIMIT\s*:?\s*${AMOUNT}`))

  const rate = /ALISVERIS\s+FAIZ\s+ORANI\s*%?\s*(\d{1,2}[.,]\d{1,2})/.exec(folded)
  if (rate) summary.interestMonthly = Number.parseFloat(rate[1].replace(',', '.'))

  const nextCut = /BIR\s+SONRAKI[\s\n]+HESAP(?:\s+KESIM\s+TARIHI)?\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/.exec(folded)
  if (nextCut) summary.nextCutDate = parseSlashDate(nextCut[1])

  const nextDue =
    /BIR\s+SONRAKI\s+(?:(\d{2}[./]\d{2}[./]\d{4})\s*-?\s*\n\s*SON\s+ODEME|SON\s+ODEME(?:\s+TARIHI)?\s*:?\s*(\d{2}[./]\d{2}[./]\d{4}))/.exec(
      folded,
    )
  if (nextDue) summary.nextDueDate = parseSlashDate(nextDue[1] ?? nextDue[2])

  const earned = money(new RegExp(String.raw`KAZANILAN\s*:\s*${AMOUNT}`))
  const specialEarned = money(new RegExp(String.raw`OZEL\s+KAZANIMLAR\s*:\s*${AMOUNT}`)) ?? 0
  const spent = money(new RegExp(String.raw`HARCAMA\s*:\s*${AMOUNT}`))
  const balance = money(new RegExp(String.raw`TOPLAM\s+PARAFPARA\s*:\s*${AMOUNT}`))
  if (earned !== null || spent !== null || balance !== null) {
    summary.loyalty = {
      programme: 'ParafPara',
      earned: earned !== null ? earned + specialEarned : null,
      spent,
      balance,
    }
  }

  const printedDebits = money(new RegExp(String.raw`DONEM\s+ICI\s+BORC\s+TUTARI\s*:?\s*${AMOUNT}`))
  const printedFees = money(new RegExp(String.raw`TOPLAM\s+FAIZ,\s*UCRET,[\s\S]{0,40}?VERGILER\s*:?\s*${AMOUNT}`))
  const printedCredits = money(new RegExp(String.raw`DONEMSEL\s+ALACAK(?:\s+KAYITLARI)?\s*:?\s*${AMOUNT}`))

  return { summary, printedDebits, printedFees, printedCredits }
}

interface PendingRow {
  row: RawRow
  pendingInstallmentTotal: number | null
  attachedContinuation: boolean
}

function parse(text: string): AdapterOutput {
  const rows: RawRow[] = []
  const ignored: IgnoredRow[] = []
  let skipped = 0
  let minCurrentCycleDate: DayKey | null = null
  let maxDate: DayKey | null = null
  let lastPending: PendingRow | null = null

  const lines = text.replace(/\r/g, '').split('\n')

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    const { line, rewards } = splitRewardTags(trimmed)
    if (!line) continue

    const match = STATEMENT_ROW.exec(line)
    if (!match) {
      if (hasUnrecognisedRowDate(line)) {
        skipped++
        lastPending = null
        continue
      }

      // Attach wrapped "04.Taksit" or single-line wrapped description (e.g. "İNDİRİMİ", city)
      // immediately following a parsed transaction row.
      if (lastPending) {
        const instOnly = NEXT_TAKSIT_RE.exec(line)
        if (instOnly && lastPending.pendingInstallmentTotal) {
          const current = Number(instOnly[1])
          const total = lastPending.pendingInstallmentTotal
          if (current > 0 && current <= total) {
            lastPending.row.installment = { current, total }
          }
          lastPending.pendingInstallmentTotal = null
          continue
        }

        const foldedLine = fold(line)
        if (
          !lastPending.attachedContinuation &&
          /[A-Z]/.test(foldedLine) &&
          line.length <= 42 &&
          !NON_CONTINUATION_RE.test(foldedLine) &&
          !AMOUNT_TOKEN_RE.test(line)
        ) {
          lastPending.row.description = `${lastPending.row.description} ${line}`.replace(/\s{2,}/g, ' ').trim()
          lastPending.attachedContinuation = true
          continue
        }
      }

      lastPending = null
      continue
    }

    lastPending = null

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
    let credit = false
    let trailing = ''

    if (billed && AMOUNT_TOKEN_RE.test(billed.token)) {
      description = billed.before
      amountToken = billed.token
      trailing = billed.after
      if (/(?:^|\s)\+$/.test(description)) {
        credit = true
        description = description.replace(/\s*\+$/, '').trim()
      } else if (amountToken.startsWith('+') || amountToken.startsWith('-')) {
        credit = true
      }
    } else if (!billed) {
      const spaceCredit = SPACE_CREDIT_RE.exec(body)
      if (spaceCredit) {
        description = spaceCredit[1].trim()
        amountToken = spaceCredit[2]
        trailing = (spaceCredit[3] ?? '').trim()
        credit = true
      } else {
        const parts = body.split(/\s+/).filter(Boolean)
        const last = parts[parts.length - 1]
        const prev = parts[parts.length - 2]

        // Plain-text fallback when column tags are absent (e.g. unit fixtures or OCR).
        // Trailing columns may be: `[remaining/total-] [parafpara]` after the amount.
        let amountIdx = -1
        for (let idx = parts.length - 1; idx >= 1; idx--) {
          if (AMOUNT_TOKEN_RE.test(parts[idx])) {
            // Skip right-most ParafPara column when the token before it is also an amount or `rem/total-`.
            const left = parts[idx - 1]
            if (
              !rewards.length &&
              idx === parts.length - 1 &&
              (AMOUNT_TOKEN_RE.test(left) || REMAINING_TOTAL_RE.test(left))
            ) {
              rewards.push(parts[idx])
              continue
            }
            amountIdx = idx
            break
          }
        }

        if (amountIdx > 0) {
          amountToken = parts[amountIdx]
          description = parts.slice(0, amountIdx).join(' ')
          trailing = parts.slice(amountIdx + 1).join(' ')
          if (description.endsWith(' +')) {
            credit = true
            description = description.slice(0, -2).trim()
          } else if (amountToken.startsWith('+') || amountToken.startsWith('-')) {
            credit = true
          }
        } else if (parts.length >= 2 && AMOUNT_TOKEN_RE.test(last)) {
          amountToken = last
          description = parts.slice(0, -1).join(' ')
          if (prev === '+') {
            credit = true
            description = parts.slice(0, -2).join(' ')
          }
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
      }
    } else {
      skipped++
      continue
    }

    description = description.replace(/\s{2,}/g, ' ').trim()
    if (!description) {
      skipped++
      continue
    }

    const amount = Math.abs(parseAmountAuto(amountToken))

    // Zero-TL rows that carry only ParafPara earnings or redemptions (e.g. "Puan Kullanım", "Seyahat Kamp. ParafPara").
    if (amount === 0) {
      const rewardToken = rewards.find((r) => REWARD_TOKEN_RE.test(r))
      if (rewardToken) {
        const rewardVal = parseAmountAuto(rewardToken)
        if (rewardVal !== 0) {
          const reason: IgnoredReason = rewardVal < 0 ? 'reward-spent' : 'reward-earned'
          ignored.push({
            date,
            description,
            amount: Math.abs(rewardVal),
            reason,
            raw: stripBilledTag(line),
          })
        }
      }
      continue
    }

    let installment: Installment | null = null
    let pendingInstallmentTotal: number | null = null
    const remMatch = REMAINING_TOTAL_RE.exec(trailing)
    if (remMatch) {
      const total = Number(remMatch[2])
      if (total > 0) {
        const inlineCurrent = INLINE_TAKSIT_RE.exec(trailing)
        if (inlineCurrent) {
          const current = Number(inlineCurrent[1])
          if (current > 0 && current <= total) installment = { current, total }
        } else {
          pendingInstallmentTotal = total
        }
      }
    }

    let kind: TxKind = credit ? 'refund' : 'expense'
    if (credit && PAYMENT_PATTERNS.test(fold(description))) kind = 'payment'

    if (!maxDate || date > maxDate) maxDate = date

    const rewardToken = rewards.find((r) => REWARD_TOKEN_RE.test(r))
    const rewardVal = rewardToken ? parseAmountAuto(rewardToken) : 0
    const reward = rewardVal > 0 ? rewardVal : 0

    const row: RawRow = {
      date,
      description,
      amount,
      kind,
      installment,
      raw: stripBilledTag(line),
      ...(reward > 0 ? { reward } : {}),
    }
    rows.push(row)
    lastPending = { row, pendingInstallmentTotal, attachedContinuation: false }
  }

  for (const row of rows) {
    if ((!row.installment || row.installment.current <= 1) && (!minCurrentCycleDate || row.date < minCurrentCycleDate)) {
      minCurrentCycleDate = row.date
    }
  }

  const folded = fold(text)
  const cutMatch = CUT_DATE_RE.exec(folded)
  const dueMatch = DUE_DATE_RE.exec(folded)
  const { summary, printedDebits, printedFees, printedCredits } = readSummary(text)

  const totalRefunds = rows
    .filter((row) => row.kind === 'refund')
    .reduce((sum, row) => sum + row.amount, 0)

  let printedTotals: AdapterOutput['printedTotals']
  if (printedDebits !== null && printedCredits !== null) {
    printedTotals = {
      charges: printedDebits + (printedFees ?? 0),
      payments: printedCredits,
      ...(totalRefunds > 0 ? { paymentLikeRefunds: totalRefunds } : {}),
    }
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
    accountLabel: isParaf ? 'Halkbank Paraf' : 'Halkbank',
    summary,
    ...(printedTotals ? { printedTotals } : {}),
  }
}

export const halkbankAdapter: BankAdapter = {
  id: 'halkbank',
  bank: 'Halkbank',
  detect,
  parse,
}
