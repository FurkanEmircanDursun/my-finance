import type { TextGeom } from './extract'

/**
 * Column awareness for tabular statement PDFs.
 *
 * A statement row carries up to three numbers — what was billed, what is left
 * of an instalment plan, and a loyalty figure (Garanti's "Bonus", Akbank's
 * "Chip-para"). Flattened to text they are indistinguishable: `150,00` could be
 * a ₺150 purchase or 150 bonus points. A row that has *only* a loyalty number
 * used to be counted as a ₺150 expense — a handful of them put thousands of
 * lira of phantom spend on a real Garanti statement.
 *
 * The PDF knows the answer: numbers are right-aligned under their header, so
 * the right edge of a number says which column it sits in. This module marks
 * loyalty figures with ⟦…⟧ and an unambiguous billed value with ⟨…⟩, keeping
 * both separate from account references printed in the description.
 */

export const REWARD_OPEN = '⟦'
export const REWARD_CLOSE = '⟧'

const REWARD_TAG_RE = /⟦([^⟧]*)⟧/g
const BILLED_TAG_RE = /^(.*?)\s*⟨([^⟩]+)⟩(.*)$/

/** Recover the geometry-confirmed billed token and the text on either side. */
export function splitBilledTag(body: string): { before: string; token: string; after: string } | null {
  const match = BILLED_TAG_RE.exec(body)
  return match ? { before: match[1].trim(), token: match[2], after: match[3].trim() } : null
}

export function stripBilledTag(line: string): string {
  return line.replace(/[⟨⟩]/g, '')
}

/** Splits tagged loyalty figures out of a line, returning what remains. */
export function splitRewardTags(line: string): { line: string; rewards: string[] } {
  const rewards: string[] = []
  const rest = line
    .replace(REWARD_TAG_RE, (_match, value: string) => {
      rewards.push(value.trim())
      return ' '
    })
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { line: rest, rewards }
}

export function hasRewardTag(line: string): boolean {
  return line.includes(REWARD_OPEN)
}

/** Right edges of the columns on one page, in PDF user units. */
export interface ColumnLayout {
  /** The billed-amount column ("Tutar (TL)", "Borç Tutarı (TL)"). */
  amountRight: number
  /** The loyalty column ("Bonus (TL)", "Dönem İçi Chip-para"). */
  rewardRight: number
  /** Baseline of the header row; only rows below it are tagged. */
  headerY: number
}

interface Word {
  text: string
  x: number
  right: number
  y: number
  first: TextGeom
  last: TextGeom
}

/** A number as either bank prints it, with its sign marker and instalment tail. */
const MONEY_WORD_RE = /^\d[\d.,]*[.,]\d{2}(?:\(-\)|[+-])?(?:x\d+)?$/
const TRANSACTION_START_RE = /^(?:bosluk\s+)?\d{1,2}(?:\/\d{1,2}\/|\s+\p{L}+\s+)\d{4}\s+/iu

/** How far a number's right edge may sit from its header's and still belong to it. */
const COLUMN_TOLERANCE = 14

/**
 * Joins the glyph runs of one row into words, using the same two rules the line
 * builder uses for spaces (a real whitespace run, or a visible gap), so a word
 * here is a word there.
 */
function rowWords(row: TextGeom[], decode: (text: string) => string): Word[] {
  const words: Word[] = []
  let current: Word | null = null
  let previousRight: number | null = null

  const close = () => {
    if (current) words.push(current)
    current = null
  }

  for (const item of row) {
    const text = decode(item.text)
    const blank = !text.trim()

    if (blank) {
      if (item.w >= item.h * 0.12) close()
      previousRight = item.x + item.w
      continue
    }

    if (current && previousRight !== null && item.x - previousRight > item.h * 0.25) close()

    if (!current) {
      current = { text, x: item.x, right: item.x + item.w, y: item.y, first: item, last: item }
    } else {
      current.text += text
      // Max, not last: a two-line header's runs interleave, so the last run is not always the rightmost.
      current.right = Math.max(current.right, item.x + item.w)
      current.last = item
    }
    previousRight = item.x + item.w
  }
  close()

  return words
}

