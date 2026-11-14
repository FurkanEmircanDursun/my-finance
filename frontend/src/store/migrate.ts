import { normalizeMerchant } from '../core/text'
import { classify } from '../ingest/categorize'
import { idFor, identityKey } from '../ingest/identity'
import type { CategoryRule, Profile, Settings, Statement, Transaction } from '../domain/types'
import { sanitizeCards } from '../domain/cards'

/**
 * Schema versions of what is written to IndexedDB (and exported as a backup).
 *
 *   1  never shipped outside development
 *   2  content-hash ids of `date | amount | merchant`; statementId smuggled onto
 *      transactions through a type cast
 *   3  ids that include the bank, the kind and the instalment index; `statementId`
 *      is a real field; instalment rows carry `billedOn`; statements carry their
 *      cover summary, a reconciliation and the loyalty lines that were left out
 *
 * A version bump used to throw the stored snapshot away, on the grounds that a
 * statement can always be re-imported. That is not a promise worth making to
 * someone whose history spans a year of statements — nor to one who has typed
 * in a salary every month and learned two hundred merchant rules. Every bump now
 * ships with a migration, and what cannot be migrated is refused loudly rather
 * than discarded quietly.
 */
export const STATE_VERSION = 3

export interface Persisted {
  version: number
  transactions: Transaction[]
  statements: Statement[]
  rules: CategoryRule[]
  profile: Profile
  settings: Settings
}

export interface MigrationResult {
  state: Persisted
  /** The version the data was upgraded from; null when it was already current. */
  migratedFrom: number | null
  /** Human-readable consequences the person should know about. */
  notes: string[]
}

type Loose = Partial<Persisted> & { version?: number }

/**
 * v2 → v3.
 *
 * Ids are re-derived under the new rules. The new id must equal what importing
 * the same statement today would produce, or re-importing it would add every row
 * a second time. All the fields the key is built from were already stored, so it
 * can be recomputed exactly. Rows are numbered per statement in stored order —
 * the same rule the importer applies — so two identical charges still get two
 * distinct ids.
 *
 * The rest brings old rows up to what the current importer would have made of
 * them, without touching anything the person decided:
 *
 *   merchant      re-derived from the description, so improvements to the
 *                 normaliser (utility invoice numbers, refund suffixes) reach
 *                 history. Learned rules are re-keyed to follow.
 *   category      only rows still on "Diğer" and never edited by hand are
 *                 re-classified; a category already chosen, by a person or by a
 *                 statement heading, is left exactly as it is.
 *   billedOn      instalment rows get the cut date of the statement that billed
 *                 them.
 */
function v2ToV3(stored: Loose): { transactions: Transaction[]; rules: CategoryRule[]; collisions: boolean } {
  const statements = new Map((stored.statements ?? []).map((s) => [s.id, s]))
  const seen = new Map<string, number>()
  const rekey = new Map<string, Set<string>>()
  let collisions = false

  const transactions = (stored.transactions ?? []).map((tx): Transaction => {
    const merchant = normalizeMerchant(tx.description)

    const old = rekey.get(tx.merchant) ?? new Set<string>()
    old.add(merchant)
    rekey.set(tx.merchant, old)

    const category =
      tx.category === 'other' && !tx.categoryLocked && tx.source !== 'manual'
        ? classify(tx.description, merchant)
        : tx.category

    if (tx.source === 'manual') return { ...tx, merchant, category }

    const identity = identityKey({
      bank: tx.bank,
      accountLabel: tx.accountLabel,
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      kind: tx.kind,
      installment: tx.installment,
    })
    const group = `${tx.statementId ?? ''}#${identity}`
    const ordinal = seen.get(group) ?? 0
    seen.set(group, ordinal + 1)

    // Instalment rows are where the old scheme lost data: a plan's later months
    // share the first month's id, so when more than one statement of a plan was
    // imported, everything after the first had been dropped on the way in.
    if (tx.installment && tx.installment.current > 1) collisions = true

    const statement = tx.statementId ? statements.get(tx.statementId) : undefined
    const billedOn =
      tx.installment && statement?.periodStart && statement.periodEnd && tx.date < statement.periodStart
        ? statement.periodEnd
        : undefined

    return {
      ...tx,
      id: idFor(identity, ordinal),
      merchant,
      category,
      ...(billedOn ? { billedOn } : {}),
    }
  })

  // A rule follows its merchant to the new key — but only when every row of that
  // merchant agrees on one, so a rule is never silently pointed at a different shop.
  const rules = (stored.rules ?? []).map((rule) => {
    const targets = rekey.get(rule.merchant)
    return targets && targets.size === 1 ? { ...rule, merchant: [...targets][0] } : rule
  })

  return { transactions, rules, collisions }
}

export function migratePersisted(stored: unknown): MigrationResult | null {
  if (!stored || typeof stored !== 'object') return null
  const loose = stored as Loose
  const version = typeof loose.version === 'number' ? loose.version : 0

  // Versions this build has never heard of are not something to guess at.
  if (version < 2) return null

  const notes: string[] = []
  let transactions = loose.transactions ?? []
  let rules = loose.rules ?? []
  let migratedFrom: number | null = null

  if (version === 2) {
    const result = v2ToV3(loose)
    transactions = result.transactions
    rules = result.rules
    migratedFrom = 2
    if (result.collisions) {
      notes.push(
        'Taksitli alışverişlerin 2. ve sonraki ayları önceki sürümde "mükerrer" sayılıp kaydedilmemiş olabilir. ' +
          'İlgili ekstreleri yeniden yüklersen yalnızca eksik satırlar eklenir; mevcut verilerin olduğu gibi kalır.',
      )
    }
  }

  return {
    migratedFrom,
    notes,
    state: {
      version: STATE_VERSION,
      transactions,
      statements: loose.statements ?? [],
      rules,
      profile: { ...loose.profile, cards: sanitizeCards(loose.profile?.cards), archivedCards: sanitizeCards(loose.profile?.archivedCards) } as Profile,
      settings: loose.settings as Settings,
    },
  }
}
