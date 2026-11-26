import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Coins,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Gift,
  LayoutDashboard,
  Monitor,
  Moon,
  Search,
  Settings2,
  Store,
  Sun,
  Target,
  Upload,
  UserCheck,
  X,
} from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useSheets } from './sheets'
import type { ViewId } from './navigation'
import { hapticTap } from '../platform/haptics'
import { CategoryBadge } from '../ui/CategoryIcon'
import {
  buildSearchCorpus,
  runSmartSearch,
  SEARCH_GROUP_LABELS,
  SEARCH_GROUP_ORDER,
  type SearchDocument,
  type SearchGroup,
  type SearchResult,
} from '../domain/smartSearch'
import './header-search.css'

function ResultIcon({ doc, privateMode }: { doc: SearchDocument; privateMode: boolean }) {
  if (doc.categoryId && (doc.iconKey === 'category' || doc.iconKey === 'merchant')) {
    return <CategoryBadge category={doc.categoryId} size="sm" />
  }
  const iconMap = {
    expense: <ArrowUpRight size={15} />,
    income: <ArrowDownLeft size={15} />,
    import: <Upload size={15} />,
    overview: <LayoutDashboard size={15} />,
    transactions: <CalendarDays size={15} />,
    cards: <CreditCard size={15} />,
    plan: <CalendarClock size={15} />,
    analysis: <BarChart3 size={15} />,
    assets: <Coins size={15} />,
    spending: <Store size={15} />,
    settings: <Settings2 size={15} />,
    budget: <Target size={15} />,
    archive: <Archive size={15} />,
    rewards: <Gift size={15} />,
    account: <UserCheck size={15} />,
    privacy: privateMode ? <Eye size={15} /> : <EyeOff size={15} />,
    'theme-dark': <Moon size={15} />,
    'theme-light': <Sun size={15} />,
    'theme-system': <Monitor size={15} />,
    category: <Search size={15} />,
    card: <CreditCard size={15} />,
    statement: <FileText size={15} />,
    merchant: <Store size={15} />,
  } as const

  return (
    <span className="header-search__icon" aria-hidden="true">
      {iconMap[doc.iconKey]}
    </span>
  )
}

