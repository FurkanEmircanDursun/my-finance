import { uid } from '../core/hash'
import type { CategoryId } from '../domain/categories'
import type {
  CategoryRule, CreditCard, Filters, ImportOutcome, Profile, Settings, Statement, Transaction,
} from '../domain/types'
import { emptyFilters } from '../domain/types'
import { cardDisplayName, sanitizeCards } from '../domain/cards'
import { applyBackup, type RestoreMode } from './backup'
import { defaultProfile, defaultSettings } from './defaults'
import { STATE_VERSION, type Persisted } from './migrate'
import { applyChange, type RemoteChange, type Snapshot } from '../sync/model'

export { defaultProfile, defaultSettings, STATE_VERSION }

export interface AppState {
  version: number
  transactions: Transaction[]
  statements: Statement[]
  rules: CategoryRule[]
  profile: Profile
  settings: Settings
  filters: Filters
  /** Import feedback from the last batch, shown once then dismissed. */
  lastImport: ImportOutcome[]
  /**
   * Things the person should be told once about the data they opened the app
   * with — what a schema migration could not recover, say. Never persisted.
   */
  notices: string[]
  hydrated: boolean
}

export const initialState: AppState = {
  version: STATE_VERSION,
  transactions: [],
  statements: [],
  rules: [],
  profile: defaultProfile,
  settings: defaultSettings,
  filters: emptyFilters,
  lastImport: [],
  notices: [],
  hydrated: false,
}

/** What cloud sync looks at: the financial data and the preferences that travel with a person. */
export function toSnapshot(
  state: Pick<AppState, 'transactions' | 'statements' | 'rules' | 'profile' | 'settings'>,
): Snapshot {
  return {
    transactions: state.transactions,
    statements: state.statements,
    rules: state.rules,
    profile: state.profile,
    prefs: {
      theme: state.settings.theme,
      periodGrouping: state.settings.periodGrouping,
      ...(state.settings.reminders && (state.settings.reminders.enabled ||
          state.settings.reminders.hour !== defaultSettings.reminders?.hour || state.settings.reminders.cloudPush !== undefined)
        ? { reminders: state.settings.reminders ?? defaultSettings.reminders } : {}),
      ...(state.settings.onboardingSeen ? { onboardingSeen: true } : {}),
    },
  }
}

const newestFirst = (a: Transaction, b: Transaction) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)

export type Action =
  | { type: 'hydrate'; payload: Partial<AppState> }
  | { type: 'seedSession'; payload: Partial<AppState> }
  | { type: 'resetSession' }
  | { type: 'import'; transactions: Transaction[]; statements: Statement[]; outcomes: ImportOutcome[]; refreshedStatementIds?: string[] }
  | { type: 'setCategory'; transactionIds: string[]; category: CategoryId; learn: boolean }
  | { type: 'addManual'; transaction: Transaction }
  | { type: 'addManualBatch'; transactions: Transaction[] }
  | { type: 'deleteTransactions'; ids: string[] }
  | { type: 'removeStatement'; statementId: string }
  | { type: 'restoreStatement'; statement: Statement; transactions: Transaction[] }
  | { type: 'setFilters'; filters: Partial<Filters> }
  | { type: 'setProfile'; profile: Partial<Profile> }
  | { type: 'upsertCard'; card: CreditCard }
  | { type: 'removeCard'; cardId: string }
  | { type: 'setSettings'; settings: Partial<Settings> }
  | { type: 'removeRule'; ruleId: string }
  | { type: 'clearImportLog' }
  | { type: 'dismissNotices' }
  | { type: 'remote'; change: RemoteChange }
  | { type: 'clearData' }
  | { type: 'restore'; backup: Persisted; mode: RestoreMode }
  | { type: 'reset' }

