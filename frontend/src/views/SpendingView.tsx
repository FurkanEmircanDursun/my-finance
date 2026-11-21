import { useState, type ReactNode } from 'react'
import { ChevronDown, Plus, Search, Upload } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Empty, Meter, Section } from '../ui/primitives'
import { MonthlyFlowChart } from '../ui/charts'
import { TrendPill } from '../ui/finance'
import { money, money2, count, percent, signedPercent } from '../core/money'
import { BreakdownFooter } from '../ui/breakdown'
import { monthLabel } from '../core/date'
import { categoryLabel } from '../domain/categories'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'
import type { RecurringPayment } from '../analytics/types'

/**
 * Where the money went — the detail page, and the only one.
 *
 * Three screens folded into this one. Cash flow and categories were separate
 * tabs, which forced the reader to hold one page in their head while looking at
 * the other; the monthly total and the category that caused it belong side by
 * side. "Düzenli ödemeler" was a third tab holding a single table that only
 * makes sense next to the categories it explains.
 *
 * Gone with them: the donut (a second drawing of the bar list beside it, and
 * worse at comparing shares), the six-column category table (four of those
 * columns answered questions nobody had), the merchant sort control (total is
 * the answer), and two long methodology essays that explained the algorithm to
 * people who wanted to know what they spent on food.
 */
