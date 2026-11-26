import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Plus,
  Receipt,
  Repeat,
  Scale,
  SlidersHorizontal,
  Upload,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Empty, Meter, Section, Segmented } from '../ui/primitives'
import {
  CashFlowChart,
  CommitmentChart,
  GoalTrajectoryChart,
  InteractiveDonutChart,
  type DonutSlice,
} from '../ui/charts'
import { MoneyValue } from '../ui/MoneyValue'
import { AnimatedProgress, Stagger } from '../ui/motion'
import { GOAL_STATUS_LABEL, type GoalProgress } from '../analytics/goal'
import { sliceForecast, type CashFlowForecast } from '../analytics/forecast'
import { buildUpcomingPayments, type UpcomingPayment } from '../analytics/upcoming'
import { computeFiftyThirtyTwenty } from '../analytics/fiftyThirtyTwenty'
import { simulateWhatIf } from '../analytics/whatIf'
import { portfolioValue } from '../domain/assets'
import { cachedAssetRates } from '../platform/rates'
import { money, money2, count, percent } from '../core/money'
import { monthLabel, monthOf, fullDayLabel, todayKey } from '../core/date'
import { categoryColor, categoryLabel } from '../domain/categories'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'
import { navigateTo } from '../app/navigation'
import { useFeedback } from '../ui/Feedback'

