import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Store,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Area, Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'
import { useNow } from '../app/useNow'
import type { ViewId } from '../app/navigation'
import { buildLongitudinalAnalysis, compareMonthlySpending, dailyNetSpending, type LongitudinalAnalysis, type LongitudinalMonth, type MonthCoverage } from '../analytics/longitudinal'
import { addMonths, daysInMonth, eachMonth, fullDayLabel, monthLabel } from '../core/date'
import { count, money, money2, moneyCompact } from '../core/money'
import { entryAmount } from '../domain/entry'
import { assetValuationDay, createManualAssetValuation, upsertAssetValuation } from '../domain/assetsHistory'
import { CATEGORIES, categoryColor, categoryLabel, sortCategoriesTr, type CategoryId } from '../domain/categories'
import type { Transaction } from '../domain/types'
import { useAssetValuationCapture } from '../hooks/useAssetValuationCapture'
import { cachedAssetRates, isQuoteAvailable, refreshAssetRates, type RateSnapshot } from '../platform/rates'
import { hapticTap } from '../platform/haptics'
import { Badge, Button, Empty, Field, Segmented, TextInput } from '../ui/primitives'
import { Select } from '../ui/Select'
import { CategoryIcon } from '../ui/CategoryIcon'
import { HorizontalScrollStrip } from '../ui/HorizontalScrollStrip'
import { Modal } from '../ui/Modal'
import { useFeedback } from '../ui/Feedback'
import { ChartTooltipShell, InteractiveDonutChart } from '../ui/charts'
import { MoneyValue } from '../ui/MoneyValue'
import { AnimatedProgress, Stagger } from '../ui/motion'
import { AssetsView } from './AssetsView'
import './analysis.css'