export function SpendingView() {
  const { state, analysis, overall } = useStore()
  const { openBudgets, openIncomeEntry, openTransactions, openImport, openEntry } = useSheets()
  const [detail, setDetail] = useState(false)
  const [allCategories, setAllCategories] = useState(false)

  const { totals, categories, merchants, monthly, trend, habits, meta, budgets } = analysis
  const limit = state.profile.spendingLimit
  const latest = monthly[monthly.length - 1]
  const shownCategories = allCategories ? categories : categories.slice(0, 6)
  const period = state.filters.month === 'all' ? 'Tüm dönemler' : monthLabel(state.filters.month)
  const heading = (
    <header className="dashboard-title">
      <div><h1>Harcamalar</h1><p>{period} · Paranın nereye gittiğini gör.</p></div>
      <button type="button" className="quiet-button" onClick={() => openTransactions()}><Search size={17} /> İşlem ara</button>
    </header>
  )

  if (!meta.transactionCount) {
    return <div>{heading}<Empty title="Bu dönemde henüz işlem yok" description={state.transactions.length ? 'Başka bir ay seçebilir veya bu döneme yeni bir kayıt ekleyebilirsin.' : 'İlk giderini ekle ya da Akbank veya Garanti ekstreni yükle. Harcamaların burada kategorilere ayrılır.'} action={<div className="flex flex-wrap justify-center gap-2"><Button variant="primary" onClick={openEntry}><Plus size={16} /> Gider ekle</Button><Button onClick={() => openImport()}><Upload size={16} /> Ekstre yükle</Button></div>} /></div>
  }

  return (
    <div className="space-y-10">
      {heading}
      {/* ── Two figures, and the rest folded away ────────────────────────── */}
      <section>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="surface p-5">
            <div className="num text-figure font-semibold text-ink">{money2(totals.netSpend)}</div>
            <div className="mt-2 text-body text-muted">Net harcama</div>
          </div>
          {/* "Kalan" is income minus spending. With no income on file it would read
              as −₺42.920 — the spending again, with a minus sign and a red
              colour — so until there is an income the tile asks for one. */}
          {totals.income > 0 ? (
            <div className="surface p-5">
              <div
                className={clsx(
                  'num text-figure font-semibold',
                  totals.net >= 0 ? 'text-positive' : 'text-negative',
                )}
              >
                {money2(totals.net)}
              </div>
              <div className="mt-2 text-body text-muted">Gelirden kalan</div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openIncomeEntry}
              className="surface p-5 text-left transition-colors duration-200 hover:bg-hover"
            >
              <div className="num text-figure font-semibold text-faint">—</div>
              <div className="mt-2 text-body text-muted">Gelirden kalan</div>
              <div className="mt-1 text-label text-accent">Gelirini gir</div>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDetail((v) => !v)}
          aria-expanded={detail}
          className="-ml-2 mt-3 flex h-11 items-center gap-1.5 rounded-[var(--radius)] px-2 text-body text-muted transition-colors duration-200 hover:bg-hover hover:text-ink"
        >
          Harcama hesabını gör
          <ChevronDown size={16} className={clsx('transition-transform duration-200', detail && 'rotate-180')} />
        </button>

        {detail && (
          <dl className="rise-in mt-1 space-y-1">
            <DetailRow
              label="Kaydedilen gelir"
              value={money2(totals.income)}
              note={totals.income > 0 ? 'bu dönemdeki gelir kayıtları' : 'henüz eklenmedi'}
            />
            <DetailRow label="Brüt harcama" value={money2(totals.spend)} note={`${count(meta.spendCount)} işlem`} />
            <DetailRow label="− İadeler ve indirimler" value={money2(totals.refunds)} />
            <DetailRow label="= Net harcama" value={money2(totals.netSpend)} />
            <DetailRow label="Kart borcu ödemesi" value={money2(totals.payments)} note="harcama değil" />
          </dl>
        )}
      </section>

      {/* ── Categories ───────────────────────────────────────────────────── */}
      <Section
        title="Kategoriler"
        description="İşlemlerini görmek veya kategorilerini değiştirmek için bir satıra dokun."
        actions={
          <Button size="sm" variant="ghost" onClick={openBudgets}>
            Limitler
          </Button>
        }
      >
        {categories.length === 0 && <Empty compact title="Kategorilere ayrılacak gider yok" description="Gelir ve kart borcu ödemeleri bu listeye eklenmez. İlk harcamanı kaydedebilirsin." action={<Button onClick={openEntry}><Plus size={16} /> Gider ekle</Button>} />}
        <ul className="-mx-2">
          {shownCategories.map((stat) => {
            const budget = budgets.items.find((b) => b.category === stat.id)
            return (
              <li key={stat.id}>
                <button
                  type="button"
                  onClick={() => openTransactions({ category: stat.id })}
                  className="w-full rounded-[var(--radius)] px-2 py-3 text-left transition-colors duration-200 hover:bg-hover"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: stat.color }}
                        aria-hidden
                      />
                      <span className="truncate text-body text-ink">{stat.label}</span>
                      {budget && budget.status !== 'ok' && (
                        <Badge tone={budget.status === 'over' ? 'negative' : 'warning'}>
                          {budget.status === 'over' ? 'Aşıldı' : 'Yaklaşıyor'}
                        </Badge>
                      )}
                    </span>
                    <span className="num shrink-0 text-body font-semibold text-ink">{money2(stat.total)}</span>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    {/* A category with a ceiling is measured against its ceiling;
                        one without is measured against the biggest category.
                        Same bar, two honest meanings. */}
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (stat.total / (budget?.limit || categories[0]?.total || 1)) * 100)}%`,
                          background:
                            budget?.status === 'over' ? 'var(--negative)'
                            : budget?.status === 'warning' ? 'var(--warning)'
                            : stat.color,
                        }}
                      />
                    </div>
                    <span className="num w-24 shrink-0 text-right text-label text-faint">
                      {budget ? `/ ${money(budget.limit)}` : `${percent(stat.share * 100)} · ${count(stat.count)} işlem`}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
        <BreakdownFooter
          categories={categories}
          shown={shownCategories.length}
          refundsOutside={totals.unallocatedRefunds}
          netSpend={totals.netSpend}
          onOpenRefunds={() => openTransactions({ kinds: ['refund'], title: 'İade ve indirimler' })}
        />
        {categories.length > 6 && <Button variant="ghost" className="mt-3 w-full" onClick={() => setAllCategories(value => !value)} aria-expanded={allCategories}>{allCategories ? 'İlk 6 kategoriyi göster' : `${count(categories.length)} kategorinin tümünü gör`}<ChevronDown size={16} className={clsx('transition-transform duration-200', allCategories && 'rotate-180')} /></Button>}
      </Section>

      {/* Comparison is secondary to finding the spending that caused it. */}
      {(monthly.length >= 2 || (limit > 0 && latest)) && (
        <SpendingDisclosure title={monthly.length >= 2 ? 'Aylar arası karşılaştırma' : 'Aylık harcama limiti'} description={monthly.length >= 2 ? `${count(monthly.length)} ayın gelir, gider ve limit görünümü` : latest ? `${monthLabel(latest.month)} · ${money(latest.spend)} / ${money(limit)}` : undefined}>
          {monthly.length >= 2 && <><div className="mb-3"><TrendPill value={trend.momPct} suffix="son iki tam ay" /></div><MonthlyFlowChart data={monthly} height={200} showIncome /><p className="mt-2 text-label text-faint">Soluk sütunlar kısmi dönemleri gösterir.</p></>}
          {limit > 0 && latest && <div className={monthly.length >= 2 ? 'mt-5 space-y-2' : 'space-y-2'}><div className="flex items-baseline justify-between gap-3"><span className="text-label text-muted">{monthLabel(latest.month)} · aylık limit</span><span className="num text-label text-muted">{money(latest.spend)} / {money(limit)}</span></div><Meter value={latest.spend} max={limit} tone={latest.spend > limit ? 'negative' : latest.spend > limit * 0.85 ? 'warning' : 'positive'} /></div>}
        </SpendingDisclosure>
      )}

      {/* ── Subscriptions ────────────────────────────────────────────────── */}
      {/* Read from `overall`, never the selected period: recurring detection
          needs the whole history to see a rhythm at all. */}
      <RecurringSection
        items={overall.recurring}
        onOpen={(item) => openTransactions({ merchant: item.merchant, title: item.label, overall: true })}
      />

      {/* ── Merchants ────────────────────────────────────────────────────── */}
      {(merchants.length > 0 || habits.length > 0 || trend.movers.length > 0) && <SpendingDisclosure title="İşyerleri ve harcama alışkanlıkları" description={`${count(merchants.length)} işyeri · sık ödemeler ve geçen aya göre değişimler`}>
      <Section title="En çok harcadığın yerler">
        <ul className="-mx-2">
          {merchants.slice(0, 8).map((merchant) => (
            <li key={merchant.merchant}>
              <button
                type="button"
                onClick={() => openTransactions({ merchant: merchant.merchant, title: merchant.label })}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2 py-2.5 text-left transition-colors duration-200 hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-ink">{merchant.label}</span>
                  <span className="mt-0.5 block text-label text-faint">
                    {categoryLabel(merchant.category)} · {count(merchant.count)} işlem
                  </span>
                </span>
                <span className="num shrink-0 text-body font-semibold text-ink">{money2(merchant.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Small but frequent ───────────────────────────────────────────── */}
      {habits.length > 0 && (
        <Section title="Küçük ama sık" description="Tek tek küçük, yıllık toplamı büyük">
          <ul className="-mx-2">
            {habits.slice(0, 5).map((habit) => (
              <li key={habit.merchant}>
                <button
                  type="button"
                  onClick={() => openTransactions({ merchant: habit.merchant, title: habit.label })}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2 py-2.5 text-left transition-colors duration-200 hover:bg-hover"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">{habit.label}</span>
                    <span className="mt-0.5 block text-label text-faint">
                      ayda {habit.perMonth} kez · {money(habit.medianAmount)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-body font-semibold text-ink">
                    {money(habit.annualProjection)}
                    <span className="ml-1 text-label font-normal text-faint">/yıl</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Movers ───────────────────────────────────────────────────────── */}
      {trend.movers.length > 0 && (
        <Section title="Geçen aya göre">
          <ul className="-mx-2">
            {trend.movers.slice(0, 6).map((mover) => (
              <li key={mover.id} className="flex min-h-[44px] items-center gap-3 px-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: mover.color }} />
                <span className="min-w-0 flex-1 truncate text-body text-ink">{mover.label}</span>
                <span className="num shrink-0 text-body text-muted">{money(mover.delta, { sign: true })}</span>
                <span className="w-16 shrink-0 text-right">
                  <TrendPill value={mover.deltaPct} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      </SpendingDisclosure>}
    </div>
  )
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function SpendingDisclosure({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <details className="group border-t border-line pt-2" onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-4 rounded-[var(--radius)] py-3 text-left">
        <h2 className="text-title font-semibold text-ink">{title}{description && <span className="mt-1 block text-label font-normal text-muted">{description}</span>}</h2>
        <ChevronDown size={18} className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
      </summary>
      {expanded && <div className="space-y-8 pb-3 pt-4">{children}</div>}
    </details>
  )
}

function DetailRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex min-h-[36px] items-baseline justify-between gap-3 px-2">
      <dt className="text-body text-muted">
        {label}
        {note && <span className="ml-2 text-label text-faint">{note}</span>}
      </dt>
      <dd className="num text-body text-ink">{value}</dd>
    </div>
  )
}

function RecurringSection({
  items,
  onOpen,
}: {
  items: RecurringPayment[]
  onOpen: (item: RecurringPayment) => void
}) {
  const [showLapsed, setShowLapsed] = useState(false)

  const active = items.filter((r) => r.status === 'active')
  const lapsed = items.filter((r) => r.status === 'lapsed')
  const rows = showLapsed ? [...active, ...lapsed] : active

  if (!items.length) return null

  const monthly = active.reduce((s, r) => s + r.monthlyEquivalent, 0)

  return (
    <SpendingDisclosure
      title="Düzenli ödemeler"
      description={`${count(active.length)} aktif ödeme · ayda yaklaşık ${money(monthly)}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-label text-muted">Aktif ödemelerin yıllık karşılığı {money(active.reduce((s, r) => s + r.annualCost, 0))}. Tüm kayıtlarından tahmin edilir.</p>
        {
        lapsed.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowLapsed((v) => !v)}>
            {showLapsed ? 'Durmuşları gizle' : `Durmuş (${lapsed.length})`}
          </Button>
        )
        }
      </div>
      <ul className="-mx-2">
        {rows.map((item) => {
          const rise = item.priceChangePct !== null && item.priceChangePct >= 10
          return (
            <li key={item.merchant}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2 py-2.5 text-left transition-colors duration-200 hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-body text-ink">{item.label}</span>
                    {item.status === 'lapsed' && <Badge tone="warning">Durmuş</Badge>}
                    {rise && <Badge tone="negative">{signedPercent(item.priceChangePct!)}</Badge>}
                  </span>
                  <span className="mt-0.5 block text-label text-faint">
                    {item.cadenceLabel} · yılda {money(item.annualCost)}
                  </span>
                </span>
                <span className="num shrink-0 text-body font-semibold text-ink">
                  {money(item.lastAmount, { decimals: true })}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </SpendingDisclosure>
  )
}
