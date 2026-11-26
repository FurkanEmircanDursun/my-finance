import { useState, type ReactNode } from 'react'
import { ChevronDown, Plus, Search, Upload } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Empty, Meter, Section } from '../ui/primitives'
import { MonthlyFlowChart } from '../ui/charts'
import { TrendPill } from '../ui/finance'
import { MoneyValue } from '../ui/MoneyValue'
import { AnimatedProgress, Stagger } from '../ui/motion'
import { money, money2, count, percent, signedPercent } from '../core/money'
import { BreakdownFooter } from '../ui/breakdown'
import { monthLabel } from '../core/date'
import { categoryLabel } from '../domain/categories'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'
import type { RecurringPayment } from '../analytics/types'

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
      <div>
        <h1>Harcamalar</h1>
        <p>{period} · Paranın nereye gittiğini incele</p>
      </div>
      <button type="button" className="quiet-button" onClick={() => openTransactions()}>
        <Search size={16} /> İşlem ara
      </button>
    </header>
  )

  if (!meta.transactionCount) {
    return (
      <div>
        {heading}
        <Empty
          title="Bu dönemde henüz işlem yok"
          description={
            state.transactions.length
              ? 'Başka bir ay seçebilir veya bu döneme yeni bir kayıt ekleyebilirsin.'
              : 'İlk giderini ekle ya da banka ekstreni yükle. Harcamaların burada kategorilere ayrılır.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={openEntry}>
                <Plus size={16} /> Gider ekle
              </Button>
              <Button onClick={() => openImport()}>
                <Upload size={16} /> Ekstre yükle
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {heading}

      <Stagger index={0}>
        <section className="bento-card">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="rounded-[var(--radius)] border border-line bg-sunken p-4 sm:p-5">
              <div className="text-micro font-medium uppercase text-faint">Net harcama</div>
              <div className="mt-2 text-figure font-semibold text-ink">
                <MoneyValue value={totals.netSpend} />
              </div>
            </div>

            {totals.income > 0 ? (
              <div className="rounded-[var(--radius)] border border-line bg-sunken p-4 sm:p-5">
                <div className="text-micro font-medium uppercase text-faint">Gelirden kalan</div>
                <div
                  className={clsx(
                    'mt-2 text-figure font-semibold',
                    totals.net >= 0 ? 'text-positive' : 'text-negative',
                  )}
                >
                  <MoneyValue value={totals.net} />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openIncomeEntry}
                className="rounded-[var(--radius)] border border-line bg-sunken p-4 text-left transition-all duration-200 hover:border-accent-border hover:bg-hover sm:p-5"
              >
                <div className="text-micro font-medium uppercase text-faint">Gelirden kalan</div>
                <div className="num mt-2 text-figure font-semibold text-faint">—</div>
                <div className="mt-1 text-label font-medium text-accent-text">Gelirini gir →</div>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setDetail((v) => !v)}
            aria-expanded={detail}
            className="mt-3 flex min-h-[44px] items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-label font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            Harcama hesabını gör
            <ChevronDown size={15} className={clsx('transition-transform duration-200', detail && 'rotate-180')} />
          </button>

          {detail && (
            <dl className="rise-in mt-2 space-y-1 border-t border-line pt-3">
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
      </Stagger>

      <Stagger index={1}>
        <div className="bento-card">
          <Section
            title="Kategoriler"
            description="İşlemlerini görmek veya kategorilerini değiştirmek için bir satıra dokun."
            actions={
              <Button size="sm" onClick={openBudgets}>
                Limitler
              </Button>
            }
          >
            {categories.length === 0 && (
              <Empty
                compact
                title="Kategorilere ayrılacak gider yok"
                description="Gelir ve kart borcu ödemeleri bu listeye eklenmez. İlk harcamanı kaydedebilirsin."
                action={
                  <Button onClick={openEntry}>
                    <Plus size={16} /> Gider ekle
                  </Button>
                }
              />
            )}
            <ul className="-mx-2">
              {shownCategories.map((stat) => {
                const budget = budgets.items.find((b) => b.category === stat.id)
                const denom = budget?.limit || categories[0]?.total || 1
                const barColor =
                  budget?.status === 'over'
                    ? 'var(--negative)'
                    : budget?.status === 'warning'
                      ? 'var(--warning)'
                      : stat.color
                return (
                  <li key={stat.id}>
                    <button
                      type="button"
                      onClick={() => openTransactions({ category: stat.id })}
                      className="w-full rounded-[var(--radius)] px-2.5 py-3 text-left transition-colors duration-200 hover:bg-hover"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: stat.color }}
                            aria-hidden
                          />
                          <span className="truncate text-body font-medium text-ink">{stat.label}</span>
                          {budget && budget.status !== 'ok' && (
                            <Badge tone={budget.status === 'over' ? 'negative' : 'warning'}>
                              {budget.status === 'over' ? 'Aşıldı' : 'Yaklaşıyor'}
                            </Badge>
                          )}
                        </span>
                        <span className="num shrink-0 text-body font-semibold text-ink">
                          {money2(stat.total)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-3">
                        <AnimatedProgress value={stat.total} max={denom} color={barColor} height={6} className="flex-1" />
                        <span className="num min-w-[5.5rem] max-w-[8.5rem] shrink-0 text-right text-label text-faint">
                          {budget
                            ? `/ ${money(budget.limit)}`
                            : `${percent(stat.share * 100)} · ${count(stat.count)} işlem`}
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
            {categories.length > 6 && (
              <Button
                variant="ghost"
                className="mt-3 w-full"
                onClick={() => setAllCategories((value) => !value)}
                aria-expanded={allCategories}
              >
                {allCategories ? 'İlk 6 kategoriyi göster' : `${count(categories.length)} kategorinin tümünü gör`}
                <ChevronDown size={16} className={clsx('transition-transform duration-200', allCategories && 'rotate-180')} />
              </Button>
            )}
          </Section>
        </div>
      </Stagger>

      {(monthly.length >= 2 || (limit > 0 && latest)) && (
        <SpendingDisclosure
          title={monthly.length >= 2 ? 'Aylar arası karşılaştırma' : 'Aylık harcama limiti'}
          description={
            monthly.length >= 2
              ? `${count(monthly.length)} ayın gelir, gider ve limit görünümü`
              : latest
                ? `${monthLabel(latest.month)} · ${money(latest.spend)} / ${money(limit)}`
                : undefined
          }
        >
          {monthly.length >= 2 && (
            <>
              <div className="mb-3">
                <TrendPill value={trend.momPct} suffix="son iki tam ay" />
              </div>
              <MonthlyFlowChart data={monthly} height={210} showIncome />
              <p className="mt-2 text-label text-faint">Soluk sütunlar kısmi dönemleri gösterir.</p>
            </>
          )}
          {limit > 0 && latest && (
            <div className={monthly.length >= 2 ? 'mt-5 space-y-2' : 'space-y-2'}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-label text-muted">{monthLabel(latest.month)} · aylık limit</span>
                <span className="num text-label text-muted">
                  {money(latest.spend)} / {money(limit)}
                </span>
              </div>
              <Meter
                value={latest.spend}
                max={limit}
                tone={latest.spend > limit ? 'negative' : latest.spend > limit * 0.85 ? 'warning' : 'positive'}
              />
            </div>
          )}
        </SpendingDisclosure>
      )}

      <RecurringSection
        items={overall.recurring}
        onOpen={(item) => openTransactions({ merchant: item.merchant, title: item.label, overall: true })}
      />

      {(merchants.length > 0 || habits.length > 0 || trend.movers.length > 0) && (
        <SpendingDisclosure
          title="İşyerleri ve harcama alışkanlıkları"
          description={`${count(merchants.length)} işyeri · sık ödemeler ve geçen aya göre değişimler`}
        >
          <Section title="En çok harcadığın yerler">
            <ul className="-mx-2">
              {merchants.slice(0, 8).map((merchant) => (
                <li key={merchant.merchant}>
                  <button
                    type="button"
                    onClick={() => openTransactions({ merchant: merchant.merchant, title: merchant.label })}
                    className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2.5 py-2.5 text-left transition-colors duration-200 hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-ink">{merchant.label}</span>
                      <span className="mt-0.5 block text-label text-faint">
                        {categoryLabel(merchant.category)} · {count(merchant.count)} işlem
                      </span>
                    </span>
                    <span className="num shrink-0 text-body font-semibold text-ink">
                      {money2(merchant.total)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>

          {habits.length > 0 && (
            <Section title="Küçük ama sık" description="Tek tek küçük, yıllık toplamı büyük">
              <ul className="-mx-2">
                {habits.slice(0, 5).map((habit) => (
                  <li key={habit.merchant}>
                    <button
                      type="button"
                      onClick={() => openTransactions({ merchant: habit.merchant, title: habit.label })}
                      className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2.5 py-2.5 text-left transition-colors duration-200 hover:bg-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium text-ink">{habit.label}</span>
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

          {trend.movers.length > 0 && (
            <Section title="Geçen aya göre">
              <ul className="-mx-2">
                {trend.movers.slice(0, 6).map((mover) => (
                  <li key={mover.id} className="flex min-h-[46px] flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5">
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: mover.color }} />
                      <span className="truncate text-body text-ink">{mover.label}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="num text-body text-muted">{money(mover.delta, { sign: true })}</span>
                      <TrendPill value={mover.deltaPct} />
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </SpendingDisclosure>
      )}
    </div>
  )
}

function SpendingDisclosure({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <details
      className="bento-card group"
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
      {expanded && <div className="rise-in mt-5 space-y-6 border-t border-line pt-5">{children}</div>}
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
      <dd className="num text-body font-medium text-ink">{value}</dd>
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
        <p className="text-label text-muted">
          Aktif ödemelerin yıllık karşılığı{' '}
          <strong className="num text-ink">{money(active.reduce((s, r) => s + r.annualCost, 0))}</strong>. Tüm kayıtlarından tahmin edilir.
        </p>
        {lapsed.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowLapsed((v) => !v)}>
            {showLapsed ? 'Durmuşları gizle' : `Durmuş (${lapsed.length})`}
          </Button>
        )}
      </div>
      <ul className="-mx-2">
        {rows.map((item) => {
          const rise = item.priceChangePct !== null && item.priceChangePct >= 10
          return (
            <li key={item.merchant}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2.5 py-2.5 text-left transition-colors duration-200 hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-body font-medium text-ink">{item.label}</span>
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
