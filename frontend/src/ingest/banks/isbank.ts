import { parseTrAmount, type Money } from '../../core/money'
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
 * Türkiye İş Bankası / Maximum statement lines, as they arrive from the PDF text layer:
 *
 *   24/10/2026 LIDIO ODEME/ORNEK ABONELIK ISTANBUL TR ⟨209,99⟩ ⟦0,02⟧
 *   24/10/2026 WWW.TRENDYOL.COM ISTANBUL TR ⟦-250,00⟧
 *   24/10/2026 IYZICO/SHOP.ORNEK.COM ISTANBUL TR ⟨500,00⟩ 2/2 taksidi (1.000,00)
 *   01/11/2026 1000-123456 HESAPTAN AKTARIM 1000 İNTERAKTİF ⟨-2.000,00⟩
 *   16/11/20211000-123456 HESAPTAN AKTARIM 1000 İNTERAKTİF ⟨-500,00⟩
 *
 * Amounts use Turkish grouping (1.234,56) with a leading `-` for credits
 * (refunds and card-debt payments). A row carrying only a MaxiPuan figure
 * (`⟦-324,95⟧`) is loyalty redemption/earning, never a TL charge or refund.
 */

const AMOUNT_TOKEN_RE = /^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/
const INSTALLMENT_RE = /(\d{1,2})\/(\d{1,2})\s*taksid[iı](?:\s*\(([\d.]+,\d{2})\))?/i

const CUT_DATE_RE = /(?<!Sonraki\s+)Hesap\s+Kesim\s+Tarihi[\s:]*(\d{2}[./]\d{2}[./]\d{4})/i
const DUE_DATE_RE = /(?<!Sonraki\s+)Son\s+[ÖO]deme\s+Tarihi[\s:]*(\d{2}[./]\d{2}[./]\d{4})/i
const CARD_LINE_RE = /^([^\n]+?)\s+Hesap\s+[ÖO]zetiniz\b/im

function titleCaseTr(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR')
    .replace(/(^|\s)(\S)/gu, (_, space: string, ch: string) => space + ch.toLocaleUpperCase('tr-TR'))
    .replace(/\b(Max)ı(mum|mıles)\b/gi, '$1i$2')
    .replace(/\b(Plat)ı(num)\b/gi, '$1i$2')
    .replace(/\b(V)ı(sa)\b/gi, '$1i$2')
}

function readAmount(token: string): { value: Money; credit: boolean } {
  const credit = token.startsWith('-')
  return { value: Math.abs(parseTrAmount(token)), credit }
}

function detect(text: string): number {
  const folded = fold(text)
  // Older Maximum Genç PDFs can glue the merchant straight onto the year ("22/11/2021BIM").
  const dates = text.match(/(?<!\d)\d{2}[./]\d{2}[./]\d{4}/g)?.length ?? 0
  if (dates < 3) return 0

  let score = Math.min(0.45, dates / 50)
  if (/\bISBANK\.COM\.TR\b|\bTURKIYE\s+IS\s+BANKASI\b|\bIS\s+BANKASI\b/.test(folded)) score += 0.35
  if (/\bMAXIMUM(?:GENC)?\.COM\.TR\b|\bMAXIPUAN\b/.test(folded)) score += 0.25
  if (/\bHESAP\s+OZETI\s+BORCU\b/.test(folded)) score += 0.15
  if (/\bBIR\s+ONCEKI\s+HESAP\s+OZETI\s+BAKIYENIZ\b/.test(folded)) score += 0.1
  return Math.min(1, score)
}

