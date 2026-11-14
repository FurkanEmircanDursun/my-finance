import { describe, expect, it } from 'vitest'
import {
  applyBackup, backupFileName, buildBackup, buildCsv, parseBackup, BACKUP_FORMAT,
} from './backup'
import { initialState, reducer } from './state'
import { defaultProfile, defaultSettings } from './defaults'
import { STATE_VERSION } from './migrate'
import { analyze } from '../analytics/engine'
import { parseStatementText } from '../ingest/pipeline'
import { AKBANK_COLUMNS, GARANTI_COLUMNS } from '../ingest/fixtures'
import { toMinor } from '../core/money'
import type { Statement, Transaction } from '../domain/types'

/** Two real-shaped statements, imported the way the app imports them. */
function loaded() {
  const statements: Statement[] = []
  const transactions: Transaction[] = []

  for (const [id, text, engine] of [
    ['st-garanti', GARANTI_COLUMNS, 'pdf-text'],
    ['st-akbank', AKBANK_COLUMNS, 'pdf-ebcdic'],
  ] as const) {
    const r = parseStatementText(text, { rules: [], engine, fileName: `${id}.pdf` })
    statements.push({
      id, label: r.label, fileName: `${id}.pdf`, bank: r.bank, accountLabel: r.accountLabel,
      transactionCount: r.transactions.length, skippedCount: r.skipped, periodStart: r.periodStart,
      periodEnd: r.periodEnd, dueDate: r.dueDate, importedAt: 1, engine, summary: r.summary,
      reconciliation: r.reconciliation, ignored: r.ignored,
    })
    transactions.push(...r.transactions.map((t) => ({ ...t, statementId: id })))
  }

  const manual: Transaction = {
    id: 'manual-salary', date: '2026-09-01', description: 'Maaş', merchant: 'MAAS', amount: 5_000_000,
    kind: 'income', category: 'other', categoryLocked: true, bank: 'Manuel', accountLabel: 'Aylık gelir',
    installment: null, source: 'manual',
  }
  return { statements, transactions: [...transactions, manual] }
}

const settings = { ...defaultSettings, theme: 'dark' as const, periodGrouping: 'statement' as const }

const stateWith = (data = loaded()) => ({
  transactions: data.transactions,
  statements: data.statements,
  rules: [{ id: 'r1', merchant: 'YEREL MARKET', category: 'market' as const, createdAt: 5 }],
  profile: { ...defaultProfile, monthlyIncome: toMinor(50_000) },
  settings,
})

const NOW = new Date('2026-10-03T10:00:00Z')

describe('the backup file', () => {
  const state = stateWith()
  const overall = analyze(state.transactions, state.profile)
  const backup = buildBackup({ state, overall, appVersion: '9.9.9', now: NOW })

  it('names itself, its schema and its units, so a stranger can read it', () => {
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.schemaVersion).toBe(STATE_VERSION)
    expect(backup.exportedAt).toBe('2026-10-03T10:00:00.000Z')
    expect(backup.app).toEqual({ name: 'Mizan', version: '9.9.9' })
    expect(backup.units.amount).toMatch(/kuruş/)
    expect(Object.keys(backup.units.kinds)).toEqual(['expense', 'refund', 'income', 'payment'])
  })

  it('carries every transaction and statement, with the detail a statement has', () => {
    expect(backup.data.transactions).toHaveLength(state.transactions.length)
    const garanti = backup.data.statements.find((s) => s.id === 'st-garanti')!
    expect(garanti.reconciliation?.status).toBe('match')
    expect(garanti.summary?.totalDebt).toBe(toMinor(1280))
    expect(garanti.ignored).toHaveLength(2)
    // Row-level detail survives: the raw line, the bonus a purchase earned.
    const uber = backup.data.transactions.find((t) => t.description.includes('UBER'))!
    expect(uber.raw).toContain('UBER EATS')
    expect(uber.reward).toBe(toMinor(0.08))
  })

  it('never lets the means to unlock the app into the file', () => {
    const locked = { ...state, settings: { ...settings, lockPinHash: 'secret-hash', lockPinSalt: 'secret-salt' } }
    const text = JSON.stringify(buildBackup({ state: locked, overall, appVersion: '1', now: NOW }))
    expect(text).not.toMatch(/secret-hash|secret-salt|lockPin/)
  })

  it('summarises each period in the grouping the app is using', () => {
    expect(backup.scope.grouping).toBe('statement')
    const [sept] = backup.derived.periods
    expect(sept.period).toBe('2026-09')
    // 1.280 + 1.300 net of refunds; the salary is income, not spend.
    expect(sept.totals.netSpend).toBe(toMinor(2580))
    expect(sept.totals.income).toBe(toMinor(50_000))
    expect(sept.counts.total).toBe(state.transactions.length)
    expect(sept.reconciliation.every((r) => r.status === 'match')).toBe(true)
  })

  it('breaks a period down by category net of refunds', () => {
    const market = backup.derived.periods[0].categories.find((c) => c.id === 'market')!
    expect(market.net).toBe(market.gross - market.refunds)
  })

  it('can be scoped to one period, taking only its statements along', () => {
    const none = buildBackup({ state, overall, appVersion: '1', period: '2030-01', now: NOW })
    expect(none.data.transactions).toHaveLength(0)
    expect(none.data.statements).toHaveLength(0)

    const sept = buildBackup({ state, overall, appVersion: '1', period: '2026-09', now: NOW })
    expect(sept.data.transactions).toHaveLength(state.transactions.length)
    expect(sept.data.statements).toHaveLength(2)
  })

  it('names its files by what they hold', () => {
    expect(backupFileName('all', '2026-10-03')).toBe('mizan-yedek-2026-10-03.json')
    expect(backupFileName('2026-09', '2026-10-03')).toBe('mizan-2026-09-2026-10-03.json')
  })
})

