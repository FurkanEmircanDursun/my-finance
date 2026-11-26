import { useMemo, useState } from 'react'
import { ArrowRight, PieChart as PieIcon, Sparkles } from 'lucide-react'
import { money2, percent } from '../core/money'
import type { CategoryId } from '../domain/categories'
import { InteractiveDonutChart, type DonutSlice } from '../ui/charts'
import { CategoryIcon } from '../ui/CategoryIcon'
import { RadialGauge } from '../ui/motion'
import { RollingNumber } from '../ui/MoneyValue'
import type { overviewSpending, spendingHabits } from './overviewSpending'

type Spending = ReturnType<typeof overviewSpending>

export function OverviewCategories({
  spending,
  privateMode,
  onCategory,
}: {
  spending: Spending
  privateMode: boolean
  onCategory: (category: CategoryId) => void
}) {
  const { categories, refunds } = spending
  const [activeId, setActiveId] = useState<string | null>(null)

  const slices = useMemo<DonutSlice[]>(
    () =>
      categories.map((item) => ({
        id: item.id,
        label: item.label,
        value: item.total,
        color: item.color,
      })),
    [categories],
  )

  const renderRows = (items: Spending['categories']) => (
    <ul className="overview-category-list">
      {items.map((item) => {
        const isActive = activeId === item.id
        return (
          <li key={item.id}>
            <button
              type="button"
              data-active={isActive || undefined}
              onMouseEnter={() => setActiveId(item.id)}
              onMouseLeave={() => setActiveId(null)}
              onClick={() => onCategory(item.id)}
              className="overview-category-row"
            >
              <span
                className="overview-category-icon"
                style={{
                  background: `${item.color}18`,
                  color: item.color,
                }}
                aria-hidden="true"
              >
                <CategoryIcon category={item.id} size={14} />
              </span>
              <span className="overview-category-name">{item.label}</span>
              <span className="num overview-category-amount">
                {privateMode ? '—' : money2(item.total)}
              </span>
              <span className="num overview-category-share">
                {privateMode ? '—' : item.share < 0.1 ? '<%0,1' : percent(item.share)}
              </span>
              {!privateMode && (
                <span className="overview-category-track" aria-hidden="true">
                  <i style={{ width: `${item.share}%`, backgroundColor: item.color }} />
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )

  return (
    <section
      className="bento-card overview-distribution"
      aria-labelledby="overview-categories"
    >
      <header className="overview-panel-heading">
        <div>
          <h2 id="overview-categories">Harcama dağılımı</h2>
          <p>Dilime dokunup incele · satırla işlemlere git</p>
        </div>
      </header>

      {categories.length ? (
        <>
          <div className="mt-3">
            <InteractiveDonutChart
              data={slices}
              height={208}
              activeId={activeId}
              onSelect={(next) => setActiveId(next)}
              totalLabel="Brüt gider"
              privateMode={privateMode}
            />
          </div>

          {renderRows(categories)}

          {!privateMode && refunds > 0 && (
            <p className="overview-note">
              İadeler net harcamadan düşülür ·{' '}
              <span className="num font-semibold text-positive">{money2(refunds)} iade</span>
            </p>
          )}
        </>
      ) : (
        <div className="mt-5 flex min-h-[180px] flex-col items-start justify-center rounded-[var(--radius)] border border-dashed border-line bg-sunken/50 p-5">
          <PieIcon size={22} className="mb-2 text-faint" />
          <p className="text-body text-muted">
            Gider kaydı eklendiğinde interaktif kategori dağılımı burada oluşur.
          </p>
        </div>
      )}
    </section>
  )
}

export interface PeriodAdvice {
  title: string
  description: string
  action?: { label: string; run: () => void }
}

export function OverviewReview({
  habit,
  advice,
  unavailable,
  privateMode,
}: {
  habit: ReturnType<typeof spendingHabits>
  advice: PeriodAdvice[]
  unavailable: string
  privateMode: boolean
}) {
  const weight = habit?.components.reduce((sum, item) => sum + item.weight, 0) ?? 0
  const scoreTone =
    !habit ? 'accent' : habit.score >= 75 ? 'safe' : habit.score >= 50 ? 'caution' : 'critical'

  return (
    <section className="overview-review" aria-label="Harcama değerlendirmesi">
      <div className="bento-card overview-habit">
        <div className="overview-panel-heading">
          <div>
            <h2>Harcama alışkanlığı puanı</h2>
            <p>Dönemdeki limit, gelir ve kategori düzeni</p>
          </div>
        </div>

        {privateMode ? (
          <p className="mt-4 text-body text-muted">Puan ve ayrıntıları gizli.</p>
        ) : habit ? (
          <>
            <div className="overview-habit-inner">
              <RadialGauge value={habit.score} max={100} size={86} strokeWidth={7} tone={scoreTone}>
                <RollingNumber value={habit.score} className="text-[1.45rem] font-bold text-ink" />
                <span className="text-[10px] font-medium uppercase text-faint">/ 100</span>
              </RadialGauge>
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-ink">
                  {habit.score >= 80
                    ? 'Güçlü finansal denge'
                    : habit.score >= 55
                      ? 'Kontrol altında, geliştirilebilir'
                      : 'Harcama temposuna dikkat'}
                </p>
                <p className="mt-1 text-label text-muted">
                  Bu dönemde kaydedilen harcamalara göre hesaplandı.
                </p>
              </div>
            </div>

            <details className="overview-data">
              <summary>Puan nasıl hesaplandı?</summary>
              <dl className="overview-components">
                {habit.components.map((item) => (
                  <div key={item.label}>
                    <dt>
                      {item.label}
                      <small>{percent((item.weight / weight) * 100, 0)} ağırlık</small>
                    </dt>
                    <dd className="num">{item.score} / 100</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 pb-2 text-label text-muted">
                Limit ve gelir bileşenleri, net harcama ilgili tutarı aşınca düşer. Kategorilendirme, brüt giderin ne kadarının sınıflandırıldığını ölçer.
              </p>
            </details>
          </>
        ) : (
          <p className="mt-4 text-body text-muted">{unavailable}</p>
        )}
      </div>

      <div className="bento-card overview-advice">
        <div className="overview-panel-heading">
          <div>
            <h2>Bu dönem için öneriler</h2>
            <p>Kayıtlarından türetilen somut adımlar</p>
          </div>
          <Sparkles size={17} className="text-accent-text" aria-hidden="true" />
        </div>

        {privateMode ? (
          <p className="mt-4 text-body text-muted">Önerilerdeki finansal ayrıntılar gizli.</p>
        ) : (
          <ul>
            {advice.map((item) => (
              <li key={item.title}>
                <div className="min-w-0">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                {item.action && (
                  <button
                    type="button"
                    className="text-button shrink-0"
                    onClick={item.action.run}
                  >
                    {item.action.label} <ArrowRight size={14} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
