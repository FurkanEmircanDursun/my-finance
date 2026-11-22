import { normalizeAssetHoldings } from '../domain/assets'
import { mergeAssetValuations } from '../domain/assetsHistory'
import { monthLabel, monthOf, type DayKey, type MonthKey } from '../core/date'
import { displayMerchant } from '../core/text'
import type { Money } from '../core/money'
import { CATEGORIES, category, type CategoryId } from '../domain/categories'
import type {
  CategoryRule, Profile, Settings, Statement, Transaction, TxKind,
} from '../domain/types'
import type { Analysis } from '../analytics/types'
import { buildStatementMonthIndex, periodMonthOf } from './selectors'
import { defaultProfile, defaultSettings, type AppState } from './state'
import { sanitizeCards } from '../domain/cards'
import { migratePersisted, STATE_VERSION, type Persisted } from './migrate'

/**
 * Backup and export.
 *
 * One file, two layers:
 *
 *   `data`     — the source of truth. Every transaction, every statement (with
 *                its cover summary, its reconciliation and the loyalty lines
 *                that were left out), the learned rules, the profile. This is
 *                all `restore` reads, and it is enough to rebuild the app
 *                exactly.
 *   `derived`  — what the app computed from it: a summary per period and the
 *                whole-history findings. For people and for other tools; never
 *                read back, so it can never disagree with `data`.
 *
 * Money is in kuruş (1/100 TL) throughout, as it is inside the app. Dates are
 * `YYYY-MM-DD`, months `YYYY-MM`.
 *
 * Never exported: the app-lock PIN hash and salt. A backup file gets emailed and
 * dropped in cloud folders; it must not carry the means to unlock the app.
 */

export const BACKUP_FORMAT = 'my-finance/backup'

export type ExportedSettings = Pick<Settings, 'theme' | 'periodGrouping' | 'useLocalOcr' | 'ocrEndpoint'>

export interface PeriodCategory {
  id: CategoryId
  label: string
  nature: string
  /** Purchases in this category, before refunds. */
  gross: Money
  refunds: Money
  /** gross − refunds. */
  net: Money
  count: number
}

export interface PeriodSummary {
  period: MonthKey
  label: string
  from: DayKey | null
  to: DayKey | null
  statementIds: string[]
  counts: Record<TxKind | 'total', number>
  totals: { spend: Money; refunds: Money; netSpend: Money; income: Money; payments: Money }
  categories: PeriodCategory[]
  merchants: Array<{ merchant: string; label: string; category: CategoryId; net: Money; count: number }>
  banks: Array<{ bank: string; net: Money; count: number }>
  largest: Array<{ id: string; date: DayKey; description: string; amount: Money; category: CategoryId }>
  installmentCharges: Money
  reconciliation: Array<{ statementId: string; label: string; status: string; delta: Money | null }>
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  /** The schema `data` conforms to; older files are migrated on restore. */
  schemaVersion: number
  exportedAt: string
  app: { name: string; version: string }
  currency: 'TRY'
  units: {
    amount: string
    dates: string
    transactionAmount: string
    kinds: Record<TxKind, string>
  }
  scope: {
    period: MonthKey | 'all'
    grouping: 'calendar' | 'statement'
    from: DayKey | null
    to: DayKey | null
    transactionCount: number
    statementCount: number
    months: MonthKey[]
  }
  data: {
    transactions: Transaction[]
    statements: Statement[]
    rules: CategoryRule[]
    profile: Profile
    settings: ExportedSettings
  }
  derived: {
    note: string
    periods: PeriodSummary[]
    overall: {
      totals: Analysis['totals']
      meta: Analysis['meta']
      monthly: Analysis['monthly']
      recurring: Analysis['recurring']
      recurringIncome: Analysis['recurringIncome']
      installments: Analysis['installments']
      commitments: Analysis['commitments']
      habits: Analysis['habits']
      anomalies: Array<{ transactionId: string; reason: string; score: number; baseline: Money; note: string }>
      duplicates: Array<{ merchant: string; amount: Money; transactionIds: string[]; spanDays: number }>
      health: Analysis['health']
      insights: Array<{ id: string; severity: string; title: string; body: string }>
    }
  }
}

