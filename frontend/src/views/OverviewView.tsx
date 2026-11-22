import { useState } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronRight, CreditCard, Plus, Upload, Wallet, X } from 'lucide-react'
import { useSheets } from '../app/sheets'
import { cardDisplayName } from '../domain/cards'
import { daysInMonth, fullDayLabel, monthOf } from '../core/date'
import { money2 } from '../core/money'
import { categoryLabel } from '../domain/categories'
import { OverviewDaily } from './OverviewDaily'
import { OverviewCategories, OverviewReview, type PeriodAdvice } from './OverviewReview'
import './overview.css'
import { TransactionItem } from '../ui/TransactionItem'
import { useTransactionDelete } from '../ui/useTransactionDelete'
import { BudgetRibbon } from '../ui/BudgetRibbon'
import { Modal } from '../ui/Modal'
import { FindingsSheet } from './FindingsSheet'
import { useOverviewModel } from './useOverviewModel'
import type { ViewId } from '../app/navigation'

export function OverviewView({ onNavigate, privateMode }: { onNavigate: (view: ViewId) => void; privateMode: boolean }) {
  const sheets = useSheets()
  const remove = useTransactionDelete()
  const { state, demo, setDemo, sampleRows, rows, current, profile, spend, income, scopedBudget, limit, period, recent, unknown, statementLedgers, upcoming, methods, historyReady, today, month, spending, habit, budgetOverrun } = useOverviewModel()
  const [detail, setDetail] = useState<'sources' | 'findings' | 'demo-records' | null>(null)
  const [demoSelection, setDemoSelection] = useState<{ day?: string; category?: string }>({})
  const showDemo = (filter: typeof demoSelection = {}) => { setDemoSelection(filter); setDetail('demo-records') }
  const startReal = () => { setDemo(false); setDetail(null); sheets.openEntry() }
  const showTransactions = () => demo ? showDemo() : onNavigate('transactions')
  const cardStatements = statementLedgers.ledgers.filter(ledger => ledger.statement.bank !== 'CSV')
  const mismatches = cardStatements.filter(ledger =>
    (historyReady ? ledger.status : ledger.statement.reconciliation?.status) === 'mismatch')
  const displayedDebt = demo || month === 'all' ? null : cardStatements.reduce<number | null>((sum, { printedDebt }) =>
    printedDebt === null ? sum : (sum ?? 0) + printedDebt, null)
  const showDebt = () => {
    if (!demo && cardStatements.length === 1) sheets.openStatement(cardStatements[0].statement.id)
    else sheets.openCards()
  }
  const setup = [
    { label: 'Kartını ekle', done: Boolean(state.profile.cards?.length), action: sheets.openCards },
    { label: 'Gelirini kaydet', done: income > 0, action: sheets.openIncomeEntry },
    { label: 'İlk giderini ekle', done: rows.some(tx => tx.kind === 'expense'), action: sheets.openEntry },
    { label: 'Aylık limitini belirle', done: profile.spendingLimit > 0, action: sheets.openBudgets },
  ]

  const advice: PeriodAdvice[] = []
  const addAdvice = (title: string, description: string, label?: string, run?: () => void) =>
    advice.push({ title, description, action: label && run ? { label, run } : undefined })
  const action = (run: () => void) => demo ? undefined : run
  if (spending.gross <= 0) {
    addAdvice('Kayıtlarını tamamla', 'Bir gider veya ekstre ekleyerek hangi harcamaları düzenli takip etmek istediğini belirle.', 'İşlem ekle', action(startReal))
  } else {
    if (scopedBudget && limit > 0 && spend > limit) {
      addAdvice('Aylık limit aşıldı', `Net harcaman aylık limitini ${money2(spend - limit)} aştı. Esnek giderlerden birini seçip bir sonraki alışveriş için sınır koy.`, 'Kategorileri incele', action(() => document.getElementById('overview-categories')?.scrollIntoView({ block: 'start' })))
    }
    if (scopedBudget && budgetOverrun) {
      addAdvice(`${categoryLabel(budgetOverrun.category)} limitini gözden geçir`, `Bu kategoride limitin ${money2(budgetOverrun.difference)} üzerinde harcama var. Tek seferlik giderleri düzenli olanlardan ayır.`, 'İşlemleri aç', action(() => sheets.openTransactions({ category: budgetOverrun.category })))
    }
    if (scopedBudget && income > 0 && spend > income) {
      addAdvice('Giderler kayıtlı geliri aştı', `Fark ${money2(spend - income)}. Gelir kayıtlarını kontrol et ve erteleyebileceğin giderleri belirle.`, 'Gelir ekle', action(sheets.openIncomeEntry))
    }
    if (scopedBudget && limit === 0) {
      addAdvice('Aylık bir harcama limiti belirle', 'Önce kira, fatura ve diğer zorunlu ödemeleri ayır. Kalan tutarı esnek giderler için planla.', 'Limit belirle', action(sheets.openBudgets))
    }
    if (scopedBudget && limit > spend && month !== 'all' && month === monthOf(today)) {
      const remainingDays = daysInMonth(month) - Number(today.slice(-2))
      if (remainingDays > 0) {
        addAdvice('Kalan bütçeyi günlere böl', `Ayın kalan ${remainingDays} günü için günlük ortalama alan ${money2(Math.floor((limit - Math.max(0, spend)) / remainingDays))}. Yaklaşan sabit ödemeleri önce ayır.`)
      }
    }
    if (unknown.length > 0) {
      addAdvice('Diğer kategorisini gözden geçir', `${unknown.length} gider Diğer kategorisinde. Düzenli olanları ayırmak, bütçeyi planlamayı kolaylaştırır.`, 'Kayıtları incele', action(() => sheets.openTransactions({ category: 'other' })))
    }
    if (scopedBudget && !income) {
      addAdvice('Gelirini de kaydet', 'Kaydedilen geliri giderle karşılaştırarak ay sonunda ne kadar kaldığını görebilirsin.', 'Gelir ekle', action(sheets.openIncomeEntry))
    }
    if (advice.length < 2) {
      const flexible = spending.categories.find(item => item.nature === 'want')
      if (flexible) {
        addAdvice(`${flexible.label} harcamalarını incele`, 'Tekrarlanan küçük kalemleri kontrol et. Sürdürmek istediklerin için bir kategori limiti belirleyebilirsin.', 'İşlemleri aç', action(() => sheets.openTransactions({ category: flexible.id })))
      } else if (spending.peak) {
        addAdvice('En yüksek günü incele', 'Tek seferlik büyük giderleri düzenli ödemelerden ayırarak gelecek aya daha gerçekçi bir bütçe ayırabilirsin.')
      }
    }
  }
  if (!advice.length) addAdvice('Kayıtlarını düzenli gözden geçir', 'Takip etmek istediğin harcamalar için bir ay seçerek giderlerini ve bütçeni karşılaştır.')

  return (
    <div className="month-overview">
      <header className="overview-title"><h1>Ay Özeti</h1><p>{period}</p></header>
      {demo && <div className="demo-banner" role="status">
        <p><strong>Örnek bütçe</strong> · Bu kayıtlar yalnızca denemek için.</p>
        <button onClick={startReal}>Kendi kaydını ekle <ArrowRight size={16} /></button>
        <button onClick={() => setDemo(false)} aria-label="Örnek görünümü kapat"><X size={18} /></button>
      </div>}

      <dl key={period} className="month-metrics month-changed" aria-label={period}>
        <div className="month-remainder">
          <dt>Gelirden kalan</dt>
          <dd className={income && income < spend ? 'num text-negative' : 'num'}>{income ? money2(income - spend) : '—'}</dd>
          <dd className="month-metric-note">{income ? 'Kaydedilen gelir eksi net harcama' : 'Gelir eklediğinde hesaplanır'}</dd>
        </div>
        <div>
          <dt><button type="button" onClick={sheets.openIncomeEntry}>Kaydedilen gelir <ChevronRight size={15} /></button></dt>
          <dd className="num">{income ? money2(income) : '—'}</dd>
        </div>
        <div>
          <dt><button type="button" onClick={() => setDetail('sources')}>Net harcama <ChevronRight size={15} /></button></dt>
          <dd className="num">{money2(spend)}</dd>
        </div>
        <div>
          <dt><button type="button" onClick={showDebt}>Bankanın dönem borcu <ChevronRight size={15} /></button></dt>
          <dd className="num">{displayedDebt === null ? '—' : money2(displayedDebt)}</dd>
          <dd className="month-metric-note">{displayedDebt !== null ? 'Yüklü ekstrelerden' : state.filters.month === 'all' ? 'Borç için bir ay seç' : 'Bu aya ait borç bilgisi yok'}</dd>
        </div>
      </dl>

      <div className="overview-evidence">
        <OverviewDaily key={`${demo ? 'demo' : 'account'}:${month}`} days={spending.days} peak={spending.peak} privateMode={privateMode}
          unavailable={month === 'all' ? 'Günlük harcamaları görmek için üstten bir ay seç.' : month > monthOf(today) ? 'Bu ay henüz başlamadı.' : 'Bu ay için harcama veya iade kaydı yok.'}
          onAnalysis={demo ? undefined : () => onNavigate('analysis')}
          onDay={day => demo ? showDemo({ day }) : sheets.openTransactions({ day, title: fullDayLabel(day), kinds: ['expense', 'refund'] })} />
        <OverviewCategories spending={spending} privateMode={privateMode}
          onCategory={category => demo ? showDemo({ category }) : sheets.openTransactions({ category, kinds: ['expense'] })} />
      </div>

      <OverviewReview habit={habit} advice={advice.slice(0, 3)} privateMode={privateMode}
        unavailable={!scopedBudget ? 'Puan için tek ayı ve tüm hesapları seç.' : !spending.gross ? 'Gider kaydı eklendiğinde puan hesaplanabilir.' : 'Puan için bir aylık limit veya gelir kaydı ekle.'} />

      <div className="month-work">
        <section className="month-activity" aria-labelledby="recent-heading">
          <div className="workspace-section-heading">
            <h2 id="recent-heading">Son işlemler</h2>
            {recent.length > 0 && <button className="text-button" onClick={showTransactions}>Tüm işlemler <ArrowRight size={16} /></button>}
          </div>
          {recent.length ? <ul key={period} className="month-changed">{recent.map(tx => <li key={tx.id}><TransactionItem transaction={tx} onOpen={showTransactions} onDelete={demo ? undefined : () => remove(tx)} /></li>)}</ul> : <div className="workspace-empty-line">
            <p>Bu dönemde işlem kaydı yok.</p>
            <button className="text-button" onClick={startReal}><Plus size={17} /> İlk işlemi ekle</button>
          </div>}
        </section>
        <section className="month-statements" aria-labelledby="month-statements-heading">
          <div className="workspace-section-heading"><h2 id="month-statements-heading">Kart ekstreleri</h2><button type="button" className="text-button" onClick={() => sheets.openImport()}><Upload size={16} /> Ekstre yükle</button></div>
          {!demo && mismatches.length > 0 && <div className="month-statement-note">
            <p>{mismatches.length} ekstre kontrol bekliyor.</p>
            <button type="button" className="text-button" onClick={() => sheets.openStatement(mismatches[0].statement.id)}>Farkı incele <ArrowRight size={15} /></button>
          </div>}
          {!demo && cardStatements.length > 0 ? <ul key={period} className="month-changed">
            {cardStatements.slice(0, 2).map(ledger => <li key={ledger.statement.id}>
              <button type="button" className="month-statement-row" onClick={() => sheets.openStatement(ledger.statement.id)}>
                <CreditCard size={19} aria-hidden="true" />
                <span><strong>{ledger.card}</strong><small>{ledger.statement.dueDate ? `Son ödeme ${fullDayLabel(ledger.statement.dueDate)}` : 'Son ödeme tarihi okunamadı'}</small></span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </li>)}
          </ul> : !demo && upcoming.length ? <p className="workspace-empty-line">{cardDisplayName(upcoming[0].card)} · sonraki kesim {upcoming[0].date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</p> : <p className="workspace-empty-line">Bu dönem için yüklü ekstre yok.</p>}
          <button type="button" className="text-button" onClick={sheets.openCards}>Kartlarını gör <ArrowRight size={16} /></button>
        </section>
      </div>

      <div className="overview-budget" hidden={privateMode}>
        {scopedBudget && <BudgetRibbon limit={limit} spend={spend} scoped onEdit={sheets.openBudgets} />}
        {!demo && spending.gross > 0 && <button className="text-button" onClick={() => setDetail('findings')}>Bütçe bulgularını gör <ArrowRight size={16} aria-hidden="true" /></button>}
      </div>
      {!demo && <details className="month-detail">
        <summary><span>Mizan’ı kur ve keşfet</span><ChevronDown size={18} /></summary>
        <div className="month-detail-body">
          {setup.some(item => !item.done) && <div className="mizan-setup-steps">{setup.map(item => <button key={item.label} onClick={item.action}><span className={item.done ? 'is-done' : ''}>{item.done ? <Check size={14} /> : <Plus size={14} />}</span>{item.label}</button>)}</div>}
          <div className="month-utilities">
            <button className="text-button" onClick={() => setDemo(true)}>Örnek bütçeyi dene <ArrowRight size={16} /></button>
            <button className="text-button" onClick={sheets.openIncome}>Sabit gelir ve giderler <ArrowRight size={16} /></button>
            <button className="text-button" onClick={sheets.openRewards}>Bonus ve puanlar <ArrowRight size={16} /></button>
          </div>
          <p className="text-body text-muted">Ay özeti takvim ayına göre hesaplanır. Eski tarihli taksitler ekstre kesim tarihinde sayılır. Kart borcu ödemesi harcamaya eklenmez. Gelirden kalan, banka bakiyesini göstermez.</p>
        </div>
      </details>}
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
          İadeler düşülür. Kart borcu ödemeleri bu toplama eklenmez.
        </p>
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
          {sampleRows.filter(tx => (!demoSelection.day || tx.date === demoSelection.day && tx.kind !== 'income')
            && (!demoSelection.category || tx.category === demoSelection.category && tx.kind === 'expense')).map((tx) => (
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