function applyRuleToAll(
  transactions: Transaction[],
  merchant: string,
  category: CategoryId,
): Transaction[] {
  return transactions.map((tx) =>
    tx.merchant === merchant ? { ...tx, category, categoryLocked: true } : tx,
  )
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'resetSession':
      return initialState
    case 'seedSession':
      return { ...state, ...action.payload, hydrated: false }
    case 'hydrate':
      return { ...state, ...action.payload, hydrated: true }

    case 'import': {
      if (action.transactions.length === 0 && action.statements.length === 0 && !action.refreshedStatementIds?.length) {
        return { ...state, lastImport: action.outcomes }
      }
      const refreshed = new Set(action.refreshedStatementIds)
      const priorRows = new Map(state.transactions.map((tx) => [tx.id, tx]))
      const kept = state.transactions.filter((tx) => !tx.statementId || !refreshed.has(tx.statementId))
      const existing = new Set(kept.map((tx) => tx.id))
      const added = action.transactions.filter((tx) => !existing.has(tx.id)).map((tx) => {
        const prior = priorRows.get(tx.id)
        return prior?.categoryLocked ? { ...tx, category: prior.category, categoryLocked: true } : tx
      })
      const merged = [...kept, ...added].sort(newestFirst)
      // A statement that arrives with an id already held replaces that record:
      // that is how a re-import refreshes the summary and reconciliation of a
      // statement imported by an older build.
      const byId = new Map(state.statements.map((st) => [st.id, st]))
      for (const st of action.statements) byId.set(st.id, { ...st, importedAt: byId.get(st.id)?.importedAt ?? st.importedAt })
      const transactions = merged.map((tx) => {
        const statement = tx.statementId ? byId.get(tx.statementId) : undefined
        return statement?.cardId && tx.cardId !== statement.cardId
          ? { ...tx, cardId: statement.cardId, accountLabel: statement.accountLabel ?? tx.accountLabel }
          : tx
      })
      return {
        ...state,
        transactions,
        statements: [...byId.values()],
        lastImport: action.outcomes,
      }
    }

    case 'setCategory': {
      const targetIds = new Set(action.transactionIds)
      const touched = state.transactions.filter((t) => targetIds.has(t.id))
      if (!touched.length) return state

      let transactions = state.transactions.map((tx) =>
        targetIds.has(tx.id) ? { ...tx, category: action.category, categoryLocked: true } : tx,
      )

      let rules = state.rules
      if (action.learn) {
        // One rule per distinct merchant in the selection; re-assigning a
        // merchant replaces its previous rule instead of stacking.
        const merchants = [...new Set(touched.map((t) => t.merchant))]
        const priorRules = new Map(state.rules.map(rule => [rule.merchant, rule]))
        rules = state.rules.filter((r) => !merchants.includes(r.merchant))
        for (const merchant of merchants) {
          const prior = priorRules.get(merchant)
          rules.push({ id: prior?.id ?? uid('rule-'), merchant, category: action.category, createdAt: prior?.createdAt ?? Date.now() })
          transactions = applyRuleToAll(transactions, merchant, action.category)
        }
      }

      return { ...state, transactions, rules }
    }

    case 'addManual': {
      const transactions = [action.transaction, ...state.transactions].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      )
      return { ...state, transactions }
    }

    case 'addManualBatch': {
      if (!action.transactions.length) return state
      // A repeating entry (rent every month, salary every month) arrives as one
      // row per month; adding them one action at a time would re-sort and
      // re-analyse the whole list once per month added.
      const existing = new Set(state.transactions.map((t) => t.id))
      const added = action.transactions.filter((t) => !existing.has(t.id))
      if (!added.length) return state

      const transactions = [...state.transactions, ...added].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      )
      return { ...state, transactions }
    }

    case 'deleteTransactions': {
      const ids = new Set(action.ids)
      return { ...state, transactions: state.transactions.filter((t) => !ids.has(t.id)) }
    }

    case 'removeStatement': {
      const statement = state.statements.find((s) => s.id === action.statementId)
      if (!statement) return state
      // No filter to reconcile here: `filters.month` names a calendar or
      // statement-group month, not this statement's id, so it stays valid —
      // worst case the selected period now has fewer (or zero) transactions,
      // which views already render as an honest empty state.
      return {
        ...state,
        statements: state.statements.filter((s) => s.id !== action.statementId),
        transactions: state.transactions.filter(
          (t) => t.statementId !== action.statementId,
        ),
      }
    }

    case 'restoreStatement': {
      const { statement, transactions } = action
      if (state.statements.some(item => item.id === statement.id || (
        statement.periodEnd && item.periodEnd === statement.periodEnd && item.bank === statement.bank &&
        (statement.cardId ? item.cardId === statement.cardId : !item.cardId && item.accountLabel === statement.accountLabel)
      ))) return state
      const ids = new Set(state.transactions.map(item => item.id))
      if (transactions.some(item => item.statementId !== statement.id || ids.has(item.id))) return state
      return {
        ...state,
        statements: [...state.statements, statement].sort((a, b) => b.importedAt - a.importedAt),
        transactions: [...state.transactions, ...transactions].sort(newestFirst),
      }
    }

    case 'setFilters':
      return { ...state, filters: { ...state.filters, ...action.filters } }

    case 'setProfile':
      return { ...state, profile: { ...state.profile, ...action.profile } }

    case 'upsertCard': {
      const card = sanitizeCards([action.card])[0]
      if (!card) return state
      const cards = state.profile.cards ?? []
      const archivedCards = state.profile.archivedCards ?? []
      const archived = archivedCards.find((item) => item.id === card.id)
      const old = cards.find((item) => item.id === card.id)
      const previous = old ?? archived
      if (previous && previous.bank !== card.bank) return state
      const label = cardDisplayName(card)
      if (cards.some((item) => item.id !== card.id && cardDisplayName(item).toLocaleLowerCase('tr-TR') === label.toLocaleLowerCase('tr-TR'))) return state
      return {
        ...state,
        profile: {
          ...state.profile,
          cards: old ? cards.map((item) => item.id === card.id ? card : item) : [...cards, card],
          archivedCards: archivedCards.filter((item) => item.id !== card.id),
        },
        filters: previous && cardDisplayName(previous) !== label
          ? { ...state.filters, cards: state.filters.cards.map((selected) => selected === cardDisplayName(previous) ? label : selected) }
          : state.filters,
        transactions: state.transactions.map((tx) => tx.cardId === card.id ? { ...tx, accountLabel: label } : tx),
        statements: state.statements.map((statement) => statement.cardId === card.id ? {
          ...statement, accountLabel: label,
          label: statement.accountLabel ? statement.label.replace(statement.accountLabel, label) : statement.label,
        } : statement),
      }
    }

    case 'removeCard': {
      // Card configuration can be removed without erasing imported financial history.
      const removed = state.profile.cards?.find((card) => card.id === action.cardId)
      if (!removed) return state
      return { ...state, profile: {
        ...state.profile,
        cards: (state.profile.cards ?? []).filter((card) => card.id !== action.cardId),
        archivedCards: [...(state.profile.archivedCards ?? []).filter((card) => card.id !== action.cardId), removed],
      } }
    }

    case 'setSettings': {
      const settings = { ...state.settings, ...action.settings }

      // `filters.month` means something different in each mode (calendar
      // month vs statement-group month, see Filters.month). Switching modes
      // without clearing it left a stale selection from the old mode read as
      // if it were a valid value in the new one — the chip row would show
      // "Tüm dönemler" unselected while the figures underneath were still
      // scoped to whatever the old mode had picked.
      const filters =
        'periodGrouping' in action.settings && action.settings.periodGrouping !== state.settings.periodGrouping
          ? { ...state.filters, month: 'all' as const }
          : state.filters

      return { ...state, settings, filters }
    }

    case 'removeRule': {
      const rule = state.rules.find((r) => r.id === action.ruleId)
      if (!rule) return state
      return {
        ...state,
        rules: state.rules.filter((r) => r.id !== action.ruleId),
        // Unlock the affected rows; their category stays until re-imported.
        transactions: state.transactions.map((tx) =>
          tx.merchant === rule.merchant ? { ...tx, categoryLocked: false } : tx,
        ),
      }
    }

    case 'clearImportLog':
      return { ...state, lastImport: [] }

    case 'remote': {
      // What another device changed. `applyChange` hands back the very same array
      // when nothing in it was touched, so an unrelated update re-renders nothing.
      const next = applyChange(toSnapshot(state), action.change)
      const { prefs, profile } = action.change
      const settings = prefs
        ? {
            ...state.settings,
            theme: prefs.theme,
            periodGrouping: prefs.periodGrouping,
            reminders: prefs.reminders ?? defaultSettings.reminders,
            onboardingSeen: prefs.onboardingSeen ?? false,
          }
        : state.settings

      return {
        ...state,
        transactions:
          next.transactions === state.transactions ? state.transactions : [...next.transactions].sort(newestFirst),
        statements: next.statements,
        rules: next.rules,
        profile: profile ? { ...defaultProfile, ...next.profile, cards: sanitizeCards(profile.cards), archivedCards: sanitizeCards(profile.archivedCards) } : state.profile,
        settings,
        // The period filter names months of the old grouping.
        filters:
          settings.periodGrouping !== state.settings.periodGrouping
            ? { ...state.filters, month: 'all' }
            : state.filters,
      }
    }

    case 'clearData':
      // This device's financial data, ahead of loading an account's. Settings stay:
      // the lock, the intro flag and the OCR address belong to the device.
      return {
        ...state,
        transactions: [],
        statements: [],
        rules: [],
        profile: defaultProfile,
        filters: emptyFilters,
        lastImport: [],
      }

    case 'dismissNotices':
      return state.notices.length ? { ...state, notices: [] } : state

    case 'restore': {
      const result = applyBackup(state, action.backup, action.mode)
      return {
        ...state,
        transactions: result.transactions,
        statements: result.statements,
        rules: result.rules,
        profile: result.profile,
        settings: result.settings,
        // The period filter named months of the old data; after a replace it may
        // name nothing at all.
        filters: action.mode === 'replace' ? { ...state.filters, month: 'all' } : state.filters,
      }
    }

    case 'reset':
      return { ...initialState, settings: state.settings, hydrated: true }

    default:
      return state
  }
}