// ─── Building ─────────────────────────────────────────────────────────────────

export function summarizePeriod(
  period: MonthKey,
  txs: readonly Transaction[],
  statements: readonly Statement[],
): PeriodSummary {
  const counts: Record<TxKind | 'total', number> = { expense: 0, refund: 0, income: 0, payment: 0, total: txs.length }
  const totals = { spend: 0, refunds: 0, netSpend: 0, income: 0, payments: 0 }
  const cats = new Map<CategoryId, PeriodCategory>()
  const merchants = new Map<string, { label: string; category: CategoryId; net: Money; count: number }>()
  const banks = new Map<string, { net: Money; count: number }>()
  let from: DayKey | null = null
  let to: DayKey | null = null
  let installmentCharges = 0

  for (const tx of txs) {
    counts[tx.kind]++
    if (!from || tx.date < from) from = tx.date
    if (!to || tx.date > to) to = tx.date

    if (tx.kind === 'income') totals.income += tx.amount
    if (tx.kind === 'payment') totals.payments += tx.amount
    if (tx.kind !== 'expense' && tx.kind !== 'refund') continue

    const sign = tx.kind === 'expense' ? 1 : -1
    if (tx.kind === 'expense') {
      totals.spend += tx.amount
      if (tx.installment) installmentCharges += tx.amount
    } else {
      totals.refunds += tx.amount
    }

    let cat = cats.get(tx.category)
    if (!cat) {
      const def = category(tx.category)
      cat = { id: def.id, label: def.label, nature: def.nature, gross: 0, refunds: 0, net: 0, count: 0 }
      cats.set(tx.category, cat)
    }
    if (tx.kind === 'expense') {
      cat.gross += tx.amount
      cat.count++
    } else {
      cat.refunds += tx.amount
    }
    cat.net += sign * tx.amount

    const merchant = merchants.get(tx.merchant) ?? {
      label: displayMerchant(tx.merchant), category: tx.category, net: 0, count: 0,
    }
    merchant.net += sign * tx.amount
    if (tx.kind === 'expense') merchant.count++
    merchants.set(tx.merchant, merchant)

    const bank = banks.get(tx.bank) ?? { net: 0, count: 0 }
    bank.net += sign * tx.amount
    if (tx.kind === 'expense') bank.count++
    banks.set(tx.bank, bank)
  }
  totals.netSpend = totals.spend - totals.refunds

  const statementIds = [...new Set(txs.map((t) => t.statementId).filter((id): id is string => Boolean(id)))]

  return {
    period,
    label: monthLabel(period),
    from,
    to,
    statementIds,
    counts,
    totals,
    categories: [...cats.values()].sort((a, b) => b.net - a.net),
    merchants: [...merchants.entries()]
      .map(([merchant, m]) => ({ merchant, ...m }))
      .sort((a, b) => b.net - a.net)
      .slice(0, 30),
    banks: [...banks.entries()].map(([bank, b]) => ({ bank, ...b })).sort((a, b) => b.net - a.net),
    largest: txs
      .filter((t) => t.kind === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)
      .map((t) => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, category: t.category })),
    installmentCharges,
    reconciliation: statements
      .filter((s) => statementIds.includes(s.id))
      .map((s) => ({
        statementId: s.id,
        label: s.label,
        status: s.reconciliation?.status ?? 'unverified',
        delta: s.reconciliation?.delta ?? null,
      })),
  }
}

