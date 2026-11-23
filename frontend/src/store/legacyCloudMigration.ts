import { docIdOf, contentHash, emptyChange, isDefaultProfile, type Ledger, type RemoteDoc } from '../sync/model'
import type { MigrationResult } from './migrate'
import { initialState, toSnapshot, type AppState } from './state'

/** An unstamped device copy fills gaps. A known local edit can update its own unchanged cloud baseline. */
export function prepareLegacyState(migrated: MigrationResult, ledger: Ledger, docs: readonly RemoteDoc[]): {
  state: Partial<AppState>
  pendingDeletions: Ledger
} {
  const original = {
    ...initialState,
    ...migrated.state,
    settings: { ...initialState.settings, ...migrated.state.settings },
  }
  const snapshot = toSnapshot(original)
  const cloud = new Map(docs.map(row => [`${row.kind}/${row.id}`, row]))
  function keep(key: string, local: unknown): boolean {
    const remote = cloud.get(key)
    const entry = ledger[key]
    if (!remote) return !entry || !!entry.p || entry.h !== contentHash(local)
    if (!entry || remote.deleted || remote.legacy) return false
    return entry.p ? entry.u > remote.u : entry.u >= remote.u && entry.h !== contentHash(local)
  }

  const entities = emptyChange().upsert
  entities.transactions = snapshot.transactions.filter(row => keep(`transactions/${row.id}`, row))
  entities.statements = snapshot.statements.filter(row => keep(`statements/${row.id}`, row)).map(row => {
    const previous = cloud.get(`statements/${row.id}`)?.data as typeof row | undefined
    return previous ? { ...row, importedAt: previous.importedAt } : row
  })
  entities.rules = snapshot.rules.filter(row => keep(`rules/${docIdOf('rules', row)}`, row)).map(row => {
    const previous = cloud.get(`rules/${docIdOf('rules', row)}`)?.data as typeof row | undefined
    return previous ? { ...previous, category: row.category } : row
  })
  const profile = !isDefaultProfile(snapshot.profile) && keep('profile/profile', snapshot.profile)
    ? original.profile : initialState.profile
  const remotePrefs = cloud.get('prefs/prefs')
  const prefs = keep('prefs/prefs', { theme: snapshot.prefs.theme, periodGrouping: snapshot.prefs.periodGrouping })
    ? snapshot.prefs
    : remotePrefs?.deleted ? initialState.settings : {
        ...(remotePrefs?.data as typeof snapshot.prefs | undefined),
        ...((remotePrefs?.data as typeof snapshot.prefs | undefined)?.reminders === undefined
          ? { reminders: snapshot.prefs.reminders } : {}),
        ...((remotePrefs?.data as typeof snapshot.prefs | undefined)?.onboardingSeen === undefined
          ? { onboardingSeen: snapshot.prefs.onboardingSeen } : {}),
      }

  // Only outstanding local deletions based on an older cloud version can be replayed.
  const pendingDeletions = Object.fromEntries(Object.entries(ledger).filter(([key, entry]) => {
    const remote = cloud.get(key)
    return entry.d && entry.p && remote && !remote.deleted && entry.u > remote.u
  }))
  return {
    state: {
      ...entities,
      profile,
      settings: {
        ...initialState.settings,
        theme: prefs.theme ?? initialState.settings.theme,
        periodGrouping: prefs.periodGrouping ?? 'calendar',
        reminders: prefs.reminders ?? initialState.settings.reminders,
        onboardingSeen: prefs.onboardingSeen ?? false,
      },
      notices: migrated.notes,
    },
    pendingDeletions,
  }
}
