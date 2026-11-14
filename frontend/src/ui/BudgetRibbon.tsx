import { ArrowUpRight, Plus } from 'lucide-react'
import { money2 } from '../core/money'
import { MoneyValue } from './MoneyValue'

export function BudgetRibbon({ limit, spend, scoped, onEdit }: {
  limit: number; spend: number; scoped: boolean; onEdit: () => void
}) {
  const used = limit ? Math.max(0, spend / limit * 100) : 0
  const over = spend > limit && limit > 0
  return <section className={`mizan-budget ${over ? 'is-over' : ''}`} aria-labelledby="budget-title">
    <div className="mizan-panel-heading"><h2 id="budget-title">Aylık harcama alanın</h2><button className="mizan-icon-button" onClick={onEdit} aria-label="Aylık harcama limitini düzenle"><ArrowUpRight size={20} /></button></div>
    {limit > 0 ? <>
      <div className="budget-remaining"><MoneyValue value={Math.abs(limit - spend)} /><span>{over ? 'limit üzerinde' : 'kullanılabilir'}</span></div>
      <div className="mizan-ribbon" role="progressbar" aria-label="Aylık limit kullanımı" aria-valuenow={Math.round(Math.min(100, used))} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`Yüzde ${Math.round(used)} kullanıldı`}>
        <span style={{ transform: `scaleX(${Math.min(1, used / 100)})` }} />
      </div>
      <div className="budget-ribbon-labels"><span className="num">%{Math.round(used)} kullanıldı</span><span className="num">{money2(limit)} limit</span></div>
      <p>{over ? 'Limitini veya bu ayın kayıtlarını gözden geçir.' : 'Her kayıtta güncellenir. Planın hep gözünün önünde.'}</p>
    </> : <>
      <p className="budget-empty-title">Kendi dengeni kur.</p>
      <p>{scoped ? 'Bir aylık limit belirle. Harcadıkça kalan alanını gör.' : 'Limitini görmek için tek ay ve tüm hesapları seç.'}</p>
      <button className="quiet-button" onClick={onEdit}><Plus size={16} /> Limit belirle</button>
    </>}
  </section>
}
