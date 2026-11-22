import { ArrowRight } from 'lucide-react'
import { money2, percent } from '../core/money'
import type { CategoryId } from '../domain/categories'
import type { overviewSpending, spendingHabits } from './overviewSpending'

type Spending = ReturnType<typeof overviewSpending>

export function OverviewCategories({ spending, privateMode, onCategory }: {
  spending: Spending
  privateMode: boolean
  onCategory: (category: CategoryId) => void
}) {
  const { categories, gross, refunds } = spending
  const renderRows = (items: Spending['categories']) => <ul className="overview-category-list">
    {items.map(item => <li key={item.id}>
      <button type="button" onClick={() => onCategory(item.id)} className="overview-category-row">
        <span className="category-color" style={{ background: item.color }} aria-hidden="true" />
        <span>{item.label}</span>
        <span className="num">{privateMode ? '—' : money2(item.total)}</span>
        <strong className="num">{privateMode ? '—' : item.share < .1 ? '<%0,1' : percent(item.share)}</strong>
        {!privateMode && <span className="overview-category-track" aria-hidden="true"><i style={{ width: `${item.share}%`, backgroundColor: item.color }} /></span>}
      </button>
    </li>)}
  </ul>
  return <section className="overview-panel overview-distribution" aria-labelledby="overview-categories">
    <header className="overview-panel-heading">
      <div><h2 id="overview-categories">Harcama dağılımı</h2><p>Brüt gider içindeki kategori payı</p></div>
    </header>
    {categories.length ? <>
      <div className="overview-distribution-total"><span>Toplam brüt gider</span><strong className="num">{privateMode ? '—' : money2(gross)}</strong></div>
      {!privateMode && <div className="overview-distribution-strip" aria-hidden="true">
        {categories.map(item => <span key={item.id} style={{ flexGrow: item.share, backgroundColor: item.color }} />)}
      </div>}
      {renderRows(categories.slice(0, 5))}
      {categories.length > 5 && <details className="overview-data">
        <summary>Kalan kategoriler ({categories.length - 5})</summary>{renderRows(categories.slice(5))}
      </details>}
      {!privateMode && refunds > 0 && <p className="overview-note">İadeler net harcamadan düşülür. <span className="num">{money2(refunds)} iade</span></p>}
    </> : <p className="overview-placeholder">Gider kaydı eklendiğinde kategori payları burada görünür.</p>}
  </section>
}

export interface PeriodAdvice {
  title: string
  description: string
  action?: { label: string; run: () => void }
}

export function OverviewReview({ habit, advice, unavailable, privateMode }: {
  habit: ReturnType<typeof spendingHabits>
  advice: PeriodAdvice[]
  unavailable: string
  privateMode: boolean
}) {
  const weight = habit?.components.reduce((sum, item) => sum + item.weight, 0) ?? 0
  return <section className="overview-review" aria-label="Harcama değerlendirmesi">
    <div className="overview-habit">
      <h2>Harcama alışkanlığı puanı</h2>
      {privateMode ? <p>Puan ve ayrıntıları gizli.</p> : habit ? <>
        <div className="overview-habit-value"><strong className="num">{habit.score}</strong><span>/ 100</span></div>
        <p>Bu dönemde kaydedilen harcamalara göre</p>
        <details className="overview-data">
          <summary>Puan nasıl hesaplandı?</summary>
          <dl className="overview-components">
            {habit.components.map(item => <div key={item.label}>
              <dt>{item.label}<small>{percent(item.weight / weight * 100, 0)} ağırlık</small></dt>
              <dd className="num">{item.score} / 100</dd>
            </div>)}
          </dl>
          <p>Limit ve gelir bileşenleri, net harcama ilgili tutarı aşınca düşer. Kategorilendirme, brüt giderin ne kadarının bir kategoriye ayrıldığını ölçer.</p>
        </details>
      </> : <p>{unavailable}</p>}
    </div>
    <div className="overview-advice">
      <h2>Bu dönem için öneriler</h2>
      {privateMode ? <p>Önerilerdeki finansal ayrıntılar gizli.</p> : <ul>
        {advice.map(item => <li key={item.title}>
          <div><h3>{item.title}</h3><p>{item.description}</p></div>
          {item.action && <button type="button" className="text-button" onClick={item.action.run}>
            {item.action.label} <ArrowRight size={15} aria-hidden="true" />
          </button>}
        </li>)}
      </ul>}
    </div>
  </section>
}
