import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, CreditCard, Plus, Upload, Wallet, X } from 'lucide-react'
import { useSheets } from '../app/sheets'
import { cardDisplayName } from '../domain/cards'
import { fullDayLabel } from '../core/date'
import { money2 } from '../core/money'
import { SpendingPulse } from '../ui/SpendingPulse'
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
  const { state, demo, setDemo, sampleRows, rows, current, profile, spend, income, scopedBudget, limit, period, recent, unknown, statementLedgers, upcoming, methods } = useOverviewModel()
  const [detail, setDetail] = useState<'categories' | 'sources' | 'findings' | 'demo-records' | null>(null)
  const startReal = () => { setDemo(false); setDetail(null); sheets.openEntry() }
  const showTransactions = () => demo ? setDetail('demo-records') : onNavigate('transactions')
  const cardStatements = statementLedgers.ledgers.filter(ledger => ledger.statement.bank !== 'CSV')
  const mismatches = cardStatements.filter(ledger => ledger.status === 'mismatch')
  const displayedDebt = demo ? null : state.filters.month === 'all' ? null : statementLedgers.totals.printedDebt
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

  return (
    <div className="month-overview">
      <h1>Ay Özeti</h1>
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

      <details className="month-detail">
        <summary><span>Bu ayın bütçesi ve dağılımı</span><ChevronDown size={18} /></summary>
        <div className="month-detail-body">
          <BudgetRibbon limit={limit} spend={spend} scoped={scopedBudget} onEdit={sheets.openBudgets} />
          <section className="mizan-panel mizan-chart-panel">
            <SpendingPulse daily={rows.some(tx => tx.kind === 'expense' || tx.kind === 'refund') ? current.daily : []} />
            <div className="pulse-footer"><button className="text-button" onClick={() => demo ? setDetail('categories') : onNavigate('analysis')}>Analizi aç <ArrowUpRight size={15} /></button></div>
          </section>
          <section className="mizan-panel">
            <div className="workspace-section-heading"><h2>Harcama kategorileri</h2><button className="text-button" onClick={() => setDetail('categories')}>Dağılımı gör <ArrowUpRight size={15} /></button></div>
            <div className="mizan-category-list">{current.categories.slice(0, 4).map(cat => <button key={cat.id} onClick={() => demo ? setDetail('categories') : sheets.openTransactions({ category: cat.id })}><span className="category-color" style={{ background: cat.color }} /><span>{cat.label}</span><strong className="num">{money2(cat.total)}</strong></button>)}</div>
            {!current.categories.length && <p className="workspace-empty-line">Bu dönemde gider kaydı yok.</p>}
          </section>
          {rows.length > 0 && <button className="text-button" onClick={() => setDetail(demo ? 'categories' : 'findings')}>Bütçe bulgularını gör <ArrowUpRight size={16} /></button>}
        </div>
      </details>
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
