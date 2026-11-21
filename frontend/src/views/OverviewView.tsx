import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ArrowRight, Check, ChevronDown, CreditCard, Plus, ShieldCheck, Upload, Wallet, X } from 'lucide-react'
import { useSheets } from '../app/sheets'
import { cardDisplayName } from '../domain/cards'
import { money2 } from '../core/money'
import { SpendingPulse } from '../ui/SpendingPulse'
import { MoneyValue } from '../ui/MoneyValue'
import { TransactionItem } from '../ui/TransactionItem'
import { useTransactionDelete } from '../ui/useTransactionDelete'
import { BudgetRibbon } from '../ui/BudgetRibbon'
import { Modal } from '../ui/Modal'
import { FindingsSheet } from './FindingsSheet'
import { useOverviewModel } from './useOverviewModel'
import type { ViewId } from '../app/navigation'

export function OverviewView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const sheets = useSheets()
  const remove = useTransactionDelete()
  const { state, demo, setDemo, sampleRows, rows, current, profile, spend, income, scopedBudget, limit, period, recent, unknown, mismatches, upcoming, methods } = useOverviewModel()
  const [detail, setDetail] = useState<'categories' | 'sources' | 'findings' | 'demo-records' | null>(null)
  const startReal = () => { setDemo(false); setDetail(null); sheets.openEntry() }
  const showTransactions = () => demo ? setDetail('demo-records') : sheets.openTransactions()
  const setup = [
    { label: 'Kartını ekle', done: Boolean(state.profile.cards?.length), action: sheets.openCards },
    { label: 'Gelirini kaydet', done: income > 0, action: sheets.openIncomeEntry },
    { label: 'İlk giderini ekle', done: rows.some(tx => tx.kind === 'expense'), action: sheets.openEntry },
    { label: 'Aylık limitini belirle', done: profile.spendingLimit > 0, action: sheets.openBudgets },
  ]

  return (
    <div className="mizan-dashboard">
      <header className="dashboard-title">
        <div><h1>Ayın dengesi.</h1><p>{demo ? 'Örnek bir ay. Mizan’ı deneyimle.' : 'Paranın nereye gittiğini bil. Önünü daha net gör.'}</p></div>
        <div className="dashboard-header-actions"><button className="quiet-button" onClick={sheets.openCards}><CreditCard size={16} /> Kartlarım</button><button className="quiet-button" onClick={() => sheets.openImport()}><Upload size={16} /> Ekstre ekle</button></div>
      </header>
      {demo && <div className="demo-banner" role="status">
        <p><strong>Örnek bütçeyi keşfediyorsun.</strong> Bu veriler hesabına kaydedilmez.</p>
        <button onClick={startReal}>Kendi bütçeme başla <ArrowRight size={16} /></button>
        <button onClick={() => setDemo(false)} aria-label="Örnek görünümü kapat"><X size={18} /></button>
      </div>}
      {!demo && mismatches.length > 0 && <div className="reconciliation-alert" role="alert"><strong>{mismatches.length} ekstre kontrol bekliyor.</strong><button className="text-button" onClick={() => sheets.openStatement(mismatches[0].statement.id)}>Farkı incele <ArrowRight size={15} /></button></div>}
      <div className="mizan-summary-grid">
        <section className="mizan-balance" aria-labelledby="balance-title">
          <div className="mizan-panel-heading"><h2 id="balance-title">Gelirden kalan</h2><span className="period-badge">{period}</span></div>
          <div className={`mizan-balance-value ${income && income < spend ? 'text-negative' : ''}`}>{income ? <MoneyValue value={income - spend} /> : <span className="num">—</span>}</div>
          <p className="balance-caption">{income ? 'Kaydedilen gelir eksi net gider. Banka bakiyesi değildir.' : 'Gelirini eklediğinde ayın dengesi burada görünür.'}</p>
          <div className="mizan-flow-pair">
            <button onClick={sheets.openIncomeEntry}><span className="flow-icon income"><ArrowDownLeft size={18} /></span><span><small>Kaydedilen gelir</small><strong>{income ? <MoneyValue value={income} /> : 'Gelir ekle'}</strong></span><ArrowUpRight className="flow-link" size={16} /></button>
            <button onClick={() => setDetail('sources')}><span className="flow-icon expense"><ArrowUpRight size={18} /></span><span><small>Net gider</small><strong><MoneyValue value={spend} /></strong></span><ArrowUpRight className="flow-link" size={16} /></button>
          </div>
          <div className="mizan-entry-actions"><button className="primary-button" onClick={sheets.openEntry}><Plus size={18} /> Gider ekle</button><button className="quiet-button" onClick={sheets.openIncomeEntry}><ArrowDownLeft size={18} /> Gelir ekle</button></div>
        </section>
        <BudgetRibbon limit={limit} spend={spend} scoped={scopedBudget} onEdit={sheets.openBudgets} />
      </div>
      <div className="mizan-work-grid">
        <section className="mizan-panel mizan-chart-panel"><SpendingPulse daily={rows.some(tx => tx.kind === 'expense' || tx.kind === 'refund') ? current.daily : []} /><div className="pulse-footer"><span>Yalnızca kaydedilen hareketler.</span><button className="text-button" onClick={() => demo ? setDetail('categories') : onNavigate('analysis')}>Analizi aç <ArrowUpRight size={15} /></button></div></section>
        <section className="mizan-panel mizan-categories">
          <div className="mizan-panel-heading"><h2>Harcama dağılımı</h2><button className="text-button" onClick={() => setDetail('categories')} aria-label="Tüm harcama kategorilerini gör"><ArrowUpRight size={19} /></button></div>
          {current.categories.length ? <>
            <div className="category-spectrum" aria-hidden="true">{current.categories.map(cat => <span key={cat.id} style={{ flex: Math.max(0, cat.share), background: cat.color }} />)}</div>
            <div className="mizan-category-list">{current.categories.slice(0, 4).map(cat => <button key={cat.id} onClick={() => demo ? setDetail('categories') : sheets.openTransactions({ category: cat.id })}><span className="category-color" style={{ background: cat.color }} /><span>{cat.label}<small>{Math.round(cat.share * 100)}% pay</small></span><strong className="num">{money2(cat.total)}</strong></button>)}</div>
          </> : <div className="mizan-empty-categories"><div className="empty-spectrum" aria-hidden="true"><span /><span /><span /></div><h3>Her harcama bir ipucu.</h3><p>İlk giderini ekle. Kategorilerin ve dağılımın burada oluşsun.</p><button className="text-button" onClick={startReal}>Gider ekle <ArrowRight size={16} /></button></div>}
        </section>
        <section className="mizan-panel mizan-recent">
          <div className="mizan-panel-heading"><h2>Son hareketler</h2><button className="text-button" onClick={showTransactions}>Tümünü gör <ArrowRight size={15} /></button></div>
          {recent.length ? <ul>{recent.map(tx => <li key={tx.id}><TransactionItem transaction={tx} onOpen={showTransactions} onDelete={demo ? undefined : () => remove(tx)} /></li>)}</ul> : <div className="mizan-empty-records"><span className="empty-record-icon"><Wallet size={24} strokeWidth={1.5} /></span><div><h3>Küçük bir kayıt, net bir başlangıç.</h3><p>Kahve, market veya kira. İlk hareketini ekle.</p></div><button className="mizan-icon-button" onClick={startReal} aria-label="İlk kaydını ekle"><Plus size={21} /></button></div>}
        </section>
        <section className="mizan-panel mizan-cards">
          <div className="mizan-panel-heading"><h2>Kart takvimin</h2><button className="text-button" onClick={sheets.openCards}>{upcoming.length ? 'Yönet' : 'Kart ekle'} <Plus size={15} /></button></div>
          {!demo && upcoming.length ? <ul>{upcoming.map(({ card, date }) => <li key={card.id}><span className="calendar-date"><strong>{date.getDate()}</strong><span>{date.toLocaleDateString('tr-TR', { month: 'short' })}</span></span><div><strong>{cardDisplayName(card)}</strong><span>Ekstre kesimi · giriş günü {card.entryDay}</span></div></li>)}</ul> : <div className="mizan-card-empty"><CreditCard size={30} strokeWidth={1.4} /><div><h3>{demo ? 'Kartların için bir yer.' : 'Tarihleri aklında tutma.'}</h3><p>{demo ? 'Kendi kartını eklediğinde kesim gününü burada gör.' : 'Kartını ekle, ekstre kesim gününü buradan takip et.'}</p></div></div>}
        </section>
      </div>
      {!demo && setup.some(item => !item.done) && <section className="mizan-setup" aria-labelledby="setup-heading"><div><h2 id="setup-heading">Mizan’ı kendine göre kur.</h2><p>İhtiyacın olan adımla başla. Hepsi senin hızında.</p></div><div className="mizan-setup-steps">{setup.map(item => <button key={item.label} onClick={item.action}><span className={item.done ? 'is-done' : ''}>{item.done ? <Check size={14} /> : <Plus size={14} />}</span>{item.label}</button>)}</div></section>}
      <div className="mizan-bottom-links">
        {!demo && <button className="text-button" onClick={() => setDemo(true)}>Örnek bir bütçede dene <ArrowRight size={16} /></button>}
        {rows.length > 0 && <button className="text-button" onClick={() => setDetail(demo ? 'categories' : 'findings')}>{current.insights.length ? `${current.insights.length} bütçe bulgusunu incele` : 'Bütçene yakından bak'} <ArrowUpRight size={16} /></button>}
      </div>
      <details className="trust-details"><summary><ShieldCheck size={15} /><span>Hesaplama ve verilerin hakkında</span><ChevronDown size={14} /></summary><div><p>Takvim ayı işlem tarihini esas alır. Eski tarihli taksitler ekstre kesim tarihinde sayılır. Kart borcu ödemeleri tekrar gider sayılmaz. Ekstre mutabakatı belgenin tamamında ayrıca yapılır.</p><div><button className="text-button" onClick={sheets.openArchive}>Ekstreler ve yedekler <ArrowRight size={14} /></button><button className="text-button" onClick={sheets.openRewards}>Bonus ve puanlar <ArrowRight size={14} /></button><button className="text-button" onClick={sheets.openIncome}>Sabit gelir ve giderler <ArrowRight size={14} /></button></div></div></details>
      <Modal
        open={detail === 'sources'}
        onClose={() => setDetail(null)}
        title="Harcamanın kaynakları"
        description={`${period} · net harcama`}
      >
        <div className="source-breakdown">
          {methods.map(({ label, value }) => (
            <div key={label}>
              <Wallet size={19} />
              <span>{label}</span>
              <strong className="num">{money2(value)}</strong>
            </div>
          ))}
          <div>
            <Wallet size={19} />
            <strong>Toplam</strong>
            <strong className="num">{money2(spend)}</strong>
          </div>
        </div>
        <p className="text-label text-muted">
          İadeler düşülür; kart borcu ödemeleri bu toplama eklenmez.
        </p>
      </Modal>
      <Modal
        open={detail === 'categories'}
        onClose={() => setDetail(null)}
        title="Harcamanın dağılımı"
        description={demo ? 'Örnek bütçe · gerçek verilerin değil' : period}
      >
        <div className="expanded-categories">
          {current.categories.map((cat) => (
            <button
              className="category-preview-row"
              key={cat.id}
              onClick={() => {
                setDetail(null)
                demo
                  ? setDetail('demo-records')
                  : sheets.openTransactions({ category: cat.id })
              }}
            >
              <span
                className="category-color"
                style={{ background: cat.color }}
              />
              <span>{cat.label}</span>
              <strong className="num">{money2(cat.total)}</strong>
              <ArrowUpRight size={15} />
            </button>
          ))}
        </div>
        {!current.categories.length && (
          <p className="text-body text-muted">Bu dönemde gider kaydı yok.</p>
        )}
        {current.totals.unallocatedRefunds > 0 && (
          <p className="num text-label text-muted">
            Kategori dışı iade: −{money2(current.totals.unallocatedRefunds)}
          </p>
        )}
        {unknown.length > 0 && !demo && (
          <button
            className="text-button"
            onClick={() => {
              setDetail(null)
              sheets.openTransactions({ category: 'other' })
            }}
          >
            {unknown.length} kaydın kategorisini gözden geçir{' '}
            <ArrowRight size={14} />
          </button>
        )}
      </Modal>
      <FindingsSheet
        open={detail === 'findings'}
        onClose={() => setDetail(null)}
        analysis={current}
      />
      <Modal
        open={detail === 'demo-records'}
        onClose={() => setDetail(null)}
        title="Örnek hareketler"
        description="Yalnızca keşif için. Bu veriler kaydedilmez."
      >
        <div>
          {sampleRows.map((tx) => (
            <div className="compact-transaction" key={tx.id}>
              <span>{tx.description}</span>
              <strong className="num">{money2(tx.amount)}</strong>
            </div>
          ))}
        </div>
        <button className="primary-button" onClick={startReal}>
          Kendi bütçeme başla <ArrowRight size={16} />
        </button>
      </Modal>
    </div>
  )
}