/**
 * "Bonus (TL)" at Garanti; "Dönem İçi Chip-para" at Akbank, which the PDF sets on
 * two overlapping lines, so its words run together ("Dönem İçiChip-para"). Short,
 * so a sentence that happens to mention a bonus is never mistaken for a header —
 * and it only counts beside a "Tutar" header in the first place.
 */
function isRewardHeader(text: string): boolean {
  return text.length <= 24 && /(Bonus|Chip-?para)/i.test(text)
}

/**
 * The right edge of a header, including a "(TL)" that the PDF set as a word of
 * its own a space after it.
 */
function headerRight(head: Word, siblings: readonly Word[]): number {
  let right = head.right
  for (const word of siblings) {
    if (word.x >= head.right - 1 && word.x - right < 8 && /^\(?TL\)?$/i.test(word.text)) right = word.right
  }
  return right
}

/**
 * Finds the header of the amount table, if the page has one.
 *
 * A header is a "Tutar…" word with a loyalty header ("Bonus", "Chip-para") on
 * its row or the row either side — Akbank sets "Dönem İçi / Chip-para" on two
 * lines. Requiring both is what stops a "Min. Ödeme Tutarı" in the cover text
 * from being taken for the table.
 */
export function findColumnLayout(rows: TextGeom[][], decode: (text: string) => string): ColumnLayout | null {
  const all = rows.map((row) => rowWords(row, decode))

  for (let r = 0; r < all.length; r++) {
    const amount = all[r].find((word) => /^Tutar/i.test(word.text))
    if (!amount) continue

    let reward: Word | null = null
    let rewardRow = -1
    for (let n = Math.max(0, r - 1); n <= Math.min(all.length - 1, r + 1); n++) {
      for (const word of all[n]) {
        if (word !== amount && isRewardHeader(word.text) && (!reward || word.right > reward.right)) {
          reward = word
          rewardRow = n
        }
      }
    }
    if (!reward) continue

    const amountRight = headerRight(amount, all[r])
    const rewardRight = headerRight(reward, all[rewardRow])

    // Columns this close cannot be told apart by their edge.
    if (Math.abs(rewardRight - amountRight) < COLUMN_TOLERANCE * 2) continue

    return { amountRight, rewardRight, headerY: amount.y }
  }

  return null
}

/**
 * Annotates positioned money values before the text is flattened.
 *
 * Works on a copy of the items. `decode` is applied to read the text (EBCDIC
 * statements arrive as mojibake that only a decoder can turn back into digits)
 * but the tag characters are inserted around the *original* text, which the
 * EBCDIC decoder later passes through untouched — they are outside its byte
 * range.
 */
export function tagStatementColumns(
  rows: TextGeom[][],
  layout: ColumnLayout,
  decode: (text: string) => string,
): void {
  for (const row of rows) {
    const words = rowWords(row, decode)
    const billed: Word[] = []
    for (const word of words) {
      if (word.y >= layout.headerY) continue
      if (!MONEY_WORD_RE.test(word.text)) continue

      const toReward = Math.abs(word.right - layout.rewardRight)
      const toAmount = Math.abs(word.right - layout.amountRight)
      if (toReward <= COLUMN_TOLERANCE && toReward < toAmount) {
        word.first.text = REWARD_OPEN + word.first.text
        word.last.text = word.last.text + REWARD_CLOSE
      } else if (toAmount <= COLUMN_TOLERANCE && toAmount < toReward && !/x\d+$/.test(word.text)) {
        billed.push(word)
      }
    }
    // Annotate only an unambiguous amount on a transaction-shaped row.
    if (billed.length === 1 && TRANSACTION_START_RE.test(words.map(word => word.text).join(' '))) {
      billed[0].first.text = '⟨' + billed[0].first.text
      billed[0].last.text += '⟩'
    }
  }
}
