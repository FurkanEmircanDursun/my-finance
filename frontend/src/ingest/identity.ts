import { hash } from '../core/hash'
import type { Installment, TxKind } from '../domain/types'

/**
 * Transaction identity.
 *
 * An id has to be the same every time the same statement line is read — that is
 * what lets a statement be re-imported, or two overlapping ones be merged,
 * without double counting — and different for every line that is genuinely a
 * different charge.
 *
 * The previous key was `date | amount | merchant`. That is not enough, and the
 * failure is silent. An instalment purchase is billed once a month for the same
 * amount, and every statement prints the *original purchase date* beside it:
 *
 *   05/07/2026 TRENDYOL.COM  3/1.taksit  355.00    (July statement)
 *   05/07/2026 TRENDYOL.COM  3/2.taksit  355.00    (August statement)
 *   05/07/2026 TRENDYOL.COM  3/3.taksit  355.00    (September statement)
 *
 * Same date, same amount, same merchant — so the second and third months hashed
 * to the first month's id and were discarded on import as "duplicates". Every
 * instalment after the first vanished from the history, and with it from the
 * monthly totals and the commitment ladder. The instalment index now sits in the
 * key, as do the bank (two cards can charge the same shop the same amount on the
 * same day) and the kind (a purchase and its same-day refund are two rows).
 *
 * What is *not* in the key is anything the app derives. `merchant` is the output
 * of `normalizeMerchant`, which gets better every time a new statement teaches
 * it a city or a suffix — and every improvement would change the key of rows
 * already stored, so re-importing a statement would add all of it a second time.
 * The key uses the description as the bank printed it, reduced by a rule that is
 * frozen here and must never be edited: change it and every stored id is wrong.
 * If it ever has to change, that is a schema version and a migration.
 *
 * `ordinal` separates identical rows *within one statement* — two ₺499 charges
 * at one shop on one day are two charges.
 */
export interface IdentityFields {
  bank: string
  accountLabel: string
  date: string
  amount: number
  description: string
  kind: TxKind
  installment: Installment | null
}

const FROZEN_FOLD: Record<string, string> = {
  Ç: 'C', Ğ: 'G', İ: 'I', ı: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
  ç: 'C', ğ: 'G', ö: 'O', ş: 'S', ü: 'U',
}

/**
 * The first 16 letters and digits of the description, upper-cased, with Turkish
 * diacritics folded. Long enough to tell shops apart, short enough that the city
 * and branch code a bank appends — which differ between reads — fall outside it.
 */
export function descriptionKey(description: string): string {
  let out = ''
  for (const ch of description) out += FROZEN_FOLD[ch] ?? ch
  return out.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
}

export function identityKey(fields: IdentityFields): string {
  const plan = fields.installment ? `${fields.installment.current}/${fields.installment.total}` : '-'
  return [
    fields.bank,
    fields.accountLabel,
    fields.date,
    fields.amount,
    descriptionKey(fields.description),
    fields.kind,
    plan,
  ].join('|')
}

/** The id of the `ordinal`-th identical row with this key. */
export function idFor(key: string, ordinal: number): string {
  return hash(`${key}|${ordinal}`)
}

/**
 * Ids for one statement's rows, in order. Identical rows are numbered 0, 1, 2…
 * so the *set* of ids does not depend on which of them was read first.
 */
export function assignIds(rows: readonly IdentityFields[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const key = identityKey(row)
    const ordinal = seen.get(key) ?? 0
    seen.set(key, ordinal + 1)
    return idFor(key, ordinal)
  })
}
