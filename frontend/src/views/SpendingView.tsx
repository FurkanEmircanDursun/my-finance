import { useState } from 'react'
import { Badge, Empty, Meter, Section, Segmented } from '../ui/primitives'
import { CategoryDonut, MonthlyFlowChart, WeekdayChart } from '../ui/charts'
import { NatureSplit, TrendPill } from '../ui/finance'
import { money, count, percent } from '../core/money'
import { fullDayLabel, monthLabel } from '../core/date'
import { categoryLabel, NATURE_LABEL, type CategoryId } from '../domain/categories'
import type { Analysis } from '../analytics/types'
import type { Profile } from '../domain/types'

/**
 * Everything about where the money went, on one scrollable page.
 *
 * Cash flow and categories used to be separate tabs, which forced the reader to
 * hold one page in their head while looking at the other — the monthly total
 * and the category that caused it belong side by side.
 */
export function SpendingView({ analysis, profile }: { analysis: Analysis; profile: Profile }) {
  const [active, setActive] = useState<CategoryId | null>(null)
  const [sort, setSort] = useState<'total' | 'count' | 'median'>('total')

  const { totals, categories, natures, merchants, monthly, weekday, trend, habits, meta } = analysis

  if (!meta.transactionCount) {
    return <Empty title="Bu dönemde işlem yok" description="Dönem veya arama kriterlerini genişletin." />
  }

  const limit = profile.spendingLimit
  const latest = monthly[monthly.length - 1]
  const merchantRows = (active ? merchants.filter((m) => m.category === active) : merchants)
    .slice()
    .sort((a, b) =>
      sort === 'count' ? b.count - a.count : sort === 'median' ? b.median - a.median : b.total - a.total,
    )
    .slice(0, 20)

  return (
    <div className="space-y-4">
      {/* ── Totals ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Figure
          label="Gelir"
          value={money(totals.incomeBasis)}
          foot={
            totals.incomeAssumed
              ? `${meta.monthsEquivalent} aylık varsayılan gelir`
              : totals.income > 0
                ? 'ekstredeki gelir satırları'
                : "Ayarlar'dan aylık gelir girin"
          }
          tone={totals.incomeBasis > 0 ? 'positive' : undefined}
        />
        <Figure label="Brüt harcama" value={money(totals.spend)} foot={`${count(meta.spendCount)} işlem`} />
        <Figure
          label="İadeler"
          value={money(totals.refunds)}
          foot={totals.spend ? `brütün ${percent((totals.refunds / totals.spend) * 100)}'i` : undefined}
          tone={totals.refunds > 0 ? 'positive' : undefined}
        />
        <Figure label="Net harcama" value={money(totals.netSpend)} foot="brüt − iade" strong />
        <Figure
          label="Net durum"
          value={money(totals.savings, { sign: true })}
          foot="gelir − net harcama"
          tone={totals.savings >= 0 ? 'positive' : 'negative'}
          strong
        />
        <Figure
          label="Kart borcu ödemesi"
          value={money(totals.payments)}
          foot="harcama değil, nakit hareketi"
        />
      </div>

      {/* ── Month by month ───────────────────────────────────────────────── */}
      <Section
        title="Gelir ve harcama"
        description="Soluk sütunlar kısmi dönemleri gösterir"
        actions={<TrendPill value={trend.momPct} suffix="son iki tam ay" />}
      >
        <MonthlyFlowChart data={monthly} height={200} showIncome />
        {monthly.some((m) => m.income > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-4 text-2xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--accent)' }} />
              Harcama
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--positive)' }} />
              Gelir
            </span>
          </div>
        )}

        {limit > 0 && latest && (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-2xs text-muted">{monthLabel(latest.month)} · aylık limit takibi</span>
              <span className="num text-2xs text-muted">
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
      </Section>

      {/* ── Categories ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Section title="Dağılım" description={`${categories.length} kategori`}>
          <div className="space-y-4">
            <CategoryDonut
              data={categories.map((c) => ({ id: c.id, label: c.label, value: c.total, color: c.color }))}
              activeId={active}
              onSelect={(id) => setActive((prev) => (prev === id ? (null as null) : (id as CategoryId)))}
              height={190}
            />
            <NatureSplit natures={natures} />
          </div>
        </Section>

        <Section
          title="Kategoriler"
          description="Satıra tıklayınca aşağıdaki işyeri listesi filtrelenir"
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line text-2xs text-faint">
                  <th className="px-4 py-2.5 font-medium">Kategori</th>
                  <th className="px-4 py-2.5 text-right font-medium">Toplam</th>
                  <th className="px-4 py-2.5 text-right font-medium">Pay</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Tipik</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Aylık ort.</th>
                  <th className="px-4 py-2.5 text-right font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((stat) => (
                  <tr
                    key={stat.id}
                    onClick={() => setActive((prev) => (prev === stat.id ? null : stat.id))}
                    className={`cursor-pointer border-b border-line last:border-b-0 hover:bg-hover ${
                      active === stat.id ? 'bg-hover' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stat.color }} />
                        <span className="text-2xs font-medium text-ink">{stat.label}</span>
                        <span className="text-2xs text-faint">{NATURE_LABEL[stat.nature]}</span>
                      </span>
                    </td>
                    <td className="num px-4 py-2.5 text-right text-2xs font-medium text-ink">
                      {money(stat.total)}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-2xs text-muted">
                      {percent(stat.share * 100)}
                    </td>
                    <td className="num hidden px-4 py-2.5 text-right text-2xs text-muted sm:table-cell">
                      {money(stat.median)}
                    </td>
                    <td className="num hidden px-4 py-2.5 text-right text-2xs text-muted md:table-cell">
                      {money(stat.monthlyAverage)}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-2xs text-muted">{count(stat.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* ── Movers ───────────────────────────────────────────────────────── */}
      {trend.movers.length > 0 && (
        <Section title="Aylar arası değişim" description="Son iki dönemin karşılaştırması">
          <div className="grid gap-3 sm:grid-cols-2">
            <MoverColumn title="Artanlar" movers={trend.movers.filter((m) => m.delta > 0).slice(0, 5)} />
            <MoverColumn
              title="Azalanlar"
              movers={[...trend.movers].reverse().filter((m) => m.delta < 0).slice(0, 5)}
            />
          </div>
        </Section>
      )}

      {/* ── Merchants ────────────────────────────────────────────────────── */}
      <Section
        title={active ? `İşyerleri · ${categoryLabel(active)}` : 'İşyerleri'}
        description={`${merchantRows.length} işyeri gösteriliyor`}
        actions={
          <div className="flex items-center gap-2">
            {active && (
              <button
                type="button"
                onClick={() => setActive(null)}
                className="text-2xs text-accent hover:underline"
              >
                Filtreyi kaldır
              </button>
            )}
            <Segmented
              value={sort}
              onChange={setSort}
              options={[
                { value: 'total', label: 'Tutar' },
                { value: 'count', label: 'Sıklık' },
                { value: 'median', label: 'Tipik' },
              ]}
            />
          </div>
        }
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-2xs text-faint">
                <th className="px-4 py-2.5 font-medium">İşyeri</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Kategori</th>
                <th className="px-4 py-2.5 text-right font-medium">Toplam</th>
                <th className="px-4 py-2.5 text-right font-medium">İşlem</th>
                <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Tipik</th>
                <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">Son</th>
              </tr>
            </thead>
            <tbody>
              {merchantRows.map((merchant) => (
                <tr key={merchant.merchant} className="border-b border-line last:border-b-0 hover:bg-hover">
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-2xs font-medium text-ink">
                    {merchant.label}
                  </td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <Badge>{categoryLabel(merchant.category)}</Badge>
                  </td>
                  <td className="num px-4 py-2.5 text-right text-2xs font-medium text-ink">
                    {money(merchant.total)}
                  </td>
                  <td className="num px-4 py-2.5 text-right text-2xs text-muted">{count(merchant.count)}</td>
                  <td className="num hidden px-4 py-2.5 text-right text-2xs text-muted sm:table-cell">
                    {money(merchant.median)}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right text-2xs text-faint lg:table-cell">
                    {fullDayLabel(merchant.lastSeen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Habits and rhythm ────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {habits.length > 0 && (
          <Section
            title="Küçük ama sık"
            description="Tek tek küçük, yıllık toplamı büyük harcamalar"
            padded={false}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-line text-2xs text-faint">
                    <th className="px-4 py-2.5 font-medium">İşyeri</th>
                    <th className="px-4 py-2.5 text-right font-medium">Tipik</th>
                    <th className="px-4 py-2.5 text-right font-medium">Ayda</th>
                    <th className="px-4 py-2.5 text-right font-medium">Yıllık</th>
                  </tr>
                </thead>
                <tbody>
                  {habits.slice(0, 8).map((habit) => (
                    <tr key={habit.merchant} className="border-b border-line last:border-b-0 hover:bg-hover">
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-2xs font-medium text-ink">
                        {habit.label}
                      </td>
                      <td className="num px-4 py-2.5 text-right text-2xs text-muted">
                        {money(habit.medianAmount)}
                      </td>
                      <td className="num px-4 py-2.5 text-right text-2xs text-muted">{habit.perMonth}</td>
                      <td className="num px-4 py-2.5 text-right text-2xs font-medium text-ink">
                        {money(habit.annualProjection)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <Section title="Haftalık ritim" description="Hangi günler daha çok harcanıyor">
          <WeekdayChart data={weekday} height={170} />
        </Section>
      </div>

      {/* ── Method note ──────────────────────────────────────────────────── */}
      <Section title="Dönem istatistikleri">
        <div className="grid gap-3 sm:grid-cols-2">
          <dl className="space-y-2.5">
            <Row label="Günlük ortalama" value={money(trend.averageDailySpend)} />
            <Row
              label="Aylık ortalama"
              value={money(Math.round(totals.netSpend / Math.max(meta.monthsEquivalent, 1)))}
            />
            <Row
              label="Kapsanan dönem"
              value={`${count(meta.coveredDays || meta.days)} gün · ${meta.monthsEquivalent} ay`}
            />
            <Row label="Sınıflandırma" value={percent(meta.classifiedShare * 100)} />
          </dl>
          <p className="text-2xs leading-relaxed text-faint">
            Aylık eğim {money(trend.slopePerMonth)} (R² {trend.trendFit}). R² 0,5'in üzerindeyse gerçek bir
            eğilimden, altındaysa dalgalanmadan söz edilir. Yoğunlaşma endeksi {analysis.merchantConcentration}
            : 0 harcamanın çok sayıda işyerine dağıldığını, 1 tek işyerinde toplandığını gösterir.
          </p>
        </div>
      </Section>
    </div>
  )
}

function Figure({
  label,
  value,
  foot,
  tone,
  strong,
}: {
  label: string
  value: string
  foot?: string
  tone?: 'positive' | 'negative'
  strong?: boolean
}) {
  return (
    <div className="surface p-4">
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p
        className={`num mt-2 text-xl font-semibold leading-none tracking-tight ${
          tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink'
        } ${strong ? 'text-[26px]' : ''}`}
      >
        {value}
      </p>
      {foot && <p className="mt-1.5 text-2xs text-muted">{foot}</p>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-2xs text-muted">{label}</dt>
      <dd className="num text-2xs font-medium text-ink">{value}</dd>
    </div>
  )
}

function MoverColumn({ title, movers }: { title: string; movers: Analysis['trend']['movers'] }) {
  return (
    <div className="rounded border border-line bg-sunken p-3">
      <p className="mb-2 text-2xs font-medium text-muted">{title}</p>
      {movers.length === 0 ? (
        <p className="text-2xs text-faint">Kayda değer değişim yok.</p>
      ) : (
        <ul className="space-y-2">
          {movers.map((mover) => (
            <li key={mover.id} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: mover.color }} />
              <span className="min-w-0 flex-1 truncate text-2xs text-ink">{mover.label}</span>
              <span className="num text-2xs text-muted">{money(mover.delta, { sign: true })}</span>
              <TrendPill value={mover.deltaPct} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