export interface BuildBackupInput {
  state: Pick<AppState, 'transactions' | 'statements' | 'rules' | 'profile' | 'settings'>
  /** Analysis of the whole history; becomes `derived.overall`. */
  overall: Analysis
  appVersion: string
  /** A single period, or everything. */
  period?: MonthKey | 'all'
  now?: Date
}

export function buildBackup({ state, overall, appVersion, period = 'all', now = new Date() }: BuildBackupInput): BackupFile {
  const grouping = state.settings.periodGrouping === 'statement' ? 'statement' : 'calendar'
  const statementMonths = buildStatementMonthIndex(state.statements)
  const periodOf = (tx: Transaction) => periodMonthOf(tx, grouping, statementMonths)

  const transactions =
    period === 'all' ? state.transactions : state.transactions.filter((tx) => periodOf(tx) === period)

  const referenced = new Set(transactions.map((tx) => tx.statementId).filter(Boolean))
  const statements =
    period === 'all'
      ? state.statements
      : state.statements.filter((s) => referenced.has(s.id) || statementMonths.get(s.id) === period)

  const byPeriod = new Map<MonthKey, Transaction[]>()
  for (const tx of transactions) {
    const key = periodOf(tx)
    const bucket = byPeriod.get(key)
    if (bucket) bucket.push(tx)
    else byPeriod.set(key, [tx])
  }
  const months = [...byPeriod.keys()].sort()

  let from: DayKey | null = null
  let to: DayKey | null = null
  for (const tx of transactions) {
    if (!from || tx.date < from) from = tx.date
    if (!to || tx.date > to) to = tx.date
  }

  // Everything the person typed stays, but never the means to unlock the app.
  const { theme, periodGrouping, useLocalOcr, ocrEndpoint } = state.settings

  return {
    format: BACKUP_FORMAT,
    schemaVersion: STATE_VERSION,
    exportedAt: now.toISOString(),
    app: { name: 'Mizan', version: appVersion },
    currency: 'TRY',
    units: {
      amount: 'kuruş — 1/100 TL, integer. 12345 means ₺123,45',
      dates: 'YYYY-MM-DD (local statement date); months YYYY-MM',
      transactionAmount: 'always positive; the direction is the `kind`',
      kinds: {
        expense: 'money spent — counts as spending',
        refund: 'merchant refund or card credit — reduces spending',
        income: 'salary or transfer in, entered by hand or from a CSV',
        payment: 'card-debt payment — a cash movement, never spending',
      },
    },
    scope: {
      period,
      grouping,
      from,
      to,
      transactionCount: transactions.length,
      statementCount: statements.length,
      months,
    },
    data: {
      transactions,
      statements,
      rules: state.rules,
      profile: state.profile,
      settings: { theme, periodGrouping, useLocalOcr, ocrEndpoint },
    },
    derived: {
      note: 'Computed by the app from `data`. Ignored on restore; regenerate rather than edit.',
      periods: months
        .slice()
        .reverse()
        .map((key) => summarizePeriod(key, byPeriod.get(key) ?? [], state.statements)),
      overall: {
        totals: overall.totals,
        meta: overall.meta,
        monthly: overall.monthly,
        recurring: overall.recurring,
        recurringIncome: overall.recurringIncome,
        installments: overall.installments,
        commitments: overall.commitments,
        habits: overall.habits,
        anomalies: overall.anomalies.map((a) => ({
          transactionId: a.transaction.id,
          reason: a.reason,
          score: a.score,
          baseline: a.baseline,
          note: a.note,
        })),
        duplicates: overall.duplicates.map((d) => ({
          merchant: d.merchant,
          amount: d.amount,
          transactionIds: d.transactions.map((t) => t.id),
          spanDays: d.spanDays,
        })),
        health: overall.health,
        insights: overall.insights.map((i) => ({ id: i.id, severity: i.severity, title: i.title, body: i.body })),
      },
    },
  }
}

export function backupFileName(period: MonthKey | 'all', today: DayKey): string {
  return period === 'all' ? `mizan-yedek-${today}.json` : `mizan-${period}-${today}.json`
}

