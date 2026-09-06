import { akbankAdapter } from './akbank'
import { garantiAdapter } from './garanti'
import { csvAdapter } from './csv'
import type { BankAdapter } from './types'

/**
 * Adding a bank means adding one adapter file and one entry here — no changes
 * anywhere else in the pipeline.
 */
export const ADAPTERS: BankAdapter[] = [akbankAdapter, garantiAdapter, csvAdapter]

export const MIN_CONFIDENCE = 0.35

export interface Detection {
  adapter: BankAdapter
  confidence: number
  /** All adapters that cleared the threshold, best first — used in diagnostics. */
  ranked: Array<{ id: string; confidence: number }>
}

export function detectAdapter(text: string): Detection | null {
  const ranked = ADAPTERS
    .map((adapter) => ({ adapter, confidence: adapter.detect(text) }))
    .sort((a, b) => b.confidence - a.confidence)

  const best = ranked[0]
  if (!best || best.confidence < MIN_CONFIDENCE) return null

  return {
    adapter: best.adapter,
    confidence: best.confidence,
    ranked: ranked.map((r) => ({ id: r.adapter.id, confidence: Math.round(r.confidence * 100) / 100 })),
  }
}

export type { BankAdapter } from './types'
