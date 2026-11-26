import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownLeft,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  List,
  Plus,
  Repeat,
  Search,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Empty, TextInput } from '../ui/primitives'
import { CategoryIcon } from '../ui/CategoryIcon'
import { HorizontalScrollStrip } from '../ui/HorizontalScrollStrip'
import { Modal } from '../ui/Modal'
import { MoneyValue } from '../ui/MoneyValue'
import { count, money2, moneyCompact } from '../core/money'
import {
  WEEKDAY_SHORT,
  addMonths,
  daysInMonth,
  fullDayLabel,
  makeDayKey,
  monthIndexOf,
  monthLabel,
  monthOf,
  todayKey,
  weekdayIndex,
  yearOf,
  type DayKey,
  type MonthKey,
} from '../core/date'
import { fold } from '../core/text'
import { EntrySheet } from '../app/EntrySheet'
import { CATEGORIES, SORTED_CATEGORIES, categoryColor, sortCategoriesTr, type CategoryId } from '../domain/categories'
import { cardDisplayName } from '../domain/cards'
import { effectiveDate, spendAmount, type Transaction } from '../domain/types'
import { useStore } from '../store/AppStore'
import { applyFilters } from '../store/selectors'
import { useSheets } from '../app/sheets'
import { TransactionItem } from '../ui/TransactionItem'
import { useTransactionDelete } from '../ui/useTransactionDelete'
import { hapticTap } from '../platform/haptics'
import './transactions-filter.css'

const PAGE_SIZE = 30

export function TransactionsSheet({
  open,
  onClose,
  title,
  transactions,
}: {
  open: boolean
  onClose: () => void
  title: string
  transactions: Transaction[]
}) {
  const [adding, setAdding] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={title} variant="sheet">
      <TransactionList transactions={transactions} onAdd={() => setAdding(true)} />
      <ManualTransactionModal open={adding} onClose={() => setAdding(false)} />
    </Modal>
  )
}

export function TransactionsView() {
  const { state } = useStore()
  const { openIncome, openIncomeEntry, openEntry } = useSheets()
  const [mode, setMode] = useState<'list' | 'calendar'>('list')

  const transactions = useMemo(
    () =>
      applyFilters(
        state.transactions,
        { ...state.filters, includeNonSpend: true },
        { periodGrouping: state.settings.periodGrouping, statements: state.statements },
      ),
    [state.transactions, state.filters, state.settings.periodGrouping, state.statements],
  )

  return (
    <div className="transactions-page space-y-5">
      <header className="dashboard-title">
        <div>
          <h1>İşlemler & Finansal Takvim</h1>
          <p>Harcama yoğunluğu takvimi, maaş/kesim/son ödeme günleri ve akıllı kategori filtreleri</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="tx-mode-switch" role="tablist" aria-label="Görünüm modu">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'list'}
              className={mode === 'list' ? 'is-active' : ''}
              onClick={() => {
                hapticTap()
                setMode('list')
              }}
            >
              <List size={15} /> Liste
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'calendar'}
              className={mode === 'calendar' ? 'is-active' : ''}
              onClick={() => {
                hapticTap()
                setMode('calendar')
              }}
            >
              <CalendarDays size={15} /> Finansal Takvim
            </button>
          </div>
          <button type="button" className="quiet-button" onClick={openIncome}>
            <ArrowDownLeft size={16} /> Gelirlerim
          </button>
        </div>
      </header>

      {mode === 'calendar' ? (
        <FinancialCalendarView onAddEntry={openEntry} onAddIncome={openIncomeEntry} />
      ) : (
        <TransactionList
          transactions={transactions}
          onAdd={openEntry}
          onIncome={openIncomeEntry}
        />
      )}
    </div>
  )
}

/* ── Akbank & Copilot Style Financial Calendar Heatmap ───────────────────── */

interface CalendarDayEvent {
  type: 'cutoff' | 'due' | 'recurring' | 'income'
  label: string
  amount?: number
}