// ─── Restoring ────────────────────────────────────────────────────────────────

export type RestoreMode = 'merge' | 'replace'

export interface BackupPreview {
  assets: number
  transactions: number
  statements: number
  rules: number
  from: DayKey | null
  to: DayKey | null
  exportedAt: string | null
  appVersion: string | null
  schemaVersion: number
  /** Rows that were present but unusable and will be left out. */
  rejected: number
}

export interface ParsedBackup {
  data: Persisted
  preview: BackupPreview
  notes: string[]
}

export type BackupParseResult = { ok: true; backup: ParsedBackup } | { ok: false; error: string }

const KINDS = new Set<TxKind>(['expense', 'refund', 'income', 'payment'])
const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id))
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * One transaction, checked and coerced, or null when it cannot be used. A file
 * that was edited by hand or written by an older build is trusted for shape
 * only as far as this lets through: a row with no date or amount would poison
 * every total, so it is dropped (and counted) rather than imported.
 */
function sanitizeTransaction(raw: unknown): Transaction | null {
  if (!isRecord(raw)) return null
  const { id, date, amount, kind } = raw
  if (typeof id !== 'string' || !id) return null
  if (typeof date !== 'string' || !DAY_RE.test(date)) return null
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null
  if (typeof kind !== 'string' || !KINDS.has(kind as TxKind)) return null

  const description = typeof raw.description === 'string' ? raw.description : ''
  const tx = raw as unknown as Transaction

  return {
    ...tx,
    id,
    date,
    amount: Math.round(amount),
    kind: kind as TxKind,
    description,
    merchant: typeof raw.merchant === 'string' && raw.merchant ? raw.merchant : description.toUpperCase(),
    category: (CATEGORY_IDS.has(String(raw.category)) ? raw.category : 'other') as CategoryId,
    categoryLocked: Boolean(raw.categoryLocked),
    bank: typeof raw.bank === 'string' ? raw.bank : 'Bilinmiyor',
    accountLabel: typeof raw.accountLabel === 'string' ? raw.accountLabel : '',
    installment: isRecord(raw.installment) ? tx.installment : null,
    source: raw.source === 'manual' || raw.source === 'csv' ? raw.source : 'statement',
  }
}

/**
 * Reads a backup file's text. Accepts this build's format, the shallow
 * `{ exportedAt, profile, rules, statements, transactions }` JSON that earlier
 * builds offered as "JSON yedek", and a raw stored snapshot.
 */
export function parseBackup(text: string): BackupParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Dosya geçerli bir JSON değil.' }
  }
  if (!isRecord(json)) return { ok: false, error: 'Dosya bir yedek gibi görünmüyor.' }

  const wrapped = json.format === BACKUP_FORMAT && isRecord(json.data)
  const source = (wrapped ? (json.data as Record<string, unknown>) : json) as Record<string, unknown>

  if (!Array.isArray(source.transactions)) {
    return { ok: false, error: 'Dosyada işlem listesi bulunamadı; bu bir Mizan yedeği değil.' }
  }

  // Files from before schema 3 carry no version of their own; they were all v2.
  const schemaVersion =
    typeof json.schemaVersion === 'number' ? json.schemaVersion
    : typeof json.version === 'number' ? json.version
    : 2

  if (schemaVersion > STATE_VERSION) {
    return {
      ok: false,
      error: `Bu yedek daha yeni bir sürümle oluşturulmuş (şema ${schemaVersion}). Uygulamayı güncelleyip tekrar dene.`,
    }
  }

  const transactions: Transaction[] = []
  let rejected = 0
  for (const raw of source.transactions as unknown[]) {
    const tx = sanitizeTransaction(raw)
    if (tx) transactions.push(tx)
    else rejected++
  }

  const profile = isRecord(source.profile) ? ({ ...defaultProfile, ...source.profile } as Profile) : defaultProfile
  const settings = isRecord(source.settings) ? ({ ...defaultSettings, ...source.settings } as Settings) : defaultSettings

  const migrated = migratePersisted({
    version: schemaVersion,
    transactions,
    statements: Array.isArray(source.statements) ? source.statements : [],
    rules: Array.isArray(source.rules) ? source.rules : [],
    profile,
    settings,
  })
  if (!migrated) return { ok: false, error: 'Yedeğin şema sürümü tanınmıyor.' }

  const data = migrated.state
  let from: DayKey | null = null
  let to: DayKey | null = null
  for (const tx of data.transactions) {
    if (!from || tx.date < from) from = tx.date
    if (!to || tx.date > to) to = tx.date
  }

  return {
    ok: true,
    backup: {
      data,
      notes: migrated.notes,
      preview: {
        assets: normalizeAssetHoldings(data.profile.assets).length,
        transactions: data.transactions.length,
        statements: data.statements.length,
        rules: data.rules.length,
        from,
        to,
        exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : null,
        appVersion: isRecord(json.app) && typeof json.app.version === 'string' ? json.app.version : null,
        schemaVersion,
        rejected,
      },
    },
  }
}

