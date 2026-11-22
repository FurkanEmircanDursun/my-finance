import { useMemo } from 'react'
import { useExplore } from '../app/ExploreContext'
import { useStore } from '../store/AppStore'
import { applyFilters } from '../store/selectors'
import { effectiveDate, spendAmount } from '../domain/types'
import { demoTransactions } from '../domain/demo'
import { nextCardDate } from '../domain/cards'
import { statementMonth } from '../domain/cardLifecycle'
import { defaultProfile } from '../store/defaults'
import { analyze } from '../analytics/engine'
import { buildLedgers } from '../analytics/ledger'
import { monthLabel, monthOf, todayKey } from '../core/date'

/** The monthly presentation model keeps sample records outside the store. */
export function useOverviewModel() {
  const { state, analysis } = useStore()
  const { exploring: demo, setExploring: setDemo } = useExplore()
  const demoMonth = monthOf(todayKey())
  const sampleRows = useMemo(() => demoTransactions(demoMonth), [demoMonth])
  const demoProfile = useMemo(() => ({ ...defaultProfile, spendingLimit: 3000000 }), [])
  const demoAnalysis = useMemo(() => analyze(sampleRows, demoProfile), [sampleRows, demoProfile])
  const realRows = useMemo(() => applyFilters(
    state.transactions, { ...state.filters, includeNonSpend: true },
    { periodGrouping: state.settings.periodGrouping, statements: state.statements },
  ), [state.transactions, state.filters, state.settings.periodGrouping, state.statements])
  const rows = demo ? sampleRows : realRows
  const current = demo ? demoAnalysis : analysis
  const profile = demo ? demoProfile : state.profile
  const spend = rows.reduce((sum, tx) => sum + spendAmount(tx), 0)
  const income = rows.filter(tx => tx.kind === 'income').reduce((sum, tx) => sum + tx.amount, 0)
  const scopedBudget = demo || (state.filters.month !== 'all' && !state.filters.cards.length && !state.filters.categories.length && !state.filters.query)
  const limit = scopedBudget ? profile.spendingLimit : 0
  const used = limit ? Math.max(0, (spend / limit) * 100) : 0
  const period = demo ? monthLabel(demoMonth) : state.filters.month === 'all' ? 'Tüm dönemler' : monthLabel(state.filters.month)
  const recent = useMemo(() => [...rows].filter(tx => tx.kind !== 'payment')
    .sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a))).slice(0, 4), [rows])
  const unknown = rows.filter(tx => tx.kind === 'expense' && tx.category === 'other')
  const statementLedgers = useMemo(() => buildLedgers(state.statements.filter(statement =>
    state.filters.month === 'all' || statementMonth(statement) === state.filters.month,
  ), state.transactions), [state.statements, state.transactions, state.filters.month])
  const upcoming = (state.profile.cards ?? [])
    .map(card => ({ card, date: nextCardDate(card.statementDay) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 2)
  const methods = [
    { label: 'Kart ve içe aktarılan', value: rows.filter(tx => tx.source !== 'manual').reduce((sum, tx) => sum + spendAmount(tx), 0) },
    { label: 'Kira ve aidat', value: rows.filter(tx => tx.source === 'manual' && tx.category === 'rent').reduce((sum, tx) => sum + spendAmount(tx), 0) },
    { label: 'Diğer kart dışı giderler', value: rows.filter(tx => tx.source === 'manual' && tx.category !== 'rent').reduce((sum, tx) => sum + spendAmount(tx), 0) },
  ]
  return { state, demo, setDemo, sampleRows, rows, current, profile, spend, income, scopedBudget, limit, used, period, recent, unknown, statementLedgers, upcoming, methods }
}
