import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, BarChart3, CalendarClock, ChevronDown, Coins, Minus, Plus, RefreshCw } from 'lucide-react'
import { Area, Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'
import { useNow } from '../app/useNow'
import type { ViewId } from '../app/navigation'
import { buildLongitudinalAnalysis, compareMonthlySpending, dailyNetSpending, type LongitudinalAnalysis, type MonthCoverage } from '../analytics/longitudinal'
import { addMonths, daysInMonth, eachMonth, fullDayLabel, monthLabel } from '../core/date'
import { money2, moneyCompact } from '../core/money'
import { entryAmount } from '../domain/entry'
import { assetValuationDay, createManualAssetValuation, upsertAssetValuation } from '../domain/assetsHistory'
import { categoryLabel, type CategoryId } from '../domain/categories'
import type { Transaction } from '../domain/types'
import { useAssetValuationCapture } from '../hooks/useAssetValuationCapture'
import { cachedAssetRates, isQuoteAvailable, refreshAssetRates, type RateSnapshot } from '../platform/rates'
import { hapticTap } from '../platform/haptics'
import { Button, Empty, Field, Segmented, TextInput } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { useFeedback } from '../ui/Feedback'
import { ChartTooltipShell, InteractiveDonutChart } from '../ui/charts'
import { MoneyValue } from '../ui/MoneyValue'
import { Stagger } from '../ui/motion'
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
  const { state } = useStore()
  const { openImport, openEntry } = useSheets()
  const now = useNow(60_000)
  const asOf = assetValuationDay(now)
  const thisMonth = asOf.slice(0, 7)
  const [windowRange, setWindowRange] = useState('all')
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
        windowRange === '6m'
          ? addMonths(thisMonth, -5)
          : windowRange === '12m'
            ? addMonths(thisMonth, -11)
            : /^\d{4}$/.test(windowRange)
              ? windowRange + '-01'
              : undefined
      const toMonth = /^\d{4}$/.test(windowRange)
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
  }, [state.transactions, state.statements, state.profile.assets, state.profile.assetValuations, asOf, thisMonth, windowRange, quotes])

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
          <h1>Analiz</h1>
          <p>Gelir, harcama, birikim ve alışkanlıklarının zaman içindeki seyri</p>
        </div>
        <div className="analysis-destinations" aria-label="İlgili görünümler">
          <button
            type="button"
            className="analysis-dest-card"
            onClick={() => onNavigate('spending')}
          >
            <BarChart3 size={16} /> Harcamalar <ArrowUpRight size={14} className="text-faint" />
          </button>
          <button
            type="button"
            className="analysis-dest-card"
            onClick={() => onNavigate('assets')}
          >
            <Coins size={16} /> Varlıklar <ArrowUpRight size={14} className="text-faint" />
          </button>
          <button
            type="button"
            className="analysis-dest-card"
            onClick={() => onNavigate('future')}
          >
            <CalendarClock size={16} /> Gelecek <ArrowUpRight size={14} className="text-faint" />
          </button>
        </div>
      </header>

      <div className="analysis-range">
        <Field label="Analiz dönemi">
          <select
            className="finance-select"
            value={windowRange}
            onChange={(event) => {
              hapticTap()
              setWindowRange(event.target.value)
              setCategory('all')
            }}
          >
            <option value="all">Tüm geçmiş</option>
            <option value="6m">Son 6 ay</option>
            <option value="12m">Son 12 ay</option>
            {years.length > 0 && (
              <optgroup label="Kayıtlı yıllar">
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
        <p>
          {report?.range.fromMonth && report.range.toMonth
            ? monthLabel(report.range.fromMonth) + ' – ' + monthLabel(report.range.toMonth)
            : 'Geçmişin, ilk kaydınla başlar.'}
          <small>Aylık özet filtresinden bağımsız, kaydedilen veriler.</small>
        </p>
      </div>

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
                            <span>
                              <i style={{ background: row.color }} aria-hidden="true" />
                              {row.label}
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
                    <select
                      className="finance-select"
                      value={activeCategory}
                      onChange={(event) => setCategory(event.target.value as CategoryId | 'all')}
                    >
                      <option value="all">Toplam net harcama</option>
                      {report.categories.map((row) => (
                        <option value={row.id} key={row.id}>
                          {row.label}
                        </option>
                      ))}
                    </select>
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
  const focus = months.find((row) => row.month === selectedMonth) ?? months[months.length - 1]
  const month = focus?.month ?? ''
  const days = useMemo(
    () => dailyNetSpending(transactions, month, asOf, category),
    [transactions, month, asOf, category],
  )
  const categoryName = category === 'all' ? 'Net harcama' : categoryLabel(category)
  const chartColor = report.categories.find((row) => row.id === category)?.color ?? 'var(--accent)'
  const total = compareMonthlySpending(report.monthly, month, 'all')
  const selected = category !== 'all' ? compareMonthlySpending(report.monthly, month, category) : null

  return (
    <section className="analysis-panel" aria-labelledby="daily-spending-heading">
      <header>
        <div>
          <h2 id="daily-spending-heading" tabIndex={-1}>
            Günlük harcamalar
          </h2>
          <p>Kesim dönemine yansıtılan taksitler, kaydedilen harcamalar ve iadeler.</p>
        </div>
      </header>
      {total ? (
        <>
          <div className="analysis-daily-controls">
            <Field label="Harcama ayı">
              <select
                className="finance-select"
                value={month}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                {[...months].reverse().map((row) => (
                  <option key={row.month} value={row.month}>
                    {row.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Günlük kategori">
              <select
                className="finance-select"
                value={category}
                onChange={(event) => onCategory(event.target.value as CategoryId | 'all')}
              >
                <option value="all">Tüm kategoriler</option>
                {report.categories.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
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

          {days.some((day) => day.count > 0) ? (
            <figure>
              <div
                className="analysis-chart"
                role="img"
                aria-label={`${monthLabel(month)}, ${categoryName}, günlük ${chart === 'line' ? 'çizgi' : 'sütun'} grafiği`}
              >
                <ResponsiveContainer width="100%" height={230}>
                  <ComposedChart data={days} margin={{ top: 14, right: 10, bottom: 0, left: -6 }}>
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
                      tickFormatter={(date) => String(Number(date.slice(-2)))}
                      minTickGap={14}
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
                        dot={false}
                        activeDot={{ r: 5, fill: chartColor, stroke: 'var(--bg-raised)', strokeWidth: 2 }}
                        isAnimationActive={false}
                      />
                    ) : (
                      <Bar
                        dataKey="net"
                        name={categoryName}
                        fill={chartColor}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={22}
                        isAnimationActive={false}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <figcaption className="analysis-caption">
                Gün numarası yatay eksendedir. Kayıt bulunmayan günler grafikte sıfır görünür.
              </figcaption>
              <details className="analysis-history-data">
                <summary>
                  Günlük tutarları gör <ChevronDown size={14} aria-hidden="true" />
                </summary>
                <table className="analysis-table analysis-daily-table">
                  <caption className="sr-only">
                    {monthLabel(month)} · {categoryName}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Gün</th>
                      <th scope="col">Kayıt</th>
                      <th scope="col">Net harcama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day) => (
                      <tr key={day.date}>
                        <th scope="row">{fullDayLabel(day.date)}</th>
                        <td>{day.count}</td>
                        <td className="num">{amount(day.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </figure>
          ) : (
            <p className="analysis-placeholder">Bu ay bu seçimde harcama veya iade kaydı yok.</p>
          )}

          <div className="analysis-daily-comparisons">
            <MonthlyBaselines label="Toplam net harcama" comparison={total} />
            {selected && <MonthlyBaselines label={categoryName} comparison={selected} />}
          </div>
          <p className="analysis-caption">
            Ortalama, seçili aralıktaki önceki kayıtlı harcama aylarını kapsar. Kısmi aylar ve kapsamı bilinmeyen aylar dahil.
          </p>
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