describe('restoring a file', () => {
  const state = stateWith()
  const overall = analyze(state.transactions, state.profile)
  const text = JSON.stringify(buildBackup({ state, overall, appVersion: '1', now: NOW }))

  it('gets back exactly what was put in', () => {
    const result = parseBackup(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.data.transactions).toEqual(state.transactions)
    expect(result.backup.data.statements).toEqual(state.statements)
    expect(result.backup.data.rules).toEqual(state.rules)
    expect(result.backup.data.profile).toEqual(state.profile)
    expect(result.backup.preview).toMatchObject({
      transactions: state.transactions.length, statements: 2, rules: 1, rejected: 0, schemaVersion: STATE_VERSION,
      from: '2026-08-23', to: '2026-09-24',
    })
  })

  it('refuses what is not JSON, and what is JSON but not a backup', () => {
    expect(parseBackup('not json')).toMatchObject({ ok: false })
    expect(parseBackup('[1,2,3]')).toMatchObject({ ok: false })
    expect(parseBackup('{"hello":"world"}')).toMatchObject({ ok: false })
  })

  it('refuses a file from a newer app instead of misreading it', () => {
    const future = JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: STATE_VERSION + 1, data: { transactions: [] } })
    const result = parseBackup(future)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/daha yeni/)
  })

  it('drops rows that would poison the totals, and says how many', () => {
    const good = state.transactions[0]
    const dirty = JSON.stringify({
      format: BACKUP_FORMAT,
      schemaVersion: STATE_VERSION,
      data: {
        transactions: [
          good,
          { ...good, id: 'no-date', date: 'yesterday' },
          { ...good, id: 'neg', amount: -5 },
          { ...good, id: 'nan', amount: 'abc' },
          { ...good, id: 'weird-kind', kind: 'gift' },
          { ...good, id: '' },
          null,
          { ...good, id: 'odd-category', category: 'spaceships' },
        ],
        statements: [],
        rules: [],
      },
    })
    const result = parseBackup(dirty)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.preview.rejected).toBe(6)
    expect(result.backup.data.transactions.map((t) => t.id)).toEqual([good.id, 'odd-category'])
    expect(result.backup.data.transactions[1].category).toBe('other')
  })

  it('reads the shallow JSON earlier builds offered, and migrates its ids', () => {
    const legacy = JSON.stringify({
      exportedAt: '2026-09-01T00:00:00Z',
      profile: defaultProfile,
      rules: [],
      statements: state.statements.map(({ summary, reconciliation, ignored, accountLabel, ...rest }) => {
        void summary, reconciliation, ignored, accountLabel
        return rest
      }),
      transactions: state.transactions.map(({ billedOn, foreign, reward, ...t }, i) => {
        void billedOn, foreign, reward
        return { ...t, id: t.source === 'manual' ? t.id : `old-${i}` }
      }),
    })
    const result = parseBackup(legacy)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.preview.schemaVersion).toBe(2)
    const ids = new Set(result.backup.data.transactions.map((t) => t.id))
    for (const t of state.transactions) expect(ids.has(t.id)).toBe(true)
  })
})