const axis = { axisLine: false, tickLine: false, tick: { fill: 'var(--text-faint)', fontSize: 11 } } as const
const coverageLabels: Record<MonthCoverage, string> = {
  complete: 'Ekstre günleri kapsanıyor',
  current: 'Ay sürüyor',
  partial: 'Kısmi ekstre kapsamı',
  unverified: 'Kapsam bilinmiyor',
  missing: 'Kayıt yok',
}
const percentNumber = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })
const pct = (value: number | null) =>
  value === null || !Number.isFinite(value)
    ? '—'
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}%${percentNumber.format(Math.abs(value))}`
const amount = (value: number | null) => (value === null ? '—' : money2(value))
const shortMonth = (value: string) => monthLabel(value, true)
const weekdayShort = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

export function AnalysisView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { state, overall } = useStore()
  const { openImport, openEntry, openTransactions } = useSheets()
  const now = useNow(60_000)
  const asOf = assetValuationDay(now)
  const thisMonth = asOf.slice(0, 7)
  const [subTab, setSubTab] = useState<'trends' | 'portfolio' | 'merchants'>('trends')
  const [windowRange, setWindowRange] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [category, setCategory] = useState<CategoryId | 'all'>('all')
  const [rates, setRates] = useState<RateSnapshot | null>(() => cachedAssetRates())
  const [rateBusy, setRateBusy] = useState(false)
  const [rateError, setRateError] = useState('')
  const [historyEditor, setHistoryEditor] = useState(false)
  const gradSpendId = useId().replace(/:/g, '')
  const gradIncomeId = useId().replace(/:/g, '')
  const gradCatId = useId().replace(/:/g, '')
  const hasHoldings = Boolean(state.profile.assets?.length)

  useEffect(() => {
    if (!hasHoldings) return
    let active = true
    setRateBusy(true)
    void refreshAssetRates()
      .then((result) => {
        if (active) {
          setRates(result)
          setRateError('')
        }
      })
      .catch(() => {
        if (active) setRateError('Kurlar alınamadı. Yeniden deneyebilirsin.')
      })
      .finally(() => {
        if (active) setRateBusy(false)
      })
    return () => {
      active = false
    }
  }, [hasHoldings])

  const quotes = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(rates?.quotes ?? {}).filter(([, quote]) => quote && isQuoteAvailable(quote, now)),
      ),
    [rates, now],
  )
  useAssetValuationCapture(quotes)

  const result = useMemo(() => {
    try {
      const fromMonth =
        windowRange === 'custom' && customFrom
          ? customFrom
          : windowRange === '3m'
            ? addMonths(thisMonth, -2)
            : windowRange === '6m'
              ? addMonths(thisMonth, -5)
              : windowRange === '12m'
                ? addMonths(thisMonth, -11)
                : /^\d{4}$/.test(windowRange)
                  ? windowRange + '-01'
                  : undefined
      const toMonth =
        windowRange === 'custom' && customTo
          ? customTo
          : /^\d{4}$/.test(windowRange)
            ? windowRange + '-12'
            : windowRange === 'all'
              ? undefined
              : thisMonth
      return {
        report: buildLongitudinalAnalysis({
          transactions: state.transactions,
          statements: state.statements,
          asOf,
          fromMonth,
          toMonth,
          holdings: state.profile.assets,
          quotes,
          assetValuations: state.profile.assetValuations,
        }),
        error: '',
      }
    } catch {
      return {
        report: null,
        error: 'Tutarlar güvenli biçimde hesaplanamadı. Kayıtlarını ve varlık miktarlarını kontrol et.',
      }
    }
  }, [
    state.transactions,
    state.statements,
    state.profile.assets,
    state.profile.assetValuations,
    asOf,
    thisMonth,
    windowRange,
    customFrom,
    customTo,
    quotes,
  ])

  const years = useMemo(
    () =>
      [
        ...new Set(
          [
            ...state.transactions.map((row) => (row.billedOn ?? row.date).slice(0, 4)),
            ...state.statements.map((row) => (row.periodEnd ?? row.periodStart ?? '').slice(0, 4)),
            ...(state.profile.assetValuations ?? []).map((row) => row.day.slice(0, 4)),
          ].filter((year) => /^\d{4}$/.test(year) && year <= asOf.slice(0, 4)),
        ),
      ]
        .sort()
        .reverse(),
    [state.transactions, state.statements, state.profile.assetValuations, asOf],
  )

  useEffect(() => {
    if (/^\d{4}$/.test(windowRange) && !years.includes(windowRange)) setWindowRange('all')
  }, [windowRange, years])

  const refresh = async () => {
    if (rateBusy) return
    setRateBusy(true)
    try {
      setRates(await refreshAssetRates(true))
      setRateError('')
    } catch {
      setRateError('Kurlar alınamadı. Yeniden deneyebilirsin.')
    } finally {
      setRateBusy(false)
    }
  }

  const report = result.report
  const activeCategory = report?.categories.some((row) => row.id === category) ? category : 'all'
  const distributions = report?.categories.filter((row) => row.pieValue > 0) ?? []
  const donutSlices = useMemo(
    () =>
      distributions.map((row) => ({
        id: row.id,
        label: row.label,
        value: row.pieValue,
        color: row.color,
      })),
    [distributions],
  )

  function openCategory(id: CategoryId) {
    setCategory(id)
    const heading = document.getElementById('daily-spending-heading')
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: 'start' })
  }

  return (
    <div className="analysis-page">
      <header className="dashboard-title">
        <div>
          <h1>Varlık & Analiz Merkezi</h1>
          <p>Gelir-gider trendlerin, altın/döviz portföyün ve işyeri alışkanlık radarın</p>
        </div>
        <div className="tx-mode-switch" role="tablist" aria-label="Varlık ve analiz bölümleri">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'trends'}
            className={subTab === 'trends' ? 'is-active' : ''}
            onClick={() => {
              hapticTap()
              setSubTab('trends')
            }}
          >
            <BarChart3 size={15} /> Harcama Trendi
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'portfolio'}
            className={subTab === 'portfolio' ? 'is-active' : ''}
            onClick={() => {
              hapticTap()
              setSubTab('portfolio')
            }}
          >
            <Coins size={15} /> Altın & Döviz ({count(state.profile.assets?.length ?? 0)})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'merchants'}
            className={subTab === 'merchants' ? 'is-active' : ''}
            onClick={() => {
              hapticTap()
              setSubTab('merchants')
            }}
          >
            <Store size={15} /> İşyeri & Alışkanlık
          </button>
        </div>
      </header>

      {subTab === 'portfolio' && <AssetsView embedded />}

      {subTab === 'merchants' && (
        <div className="space-y-5">
          {/* Top Merchants Leaderboard */}
          <section className="bento-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-micro font-medium uppercase text-faint">İşyeri Radarı</span>
                <h2 className="mt-0.5 text-title font-semibold text-ink">
                  En Çok Harcama Yapılan İşyerleri
                </h2>
              </div>
              <Button size="sm" onClick={() => onNavigate('spending')}>
                Kategori detayı
              </Button>
            </div>

            {overall.merchants.length > 0 ? (
              <ul className="mt-4 divide-y divide-line">
                {overall.merchants.slice(0, 10).map((m, idx) => (
                  <li key={m.merchant}>
                    <button
                      type="button"
                      onClick={() => openTransactions({ merchant: m.merchant, title: m.label, overall: true })}
                      className="flex w-full flex-col gap-2 rounded-[var(--radius)] px-2 py-3.5 text-left transition-colors hover:bg-hover"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-medium text-muted">
                            {idx + 1}
                          </span>
                          <strong className="truncate text-body font-medium text-ink">
                            {m.label}
                          </strong>
                          {m.label.toLocaleLowerCase('tr-TR') !==
                            categoryLabel(m.category).toLocaleLowerCase('tr-TR') && (
                            <Badge dot={categoryColor(m.category)}>
                              {categoryLabel(m.category)}
                            </Badge>
                          )}
                        </span>
                        <span className="num shrink-0 text-body font-semibold text-ink">
                          {money2(m.total)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-8">
                        <AnimatedProgress
                          value={m.total}
                          max={overall.merchants[0]?.total || 1}
                          color={categoryColor(m.category)}
                          height={5}
                          className="min-w-[80px] flex-1"
                        />
                        <span className="num shrink-0 text-xs text-muted">
                          {count(m.count)} işlem · ortanca {money2(m.median)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                compact
                title="İşyeri analizi için henüz harcama yok"
                description="Ekstre veya gider eklediğinde en sık alışveriş yaptığın işyerleri ve ortanca fiş tutarları burada sıralanır."
              />
            )}
          </section>

          {/* Recurring Habit Annual Footprint */}
          <section className="bento-card">
            <span className="text-micro font-medium uppercase text-faint">Alışkanlık İzi</span>
            <h2 className="mt-0.5 text-title font-semibold text-ink">
              Sık Tekrarlanan Harcamaların Yıllık Maliyeti
            </h2>
            {overall.habits.length > 0 ? (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {overall.habits.slice(0, 6).map((h) => (
                  <li
                    key={h.merchant}
                    className="rounded-[var(--radius)] border border-line bg-sunken p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate text-body font-medium text-ink">
                        {h.label}
                      </strong>
                      <Badge dot={categoryColor(h.category)}>{categoryLabel(h.category)}</Badge>
                    </div>
                    <p className="mt-1 text-label text-muted">
                      Ayda ~{h.perMonth.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} kez ·
                      ortanca {money(h.medianAmount)}
                    </p>
                    <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-line pt-2.5">
                      <span className="text-xs text-faint">Yıllık projeksiyon</span>
                      <strong className="num text-body font-semibold text-warning">
                        {money(h.annualProjection)} / yıl
                      </strong>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-label text-muted">
                Aynı işyerinde en az birkaç kez tekrarlanan günlük alışkanlıklar yakalandığında yıllık toplam maliyetleri burada hesaplanır.
              </p>
            )}
          </section>
        </div>
      )}

      {subTab === 'trends' && (
        <>
          <section className="analysis-period-card" aria-label="Dinamik analiz dönemi seçimi">
            <div className="analysis-period-top">
              <div className="analysis-period-presets" role="group" aria-label="Hızlı dönem seçenekleri">
                {(
                  [
                    ['all', 'Tüm geçmiş'],
                    ['3m', 'Son 3 ay'],
                    ['6m', 'Son 6 ay'],
                    ['12m', 'Son 12 ay'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={windowRange === value}
                    className={clsx('analysis-period-pill', windowRange === value && 'is-active')}
                    onClick={() => {
                      hapticTap()
                      setWindowRange(value)
                      setCategory('all')
                    }}
                  >
                    {label}
                  </button>
                ))}
                {years.map((year) => (
                  <button
                    key={year}
                    type="button"
                    aria-pressed={windowRange === year}
                    className={clsx('analysis-period-pill num', windowRange === year && 'is-active')}
                    onClick={() => {
                      hapticTap()
                      setWindowRange(year)
                      setCategory('all')
                    }}
                  >
                    {year}
                  </button>
                ))}
                {windowRange !== 'all' && (
                  <button
                    type="button"
                    className="analysis-period-pill"
                    onClick={() => {
                      hapticTap()
                      setWindowRange('all')
                      setCustomFrom('')
                      setCustomTo('')
                      setCategory('all')
                    }}
                    title="Tüm geçmişe dön"
                  >
                    <RotateCcw size={13} /> Sıfırla
                  </button>
                )}
              </div>

              <div className="analysis-period-meta">
                <span className="analysis-period-dot" aria-hidden="true" />
                <span>
                  {report?.range.fromMonth && report.range.toMonth
                    ? report.range.fromMonth === report.range.toMonth
                      ? monthLabel(report.range.fromMonth)
                      : `${monthLabel(report.range.fromMonth)} – ${monthLabel(report.range.toMonth)}`
                    : 'Geçmişin ilk kaydınla başlar'}
                </span>
                {report && report.totals.spendingMonths > 0 && (
                  <Badge tone="accent">{count(report.totals.spendingMonths)} harcama ayı</Badge>
                )}
              </div>
            </div>

            {report && report.availableMonths.length > 1 && (
              <HorizontalScrollStrip
                className="analysis-month-strip-wrap"
                scrollerClassName="analysis-month-strip"
                role="group"
                ariaLabel="Aylara dokunarak özel aralık seç"
              >
                <span className="mr-1 inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-faint">
                  <CalendarRange size={13} />
                  {windowRange === 'custom' && customFrom && customFrom === customTo
                    ? 'Bitiş ayı seç:'
                    : 'Özel aralık:'}
                </span>
                {report.availableMonths.map((m) => {
                  const activeFrom = report.range.fromMonth
                  const activeTo = report.range.toMonth
                  const inRange = Boolean(activeFrom && activeTo && m >= activeFrom && m <= activeTo)
                  const isEdge =
                    windowRange === 'custom' && (m === customFrom || m === customTo)
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={inRange}
                      className={clsx(
                        'analysis-month-chip num',
                        inRange && 'is-in-range',
                        isEdge && 'is-edge',
                      )}
                      onClick={() => {
                        hapticTap()
                        setCategory('all')
                        if (windowRange !== 'custom' || (customFrom && customTo && customFrom !== customTo)) {
                          setWindowRange('custom')
                          setCustomFrom(m)
                          setCustomTo(m)
                        } else if (customFrom) {
                          const start = m < customFrom ? m : customFrom
                          const end = m < customFrom ? customFrom : m
                          setCustomFrom(start)
                          setCustomTo(end)
                        }
                      }}
                    >
                      {shortMonth(m)}
                    </button>
                  )
                })}
              </HorizontalScrollStrip>
            )}
          </section>

      {result.error && (
        <div role="alert" className="analysis-notice">
          {result.error}
        </div>
      )}

      {report && (
        <>
          {report.excludedInvalidTransactions > 0 && (
            <p role="status" className="analysis-notice">
              {report.excludedInvalidTransactions} geçersiz kayıt hesaplamaya alınmadı. Kaynak kayıtlarını kontrol et.
            </p>
          )}

          {!report.totals.observedMonths && (
            <Empty
              compact
              icon={<BarChart3 size={24} />}
              title="Finansal geçmişine bir başlangıç."
              description="Ekstreni yükle veya gelir/gider ekle. Zaman içindeki değişimler, kategoriler ve alışkanlıkların burada oluşsun."
              action={
                <div className="analysis-actions">
                  <Button variant="primary" onClick={() => openImport()}>
                    Ekstre ekle
                  </Button>
                  <Button onClick={openEntry}>Kayıt ekle</Button>
                </div>
              }
            />
          )}

          <Stagger index={0}>
            <dl className="analysis-summary">
              <Summary
                label="Net harcama"
                value={report.totals.observedMonths ? <MoneyValue value={report.totals.netSpend} /> : '—'}
                note="Harcamalar eksi iadeler"
              />
              <Summary
                label="Aylık ortalama"
                value={
                  report.totals.averageObservedMonthSpend !== null ? (
                    <MoneyValue value={report.totals.averageObservedMonthSpend} />
                  ) : (
                    '—'
                  )
                }
                note={`${report.totals.spendingMonths} kayıtlı harcama ayı · kısmi aylar dahil`}
              />
              <Summary
                label="Kaydedilen gelir"
                value={
                  report.monthly.some((row) => row.hasIncome) ? (
                    <MoneyValue value={report.totals.income} />
                  ) : (
                    '—'
                  )
                }
                note="Yalnızca eklediğin gelirler"
              />
              <Summary
                label="Gelirden kalan"
                value={
                  report.monthly.some((row) => row.hasIncome) ? (
                    <MoneyValue value={report.totals.recordedSurplus} />
                  ) : (
                    '—'
                  )
                }
                note="Banka bakiyesi değildir"
              />
            </dl>
          </Stagger>

          <Stagger index={1}>
            <div className="analysis-main-grid">
              <Panel
                title="Gelir ve harcama trendi"
                description="Kayıt olmayan aylar boş bırakılır; sıfır harcama varsayılmaz."
              >
                {report.monthly.some((row) => row.hasRecords) ? (
                  <>
                    <div className="analysis-legend">
                      <span>
                        <i style={{ background: 'var(--accent)' }} />
                        Net harcama
                      </span>
                      <span>
                        <i style={{ background: 'var(--positive)' }} />
                        Kaydedilen gelir
                      </span>
                    </div>
                    <div
                      className="analysis-chart"
                      role="img"
                      aria-label="Aylık gelir ve net harcama trend grafiği; kesin değerler aşağıdaki aylık tabloda."
                    >
                      <ResponsiveContainer width="100%" height={275}>
                        <ComposedChart
                          data={report.monthly.map((row) => ({
                            ...row,
                            spending: row.hasSpendingEvidence ? row.netSpend : null,
                            recordedIncome: row.hasIncome ? row.income : null,
                          }))}
                          margin={{ top: 14, right: 12, bottom: 0, left: -6 }}
                        >
                          <defs>
                            <linearGradient id={gradSpendId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id={gradIncomeId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--positive)" stopOpacity={0.22} />
                              <stop offset="100%" stopColor="var(--positive)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
                          <XAxis dataKey="month" {...axis} tickFormatter={shortMonth} minTickGap={28} />
                          <YAxis {...axis} width={60} tickFormatter={(value) => moneyCompact(value)} />
                          <Tooltip content={<MoneyTooltip />} />
                          <Area
                            type="monotone"
                            dataKey="recordedIncome"
                            name="Kaydedilen gelir"
                            stroke="var(--positive)"
                            strokeWidth={2}
                            fill={`url(#${gradIncomeId})`}
                            dot={{ r: 3, fill: 'var(--positive)', stroke: 'var(--bg-raised)', strokeWidth: 1.5 }}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                          <Area
                            type="monotone"
                            dataKey="spending"
                            name="Net harcama"
                            stroke="var(--accent)"
                            strokeWidth={2.5}
                            fill={`url(#${gradSpendId})`}
                            dot={{ r: 3.5, fill: 'var(--accent)', stroke: 'var(--bg-raised)', strokeWidth: 1.5 }}
                            activeDot={{ r: 5.5, fill: 'var(--accent)', stroke: 'var(--bg-raised)', strokeWidth: 2 }}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <p className="analysis-placeholder">İlk kayıtlarından sonra aylık trendin burada görünür.</p>
                )}
              </Panel>

              <Panel title="Harcama dağılımı" description="Dilime dokunup incele veya satırla günlük detaya in.">
                {report.categories.length ? (
                  <div className="analysis-pie">
                    {donutSlices.length > 0 && (
                      <div className="analysis-chart" role="img" aria-label="Kategorilere göre harcama dağılımı.">
                        <InteractiveDonutChart
                          data={donutSlices}
                          height={210}
                          activeId={activeCategory === 'all' ? null : activeCategory}
                          onSelect={(id) => {
                            if (id) setCategory(id as CategoryId)
                            else setCategory('all')
                          }}
                          totalLabel="Net dağılım"
                        />
                      </div>
                    )}
                    <ul className="analysis-key">
                      {report.categories.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => openCategory(row.id)}
                            aria-pressed={activeCategory === row.id}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0" style={{ color: row.color }}>
                                <CategoryIcon category={row.id} size={14} />
                              </span>
                              <span className="truncate">{row.label}</span>
                            </span>
                            <strong className="num">{amount(row.net)}</strong>
                            <span className="analysis-key-share num">
                              {row.pieValue > 0
                                ? row.share < 0.001
                                  ? '<%0,1'
                                  : '%' + percentNumber.format(row.share * 100)
                                : 'İade kredisi'}
                            </span>
                            <ArrowUpRight size={14} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {report.categoryRefundCredit > 0 && (
                      <p className="analysis-caption">
                        Negatif kategori bakiyeleri pastaya eklenmez.{' '}
                        <span className="num font-semibold text-positive">
                          {amount(report.categoryRefundCredit)}
                        </span>{' '}
                        iade kredisi toplamdan ayrıca düşülür.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="analysis-placeholder">Dağılım için henüz pozitif net harcama yok.</p>
                )}
              </Panel>
            </div>
          </Stagger>

          <Stagger index={2}>
            <MonthOverMonthCategoryRadar
              monthly={report.monthly}
              onSelectCategory={openCategory}
            />
          </Stagger>

          <Stagger index={2}>
            <DailySpending
              report={report}
              transactions={state.transactions}
              asOf={asOf}
              category={activeCategory}
              onCategory={setCategory}
            />
          </Stagger>

          <Stagger index={3}>
            <Panel
              title="Aylık kategori trendi"
              description={
                report.comparison
                  ? monthLabel(report.comparison.previousMonth) +
                    ' ile ' +
                    monthLabel(report.comparison.currentMonth) +
                    ' karşılaştırması'
                  : 'Kategori trendini izle. Karşılaştırma için art arda kayıt bulunan iki ay gerekir.'
              }
            >
              {report.categories.length > 0 && (
                <div className="analysis-category-control">
                  <Field label="Trend kategorisi">
                    <Select
                      ariaLabel="Trend kategorisi"
                      value={activeCategory}
                      onChange={(next) => setCategory(next as CategoryId | 'all')}
                      options={[
                        {
                          value: 'all',
                          label: 'Toplam net harcama',
                          icon: <BarChart3 size={14} />,
                        },
                        ...sortCategoriesTr(report.categories).map((row) => ({
                          value: row.id,
                          label: row.label,
                          icon: (
                            <span style={{ color: row.color }}>
                              <CategoryIcon category={row.id} size={14} />
                            </span>
                          ),
                        })),
                      ]}
                    />
                  </Field>
                </div>
              )}

              {report.categories.length > 0 && (
                <div className="analysis-chart" role="img" aria-label="Seçilen kategorinin aylık harcama trendi.">
                  <ResponsiveContainer width="100%" height={195}>
                    <ComposedChart
                      data={report.monthly.map((row) => ({
                        month: row.month,
                        value: row.hasSpendingEvidence
                          ? activeCategory === 'all'
                            ? row.netSpend
                            : (row.categories[activeCategory] ?? 0)
                          : null,
                      }))}
                      margin={{ top: 10, right: 12, bottom: 0, left: -6 }}
                    >
                      <defs>
                        <linearGradient id={gradCatId} x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor={
                              report.categories.find((row) => row.id === activeCategory)?.color ??
                              'var(--accent)'
                            }
                            stopOpacity={0.28}
                          />
                          <stop
                            offset="100%"
                            stopColor={
                              report.categories.find((row) => row.id === activeCategory)?.color ??
                              'var(--accent)'
                            }
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
                      <XAxis {...axis} dataKey="month" tickFormatter={shortMonth} minTickGap={28} />
                      <YAxis {...axis} width={60} tickFormatter={(value) => moneyCompact(value)} />
                      <Tooltip content={<MoneyTooltip />} />
                      <Area
                        type="monotone"
                        name={
                          activeCategory === 'all'
                            ? 'Net harcama'
                            : (report.categories.find((row) => row.id === activeCategory)?.label ?? 'Kategori')
                        }
                        dataKey="value"
                        stroke={
                          report.categories.find((row) => row.id === activeCategory)?.color ?? 'var(--accent)'
                        }
                        strokeWidth={2.2}
                        fill={`url(#${gradCatId})`}
                        dot={{ r: 3 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {report.categoryMovers.length > 0 ? (
                <div
                  className="analysis-table-scroll overflow-x-auto"
                  tabIndex={0}
                  role="region"
                  aria-label="Kategori değişimleri tablosu"
                >
                  <table className="analysis-table">
                    <thead>
                      <tr>
                        <th>Kategori</th>
                        <th>Önceki ay</th>
                        <th>Son ay</th>
                        <th>Fark</th>
                        <th>Değişim</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.categoryMovers.map((row) => (
                        <tr key={row.id}>
                          <th>
                            <i style={{ background: row.color }} />
                            {row.label}
                          </th>
                          <td className="num">{amount(row.previous)}</td>
                          <td className="num">{amount(row.current)}</td>
                          <td className="num">{money2(row.delta, { sign: true })}</td>
                          <td
                            className={`num font-semibold ${
                              row.deltaPct && row.deltaPct > 0
                                ? 'text-negative'
                                : row.deltaPct && row.deltaPct < 0
                                  ? 'text-positive'
                                  : ''
                            }`}
                          >
                            {pct(row.deltaPct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="analysis-caption">
                  Bir önceki ayın verisi yoksa değişim yüzdesi hesaplanmaz.
                </p>
              )}
            </Panel>
          </Stagger>

          <Panel
            title="Varlıkların ve birikimin"
            description="Bugünkü portföyün ve gerçekten kaydedilmiş aylık değerleri."
            action={
              <button type="button" className="text-button" onClick={() => onNavigate('assets')}>
                Varlıkları yönet <ArrowUpRight size={15} />
              </button>
            }
          >
            <div className="analysis-assets-grid">
              <div>
                <span className="analysis-caption">
                  {report.portfolio.total === null ? 'Fiyatı bilinen varlıklar' : 'Bugünkü tahmini değer'}
                </span>
                <strong className="analysis-asset-total num">
                  {hasHoldings && (report.portfolio.total ?? report.portfolio.knownValue) !== null ? (
                    <MoneyValue value={(report.portfolio.total ?? report.portfolio.knownValue)!} />
                  ) : (
                    '—'
                  )}
                </strong>
                {report.portfolio.missing > 0 && (
                  <p className="analysis-caption">
                    {report.portfolio.missing} varlığın fiyatı eksik; bu toplam portföyünün tamamı değil.
                  </p>
                )}
                <ul className="analysis-key">
                  {report.portfolio.composition.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2 py-2.5 text-label">
                      <span className="flex items-center text-ink">
                        <i style={{ background: row.color }} />
                        <span>
                          {row.label}
                          <small className="ml-1.5 text-faint">{row.holdingCount} kayıt</small>
                        </span>
                      </span>
                      <strong className="num">{row.unpriced ? 'Fiyat eksik' : amount(row.valueMinor)}</strong>
                    </li>
                  ))}
                </ul>
                {!hasHoldings && (
                  <p className="analysis-caption">Altın, gümüş ve dövizini Varlıklarım’dan ekleyebilirsin.</p>
                )}
                <div className="analysis-actions mt-3">
                  <Button size="sm" disabled={!hasHoldings || rateBusy} onClick={() => void refresh()}>
                    <RefreshCw size={14} className={rateBusy ? 'animate-spin' : ''} />
                    {rateBusy ? 'Kurlar alınıyor' : 'Kurları yenile'}
                  </Button>
                </div>
                {(rateError || rates?.warning) && (
                  <p role="status" className="analysis-caption">
                    {rateError || rates?.warning}
                  </p>
                )}
                {hasHoldings && (
                  <p className="analysis-caption">
                    Kaynak tarihi:{' '}
                    {Object.values(quotes).length
                      ? new Date(Math.min(...Object.values(quotes).map((quote) => quote.asOf))).toLocaleDateString(
                          'tr-TR',
                          { timeZone: 'Europe/Istanbul' },
                        )
                      : 'Fiyat bekleniyor'}
                    . Önbellek ve günlük referans fiyatı kullanılabilir; satış fiyatı garantisi değildir.
                  </p>
                )}
              </div>

              <div>
                <AssetHistoryChart report={report} />
                <Button size="sm" className="mt-3" onClick={() => setHistoryEditor(true)}>
                  <Plus size={15} /> Geçmiş ay değeri ekle / düzelt
                </Button>
                <p className="analysis-caption">
                  Fark; miktar ekleme/çıkarma ve fiyat hareketlerini birlikte içerir. Yatırım getirisi değildir. Geçmiş kurlar veya varlıklar tahmin edilmez.
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Harcama alışkanlıkların" description="Seçili dönemdeki alışveriş kayıtlarından.">
            <dl className="analysis-habits">
              <Summary
                label="Alışveriş başına ortalama"
                value={amount(report.habits.averageTicket)}
                note={`${report.totals.purchases} alışveriş`}
              />
              <Summary
                label="Ortanca alışveriş"
                value={amount(report.habits.medianTicket)}
                note="Büyük tutarlardan daha az etkilenir"
              />
              <Summary
                label="Hafta sonu payı"
                value={
                  report.habits.weekendShare === null
                    ? '—'
                    : Math.round(report.habits.weekendShare * 100) + '%'
                }
                note="Brüt alışveriş tutarı içinde"
              />
              <Summary
                label="Tekrar gittiğin işyerleri"
                value={String(report.habits.repeatMerchants)}
                note={`${report.habits.activeDays} alışveriş yapılan gün`}
              />
            </dl>
            <div className="analysis-weekdays">
              {report.weekday.map((day) => (
                <div key={day.index}>
                  <span title={day.label}>{weekdayShort[day.index]}</span>
                  <div>
                    <i style={{ width: Math.max(0, day.share * 100) + '%' }} />
                  </div>
                  <strong className="num">{day.count}</strong>
                </div>
              ))}
            </div>
            <p className="analysis-caption">
              Gün çubukları brüt harcama payını, alttaki sayılar alışveriş adedini gösterir.
            </p>
            {report.merchants.length > 0 && (
              <div
                className="analysis-table-scroll overflow-x-auto"
                role="region"
                tabIndex={0}
                aria-label="İşyeri harcamaları"
              >
                <table className="analysis-table">
                  <thead>
                    <tr>
                      <th>İşyeri</th>
                      <th>Alışveriş</th>
                      <th>Kayıtlı ay</th>
                      <th>Net harcama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.merchants.slice(0, 12).map((row) => (
                      <tr key={row.merchant}>
                        <th>{row.label}</th>
                        <td>{row.count}</td>
                        <td>{row.months}</td>
                        <td className="num font-semibold">{amount(row.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Ay ay, tüm kayıtların"
            description="Grafiklerin sayısal karşılığı. Kart borcu ödemeleri yeniden gider sayılmaz."
          >
            {report.monthly.length > 0 ? (
              <div
                className="analysis-table-scroll overflow-x-auto"
                role="region"
                tabIndex={0}
                aria-label="Aylık finansal analiz tablosu"
              >
                <table className="analysis-table">
                  <thead>
                    <tr>
                      <th>Ay</th>
                      <th>Gelir</th>
                      <th>Net gider</th>
                      <th>Gelirden kalan</th>
                      <th>Ekstre gün kapsamı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.monthly.map((row) => (
                      <tr key={row.month}>
                        <th>
                          {row.label}
                          <small>{coverageLabels[row.status]}</small>
                        </th>
                        <td className="num">{row.hasIncome ? amount(row.income) : '—'}</td>
                        <td className="num">{row.hasSpendingEvidence ? amount(row.netSpend) : '—'}</td>
                        <td
                          className={`num font-semibold ${
                            row.hasIncome
                              ? row.recordedSurplus >= 0
                                ? 'text-positive'
                                : 'text-negative'
                              : ''
                          }`}
                        >
                          {row.hasIncome ? amount(row.recordedSurplus) : '—'}
                        </td>
                        <td>
                          {row.coverageDays ? `${row.coverageDays} / ${row.elapsedDays} gün` : 'Bilinmiyor'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="analysis-caption">Henüz aylık kayıt yok.</p>
            )}
            <p className="analysis-caption">
              Ekstre gün kapsamı, yüklenen belgelerin tarih aralığıdır; tüm kartların veya tüm giderlerin eklendiğini kanıtlamaz. Kayıtsız aylar ortalamaya eklenmez.{' '}
              {report.excludedFutureTransactions > 0 &&
                'Gelecekteki plan kayıtları gerçekleşmiş harcama sayılmadı.'}
            </p>
          </Panel>
        </>
      )}
        </>
      )}

      {historyEditor && <AssetHistoryEditor onClose={() => setHistoryEditor(false)} />}
    </div>
  )
}

function Summary({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
      <dd className="analysis-metric-note">{note}</dd>
    </div>
  )
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="analysis-panel">
      <header>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function MoneyTooltip({
  active,
  payload,
  label,
  pie,
}: {
  active?: boolean
  payload?: readonly { value?: unknown; name?: string; color?: string }[]
  label?: unknown
  pie?: boolean
}) {
  if (!active || !payload?.length) return null
  const title =
    !pie && typeof label === 'string'
      ? /^\d{4}-\d{2}$/.test(label)
        ? monthLabel(label)
        : /^\d{4}-\d{2}-\d{2}$/.test(label)
          ? fullDayLabel(label)
          : label
      : undefined
  return (
    <ChartTooltipShell
      title={title}
      rows={payload
        .filter((row) => row.value !== null && row.value !== undefined)
        .map((row) => ({
          label: row.name ?? '',
          value: amount(Number(row.value)),
          color: row.color,
        }))}
    />
  )
}

function DailySpending({
  report,
  transactions,
  category,
  asOf,
  onCategory,
}: {
  report: LongitudinalAnalysis
  transactions: readonly Transaction[]
  category: CategoryId | 'all'
  asOf: string
  onCategory: (category: CategoryId | 'all') => void
}) {
  const [selectedMonth, setSelectedMonth] = useState('')
  const [chart, setChart] = useState<'line' | 'bar'>('line')
  const gradId = useId().replace(/:/g, '')
  const months = report.monthly.filter((row) => row.hasSpendingEvidence)
  const isLongTerm = selectedMonth === 'all'
  const focus = months.find((row) => row.month === selectedMonth) ?? months[months.length - 1]
  const month = isLongTerm ? 'all' : (focus?.month ?? '')

  const days = useMemo(
    () => (isLongTerm ? [] : dailyNetSpending(transactions, month, asOf, category)),
    [transactions, month, asOf, category, isLongTerm],
  )

  const longTermPoints = useMemo(() => {
    if (!isLongTerm) return []
    return months.map((row) => ({
      date: row.month,
      net: category === 'all' ? row.netSpend : (row.categories[category] ?? 0),
      count: row.purchaseCount,
    }))
  }, [isLongTerm, months, category])

  const chartData = isLongTerm ? longTermPoints : days
  const categoryName = category === 'all' ? 'Net harcama' : categoryLabel(category)
  const chartColor = report.categories.find((row) => row.id === category)?.color ?? 'var(--accent)'
  const total = !isLongTerm ? compareMonthlySpending(report.monthly, month, 'all') : null
  const selected = !isLongTerm && category !== 'all' ? compareMonthlySpending(report.monthly, month, category) : null

  const longTermTotal = useMemo(
    () => longTermPoints.reduce((sum, p) => sum + (p.net ?? 0), 0),
    [longTermPoints],
  )
  const longTermAverage =
    longTermPoints.length > 0 ? Math.round(longTermTotal / longTermPoints.length) : 0

  return (
    <section className="analysis-panel" aria-labelledby="daily-spending-heading">
      <header>
        <div>
          <h2 id="daily-spending-heading" tabIndex={-1}>
            {isLongTerm ? 'Uzun dönem harcamalar' : 'Günlük harcamalar'}
          </h2>
          <p>
            {isLongTerm
              ? 'Seçili analiz dönemindeki tüm ayların uzun dönem harcama seyri.'
              : 'Kesim dönemine yansıtılan taksitler, kaydedilen harcamalar ve iadeler.'}
          </p>
        </div>
      </header>
      {months.length > 0 ? (
        <>
          <div className="analysis-daily-controls">
            <Field label="Harcama dönemi">
              <Select
                ariaLabel="Harcama dönemi"
                value={month}
                onChange={(next) => setSelectedMonth(next)}
                options={[
                  {
                    value: 'all',
                    label: 'Tüm dönem (Uzun dönem)',
                    icon: <CalendarRange size={14} />,
                    badge: `${count(months.length)} ay`,
                  },
                  ...[...months].reverse().map((row) => ({
                    value: row.month,
                    label: row.label,
                  })),
                ]}
              />
            </Field>
            <Field label="Kategori">
              <Select
                ariaLabel="Kategori"
                value={category}
                onChange={(next) => onCategory(next as CategoryId | 'all')}
                options={[
                  {
                    value: 'all',
                    label: 'Tüm kategoriler',
                    icon: <BarChart3 size={14} />,
                  },
                  ...sortCategoriesTr(report.categories).map((row) => ({
                    value: row.id,
                    label: row.label,
                    icon: (
                      <span style={{ color: row.color }}>
                        <CategoryIcon category={row.id} size={14} />
                      </span>
                    ),
                  })),
                ]}
              />
            </Field>
            <Segmented
              value={chart}
              onChange={(next) => {
                hapticTap()
                setChart(next)
              }}
              options={[
                { value: 'line', label: 'Çizgi' },
                { value: 'bar', label: 'Sütun' },
              ]}
            />
          </div>

          {chartData.some((pt) => pt.count > 0 || (pt.net ?? 0) !== 0) ? (
            <figure>
              <div
                className="analysis-chart"
                role="img"
                aria-label={`${isLongTerm ? 'Tüm dönem' : monthLabel(month)}, ${categoryName}, ${chart === 'line' ? 'çizgi' : 'sütun'} grafiği`}
              >
                <ResponsiveContainer width="100%" height={230}>
                  <ComposedChart data={chartData} margin={{ top: 14, right: 10, bottom: 0, left: -6 }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartColor} stopOpacity={0.30} />
                        <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
                    <XAxis
                      {...axis}
                      dataKey="date"
                      tickFormatter={(value: string) =>
                        isLongTerm ? shortMonth(value) : String(Number(value.slice(-2)))
                      }
                      minTickGap={isLongTerm ? 24 : 14}
                    />
                    <YAxis {...axis} width={60} tickFormatter={(value: number) => moneyCompact(value)} />
                    <ReferenceLine y={0} stroke="var(--line-strong)" />
                    <Tooltip content={<MoneyTooltip />} />
                    {chart === 'line' ? (
                      <Area
                        type="monotone"
                        dataKey="net"
                        name={categoryName}
                        stroke={chartColor}
                        strokeWidth={2.4}
                        fill={`url(#${gradId})`}
                        dot={isLongTerm ? { r: 3.5, fill: chartColor, stroke: 'var(--bg-raised)', strokeWidth: 1.5 } : false}
                        activeDot={{ r: 5, fill: chartColor, stroke: 'var(--bg-raised)', strokeWidth: 2 }}
                        isAnimationActive={false}
                      />
                    ) : (
                      <Bar
                        dataKey="net"
                        name={categoryName}
                        fill={chartColor}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={isLongTerm ? 36 : 22}
                        isAnimationActive={false}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <figcaption className="analysis-caption">
                {isLongTerm
                  ? `${count(months.length)} harcama ayı · Toplam ${money2(longTermTotal)} · Aylık ortalama ${money2(longTermAverage)}.`
                  : 'Gün numarası yatay eksendedir. Kayıt bulunmayan günler grafikte sıfır görünür.'}
              </figcaption>
            </figure>
          ) : (
            <p className="analysis-placeholder">
              {isLongTerm
                ? 'Seçili uzun dönemde bu kategori için kayıt yok.'
                : 'Bu ay bu seçimde harcama veya iade kaydı yok.'}
            </p>
          )}

          {total && (
            <>
              <div className="analysis-daily-comparisons">
                <MonthlyBaselines label="Toplam net harcama" comparison={total} />
                {selected && <MonthlyBaselines label={categoryName} comparison={selected} />}
              </div>
              <p className="analysis-caption">
                Ortalama, seçili aralıktaki önceki kayıtlı harcama aylarını kapsar. Kısmi aylar ve kapsamı bilinmeyen aylar dahil.
              </p>
            </>
          )}
        </>
      ) : (
        <p className="analysis-placeholder">
          İlk harcamandan veya ekstrenden sonra günlük tutarları ve aylık değişimi burada görebilirsin.
        </p>
      )}
    </section>
  )
}

function MonthlyBaselines({
  label,
  comparison,
}: {
  label: string
  comparison: NonNullable<ReturnType<typeof compareMonthlySpending>>
}) {
  return (
    <div>
      <h3>
        {label} <span className="num">{amount(comparison.current)}</span>
      </h3>
      <dl>
        <Baseline label="Önceki aya göre" data={comparison.previous} missing="Önceki ayda kayıt yok" />
        <Baseline label="Geçmiş ortalamaya göre" data={comparison.average} missing="Önceki aylarda kayıt yok" />
      </dl>
    </div>
  )
}

function Baseline({
  label,
  data,
  missing,
}: {
  label: string
  data: { value: number | null; percent: number | null }
  missing: string
}) {
  const change = data.percent
  const tone = change === null || change === 0 ? '' : change > 0 ? 'text-negative' : 'text-positive'
  const Icon = change === null || change === 0 ? Minus : change > 0 ? ArrowUp : ArrowDown
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {data.value === null ? (
          <span>{missing}</span>
        ) : (
          <>
            <span className="num">{amount(Math.round(data.value))}</span>
            {change === null ? (
              <span>Baz tutar sıfır veya negatif</span>
            ) : (
              <strong className={`analysis-delta num ${tone}`}>
                <Icon size={13} aria-hidden="true" />
                {pct(change)}
              </strong>
            )}
          </>
        )}
      </dd>
    </div>
  )
}

function AssetHistoryChart({ report }: { report: LongitudinalAnalysis }) {
  const gradId = useId().replace(/:/g, '')
  const history = report.assetHistory
  const latest = history[history.length - 1]
  const byMonth = new Map(history.map((row) => [row.month, row]))
  const points = history.length
    ? eachMonth(history[0].month, history[history.length - 1].month).map((month) => ({
        month,
        value: byMonth.get(month)?.totalMinor ?? null,
      }))
    : []

  return (
    <>
      <div className="analysis-history-heading">
        <h3>Aylık varlık değeri</h3>
        {latest?.deltaMinor !== null && latest?.deltaMinor !== undefined && (
          <span className="num">
            {money2(latest.deltaMinor, { sign: true })} · {pct(latest.deltaPct)}
          </span>
        )}
      </div>
      {history.length ? (
        <div className="analysis-chart" role="img" aria-label="Kaydedilen aylık portföy değerleri.">
          <ResponsiveContainer width="100%" height={210}>
            <ComposedChart data={points} margin={{ top: 14, right: 12, bottom: 0, left: -6 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 5" />
              <XAxis {...axis} dataKey="month" tickFormatter={shortMonth} minTickGap={28} />
              <YAxis {...axis} width={60} tickFormatter={(value) => moneyCompact(value)} />
              <Tooltip content={<MoneyTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                name="Portföy değeri"
                stroke="var(--gold)"
                strokeWidth={2.4}
                fill={`url(#${gradId})`}
                dot={{ r: 3.5, fill: 'var(--gold)', stroke: 'var(--bg-raised)', strokeWidth: 1.5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="analysis-placeholder">
          Henüz geçmiş değer yok. Varlıklarını güncellediğinde bu aydan itibaren kaydedilir; bildiğin eski ay toplamlarını da ekleyebilirsin.
        </p>
      )}
      {history.length > 0 && (
        <details className="analysis-history-data">
          <summary>
            Değer kayıtlarını gör <ChevronDown size={14} />
          </summary>
          <div className="analysis-table-scroll overflow-x-auto">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Gözlem</th>
                  <th>Değer</th>
                  <th>Aylık fark</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((row) => (
                  <tr key={row.month}>
                    <th>
                      {fullDayLabel(row.day)}
                      <small>
                        {row.origin === 'manual' ? 'Kullanıcının eklediği toplam' : 'Miktar ve kur gözlemi'}
                      </small>
                    </th>
                    <td className="num">{amount(row.totalMinor)}</td>
                    <td className="num">
                      {row.deltaMinor === null ? '—' : money2(row.deltaMinor, { sign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  )
}

function AssetHistoryEditor({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore()
  const feedback = useFeedback()
  const currentMonth = assetValuationDay().slice(0, 7)
  const [month, setMonth] = useState(addMonths(currentMonth, -1))
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const parsed = value.trim() === '0' || /^0,0{1,2}$/.test(value.trim()) ? 0 : entryAmount(value)
  const existing = state.profile.assetValuations?.find((row) => row.day.slice(0, 7) === month)

  const save = () => {
    if (!/^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(month) || month >= currentMonth || parsed === null) {
      setError('Geçmiş bir ay ve geçerli toplam gir. Örnek: 25.000,50')
      return
    }
    const day = month + '-' + String(daysInMonth(month)).padStart(2, '0')
    const snapshot = createManualAssetValuation(day, parsed)
    if (!snapshot) {
      setError('Değer kaydedilemedi. Ayı ve tutarı kontrol et.')
      return
    }
    dispatch({
      type: 'setProfile',
      profile: { assetValuations: upsertAssetValuation(state.profile.assetValuations ?? [], snapshot) },
    })
    feedback({ message: 'Geçmiş ayın varlık toplamı kaydedildi.' })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Geçmiş ayın varlık değeri"
      description="O ay sonunda sahip olduğun toplamın TL karşılığını gir. Bu bir gelir veya yatırım getirisi kaydı oluşturmaz."
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" disabled={parsed === null} onClick={save}>
            Toplamı kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Ay">
          <TextInput
            type="month"
            min="1900-01"
            max={addMonths(currentMonth, -1)}
            value={month}
            onChange={(event) => {
              setMonth(event.target.value)
              setError('')
            }}
          />
        </Field>
        <Field
          label="Ay sonu toplam varlık değeri (₺)"
          hint={
            existing ? (
              <>
                Bu ayın kayıtlı değeri: <span className="num">{money2(existing.totalMinor)}</span>. Yeni tutar bu kaydın yerini alır.
              </>
            ) : (
              'Yalnızca bildiğin toplamı gir; geçmiş fiyatlar tahmin edilmez.'
            )
          }
        >
          <TextInput
            inputMode="decimal"
            placeholder="Örnek: 25.000,50"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setError('')
            }}
          />
        </Field>
        {error && (
          <p role="alert" className="text-label text-negative">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}


function MonthOverMonthCategoryRadar({
  monthly,
  onSelectCategory,
}: {
  monthly: readonly LongitudinalMonth[]
  onSelectCategory: (category: CategoryId) => void
}) {
  const spendingMonths = useMemo(
    () => monthly.filter((m) => m.hasSpendingEvidence),
    [monthly],
  )

  // Index of the "current" month in `spendingMonths` (defaults to the latest available)
  const [pairOffset, setPairOffset] = useState(0)
  const [filter, setFilter] = useState<'all' | 'up' | 'down'>('all')

  const maxOffset = Math.max(0, spendingMonths.length - 2)
  const clampedOffset = Math.min(pairOffset, maxOffset)
  const currentIdx = spendingMonths.length - 1 - clampedOffset
  const prevIdx = currentIdx - 1

  const currentMonth = currentIdx >= 0 ? spendingMonths[currentIdx] : null
  const prevMonth = prevIdx >= 0 ? spendingMonths[prevIdx] : null

  const movers = useMemo(() => {
    if (!currentMonth || !prevMonth) return []
    return CATEGORIES.map((cat) => {
      const before = prevMonth.categories[cat.id] ?? 0
      const after = currentMonth.categories[cat.id] ?? 0
      const delta = after - before
      const deltaPct = before > 0 ? (delta / before) * 100 : after > 0 ? null : 0
      return {
        id: cat.id,
        label: cat.label,
        color: cat.color,
        before,
        after,
        delta,
        deltaPct,
      }
    })
      .filter((row) => row.before !== 0 || row.after !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  }, [currentMonth, prevMonth])

  if (!currentMonth || !prevMonth) {
    return (
      <section className="analysis-panel">
        <header>
          <div>
            <h2>Aydan Aya Kategorisel Değişim (%)</h2>
            <p>
              Kategorilerdeki artış ve azalışları yüzdesel olarak karşılaştırmak için seçili dönemde en az 2 harcama ayı gerekir.
            </p>
          </div>
        </header>
      </section>
    )
  }

  const totalDelta = currentMonth.netSpend - prevMonth.netSpend
  const totalPct =
    prevMonth.netSpend > 0 ? (totalDelta / prevMonth.netSpend) * 100 : null
  const upItems = movers.filter((m) => m.delta > 0)
  const downItems = movers.filter((m) => m.delta < 0)

  const visibleMovers =
    filter === 'up' ? upItems : filter === 'down' ? downItems : movers
  const maxAbsDelta = Math.max(1, ...movers.map((m) => Math.abs(m.delta)))

  return (
    <section className="analysis-panel" aria-labelledby="mom-radar-heading">
      <div className="mom-header">
        <div>
          <span className="text-micro font-semibold uppercase text-accent-text">
            Aydan Aya Kategori Değişimi (%)
          </span>
          <h2 id="mom-radar-heading" className="mt-0.5">
            Harcama Artış &amp; Azalış Radarı
          </h2>
          <p className="mt-1 text-label text-muted">
            Her kategorinin bir önceki aya göre yüzdesel ve TL bazlı değişimini incele; satıra dokunarak günlük detaya in.
          </p>
        </div>

        <div className="mom-pair-nav" role="group" aria-label="Karşılaştırılan aylar">
          <button
            type="button"
            disabled={clampedOffset >= maxOffset}
            aria-label="Önceki ay çiftine git"
            onClick={() => {
              hapticTap()
              setPairOffset((v) => Math.min(maxOffset, v + 1))
            }}
          >
            <ChevronLeft size={17} />
          </button>
          <span className="mom-pair-label">
            {shortMonth(prevMonth.month)} → {shortMonth(currentMonth.month)}
          </span>
          <button
            type="button"
            disabled={clampedOffset <= 0}
            aria-label="Sonraki ay çiftine git"
            onClick={() => {
              hapticTap()
              setPairOffset((v) => Math.max(0, v - 1))
            }}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {/* Overall Month-over-Month Summary Strip */}
      <div className="mom-summary-strip">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <span className="block text-xs font-medium text-muted">
              Toplam Net Harcama ({monthLabel(prevMonth.month)} → {monthLabel(currentMonth.month)})
            </span>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <span className="num text-body font-medium text-muted">
                {money2(prevMonth.netSpend)}
              </span>
              <span className="text-faint">→</span>
              <strong className="num text-body font-semibold text-ink">
                {money2(currentMonth.netSpend)}
              </strong>
              <span
                className={clsx(
                  'mom-pct-badge num',
                  totalDelta > 0 ? 'is-up' : totalDelta < 0 ? 'is-down' : 'is-flat',
                )}
              >
                {totalDelta > 0 ? (
                  <TrendingUp size={13} />
                ) : totalDelta < 0 ? (
                  <TrendingDown size={13} />
                ) : null}
                {totalPct !== null ? pct(totalPct) : 'Yeni'} ({money2(totalDelta, { sign: true })})
              </span>
            </div>
          </div>
        </div>

        <div className="mom-filter-tabs" role="tablist" aria-label="Değişim yönü filtresi">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={clsx('mom-filter-tab', filter === 'all' && 'is-active')}
            onClick={() => {
              hapticTap()
              setFilter('all')
            }}
          >
            Tümü ({count(movers.length)})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'up'}
            className={clsx('mom-filter-tab', filter === 'up' && 'is-active')}
            onClick={() => {
              hapticTap()
              setFilter('up')
            }}
          >
            <ArrowUp size={13} className="text-negative" /> Artanlar ({count(upItems.length)})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'down'}
            className={clsx('mom-filter-tab', filter === 'down' && 'is-active')}
            onClick={() => {
              hapticTap()
              setFilter('down')
            }}
          >
            <ArrowDown size={13} className="text-positive" /> Azalanlar ({count(downItems.length)})
          </button>
        </div>
      </div>

      {visibleMovers.length > 0 ? (
        <ul className="mom-list">
          {visibleMovers.map((row) => {
            const isUp = row.delta > 0
            const isDown = row.delta < 0
            const widthPct = Math.max(6, Math.round((Math.abs(row.delta) / maxAbsDelta) * 100))
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className="mom-row"
                  onClick={() => {
                    hapticTap()
                    onSelectCategory(row.id)
                  }}
                >
                  <div className="mom-row__cat">
                    <span
                      className="mom-row__icon"
                      style={{
                        background: `${row.color}18`,
                        borderColor: `${row.color}36`,
                        color: row.color,
                      }}
                    >
                      <CategoryIcon category={row.id} size={16} />
                    </span>
                    <div className="min-w-0">
                      <strong className="block truncate text-body font-medium text-ink">
                        {row.label}
                      </strong>
                      <span className="num block text-xs text-muted">
                        {money2(row.before)} → <strong className="font-medium text-ink">{money2(row.after)}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="mom-row__bar-track" aria-hidden="true">
                    <div
                      className="mom-row__bar-fill"
                      style={{
                        width: `${widthPct}%`,
                        background: isUp
                          ? 'var(--negative)'
                          : isDown
                            ? 'var(--positive)'
                            : 'var(--text-faint)',
                      }}
                    />
                  </div>

                  <div className="mom-row__delta">
                    <span
                      className={clsx(
                        'mom-pct-badge num',
                        isUp ? 'is-up' : isDown ? 'is-down' : 'is-flat',
                      )}
                    >
                      {isUp ? <ArrowUp size={12} /> : isDown ? <ArrowDown size={12} /> : null}
                      {row.before === 0 && row.after > 0
                        ? 'Yeni'
                        : row.after === 0 && row.before > 0
                          ? '−%100'
                          : pct(row.deltaPct)}
                    </span>
                    <span
                      className={clsx(
                        'num text-xs font-medium',
                        isUp ? 'text-negative' : isDown ? 'text-positive' : 'text-muted',
                      )}
                    >
                      {money2(row.delta, { sign: true })}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="py-4 text-center text-label text-muted">
          Bu yönde değişim gösteren kategori bulunmuyor.
        </p>
      )}
    </section>
  )
}
