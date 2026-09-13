import { uid } from '../core/hash'
import type { CategoryId } from '../domain/categories'
import type {
  CategoryRule, Filters, ImportOutcome, Profile, Settings, Statement, Transaction,
} from '../domain/types'
import { emptyFilters } from '../domain/types'

export const STATE_VERSION = 2

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
  hydrated: boolean
}

export const defaultProfile: Profile = {
  monthlyIncome: 0,
  spendingLimit: 0,
  currentBalance: 0,
  budgets: [],
  goal: null,
}

export const defaultSettings: Settings = {
  theme: 'system',
  useLocalOcr: false,
  ocrEndpoint: 'http://127.0.0.1:8005/api/ocr',
  periodGrouping: null,
  lockPinHash: null,
  lockPinSalt: null,
  onboardingSeen: false,
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
  hydrated: false,
}

export type Action =
  | { type: 'hydrate'; payload: Partial<AppState> }
  | { type: 'import'; transactions: Transaction[]; statements: Statement[]; outcomes: ImportOutcome[] }
  | { type: 'setCategory'; transactionIds: string[]; category: CategoryId; learn: boolean }
  | { type: 'addManual'; transaction: Transaction }
  | { type: 'addManualBatch'; transactions: Transaction[] }
  | { type: 'deleteTransactions'; ids: string[] }
  | { type: 'removeStatement'; statementId: string }
  | { type: 'setFilters'; filters: Partial<Filters> }
  | { type: 'setProfile'; profile: Partial<Profile> }
  | { type: 'setSettings'; settings: Partial<Settings> }
  | { type: 'removeRule'; ruleId: string }
  | { type: 'clearImportLog' }
  | { type: 'reset' }

/**
 * Statement provenance is tracked with a field on the transaction rather than a
 * parallel array, so removing one statement is a single filter and can never
 * leave orphaned rows behind.
 */
export interface TransactionWithStatement extends Transaction {
  statementId: string
}

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
    case 'hydrate':
      return { ...state, ...action.payload, hydrated: true }

    case 'import': {
      const existing = new Set(state.transactions.map((t) => t.id))
      const added = action.transactions.filter((t) => !existing.has(t.id))
      const merged = [...state.transactions, ...added].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      )
      return {
        ...state,
        transactions: merged,
        statements: [...state.statements, ...action.statements],
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
        rules = state.rules.filter((r) => !merchants.includes(r.merchant))
        for (const merchant of merchants) {
          rules = [...rules, { id: uid('rule-'), merchant, category: action.category, createdAt: Date.now() }]
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
          (t) => (t as TransactionWithStatement).statementId !== action.statementId,
        ),
      }
    }

    case 'setFilters':
      return { ...state, filters: { ...state.filters, ...action.filters } }

    case 'setProfile':
      return { ...state, profile: { ...state.profile, ...action.profile } }

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

    case 'reset':
      return { ...initialState, settings: state.settings, hydrated: true }

    default:
      return state
  }
}