function FinancialCalendarView({
  onAddEntry,
  onAddIncome,
}: {
  onAddEntry: () => void
  onAddIncome: () => void
}) {
  const { state, overall } = useStore()
  const today = todayKey()
  const initialMonth: MonthKey =
    state.filters.month === 'all' ? monthOf(today) : state.filters.month
  const [calMonth, setCalMonth] = useState<MonthKey>(initialMonth)
  const [selectedDay, setSelectedDay] = useState<DayKey>(() =>
    initialMonth === monthOf(today) ? today : `${initialMonth}-01`,
  )
  const [expandedTx, setExpandedTx] = useState<string | null>(null)

  useEffect(() => {
    if (state.filters.month !== 'all') {
      setCalMonth(state.filters.month)
      setSelectedDay(
        state.filters.month === monthOf(today) ? today : `${state.filters.month}-01`,
      )
    }
  }, [state.filters.month, today])

  const changeMonth = (delta: number) => {
    hapticTap()
    const next = addMonths(calMonth, delta)
    setCalMonth(next)
    setSelectedDay(next === monthOf(today) ? today : `${next}-01`)
  }

  const totalDays = daysInMonth(calMonth)
  const firstDayKey = `${calMonth}-01`
  const leadingBlanks = weekdayIndex(firstDayKey) // 0=Mon..6=Sun

  // Transactions in this calendar month
  const monthTxs = useMemo(
    () =>
      state.transactions.filter((tx) => {
        const eff = effectiveDate(tx)
        return eff.slice(0, 7) === calMonth
      }),
    [state.transactions, calMonth],
  )

  const byDay = useMemo(() => {
    const map = new Map<
      DayKey,
      {
        txs: Transaction[]
        spend: number
        income: number
        events: CalendarDayEvent[]
      }
    >()

    const yr = yearOf(calMonth)
    const mo1 = monthIndexOf(calMonth) + 1
    for (let d = 1; d <= totalDays; d++) {
      const key = makeDayKey(yr, mo1, d)
      map.set(key, { txs: [], spend: 0, income: 0, events: [] })
    }

    for (const tx of monthTxs) {
      const key = effectiveDate(tx)
      const cell = map.get(key)
      if (!cell) continue
      cell.txs.push(tx)
      if (tx.kind === 'income') {
        cell.income += tx.amount
        cell.events.push({ type: 'income', label: tx.description, amount: tx.amount })
      } else if (tx.kind !== 'payment') {
        cell.spend += spendAmount(tx)
      }
    }

    // Card statement cutoffs in this month
    for (const card of state.profile.cards ?? []) {
      const cutoffDay = Math.min(totalDays, Math.max(1, card.statementDay))
      const key = makeDayKey(yr, mo1, cutoffDay)
      map.get(key)?.events.push({
        type: 'cutoff',
        label: `${cardDisplayName(card)} ekstre kesimi`,
      })
    }

    // Statement due dates in this month
    for (const st of state.statements) {
      if (st.dueDate && st.dueDate.slice(0, 7) === calMonth) {
        map.get(st.dueDate)?.events.push({
          type: 'due',
          label: `${st.accountLabel ?? st.bank} son ödeme`,
          amount: st.summary?.totalDebt ?? st.reconciliation?.printedDebt ?? undefined,
        })
      }
    }

    // Expected active recurring payments in this month
    for (const rec of overall.recurring) {
      if (rec.status === 'active' && rec.nextExpected.slice(0, 7) === calMonth) {
        map.get(rec.nextExpected)?.events.push({
          type: 'recurring',
          label: `${rec.label} (beklenen abonelik)`,
          amount: rec.lastAmount,
        })
      }
    }

    return map
  }, [calMonth, totalDays, monthTxs, state.profile.cards, state.statements, overall.recurring])

  const { monthSpend, monthIncome, activeDaysCount, peakSpend, milestoneCount } = useMemo(() => {
    let s = 0
    let inc = 0
    let active = 0
    let peak = 0
    let milestones = 0
    for (const cell of byDay.values()) {
      s += cell.spend
      inc += cell.income
      if (cell.txs.length > 0) active++
      if (cell.spend > peak) peak = cell.spend
      milestones += cell.events.filter((e) => e.type !== 'income').length
    }
    return {
      monthSpend: s,
      monthIncome: inc,
      activeDaysCount: active,
      peakSpend: peak,
      milestoneCount: milestones,
    }
  }, [byDay])

  const selectedCell = byDay.get(selectedDay)

  return (
    <div className="space-y-4">
      {/* Month Navigator & Summary KPIs */}
      <section className="bento-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="toolbar-icon"
              onClick={() => changeMonth(-1)}
              aria-label="Önceki ay"
            >
              <ChevronLeft size={17} />
            </button>
            <h2 className="min-w-[140px] text-center text-title font-bold text-ink">
              {monthLabel(calMonth)}
            </h2>
            <button
              type="button"
              className="toolbar-icon"
              onClick={() => changeMonth(1)}
              aria-label="Sonraki ay"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-positive" /> Gelir / Maaş
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-warning" /> Ekstre Kesim
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-negative" /> Son Ödeme
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-[#38BDF8]" /> Abonelik
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-[var(--radius)] border border-line bg-sunken p-3.5">
            <span className="text-micro font-semibold uppercase text-faint">Takvim Harcaması</span>
            <strong className="num mt-1 block text-body font-bold text-ink">
              <MoneyValue value={monthSpend} />
            </strong>
          </div>
          <div className="rounded-[var(--radius)] border border-line bg-sunken p-3.5">
            <span className="text-micro font-semibold uppercase text-faint">Kaydedilen Gelir</span>
            <strong className="num mt-1 block text-body font-bold text-positive">
              {monthIncome > 0 ? <MoneyValue value={monthIncome} /> : '—'}
            </strong>
          </div>
          <div className="rounded-[var(--radius)] border border-line bg-sunken p-3.5">
            <span className="text-micro font-semibold uppercase text-faint">Harcamalı Gün</span>
            <strong className="num mt-1 block text-body font-bold text-ink">
              {activeDaysCount} / {totalDays} gün
            </strong>
          </div>
          <div className="rounded-[var(--radius)] border border-line bg-sunken p-3.5">
            <span className="text-micro font-semibold uppercase text-faint">Kesim & Ödeme Günü</span>
            <strong className="num mt-1 block text-body font-bold text-warning">
              {milestoneCount} önemli tarih
            </strong>
          </div>
        </div>

        {/* 7-column Weekday Header */}
        <div className="mizan-cal-weekdays mt-5" aria-hidden="true">
          {WEEKDAY_SHORT.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>

        {/* 7-column Calendar Day Grid */}
        <div className="mizan-cal-grid" role="grid" aria-label={`${monthLabel(calMonth)} finansal takvim`}>
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <span key={`blank-${i}`} className="mizan-cal-blank" aria-hidden="true" />
          ))}

          {Array.from({ length: totalDays }).map((_, i) => {
            const dayNum = i + 1
            const key = makeDayKey(yearOf(calMonth), monthIndexOf(calMonth) + 1, dayNum)
            const cell = byDay.get(key)
            const spend = cell?.spend ?? 0
            const income = cell?.income ?? 0
            const events = cell?.events ?? []
            const isToday = key === today
            const isSelected = key === selectedDay

            const ratio = peakSpend > 0 && spend > 0 ? spend / peakSpend : 0
            const heat =
              spend <= 0 ? 0 : ratio > 0.7 ? 4 : ratio > 0.4 ? 3 : ratio > 0.15 ? 2 : 1

            const hasCutoff = events.some((e) => e.type === 'cutoff')
            const hasDue = events.some((e) => e.type === 'due')
            const hasRecurring = events.some((e) => e.type === 'recurring')

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  hapticTap()
                  setSelectedDay(key)
                }}
                aria-pressed={isSelected}
                aria-label={`${fullDayLabel(key)}, harcama ${money2(spend)}${hasDue ? ', son ödeme günü' : ''}${hasCutoff ? ', ekstre kesim günü' : ''}`}
                className={clsx(
                  'mizan-cal-day',
                  heat > 0 && `mizan-cal-day--heat-${heat}`,
                  isToday && 'is-today',
                  isSelected && 'is-selected',
                )}
              >
                <div className="mizan-cal-day__top">
                  <span className="mizan-cal-day__num num">{dayNum}</span>
                  <span className="mizan-cal-day__dots">
                    {income > 0 && <i className="bg-positive" title="Gelir" />}
                    {hasCutoff && <i className="bg-warning" title="Kart ekstre kesimi" />}
                    {hasDue && <i className="bg-negative" title="Son ödeme tarihi" />}
                    {hasRecurring && <i className="bg-[#38BDF8]" title="Beklenen abonelik" />}
                  </span>
                </div>

                <div className="mizan-cal-day__amount num">
                  {spend > 0 ? (
                    <span>{moneyCompact(spend)}</span>
                  ) : income > 0 ? (
                    <span className="text-positive">+{moneyCompact(income)}</span>
                  ) : hasDue && hasCutoff ? (
                    <span className="text-negative">Kesim · Ödeme</span>
                  ) : hasDue ? (
                    <span className="text-negative">Son Ödeme</span>
                  ) : hasCutoff ? (
                    <span className="text-warning">Kesim</span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Selected Day Detail Drawer */}
      <section className="bento-card" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3.5">
          <div>
            <span className="text-micro font-semibold uppercase text-faint">Seçili Gün Detayı</span>
            <h3 className="mt-0.5 text-title font-bold text-ink">{fullDayLabel(selectedDay)}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={onAddEntry}>
              <Plus size={15} /> Gider ekle
            </Button>
            <Button size="sm" onClick={onAddIncome}>
              <ArrowDownLeft size={15} /> Gelir ekle
            </Button>
          </div>
        </div>

        {selectedCell && selectedCell.events.filter((e) => e.type !== 'income').length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {selectedCell.events
              .filter((e) => e.type !== 'income')
              .map((ev, idx) => (
                <div
                  key={`${ev.label}-${idx}`}
                  className={clsx(
                    'flex items-center justify-between gap-3 rounded-[var(--radius)] border px-3.5 py-2.5 text-label',
                    ev.type === 'due'
                      ? 'border-negative/30 bg-negative-soft/45'
                      : 'border-line bg-sunken',
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    {ev.type === 'recurring' ? (
                      <Repeat size={15} className="text-[#38BDF8]" />
                    ) : ev.type === 'due' ? (
                      <CalendarClock size={15} className="text-negative" />
                    ) : (
                      <CreditCard size={15} className="text-warning" />
                    )}
                    {ev.label}
                  </span>
                  {ev.amount !== undefined && (
                    <strong className="num text-ink">{money2(ev.amount)}</strong>
                  )}
                </div>
              ))}
          </div>
        )}

        {selectedCell && selectedCell.txs.length > 0 ? (
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between text-label text-muted">
              <span>{count(selectedCell.txs.length)} kayıt</span>
              <span className="num font-semibold text-ink">
                Günlük net harcama: {money2(selectedCell.spend)}
              </span>
            </div>
            <ul className="divide-y divide-line">
              {selectedCell.txs.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  open={expandedTx === tx.id}
                  onToggle={() => {
                    hapticTap()
                    setExpandedTx((prev) => (prev === tx.id ? null : tx.id))
                  }}
                  onDone={() => setExpandedTx(null)}
                />
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-label text-muted">
            Bu güne ait harcama veya gelir kaydı bulunmuyor.
          </p>
        )}
      </section>
    </div>
  )
}

/* ── Smart Filterable & Scrollable Transaction List ──────────────────────── */

type KindFilter = 'all' | 'expense' | 'income' | 'refund' | 'installment'

function TransactionList({
  transactions,
  onAdd,
  onIncome,
}: {
  transactions: Transaction[]
  onAdd?: () => void
  onIncome?: () => void
}) {
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | 'all'>('all')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [expanded, setExpanded] = useState<string | null>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLimit(PAGE_SIZE)
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0
  }, [query, kindFilter, categoryFilter, transactions])

  const presentCategories = useMemo(() => {
    const totals = new Map<CategoryId, number>()
    for (const tx of transactions) {
      if (tx.kind === 'expense') {
        totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.amount)
      }
    }
    return sortCategoriesTr(CATEGORIES.filter((c) => (totals.get(c.id) ?? 0) > 0))
  }, [transactions])

  const rows = useMemo(() => {
    const folded = query.trim() ? fold(query.trim()) : ''
    const list = transactions.filter((tx) => {
      if (kindFilter === 'installment') {
        if (!tx.installment) return false
      } else if (kindFilter !== 'all' && tx.kind !== kindFilter) {
        return false
      }
      if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false
      if (!folded) return true
      return fold(tx.description).includes(folded) || tx.merchant.includes(folded)
    })
    return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [transactions, query, kindFilter, categoryFilter])

  const total = rows.reduce((sum, tx) => sum + spendAmount(tx), 0)
  const visibleCount = Math.min(limit, rows.length)

  const handleListScroll = () => {
    const el = listScrollRef.current
    if (!el || limit >= rows.length) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
      setLimit((prev) => Math.min(rows.length, prev + PAGE_SIZE))
    }
  }

  return (
    <div className="transaction-list">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <TextInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="İşyeri veya açıklama ara"
            aria-label="İşlem ara"
            className="pl-10"
          />
        </div>
        {(onAdd || onIncome) && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {onAdd && (
              <Button variant="primary" onClick={onAdd} className="flex-1 shrink-0 sm:flex-none">
                <Plus size={16} /> Gider ekle
              </Button>
            )}
            {onIncome && (
              <Button onClick={onIncome} className="flex-1 shrink-0 sm:flex-none">
                <ArrowDownLeft size={16} /> Gelir ekle
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="tx-kind-bar">
        <div className="tx-kind-tabs" role="tablist" aria-label="İşlem türü filtresi">
          {(
            [
              ['all', 'Tümü'],
              ['expense', 'Gider'],
              ['income', 'Gelir'],
              ['refund', 'İade'],
              ['installment', 'Taksitli'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kindFilter === value}
              className={clsx('tx-kind-tab', kindFilter === value && 'is-active')}
              onClick={() => {
                hapticTap()
                setKindFilter(value)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="transaction-result pb-2 sm:pb-0" aria-live="polite" style={{ paddingBlock: 0 }}>
          {count(rows.length)} işlem · Net harcama{' '}
          <strong className="text-ink">
            <MoneyValue value={total} duration={320} />
          </strong>
        </p>
      </div>

      {presentCategories.length > 1 && (
        <HorizontalScrollStrip
          className="tx-cat-strip-wrap"
          scrollerClassName="tx-cat-strip"
          role="group"
          ariaLabel="Kategori filtresi"
        >
          <button
            type="button"
            aria-pressed={categoryFilter === 'all'}
            className={clsx('tx-cat-pill', categoryFilter === 'all' && 'is-active')}
            onClick={() => {
              hapticTap()
              setCategoryFilter('all')
            }}
          >
            Tüm kategoriler
          </button>
          {presentCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              aria-pressed={categoryFilter === cat.id}
              className={clsx('tx-cat-pill', categoryFilter === cat.id && 'is-active')}
              onClick={() => {
                hapticTap()
                setCategoryFilter((prev) => (prev === cat.id ? 'all' : cat.id))
              }}
            >
              <span className="tx-cat-pill__icon" style={{ color: cat.color }}>
                <CategoryIcon category={cat.id} size={14} />
              </span>
              {cat.label}
            </button>
          ))}
        </HorizontalScrollStrip>
      )}

      {rows.length === 0 ? (
        <Empty
          compact
          title="İşlem bulunamadı"
          description={
            query || kindFilter !== 'all' || categoryFilter !== 'all'
              ? 'Filtreleri temizleyip başka bir sözcükle ara.'
              : 'Başka bir ay seçebilir veya işlem ekleyebilirsin.'
          }
          action={
            query || kindFilter !== 'all' || categoryFilter !== 'all' ? (
              <Button
                size="sm"
                onClick={() => {
                  hapticTap()
                  setQuery('')
                  setKindFilter('all')
                  setCategoryFilter('all')
                }}
              >
                Filtreleri temizle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div
            ref={listScrollRef}
            className="transaction-list-scroll"
            onScroll={handleListScroll}
            tabIndex={0}
            aria-label="İşlem listesi"
          >
            <ul className="transaction-list-rows">
              {rows.slice(0, limit).map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  open={expanded === tx.id}
                  onToggle={() => {
                    hapticTap()
                    setExpanded((prev) => (prev === tx.id ? null : tx.id))
                  }}
                  onDone={() => setExpanded(null)}
                />
              ))}
            </ul>
          </div>

          {rows.length > PAGE_SIZE && (
            <div className="transaction-list-footer">
              <span className="num">
                {count(visibleCount)} / {count(rows.length)} işlem görüntüleniyor · kaydırarak devam et
              </span>
              {limit < rows.length && (
                <Button size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                  +{count(Math.min(PAGE_SIZE, rows.length - limit))} işlem daha
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TransactionRow({
  tx,
  open,
  onToggle,
  onDone,
}: {
  tx: Transaction
  open: boolean
  onToggle: () => void
  onDone: () => void
}) {
  const { dispatch, ensureHistory, historyReady, syncNow } = useStore()
  const [onlyThis, setOnlyThis] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const remove = useTransactionDelete()

  const assign = async (category: CategoryId) => {
    setError(false)
    setSaving(true)
    try {
      if (!onlyThis && !historyReady) {
        syncNow()
        await ensureHistory()
      }
      hapticTap()
      dispatch({ type: 'setCategory', transactionIds: [tx.id], category, learn: !onlyThis })
      onDone()
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="border-b border-line last:border-b-0">
      <TransactionItem
        transaction={tx}
        onOpen={onToggle}
        expanded={open}
        onDelete={() => {
          remove(tx)
          onDone()
        }}
      />

      {open && (
        <div className="rise-in mb-3 rounded-[var(--radius)] border border-line bg-sunken p-3.5">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {SORTED_CATEGORIES.map((def) => (
              <button
                key={def.id}
                type="button"
                disabled={saving}
                onClick={() => void assign(def.id)}
                className={clsx(
                  'flex min-h-[44px] items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 text-left text-label font-medium transition-all duration-150 sm:px-3',
                  def.id === tx.category
                    ? 'border-accent-border bg-accent-soft text-accent-text'
                    : 'border-line bg-raised text-ink hover:border-line-strong hover:bg-hover',
                )}
              >
                <span className="shrink-0" style={{ color: def.color }}>
                  <CategoryIcon category={def.id} size={14} />
                </span>
                <span className="truncate">{def.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-label font-medium text-muted">
              <input
                type="checkbox"
                disabled={saving}
                checked={onlyThis}
                onChange={(e) => setOnlyThis(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Sadece bu işlem
            </label>
          </div>

          {!onlyThis && (
            <p className="mt-2 text-label text-faint">
              <Badge dot={categoryColor(tx.category)}>{tx.merchant}</Badge> işyerinin tüm işlemleri
              güncellenir.
            </p>
          )}
          {saving && (
            <p role="status" className="mt-2 text-label text-muted">
              İşlemler kontrol ediliyor…
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-label text-negative">
              İşlem geçmişi yüklenemedi. Bağlantını kontrol edip tekrar dene.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

function ManualTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <EntrySheet onClose={onClose} /> : null
}