const hasProfile = (p: Profile) =>
  p.monthlyIncome > 0 || p.spendingLimit > 0 || p.currentBalance > 0 || p.goal !== null || p.budgets.length > 0 || (p.assets?.length ?? 0) > 0 || (p.assetValuations?.length ?? 0) > 0

export interface RestoreResult {
  transactions: Transaction[]
  statements: Statement[]
  rules: CategoryRule[]
  profile: Profile
  settings: Settings
  added: { transactions: number; statements: number; rules: number }
}

/**
 * Applies a parsed backup to the current data.
 *
 * `merge` adds what is missing and touches nothing that exists: a transaction
 * already here (same id) is kept as it is, so a category the person has since
 * corrected is not reverted by restoring an older file. `replace` swaps the data
 * for the file's. Either way the app lock and the intro flag stay as they are on
 * this device — they describe the device, not the finances.
 */
export function applyBackup(
  current: Pick<AppState, 'transactions' | 'statements' | 'rules' | 'profile' | 'settings'>,
  backup: Persisted,
  mode: RestoreMode,
): RestoreResult {
  const sortDesc = (a: Transaction, b: Transaction) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)

  const carriedSettings = (incoming: Settings): Settings => ({
    ...current.settings,
    theme: incoming.theme ?? current.settings.theme,
    periodGrouping: incoming.periodGrouping ?? current.settings.periodGrouping,
  })

  if (mode === 'replace') {
    const statements = new Map(current.statements.map(statement => [statement.id, statement.importedAt]))
    const rules = new Map(current.rules.map(rule => [rule.merchant, rule]))
    return {
      transactions: [...backup.transactions].sort(sortDesc),
      statements: backup.statements.map(statement => ({ ...statement, importedAt: statements.get(statement.id) ?? statement.importedAt })),
      rules: backup.rules.map(rule => {
        const original = rules.get(rule.merchant)
        return original ? { ...original, category: rule.category } : rule
      }),
      profile: { ...defaultProfile, ...backup.profile },
      settings: carriedSettings(backup.settings),
      added: {
        transactions: backup.transactions.length,
        statements: backup.statements.length,
        rules: backup.rules.length,
      },
    }
  }

  const haveTx = new Set(current.transactions.map((t) => t.id))
  const newTx = backup.transactions.filter((t) => !haveTx.has(t.id))

  const haveSt = new Set(current.statements.map((s) => s.id))
  const newSt = backup.statements.filter((s) => !haveSt.has(s.id))

  const haveRule = new Set(current.rules.map((r) => r.merchant))
  const newRules = backup.rules.filter((r) => !haveRule.has(r.merchant))
  const currentCards = sanitizeCards(current.profile.cards)
  const cardIds = new Set(currentCards.map((card) => card.id))
  const removedIds = new Set(sanitizeCards(current.profile.archivedCards).map((card) => card.id))
  const cards = [...currentCards, ...sanitizeCards(backup.profile.cards).filter((card) => !cardIds.has(card.id) && !removedIds.has(card.id))]
  const activeIds = new Set(cards.map((card) => card.id))
  const archivedById = new Map(sanitizeCards(backup.profile.archivedCards).map((card) => [card.id, card]))
  for (const card of sanitizeCards(current.profile.archivedCards)) archivedById.set(card.id, card)
  const archivedCards = [...archivedById.values()].filter((card) => !activeIds.has(card.id))
  // Keep current holdings on ID collisions; merge never rolls back an edit.
  const assetsById = new Map(normalizeAssetHoldings(backup.profile.assets).map(asset => [asset.id, asset]))
  for (const asset of normalizeAssetHoldings(current.profile.assets)) assetsById.set(asset.id, asset)
  const assets = [...assetsById.values()]
  const assetValuations = mergeAssetValuations(backup.profile.assetValuations, current.profile.assetValuations)

  return {
    transactions: [...current.transactions, ...newTx].sort(sortDesc),
    statements: [...current.statements, ...newSt],
    rules: [...current.rules, ...newRules],
    // A profile already filled in on this device is not overwritten by a file's.
    profile: { ...(hasProfile(current.profile) ? current.profile : { ...defaultProfile, ...backup.profile }), cards, archivedCards, assets, assetValuations },
    settings: current.settings,
    added: { transactions: newTx.length, statements: newSt.length, rules: newRules.length },
  }
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

