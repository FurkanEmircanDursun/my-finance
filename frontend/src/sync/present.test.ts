import { describe, expect, it } from 'vitest'
import { ago, describeSync } from './present'
import type { SyncState } from './status'

const state = (patch: Partial<SyncState>): SyncState => ({
  status: 'synced', lastSyncedAt: null, pending: 0, error: null, ...patch,
})

const NOW = 1_000_000_000_000

describe('ago', () => {
  it('says "az önce" for the first moments, then counts in the largest sensible unit', () => {
    expect(ago(NOW - 5_000, NOW)).toBe('az önce')
    expect(ago(NOW - 44_000, NOW)).toBe('az önce')
    expect(ago(NOW - 3 * 60_000, NOW)).toBe('3 dk önce')
    expect(ago(NOW - 2 * 3_600_000, NOW)).toBe('2 sa önce')
    expect(ago(NOW - 26 * 3_600_000, NOW)).toBe('dün')
    expect(ago(NOW - 5 * 86_400_000, NOW)).toBe('5 gün önce')
  })

  it('never reports a time in the future', () => {
    expect(ago(NOW + 60_000, NOW)).toBe('az önce')
  })
})

describe('describeSync', () => {
  it('reports a finished sync with how long ago it was', () => {
    const view = describeSync(state({ status: 'synced', lastSyncedAt: NOW - 120_000 }), NOW)
    expect(view.title).toBe('Her şey güncel')
    expect(view.detail).toContain('2 dk önce')
    expect(view.tone).toBe('positive')
    expect(view.busy).toBe(false)
  })

  it('counts what is being sent while syncing, and marks the indicator busy', () => {
    const view = describeSync(state({ status: 'syncing', pending: 3 }), NOW)
    expect(view.busy).toBe(true)
    expect(view.detail).toContain('3 değişiklik')
    expect(describeSync(state({ status: 'syncing', pending: 1 }), NOW).detail).toContain('1 değişiklik')
  })

  it('labels offline edits as pending in the active session', () => {
    const view = describeSync(state({ status: 'offline', pending: 2 }), NOW)
    expect(view.tone).toBe('warning')
    expect(view.detail).toContain('2 değişiklik')
    expect(view.detail).toContain('açık oturumda')
  })

  it('keeps red for a failure and explains pending retries', () => {
    const view = describeSync(state({ status: 'error', error: 'boom' }), NOW)
    expect(view.tone).toBe('negative')
    expect(view.detail).toContain('bekleyen değişiklikler')
    expect(view.detail).toContain('yeniden deneniyor')
  })

  it('asks for a choice when the device holds another account\'s data', () => {
    const view = describeSync(state({ status: 'decision' }), NOW)
    expect(view.title).toBe('Seçim bekleniyor')
    expect(view.busy).toBe(false)
  })

  it('has an answer for every status', () => {
    for (const status of ['connecting', 'syncing', 'synced', 'offline', 'error', 'decision'] as const) {
      const view = describeSync(state({ status }), NOW)
      expect(view.title.length).toBeGreaterThan(0)
      expect(view.detail.length).toBeGreaterThan(0)
    }
  })
})