export function HeaderSearch({
  onNavigate,
  privateMode,
  onTogglePrivate,
}: {
  onNavigate: (view: ViewId) => void
  privateMode: boolean
  onTogglePrivate: () => void
}) {
  const { state, dispatch } = useStore()
  const sheets = useSheets()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const corpus = useMemo(
    () =>
      buildSearchCorpus({
        cards: state.profile.cards ?? [],
        statements: state.statements,
        transactions: state.transactions,
        privateMode,
        theme: state.settings.theme,
      }),
    [state.profile.cards, state.statements, state.transactions, privateMode, state.settings.theme],
  )

  const results = useMemo(() => runSmartSearch(corpus, query, 12), [corpus, query])

  const grouped = useMemo(() => {
    const byGroup = new Map<SearchGroup, SearchResult[]>()
    for (const hit of results) {
      const list = byGroup.get(hit.doc.group) ?? []
      list.push(hit)
      byGroup.set(hit.doc.group, list)
    }
    return SEARCH_GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => ({
      group,
      label: query.trim() ? SEARCH_GROUP_LABELS[group] : 'Hızlı erişim',
      items: byGroup.get(group)!,
    }))
  }, [results, query])

  const flatResults = useMemo(() => grouped.flatMap((g) => g.items), [grouped])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open])

  function execute(doc: SearchDocument) {
    hapticTap()
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()

    const action = doc.action
    switch (action.kind) {
      case 'navigate':
        onNavigate(action.view)
        break
      case 'open-entry':
        if (action.entryKind === 'income') sheets.openIncomeEntry()
        else sheets.openEntry()
        break
      case 'open-import':
        sheets.openImport()
        break
      case 'open-budgets':
        sheets.openBudgets()
        break
      case 'open-income':
        sheets.openIncome()
        break
      case 'open-archive':
        sheets.openArchive()
        break
      case 'open-rewards':
        sheets.openRewards()
        break
      case 'open-account':
        sheets.openAccount()
        break
      case 'open-settings':
        sheets.openSettings()
        break
      case 'toggle-privacy':
        onTogglePrivate()
        break
      case 'set-theme':
        dispatch({ type: 'setSettings', settings: { theme: action.theme } })
        break
      case 'open-category':
        sheets.openTransactions({ category: action.categoryId, overall: true })
        break
      case 'open-card':
        sheets.openCardDetail(action.cardId)
        break
      case 'open-statement':
        sheets.openStatement(action.statementId)
        break
      case 'open-merchant':
        sheets.openTransactions({
          merchant: action.merchant,
          title: action.title,
          overall: true,
        })
        break
    }
  }

  const activeOptionId =
    open && flatResults[activeIndex] ? `${listboxId}-opt-${flatResults[activeIndex].doc.id}` : undefined

  return (
    <div className="header-search" ref={rootRef}>
      <div className={`header-search__field${open ? ' is-open' : ''}`}>
        <Search size={15} className="header-search__lens" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-label="Uygulamada akıllı arama"
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder="Ara: market, benzin, ekstre, altın…"
          className="header-search__input"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            if (!open) setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              if (!open) setOpen(true)
              else if (flatResults.length > 0) {
                setActiveIndex((idx) => (idx + 1) % flatResults.length)
              }
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              if (flatResults.length > 0) {
                setActiveIndex((idx) => (idx - 1 + flatResults.length) % flatResults.length)
              }
            } else if (event.key === 'Enter' && open && flatResults[activeIndex]) {
              event.preventDefault()
              execute(flatResults[activeIndex].doc)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              if (query) {
                setQuery('')
              } else {
                setOpen(false)
                inputRef.current?.blur()
              }
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="header-search__clear"
            aria-label="Aramayı temizle"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {open && (
        <div id={listboxId} role="listbox" aria-label="Arama sonuçları" className="header-search__dropdown">
          {flatResults.length === 0 ? (
            <div className="header-search__empty">
              <p className="header-search__empty-title">
                &ldquo;{query}&rdquo; için eşleşme bulunamadı
              </p>
              <p className="header-search__empty-hint">
                Kategori, ekran, kart adı veya &ldquo;benzin&rdquo;, &ldquo;kahve&rdquo;, &ldquo;altın&rdquo;, &ldquo;ekstre&rdquo; gibi bir ifade dene.
              </p>
            </div>
          ) : (
            <div className="header-search__groups">
              {grouped.map((section, sectionIdx) => {
                const showGroupHeader = query.trim().length > 0 || sectionIdx === 0
                return (
                  <div key={section.group} className="header-search__group">
                    {showGroupHeader && (
                      <div className="header-search__group-label">{section.label}</div>
                    )}
                    {section.items.map((hit) => {
                      const flatIdx = flatResults.indexOf(hit)
                      const isActive = flatIdx === activeIndex
                      return (
                        <button
                          key={hit.doc.id}
                          id={`${listboxId}-opt-${hit.doc.id}`}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`header-search__item${isActive ? ' is-active' : ''}`}
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          onMouseDown={(event) => {
                            // Keep focus stable on desktop click before executing
                            event.preventDefault()
                          }}
                          onClick={() => execute(hit.doc)}
                        >
                          <ResultIcon doc={hit.doc} privateMode={privateMode} />
                          <span className="header-search__copy">
                            <span className="header-search__title">{hit.doc.title}</span>
                            {hit.doc.subtitle && (
                              <span className="header-search__subtitle">{hit.doc.subtitle}</span>
                            )}
                          </span>
                          {hit.doc.badge && (
                            <span className="header-search__badge">{hit.doc.badge}</span>
                          )}
                          <ChevronRight size={14} className="header-search__arrow" aria-hidden="true" />
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