export function FutureView() {
  const { state, analysis, overall } = useStore()
  const {
    openSettings,
    openImport,
    openEntry,
    openBudgets,
    openIncome,
    openTransactions,
  } = useSheets()
  const { installments, commitments, recurring, goal, forecast } = overall
  const [activeRuleSlice, setActiveRuleSlice] = useState<string | null>(null)

  const upcoming = useMemo(
    () => buildUpcomingPayments(recurring, state.statements, todayKey()),
    [recurring, state.statements],
  )

  const open = installments.filter((plan) => plan.remainingCount > 0)
  const activeRecurring = recurring.filter((r) => r.status === 'active')
  const monthlySubTotal = activeRecurring.reduce((s, r) => s + r.monthlyEquivalent, 0)
  const annualSubTotal = activeRecurring.reduce((s, r) => s + r.annualCost, 0)

  const income = analysis.totals.income > 0 ? analysis.totals.income : state.profile.monthlyIncome
  const spend = analysis.totals.netSpend
  const limit = state.profile.spendingLimit
  const hasForecast = forecast.totalIn > 0 || forecast.totalOut > 0

  // 50/30/20 Rule calculation — covers 100% of spending categories + savings
  const rule = useMemo(
    () =>
      computeFiftyThirtyTwenty(
        analysis.categories,
        income,
        spend,
        analysis.totals.unallocatedRefunds,
      ),
    [analysis.categories, income, spend, analysis.totals.unallocatedRefunds],
  )
  const {
    needTotal,
    wantTotal,
    otherTotal,
    savingsTotal,
    deficitTotal,
    needPct,
    wantPct,
    otherPct,
    savePct,
  } = rule

  const ruleSlices = useMemo<DonutSlice[]>(() => {
    const out: DonutSlice[] = []
    if (needTotal > 0) {
      out.push({ id: 'need', label: 'Zorunlu İhtiyaç (%50 hedef)', value: needTotal, color: '#2BD49B' })
    }
    if (wantTotal > 0) {
      out.push({ id: 'want', label: 'Esnek / Keyfi (%30 hedef)', value: wantTotal, color: '#FBBF24' })
    }
    if (otherTotal > 0) {
      out.push({ id: 'other', label: 'Diğer / Sınıflanmayan', value: otherTotal, color: '#94A3B8' })
    }
    if (savingsTotal > 0) {
      out.push({ id: 'save', label: 'Tasarruf / Kalan (%20 hedef)', value: savingsTotal, color: '#38BDF8' })
    }
    return out
  }, [needTotal, wantTotal, otherTotal, savingsTotal])

  const next = commitments[0]
  const twelveMonthTotal = commitments.reduce((s, m) => s + m.total, 0)
  const heaviest = commitments.reduce(
    (max, m) => (m.total > (max?.total ?? 0) ? m : max),
    commitments[0] as (typeof commitments)[number] | undefined,
  )

  const periodText =
    state.filters.month === 'all' ? 'Tüm dönemler' : monthLabel(state.filters.month)

  const heading = (
    <header className="dashboard-title">
      <div>
        <h1>Plan &amp; Bütçe Merkezi</h1>
        <p>{periodText} · 50/30/20 dengesi, kategori zarfları, abonelik keşfi ve canlı senaryo</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" onClick={openBudgets}>
          <SlidersHorizontal size={15} /> Limitleri düzenle
        </Button>
        <Button size="sm" onClick={openIncome}>
          <ArrowDownLeft size={15} /> Sabit gelir &amp; gider
        </Button>
        <Button size="sm" onClick={openSettings}>
          Hedef ayarları
        </Button>
      </div>
    </header>
  )

  return (
    <div className="space-y-5">
      {heading}

      {/* ── Row 1: 4-Card Plan & Budget KPI Strip ─────────────────────────── */}
      <Stagger index={0}>
        <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={openBudgets}
            className="bento-card min-w-0 text-left transition-all hover:border-accent-border"
          >
            <span className="text-micro font-medium uppercase text-faint">Aylık Bütçe Limiti</span>
            <div className="mt-2 break-words text-figure font-semibold text-ink">
              {limit > 0 ? <MoneyValue value={limit} /> : <span className="text-accent-text">Limit koy →</span>}
            </div>
            <span className="mt-1 block text-label text-muted">
              {limit > 0
                ? `${money(Math.max(0, limit - spend))} kullanılabilir`
                : `${count(analysis.budgets.items.length)} kategori zarfı`}
            </span>
          </button>

          <button
            type="button"
            onClick={openIncome}
            className="bento-card min-w-0 text-left transition-all hover:border-accent-border"
          >
            <span className="text-micro font-medium uppercase text-faint">Gelir &amp; Sabit Gider</span>
            <div className="mt-2 break-words text-figure font-semibold text-positive">
              {income > 0 ? <MoneyValue value={income} /> : <span className="text-accent-text">Gelir ekle →</span>}
            </div>
            <span className="mt-1 block text-label text-muted">
              {income > 0 ? `Tasarruf oranı %${savePct}` : 'Maaş, kira ve fatura planı'}
            </span>
          </button>

          <div className="bento-card min-w-0">
            <span className="text-micro font-medium uppercase text-faint">Aktif Abonelik Yükü</span>
            <div className="mt-2 break-words text-figure font-semibold text-ink">
              <MoneyValue value={monthlySubTotal} />
              <span className="ml-1 text-label font-normal text-muted">/ay</span>
            </div>
            <span className="mt-1 block text-label text-muted">
              {count(activeRecurring.length)} abonelik · yıllık {money(annualSubTotal)}
            </span>
          </div>

          <div className="bento-card min-w-0">
            <span className="text-micro font-medium uppercase text-faint">12 Aylık Bağlı Yük</span>
            <div className="mt-2 break-words text-figure font-semibold text-ink">
              <MoneyValue value={twelveMonthTotal} />
            </div>
            <span className="mt-1 block text-label text-muted">
              {count(open.length)} açık taksit · {count(upcoming.length)} yaklaşan ödeme
            </span>
          </div>
        </div>
      </Stagger>

      {/* ── Row 2: 50/30/20 Needs-Wants-Savings + Category Budget Envelopes ── */}
      <Stagger index={1}>
        <div className="grid gap-4 lg:grid-cols-12">
          {/* 50/30/20 Rule Engine */}
          <section className="bento-card lg:col-span-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-micro font-medium uppercase text-accent-text">
                  50 / 30 / 20 Finansal Denge Kuralı
                </span>
                <h2 className="mt-0.5 text-title font-semibold text-ink">
                  Zorunlu · Keyfi · Tasarruf
                </h2>
              </div>
              <Scale size={18} className="shrink-0 text-accent-text" />
            </div>

            {ruleSlices.length > 0 ? (
              <>
                <div className="mt-3">
                  <InteractiveDonutChart
                    data={ruleSlices}
                    height={196}
                    activeId={activeRuleSlice}
                    onSelect={setActiveRuleSlice}
                    totalLabel={
                      income > 0
                        ? state.filters.month === 'all'
                          ? 'Toplam Gelir'
                          : 'Aylık Gelir'
                        : 'Toplam Harcama'
                    }
                    totalValue={rule.base > 0 ? rule.base : undefined}
                  />
                </div>

                <div className="mt-3 space-y-3">
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-label">
                      <span className="font-medium text-ink">
                        Zorunlu İhtiyaçlar <small className="font-normal text-faint">(Hedef ≤%50)</small>
                      </span>
                      <span className="num font-semibold text-ink">
                        %{needPct} · {money2(needTotal)}
                      </span>
                    </div>
                    <AnimatedProgress
                      value={Math.min(100, needPct)}
                      max={100}
                      color="#2BD49B"
                      height={6}
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-label">
                      <span className="font-medium text-ink">
                        Esnek / Keyfi İstekler <small className="font-normal text-faint">(Hedef ≤%30)</small>
                      </span>
                      <span className="num font-semibold text-ink">
                        %{wantPct} · {money2(wantTotal)}
                      </span>
                    </div>
                    <AnimatedProgress
                      value={Math.min(100, wantPct)}
                      max={100}
                      color={wantPct > 35 ? 'var(--warning)' : '#FBBF24'}
                      height={6}
                      className="mt-1.5"
                    />
                  </div>

                  {otherTotal > 0 && (
                    <div>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-label">
                        <span className="font-medium text-ink">
                          Diğer / Sınıflanmayan <small className="font-normal text-faint">(Diğer, cüzdan, nakit)</small>
                        </span>
                        <span className="num font-semibold text-ink">
                          %{otherPct} · {money2(otherTotal)}
                        </span>
                      </div>
                      <AnimatedProgress
                        value={Math.min(100, otherPct)}
                        max={100}
                        color="#94A3B8"
                        height={6}
                        className="mt-1.5"
                      />
                    </div>
                  )}

                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-label">
                      <span className="font-medium text-ink">
                        Net Tasarruf / Kalan <small className="font-normal text-faint">(Hedef ≥%20)</small>
                      </span>
                      <span
                        className={clsx(
                          'num font-semibold',
                          deficitTotal > 0 ? 'text-negative' : 'text-positive',
                        )}
                      >
                        {income > 0
                          ? deficitTotal > 0
                            ? `Gelir ${money2(deficitTotal)} aşıldı`
                            : `%${savePct} · ${money2(savingsTotal)}`
                          : 'Gelir girilmedi'}
                      </span>
                    </div>
                    <AnimatedProgress
                      value={Math.min(100, savePct)}
                      max={100}
                      color="#38BDF8"
                      height={6}
                      className="mt-1.5"
                    />
                  </div>

                  {analysis.totals.unallocatedRefunds > 0 && (
                    <p className="pt-1 text-micro text-muted">
                      Kategorisiz {money2(analysis.totals.unallocatedRefunds)} iade kredisi net tasarrufa yansıtıldı.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-[var(--radius)] border border-dashed border-line bg-sunken p-5 text-center">
                <p className="text-label text-muted">
                  Harcama ve gelir eklediğinde 50/30/20 zorunlu-keyfi-tasarruf analiz halkası otomatik oluşur.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Button size="sm" variant="primary" onClick={() => openEntry()}>
                    <Plus size={14} /> Gider ekle
                  </Button>
                  <Button size="sm" onClick={openIncome}>
                    Gelir ekle
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Category Budget Envelopes */}
          <section className="bento-card lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-micro font-medium uppercase text-faint">Kategori Zarfları</span>
                <h2 className="mt-0.5 text-title font-semibold text-ink">
                  Kategori Bütçeleri ve Harcama Hızı
                </h2>
              </div>
              <Button size="sm" onClick={openBudgets}>
                <SlidersHorizontal size={14} /> Kategori limiti koy
              </Button>
            </div>

            {analysis.budgets.items.length > 0 ? (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {analysis.budgets.items.map((b) => {
                  const over = b.status === 'over'
                  const warn = b.status === 'warning'
                  return (
                    <li key={b.category} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => openTransactions({ category: b.category })}
                        className="w-full rounded-[var(--radius)] border border-line bg-sunken p-3.5 text-left transition-all hover:border-line-strong hover:bg-hover"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2 text-body font-medium text-ink">
                            <i
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: b.color }}
                            />
                            <span className="truncate">{b.label}</span>
                          </span>
                          <Badge tone={over ? 'negative' : warn ? 'warning' : 'positive'}>
                            {over
                              ? `${money(b.spent - b.limit)} aşıldı`
                              : `${money(Math.max(0, b.limit - b.spent))} kaldı`}
                          </Badge>
                        </div>

                        <div className="mt-2.5">
                          <AnimatedProgress value={b.spent} max={b.limit} height={7} />
                        </div>

                        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 text-label text-muted num">
                          <span>{money2(b.spent)} harcandı</span>
                          <span>/ {money(b.limit)} limit</span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : analysis.categories.length > 0 ? (
              <div className="mt-4 space-y-3">
                <p className="text-label text-muted">
                  Henüz kategori bazlı zarf limiti koymadın. En çok harcadığın kategorilere tek dokunuşla tavan belirleyebilirsin:
                </p>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {analysis.categories.slice(0, 6).map((cat) => (
                    <li key={cat.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={openBudgets}
                        className="flex min-h-[44px] w-full flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-line bg-sunken px-3.5 py-3 text-left transition-all hover:border-accent-border hover:bg-hover"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <i
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: cat.color }}
                          />
                          <span className="truncate text-body font-medium text-ink">{cat.label}</span>
                        </span>
                        <span className="num shrink-0 text-label font-medium text-ink">
                          {money2(cat.total)} · <span className="text-accent-text">Limit koy</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <Empty
                compact
                title="Kategori bütçesi için ilk kaydını ekle"
                description="Market, restoran, fatura gibi kategorilere ayrı ayrı aylık tavan koyabilirsin."
                action={
                  <Button size="sm" variant="primary" onClick={openBudgets}>
                    Kategori limitlerini aç
                  </Button>
                }
              />
            )}
          </section>
        </div>
      </Stagger>

      {/* ── Row 3: Subscription & Recurring Bills Radar (Confirmed Multi-Month Only) ── */}
      <Stagger index={2}>
        <section className="bento-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-micro font-medium uppercase text-faint">
                Abonelik &amp; Düzenli Ödeme Radarı
              </span>
              <h2 className="mt-0.5 text-title font-semibold text-ink">
                Tekrarlanan Abonelikler
              </h2>
            </div>
          </div>

          {recurring.length > 0 ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recurring.map((sub) => {
                const hiked = (sub.priceChangePct ?? 0) > 2
                return (
                  <li
                    key={sub.merchant}
                    className="flex min-w-0 flex-col justify-between gap-3 rounded-[var(--radius)] border border-line bg-sunken p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: categoryColor(sub.category) }}
                          />
                          <strong className="truncate text-body font-medium text-ink">
                            {sub.label}
                          </strong>
                        </div>
                        <span className="mt-0.5 block text-label text-faint">
                          {categoryLabel(sub.category)} · {sub.cadenceLabel} ({count(sub.occurrences)} kez)
                        </span>
                      </div>
                      <Badge tone={sub.status === 'active' ? (hiked ? 'warning' : 'accent') : 'neutral'}>
                        {hiked
                          ? `+%${Math.round(sub.priceChangePct!)} zam`
                          : sub.status === 'active'
                            ? 'Aktif'
                            : 'Pasif'}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-t border-line pt-2.5">
                      <div>
                        <span className="num text-body font-semibold text-ink">
                          {money2(sub.lastAmount)}
                        </span>
                        <span className="ml-1 text-xs text-muted">/ {sub.cadenceLabel.toLowerCase()}</span>
                      </div>
                      <span className="text-xs text-faint">
                        Sıradaki: {fullDayLabel(sub.nextExpected)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius)] border border-line bg-sunken p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
                  <Repeat size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-body font-medium text-ink">
                    Düzenli abonelikler birden fazla ayda tekrarlandığında otomatik görünür
                  </p>
                  <p className="text-label text-muted">
                    Ekstrelerin biriktikçe düzenli tekrarlayan ödemelerin ve fiyat artışların burada takip edilir.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </Stagger>

      {/* ── Row 3.5: Live "Ne Olur?" (What-If) Scenario Bridge (Future × Assets × Debt) ── */}
      <Stagger index={3}>
        <WhatIfScenarioBridge
          goal={goal}
          monthlyIncome={income}
          monthlySpend={spend}
        />
      </Stagger>

      {/* ── Row 4: Upcoming Payments (Next 45 Days) ───────────────────────── */}
      <Stagger index={4}>
        {upcoming.length > 0 ? (
          <UpcomingSection payments={upcoming} />
        ) : (
          <div className="bento-card">
            <Section title="Yaklaşan ödemeler (45 gün)">
              <p className="max-w-xl text-body text-muted">
                Kayıtlarında önümüzdeki 45 güne ait bir ekstre son ödeme tarihi bulunamadı. Güncel ekstreni yükleyerek son ödeme geri sayımını başlatabilirsin.
              </p>
              <Button size="sm" className="mt-3" onClick={() => openImport()}>
                <Upload size={15} /> Güncel ekstre ekle
              </Button>
            </Section>
          </div>
        )}
      </Stagger>

      {/* ── Row 5: Committed Payment Load & 12-Month Projection ───────────── */}
      <Stagger index={5}>
        <section className="bento-card">
          <span className="text-micro font-medium uppercase text-faint">Bağlı Ödeme Yükü</span>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="text-title font-semibold text-ink">Kayıtlarına göre gelecek ödeme yükün</h2>
            {twelveMonthTotal > 0 && (
              <div className="text-figure font-semibold text-ink">
                <MoneyValue value={twelveMonthTotal} decimals={false} />
                <span className="ml-1.5 text-label font-normal text-muted">/ 12 ay</span>
              </div>
            )}
          </div>

          <p className="mt-3 max-w-2xl text-body text-muted">
            {next && next.total > 0 ? (
              <>
                <span className="font-medium text-ink">{monthLabel(next.month)}</span> için{' '}
                <span className="num font-semibold text-ink">{money(next.total)}</span> bağlı.{' '}
              </>
            ) : (
              'Kayıtlı taksit veya aktif düzenli ödeme görünmüyor. '
            )}
            {heaviest && heaviest.total > 0 && (
              <>
                En yoğun ay <span className="font-medium text-ink">{monthLabel(heaviest.month)}</span>:{' '}
                <span className="num font-semibold text-ink">{money(heaviest.total)}</span>.{' '}
              </>
            )}
            {[
              open.length > 0 ? `${count(open.length)} açık taksit planı` : null,
              activeRecurring.length > 0 ? `${count(activeRecurring.length)} aktif abonelik` : null,
            ]
              .filter(Boolean)
              .join(', ')}
            {(open.length > 0 || activeRecurring.length > 0) && '.'}
          </p>

          {income > 0 && next && next.total > 0 && (
            <div className="mt-5 space-y-2 rounded-[var(--radius)] border border-line bg-sunken p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-label font-normal text-muted">
                  {monthLabel(next.month)} yükü, aylık gelirinin{' '}
                  <span className="num font-medium text-ink">
                    {percent((next.total / income) * 100)}
                  </span>
                  &apos;i
                </span>
                <span className="num text-label text-faint">
                  {money(next.total)} / {money(income)}
                </span>
              </div>
              <Meter
                value={next.total}
                max={income}
                tone={next.total > income * 0.4 ? 'negative' : next.total > income * 0.25 ? 'warning' : 'positive'}
              />
            </div>
          )}

          {twelveMonthTotal > 0 && (
            <div className="mt-5 border-t border-line pt-5">
              <CommitmentChart data={commitments} height={225} />
            </div>
          )}
        </section>
      </Stagger>

      {/* ── Row 6: Open Installments ──────────────────────────────────────── */}
      {open.length > 0 && (
        <FutureDisclosure
          title="Açık taksit planları"
          description={`${count(open.length)} plan · kalan toplam ${money(open.reduce((s, p) => s + p.remainingAmount, 0))}`}
          defaultOpen
        >
          <ul className="-mx-2 divide-y divide-line">
            {open.map((plan) => (
              <li key={plan.id} className="px-2 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-body font-medium text-ink">
                    {plan.label}{' '}
                    <small className="ml-1.5 text-label font-normal text-faint">({plan.bank})</small>
                  </span>
                  <span className="num shrink-0 text-body font-semibold text-ink">
                    {money(plan.monthlyAmount, { decimals: true })}
                    <span className="ml-1 text-label font-normal text-faint">/ay</span>
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <AnimatedProgress value={plan.paidCount} max={plan.totalCount} tone="accent" height={6} className="flex-1" />
                  <span className="num shrink-0 text-right text-label text-faint">
                    {plan.paidCount}/{plan.totalCount} taksit · bitiş {monthLabel(plan.endMonth, true)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </FutureDisclosure>
      )}

      {/* ── Row 7: 30/60/90 Day Cashflow Simulator ────────────────────────── */}
      {hasForecast && (forecast.totalIn > 0 || forecast.hasOpeningBalance) ? (
        <FutureDisclosure
          title="30 / 60 / 90 Günlük Nakit Akışı Simülatörü"
          description="Sabit gelir, taksit ve aboneliklerine göre ileriye dönük bakiye projeksiyonu"
          defaultOpen
        >
          <ForecastSection forecast={forecast} onOpenSettings={openSettings} />
        </FutureDisclosure>
      ) : (
        <div className="bento-card">
          <Section title="Nakit Akışı Simülatörü (30 / 60 / 90 Gün)">
            <button
              type="button"
              onClick={openSettings}
              className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] border border-accent-border bg-accent-soft px-4 py-3 text-left transition-all duration-200 hover:brightness-105"
            >
              <span className="flex-1 text-body text-accent-text">
                Önümüzdeki 30–90 gün için nakit akışı simülasyonunu açmak üzere aylık gelir planını veya başlangıç nakdini belirle.
              </span>
              <ChevronRight size={18} className="shrink-0 text-accent" />
            </button>
          </Section>
        </div>
      )}

      {goal && <GoalSection goal={goal} />}
    </div>
  )
}

function FutureDisclosure({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string
  description?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultOpen)
  return (
    <details
      className="bento-card group"
      open={defaultOpen}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
        <h2 className="text-title font-semibold text-ink">
          {title}
          {description && (
            <span className="mt-1 block text-label font-normal text-muted">{description}</span>
          )}
        </h2>
        <ChevronDown
          size={18}
          className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      {expanded && <div className="rise-in mt-5 border-t border-line pt-5">{children}</div>}
    </details>
  )
}

function UpcomingSection({ payments }: { payments: UpcomingPayment[] }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? payments : payments.slice(0, 4)
  return (
    <div className="bento-card">
      <Section title="Yaklaşan ödemeler" description="Önümüzdeki 45 gün">
        <ul className="-mx-2 divide-y divide-line">
          {shown.map((payment, index) => (
            <li
              key={`${payment.kind}-${payment.date}-${index}`}
              className="flex min-h-[60px] items-center gap-3.5 px-2 py-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-sunken text-accent-text">
                {payment.kind === 'recurring' ? <CalendarClock size={17} /> : <Receipt size={17} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-body font-medium text-ink">{payment.label}</span>
                  <Badge tone={payment.daysUntil <= 3 ? 'warning' : 'neutral'}>
                    {payment.daysUntil === 1 ? 'yarın' : `${count(payment.daysUntil)} gün`}
                  </Badge>
                </span>
                <span className="mt-0.5 block text-label text-faint">
                  {fullDayLabel(payment.date)}
                  {payment.minimum !== null && ` · asgari ${money(payment.minimum)}`}
                </span>
              </span>
              {payment.amount !== null ? (
                <span className="num shrink-0 text-body font-semibold text-ink">
                  {money(payment.amount, { decimals: payment.kind === 'statement' })}
                </span>
              ) : (
                <span className="shrink-0 text-label text-faint">Tutar bilinmiyor</span>
              )}
            </li>
          ))}
        </ul>
        {payments.length > 4 && (
          <Button
            variant="ghost"
            className="mt-3 w-full"
            onClick={() => setShowAll((value) => !value)}
            aria-expanded={showAll}
          >
            {showAll ? 'İlk 4 ödemeyi göster' : `${count(payments.length)} ödemenin tümünü gör`}
            <ChevronDown size={16} className={clsx('transition-transform duration-200', showAll && 'rotate-180')} />
          </Button>
        )}
      </Section>
    </div>
  )
}

type Horizon = '30' | '60' | '90'

function ForecastSection({
  forecast,
  onOpenSettings,
}: {
  forecast: CashFlowForecast
  onOpenSettings: () => void
}) {
  const [horizon, setHorizon] = useState<Horizon>('30')
  const view = sliceForecast(forecast, Number(horizon))
  const negative = forecast.hasOpeningBalance ? view.lowestBalance < 0 : view.endBalance < 0

  return (
    <Section
      title="Beklenen bakiye"
      actions={
        <Segmented
          value={horizon}
          onChange={setHorizon}
          options={[
            { value: '30', label: '30 gün' },
            { value: '60', label: '60 gün' },
            { value: '90', label: '90 gün' },
          ]}
        />
      }
    >
      <p className="mb-4 max-w-xl text-body text-muted">
        {horizon} gün sonunda{' '}
        <span className={clsx('num font-semibold', view.endBalance >= 0 ? 'text-positive' : 'text-negative')}>
          {money(view.endBalance, { sign: !forecast.hasOpeningBalance })}
        </span>
        {forecast.hasOpeningBalance ? ' kalır' : ' fark oluşur'}. Beklenen gelir {money(view.totalIn)}, gider{' '}
        {money(view.totalOut)}.
      </p>

      <CashFlowChart points={view.points} height={230} negative={negative} />

      {negative && view.lowestDate && (
        <p className="mt-4 text-body text-negative">
          {fullDayLabel(view.lowestDate)} civarında {money(view.lowestBalance)} seviyesine iniyor.
        </p>
      )}

      {!forecast.hasOpeningBalance && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-4 min-h-[44px] text-left text-label font-medium text-accent-text underline-offset-4 hover:underline"
        >
          Sıfır çizgisi bugünü gösterir, bakiyeni değil. Bugünkü nakdini gir →
        </button>
      )}
    </Section>
  )
}

function GoalSection({ goal }: { goal: GoalProgress }) {
  const [showTrajectory, setShowTrajectory] = useState(true)
  const onPace = goal.status === 'ahead' || goal.status === 'reached'
  const g = goal.goal

  return (
    <div className="bento-card">
      <Section
        title="Tasarruf hedefi"
        description={`${money(g.targetAmount)} · ${monthLabel(g.targetMonth)}`}
        actions={<Badge tone={onPace ? 'positive' : 'negative'}>{GOAL_STATUS_LABEL[goal.status]}</Badge>}
      >
        <p className="mb-4 max-w-xl text-body text-muted">
          <span className="num font-semibold text-ink">{money(goal.currentActual)}</span> birikti, gereken{' '}
          <span className="num">{money(goal.requiredAtNow)}</span>.{' '}
          {goal.maxMonthlySpend !== null && (
            <>
              Bu ay en fazla{' '}
              <span className="num font-semibold text-ink">{money(goal.maxMonthlySpend)}</span> harca.
            </>
          )}
        </p>

        <details
          className="group"
          open={showTrajectory}
          onToggle={(event) => setShowTrajectory(event.currentTarget.open)}
        >
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-label font-medium text-accent-text">
            Hedefin gidişatını gör
            <ChevronDown size={15} className="transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
          </summary>
          {showTrajectory && (
            <div className="mt-3">
              <GoalTrajectoryChart points={goal.points} height={225} onPace={onPace} />
              <div className="mt-3 flex flex-wrap items-center gap-5 text-label text-muted">
                <span className="flex items-center gap-2">
                  <span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--text-faint)' }} />
                  Gereken tempo
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className="h-0.5 w-4 rounded-full"
                    style={{ background: onPace ? 'var(--positive)' : 'var(--negative)' }}
                  />
                  Gerçekleşen
                </span>
              </div>
            </div>
          )}
        </details>
      </Section>
    </div>
  )
}

const TARGET_PRESETS = [
  { label: '100.000 ₺', value: 100_000_00 },
  { label: '250.000 ₺', value: 250_000_00 },
  { label: '500.000 ₺', value: 500_000_00 },
  { label: '1.000.000 ₺', value: 1_000_000_00 },
] as const

const EXTRA_SAVINGS_PRESETS = [
  { label: '+0 ₺', value: 0 },
  { label: '+2.500 ₺', value: 2_500_00 },
  { label: '+5.000 ₺', value: 5_000_00 },
  { label: '+10.000 ₺', value: 10_000_00 },
] as const

function WhatIfScenarioBridge({
  goal,
  monthlyIncome,
  monthlySpend,
}: {
  goal: GoalProgress | null
  monthlyIncome: number
  monthlySpend: number
}) {
  const { state, dispatch } = useStore()
  const feedback = useFeedback()
  const holdings = state.profile.assets ?? []
  const snapshot = useMemo(() => cachedAssetRates(), [])
  const portfolio = useMemo(
    () => portfolioValue(holdings, snapshot?.quotes ?? {}),
    [holdings, snapshot],
  )
  const portfolioTotalMinor = portfolio.total ?? portfolio.knownValue ?? 0

  const statementDebtMinor = useMemo(
    () =>
      state.statements.reduce((sum, st) => {
        const debt = st.summary?.totalDebt ?? st.reconciliation?.printedDebt ?? 0
        return sum + Math.max(0, debt)
      }, 0),
    [state.statements],
  )

  const defaultTarget = goal?.goal.targetAmount ?? 250_000_00
  const [targetAmount, setTargetAmount] = useState<number>(defaultTarget)
  const [extraMonthlySavings, setExtraMonthlySavings] = useState<number>(5_000_00)
  const [includePortfolio, setIncludePortfolio] = useState<boolean>(portfolioTotalMinor > 0)
  const [deductCardDebt, setDeductCardDebt] = useState<boolean>(false)

  const baseSaved = goal?.currentActual ?? Math.max(0, state.profile.currentBalance)
  const currentMonthlySavings =
    goal?.averageMonthlyPaceSoFar && goal.averageMonthlyPaceSoFar > 0
      ? goal.averageMonthlyPaceSoFar
      : monthlyIncome > 0
        ? Math.max(0, monthlyIncome - monthlySpend)
        : 10_000_00

  const asOfMonth =
    state.filters.month !== 'all' ? state.filters.month : monthOf(todayKey())

  const projection = useMemo(
    () =>
      simulateWhatIf({
        targetAmount,
        baseSaved,
        baseMonthlySavings: currentMonthlySavings,
        extraMonthlySavings,
        portfolioTotalMinor,
        includePortfolio,
        statementDebtMinor,
        deductCardDebt,
        asOfMonth,
      }),
    [
      targetAmount,
      baseSaved,
      currentMonthlySavings,
      extraMonthlySavings,
      portfolioTotalMinor,
      includePortfolio,
      statementDebtMinor,
      deductCardDebt,
      asOfMonth,
    ],
  )

  const applyScenarioToGoal = () => {
    const previousGoal = state.profile.goal
    const nextTargetMonth =
      projection.simulatedTargetMonth && projection.simulatedTargetMonth > asOfMonth
        ? projection.simulatedTargetMonth
        : monthOf(todayKey())
    const nextGoal = {
      targetAmount: projection.targetAmount,
      targetMonth: nextTargetMonth,
      startMonth: previousGoal?.startMonth ?? asOfMonth,
      startingAmount: Math.max(0, projection.simulatedStartingCapital),
    }
    dispatch({ type: 'setProfile', profile: { goal: nextGoal } })
    feedback({
      message: `Hedef güncellendi: ${money(nextGoal.targetAmount)} (${monthLabel(nextGoal.targetMonth)})`,
      undo: () => dispatch({ type: 'setProfile', profile: { goal: previousGoal } }),
    })
  }

  return (
    <section
      className="bento-card space-y-5"
      aria-labelledby="whatif-bridge-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-micro font-medium uppercase text-accent-text">
            Canlı &quot;Ne Olur?&quot; (What-If) Senaryo Köprüsü · Gelecek × Varlıklar
          </span>
          <h2 id="whatif-bridge-title" className="mt-0.5 text-title font-semibold text-ink">
            Portföy, Ek Tasarruf ve Borç Kapatma Simülatörü
          </h2>
          <p className="mt-1 text-label text-muted">
            Altın/döviz varlıklarını, aylık ek tasarrufu ve kart borcunu tek denklemde birleştirerek hedef tarihinin kaç ay öne çekildiğini canlı test et.
          </p>
        </div>
        <Button size="sm" onClick={() => navigateTo('assets')}>
          <Coins size={14} /> Varlık portföyünü aç <ArrowRight size={14} />
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Controls Column */}
        <div className="min-w-0 space-y-4 lg:col-span-7">
          {/* Target Amount Picker */}
          <div className="space-y-2.5 rounded-[var(--radius)] border border-line bg-sunken p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-label font-medium text-ink">Hedef Birikim Tutarı</span>
              <strong className="num text-body font-semibold text-accent-text">
                {money(targetAmount)}
              </strong>
            </div>
            <div className="flex flex-wrap gap-2">
              {TARGET_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setTargetAmount(preset.value)}
                  aria-pressed={targetAmount === preset.value}
                  className={clsx(
                    'min-h-[44px] rounded-[var(--radius)] border px-3 text-label font-medium num transition-colors',
                    targetAmount === preset.value
                      ? 'border-accent-border bg-accent-soft text-accent-text'
                      : 'border-line bg-raised text-muted hover:text-ink',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Extra Monthly Savings Slider */}
          <div className="space-y-3 rounded-[var(--radius)] border border-line bg-sunken p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor="whatif-extra-slider" className="text-label font-medium text-ink">
                Aylık Tasarrufu Artır
              </label>
              <span className="num text-body font-semibold text-positive">
                +{money(extraMonthlySavings)} / ay
              </span>
            </div>
            <input
              id="whatif-extra-slider"
              type="range"
              min={0}
              max={50_000_00}
              step={1_000_00}
              value={extraMonthlySavings}
              onChange={(e) => setExtraMonthlySavings(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted num">
                Baz tempo: {money(currentMonthlySavings)}/ay → Yeni:{' '}
                <strong className="font-medium text-ink">{money(projection.simulatedMonthlyPace)}/ay</strong>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {EXTRA_SAVINGS_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setExtraMonthlySavings(p.value)}
                    aria-pressed={extraMonthlySavings === p.value}
                    className={clsx(
                      'min-h-[44px] rounded-lg border px-2.5 text-xs font-medium num transition-colors',
                      extraMonthlySavings === p.value
                        ? 'border-accent-border bg-accent-soft text-accent-text'
                        : 'border-line bg-raised text-muted hover:text-ink',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Assets & Card Debt Bridge Toggles */}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              role="switch"
              aria-checked={includePortfolio}
              onClick={() => setIncludePortfolio((v) => !v)}
              className={clsx(
                'flex min-h-[60px] items-center justify-between gap-3 rounded-[var(--radius)] border p-3.5 text-left transition-all',
                includePortfolio
                  ? 'border-accent-border bg-accent-soft'
                  : 'border-line bg-sunken hover:border-line-strong',
              )}
            >
              <div className="min-w-0">
                <span className="block text-label font-medium text-ink">
                  Varlık Portföyünü Dahil Et
                </span>
                <span className="num mt-0.5 block text-xs text-muted">
                  {portfolioTotalMinor > 0
                    ? `+${money(portfolioTotalMinor)} (${count(holdings.length)} kalem)`
                    : 'Portföyde kayıtlı varlık yok'}
                </span>
              </div>
              <Badge tone={includePortfolio ? 'accent' : 'neutral'}>
                {includePortfolio ? 'Dahil' : 'Hariç'}
              </Badge>
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={deductCardDebt}
              onClick={() => setDeductCardDebt((v) => !v)}
              className={clsx(
                'flex min-h-[60px] items-center justify-between gap-3 rounded-[var(--radius)] border p-3.5 text-left transition-all',
                deductCardDebt
                  ? 'border-warning/40 bg-warning-soft'
                  : 'border-line bg-sunken hover:border-line-strong',
              )}
            >
              <div className="min-w-0">
                <span className="block text-label font-medium text-ink">
                  Kart Borcunu Bu Ay Kapat
                </span>
                <span className="num mt-0.5 block text-xs text-muted">
                  {statementDebtMinor > 0
                    ? `−${money(statementDebtMinor)} ekstre borcu`
                    : 'Kayıtlı ekstre borcu yok'}
                </span>
              </div>
              <Badge tone={deductCardDebt ? 'warning' : 'neutral'}>
                {deductCardDebt ? 'Düşüldü' : 'Hariç'}
              </Badge>
            </button>
          </div>
        </div>

        {/* Live Outcome Column */}
        <div className="flex min-w-0 flex-col justify-between rounded-[var(--radius-lg)] border border-accent-border bg-sunken p-4 sm:p-5 lg:col-span-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-micro font-medium uppercase text-faint">
                  Simülasyon Sonucu
                </span>
                <div className="mt-1 text-display font-bold text-ink num">
                  {projection.simulatedMonthsToTarget === 0
                    ? 'Hedefe Ulaşıldı!'
                    : projection.simulatedMonthsToTarget !== null
                      ? `${count(projection.simulatedMonthsToTarget)} ay`
                      : 'Tasarruf gerekli'}
                </div>
                {projection.simulatedTargetMonth && (
                  <span className="mt-0.5 block text-label text-muted">
                    Tahmini tamamlanma:{' '}
                    <strong className="font-medium text-ink">
                      {monthLabel(projection.simulatedTargetMonth)}
                    </strong>
                  </span>
                )}
              </div>

              {projection.monthsSaved !== null && projection.monthsSaved > 0 && (
                <Badge tone="positive">
                  {count(projection.monthsSaved)} ay daha erken
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-label">
                <span className="text-muted">Simüle başlangıç sermayesi</span>
                <strong className="num font-semibold text-ink">
                  {money(projection.simulatedStartingCapital)} (%{projection.coverageRatioPct})
                </strong>
              </div>
              <AnimatedProgress
                value={projection.coverageRatioPct}
                max={100}
                tone="accent"
                height={7}
              />
            </div>

            <dl className="grid grid-cols-1 gap-3 border-t border-line pt-3.5 min-[380px]:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs text-faint">Mevcut Tempoyla Süre</dt>
                <dd className="num mt-0.5 text-body font-medium text-muted">
                  {projection.baselineMonthsToTarget !== null
                    ? `${count(projection.baselineMonthsToTarget)} ay`
                    : '—'}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-faint">12 Ay Sonu Tahmini Servet</dt>
                <dd className="num mt-0.5 break-words text-body font-semibold text-positive">
                  <MoneyValue value={projection.twelveMonthProjectedWealth} decimals={false} />
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <Button
              size="sm"
              variant="primary"
              className="w-full whitespace-normal text-center"
              onClick={applyScenarioToGoal}
            >
              <Check size={15} className="shrink-0" /> Bu senaryoyu tasarruf hedefi olarak kaydet
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
