import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe('IndexedDB write lifecycle', () => {
  it('starts Undo writes synchronously on the hydrated connection and resolves only on commit', async () => {
    const requests: { result?: unknown; onsuccess?: () => void }[] = []
    const writes: { value: unknown; key: string; oncomplete?: () => void; onabort?: () => void }[] = []
    const database = {
      transaction: vi.fn((_store: string, mode: string) => {
        if (mode === 'readonly') return { objectStore: () => ({ get: () => {
          const request = { result: { transactions: ['expense'] } }
          requests.push(request)
          return request
        } }) }
        const transaction = { value: undefined as unknown, key: '' }
        writes.push(transaction)
        return Object.assign(transaction, { objectStore: () => ({ put: (value: unknown, key: string) => {
          transaction.value = value
          transaction.key = key
        } }) })
      }),
    }
    const opened = { result: database, onsuccess: undefined as undefined | (() => void) }
    vi.stubGlobal('indexedDB', { open: () => opened })
    const { dbGet, dbSet } = await import('./db')
    const hydration = dbGet('state')
    opened.onsuccess?.()
    await Promise.resolve()
    requests[0].onsuccess?.()
    await hydration

    const undone = { transactions: [] }
    const saving = dbSet('state', undone)
    // A pagehide callback must enqueue this before returning to the browser.
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ value: undone, key: 'state' })
    let committed = false
    void saving.then(() => { committed = true })
    await Promise.resolve()
    expect(committed).toBe(false)
    writes[0].oncomplete?.()
    expect(await saving).toBe(true)
  })

  it('retains the in-memory fallback when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { dbGet, dbSet } = await import('./db')
    const value = { transactions: ['local-only'] }
    expect(await dbSet('state', value)).toBe(false)
    expect(await dbGet('state')).toEqual(value)
  })
  it('does not report an in-memory financial write as durable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { dbReadFinancialState, dbWriteFinancialValue } = await import('./db')
    await dbReadFinancialState()
    const value = { transactions: ['memory-only'] }
    expect(await dbWriteFinancialValue('state', value)).toBe(false)
    expect(await dbReadFinancialState()).toEqual(value)
  })
  it('fails closed when opening an available IndexedDB throws instead of treating disk records as absent', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('storage denied') } })
    const { dbReadFinancialState, dbWriteFinancialValue } = await import('./db')
    await expect(dbReadFinancialState()).rejects.toThrow('Cihaz veritabanı açılamadı')
    await expect(dbWriteFinancialValue('state', { transactions: [] })).rejects.toThrow('Cihaz veritabanı açılamadı')
  })
})