describe('applying a backup', () => {
  const state = stateWith()
  const overall = analyze(state.transactions, state.profile)
  const parsed = parseBackup(JSON.stringify(buildBackup({ state, overall, appVersion: '1', now: NOW })))
  if (!parsed.ok) throw new Error('fixture backup must parse')
  const data = parsed.backup.data

  it('merging the same file twice adds nothing', () => {
    const result = applyBackup(state, data, 'merge')
    expect(result.added).toEqual({ transactions: 0, statements: 0, rules: 0 })
    expect(result.transactions).toHaveLength(state.transactions.length)
  })

  it('merging fills in only what is missing', () => {
    const fewer = { ...state, transactions: state.transactions.slice(0, 10), statements: [state.statements[0]], rules: [] }
    const result = applyBackup(fewer, data, 'merge')
    expect(result.added.transactions).toBe(state.transactions.length - 10)
    expect(result.added.statements).toBe(1)
    expect(result.added.rules).toBe(1)
    expect(new Set(result.transactions.map((t) => t.id)).size).toBe(state.transactions.length)
  })

  it('merging does not undo a correction made since the backup was taken', () => {
    const corrected = state.transactions.map((t) => (t.id === state.transactions[0].id ? { ...t, category: 'health' as const } : t))
    const result = applyBackup({ ...state, transactions: corrected }, data, 'merge')
    expect(result.transactions.find((t) => t.id === state.transactions[0].id)?.category).toBe('health')
  })

  it('merging keeps a profile already filled in here', () => {
    const mine = { ...defaultProfile, monthlyIncome: toMinor(99_000) }
    expect(applyBackup({ ...state, profile: mine }, data, 'merge').profile.monthlyIncome).toBe(toMinor(99_000))
    expect(applyBackup({ ...state, profile: defaultProfile }, data, 'merge').profile.monthlyIncome).toBe(toMinor(50_000))
  })

  it('replacing swaps the data but keeps what belongs to this device', () => {
    const device = { ...state, settings: { ...settings, lockPinHash: 'h', lockPinSalt: 's', onboardingSeen: true } }
    const empty = { ...device, transactions: [], statements: [], rules: [], profile: defaultProfile }
    const result = applyBackup(empty, data, 'replace')
    expect(result.transactions).toHaveLength(state.transactions.length)
    expect(result.settings.lockPinHash).toBe('h')
    expect(result.settings.onboardingSeen).toBe(true)
  })

  it('replacing sorts newest first, as the app keeps it', () => {
    const dates = applyBackup(state, data, 'replace').transactions.map((t) => t.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })
})

describe('restore through the reducer', () => {
  const state = stateWith()
  const overall = analyze(state.transactions, state.profile)
  const parsed = parseBackup(JSON.stringify(buildBackup({ state, overall, appVersion: '1', now: NOW })))
  if (!parsed.ok) throw new Error('fixture backup must parse')

  it('brings a blank install back to the full history', () => {
    const restored = reducer({ ...initialState, hydrated: true }, { type: 'restore', backup: parsed.backup.data, mode: 'replace' })
    expect(restored.transactions).toHaveLength(state.transactions.length)
    expect(restored.statements).toHaveLength(2)
    expect(restored.rules).toHaveLength(1)
  })

  it('clears a period filter that named the old data', () => {
    const filtered = { ...initialState, filters: { ...initialState.filters, month: '2019-01' } }
    expect(reducer(filtered, { type: 'restore', backup: parsed.backup.data, mode: 'replace' }).filters.month).toBe('all')
    expect(reducer(filtered, { type: 'restore', backup: parsed.backup.data, mode: 'merge' }).filters.month).toBe('2019-01')
  })
})

describe('CSV', () => {
  const { transactions, statements } = loaded()
  const csv = buildCsv(transactions, statements)
  const lines = csv.replace(/^﻿/, '').split('\r\n')

  it('opens in Excel: BOM, semicolons, one line per row', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(lines).toHaveLength(transactions.length + 1)
    expect(lines[0]).toContain('"Tür";"Kategori"')
  })

  it('says whether a row is a purchase or a refund — the old export could not', () => {
    const refundLine = lines.find((l) => l.includes('MİGROS HEMEN'))!
    expect(refundLine).toContain('"İade"')
  })

  it('writes amounts with a decimal comma', () => {
    expect(lines.find((l) => l.includes('UBER EATS'))).toContain('"600,00"')
  })

  it('carries instalment, foreign price and bonus columns', () => {
    const plan = lines.find((l) => l.includes('TKPAY'))!
    expect(plan).toContain('"2/3"')
    expect(plan).toContain('"900,00"')
    expect(lines.find((l) => l.includes('STEAMGAMES'))).toContain('"3,99";"USD"')
  })

  it('escapes quotes so a description can never break a row', () => {
    const tricky: Transaction = { ...transactions[0], id: 'q', description: 'A "quoted" shop; with a semicolon' }
    const out = buildCsv([tricky], [])
    expect(out).toContain('"A ""quoted"" shop; with a semicolon"')
  })
})