const CSV_HEADER = [
  'Tarih', 'Açıklama', 'İşyeri', 'Tür', 'Kategori', 'Tutar (TL)', 'Banka', 'Hesap',
  'Taksit', 'Taksit ana tutar (TL)', 'Döviz tutarı', 'Döviz', 'Kazanılan bonus (TL)', 'Dönem', 'Kaynak', 'Ekstre',
]

const KIND_TR: Record<TxKind, string> = {
  expense: 'Harcama', refund: 'İade', income: 'Gelir', payment: 'Kart ödemesi',
}

const tl = (minor: Money) => (minor / 100).toFixed(2).replace('.', ',')
const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`

/**
 * Every transaction, one per line, openable in Excel: `;` separated, decimal
 * comma, UTF-8 with a BOM so Turkish letters survive. The earlier export had
 * seven columns and dropped the kind, so a refund and a purchase of the same
 * amount were indistinguishable in the sheet.
 */
export function buildCsv(
  transactions: readonly Transaction[],
  statements: readonly Statement[],
  periodOf: (tx: Transaction) => MonthKey = (tx) => monthOf(tx.date),
): string {
  const labels = new Map(statements.map((s) => [s.id, s.label]))

  const rows = transactions.map((tx) =>
    [
      tx.date,
      tx.description,
      tx.merchant,
      KIND_TR[tx.kind],
      category(tx.category).label,
      tl(tx.amount),
      tx.bank,
      tx.accountLabel,
      tx.installment ? `${tx.installment.current}/${tx.installment.total}` : '',
      tx.installment?.principal ? tl(tx.installment.principal) : '',
      tx.foreign ? (tx.foreign.amount / 100).toFixed(2).replace('.', ',') : '',
      tx.foreign?.currency ?? '',
      tx.reward ? tl(tx.reward) : '',
      periodOf(tx),
      tx.source === 'manual' ? 'Elle girildi' : tx.source === 'csv' ? 'CSV' : 'Ekstre',
      tx.statementId ? labels.get(tx.statementId) ?? '' : '',
    ].map(cell).join(';'),
  )

  return '﻿' + [CSV_HEADER.map(cell).join(';'), ...rows].join('\r\n')
}