function readSummary(text: string): StatementSummary {
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

  summary.totalDebt = money(new RegExp(String.raw`HESAP\s+OZETI\s+BORCU\s*:?\s*${AMOUNT}`))
  summary.previousBalance = money(new RegExp(String.raw`BIR\s+ONCEKI\s+HESAP\s+OZETI\s+BAKIYENIZ[^\d-]*${AMOUNT}`))
  summary.minPayment = money(new RegExp(String.raw`ODENMESI\s+GEREKEN\s+ASGARI\s+TUTAR\s*:?\s*${AMOUNT}`))
  summary.creditLimit =
    money(new RegExp(String.raw`TOPLAM\s+KART\s+LIMITI\s*:?\s*${AMOUNT}`)) ??
    money(new RegExp(String.raw`MUSTERI\s+LIMITI\s*:?\s*${AMOUNT}`))
  summary.availableLimit =
    money(new RegExp(String.raw`TOPLAM\s+KULLANILABILIR\s+KART\s+LIMITI\s*:?\s*${AMOUNT}`)) ??
    money(new RegExp(String.raw`KULLANILABILIR\s+MUSTERI\s+LIMITI\s*:?\s*${AMOUNT}`))
  summary.cashAdvanceLimit = money(new RegExp(String.raw`(?<!KULLANILABILIR\s+)NAKIT\s+CEKME\s+LIMITI\s*:?\s*${AMOUNT}`))

  // Modern statements print a tabular "Aylık %3,25 %4,25 ..."; older Genç
  // statements print "Alışveriş Faiz Oranı: %1,8" inline in the footer.
  const rate =
    /ALISVERIS\s+FAIZ\s+ORANI\s*:?\s*%\s*(\d{1,2}[.,]\d{1,2})/.exec(folded) ??
    /ALISVERIS[\s\S]{0,120}?\bAYLIK\s+%\s*(\d{1,2}[.,]\d{1,2})/.exec(folded)
  if (rate) summary.interestMonthly = Number.parseFloat(rate[1].replace(',', '.'))

  summary.nextCutDate = date(/BIR\s+SONRAKI\s+HESAP\s+KESIM\s+TARIHI\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/)
  summary.nextDueDate = date(/BIR\s+SONRAKI\s+SON\s+ODEME\s+TARIHI\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/)

  const maxiBalance = money(new RegExp(String.raw`TOPLAM\s+MAXIPUAN\s*:?\s*${AMOUNT}`))
  if (maxiBalance !== null) {
    summary.loyalty = { programme: 'MaxiPuan', earned: null, spent: null, balance: maxiBalance }
  }

  // First statement with no prior balance omits the "BİR ÖNCEKİ HESAP ÖZETİ BAKİYENİZ" line.
  if (summary.previousBalance === null && summary.totalDebt !== null) {
    const hasPriorLabel = /\bONCEKI\s+HESAP\s+OZETI\b/.test(folded)
    const tableTotal = new RegExp(String.raw`^TOPLAM\s+${AMOUNT}\s*TL`, 'm').exec(folded)
    if (!hasPriorLabel && tableTotal && parseTrAmount(tableTotal[1]) === summary.totalDebt) {
      summary.previousBalance = 0
    }
  }

  return summary
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
    let installmentSource = ''

    if (billed && AMOUNT_TOKEN_RE.test(billed.token)) {
      description = billed.before
      amountToken = billed.token
      installmentSource = billed.after
    } else if (!billed) {
      // Untagged fallback: strip trailing instalment text first, then read amount(s).
      let working = body
      const instTail = INSTALLMENT_RE.exec(working)
      if (instTail) {
        installmentSource = instTail[0]
        working = working.replace(instTail[0], ' ').replace(/\s{2,}/g, ' ').trim()
      }
      const parts = working.split(/\s+/).filter(Boolean)
      const last = parts[parts.length - 1]
      const prev = parts[parts.length - 2]

      if (!rewards.length && parts.length >= 3 && AMOUNT_TOKEN_RE.test(last) && AMOUNT_TOKEN_RE.test(prev)) {
        // Two trailing numbers without column tags: TUTAR then MAXIPUAN.
        amountToken = prev
        rewards.push(last)
        description = parts.slice(0, -2).join(' ')
      } else if (parts.length >= 2 && AMOUNT_TOKEN_RE.test(last)) {
        amountToken = last
        description = parts.slice(0, -1).join(' ')
      } else if (rewards.length && body && !AMOUNT_TOKEN_RE.test(last)) {
        const rewardToken = rewards[0]
        const reason: IgnoredReason = rewardToken.startsWith('-') ? 'reward-spent' : 'reward-earned'
        ignored.push({
          date,
          description: body,
          amount: Math.abs(parseTrAmount(rewardToken)),
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
    const instMatch = INSTALLMENT_RE.exec(installmentSource) ?? INSTALLMENT_RE.exec(description)
    if (instMatch) {
      const current = Number(instMatch[1])
      const total = Number(instMatch[2])
      const principal = instMatch[3] ? parseTrAmount(instMatch[3]) : 0
      if (current > 0 && total > 0 && current <= total) {
        installment = {
          current,
          total,
          ...(principal > 0 ? { principal } : {}),
        }
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

    const reward = rewards.length && !rewards[0].startsWith('-') ? Math.abs(parseTrAmount(rewards[0])) : 0

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
  const cardMatch = CARD_LINE_RE.exec(text)
  const summary = readSummary(text)

  const periodEnd = (cutMatch ? parseSlashDate(cutMatch[1]) : null) ?? maxDate
  const cardName = cardMatch ? titleCaseTr(cardMatch[1]) : ''

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
    dueDate: dueMatch ? parseSlashDate(dueMatch[1]) : null,
    accountLabel: cardName ? `İş Bankası ${cardName}` : 'İş Bankası Maximum',
    summary,
  }
}

export const isbankAdapter: BankAdapter = {
  id: 'isbank',
  bank: 'Türkiye İş Bankası',
  detect,
  parse,
}
