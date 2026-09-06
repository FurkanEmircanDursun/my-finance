import { lookupPhrase, lookupToken, type CategoryId } from '../domain/categories'
import type { CategoryRule } from '../domain/types'
import { normalizeMerchant, tokens } from '../core/text'

/**
 * Classification order:
 *   1. user rule for this exact merchant  (learned from manual corrections)
 *   2. multi-token phrase match           (longest phrase wins)
 *   3. single-token index lookup          (hash, first token that hits)
 *   4. 'other'
 *
 * Results are memoised per normalised merchant, so a statement with 400 rows
 * across 90 distinct merchants performs 90 classifications, not 400.
 */
export interface Categorizer {
  (description: string, merchantHint?: string): CategoryId
  /** Exposed so the import pipeline can report how much was auto-classified. */
  readonly cache: Map<string, CategoryId>
}

export function createCategorizer(rules: readonly CategoryRule[] = []): Categorizer {
  const ruleMap = new Map<string, CategoryId>()
  for (const rule of rules) ruleMap.set(rule.merchant, rule.category)

  const cache = new Map<string, CategoryId>()

  const fn = ((description: string, merchantHint?: string): CategoryId => {
    const merchant = merchantHint ?? normalizeMerchant(description)

    const ruled = ruleMap.get(merchant)
    if (ruled) return ruled

    const cached = cache.get(merchant)
    if (cached !== undefined) return cached

    let result: CategoryId = 'other'

    const phrase = lookupPhrase(merchant)
    if (phrase) {
      result = phrase
    } else {
      for (const token of tokens(merchant)) {
        const hit = lookupToken(token)
        if (hit) {
          result = hit
          break
        }
      }
    }

    cache.set(merchant, result)
    return result
  }) as Categorizer

  Object.defineProperty(fn, 'cache', { value: cache })
  return fn
}

/** Default instance used where no user rules are in play (parsers, previews). */
export const classify = createCategorizer()
