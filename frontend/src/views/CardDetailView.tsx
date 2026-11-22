import { useMemo } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, Upload } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'
import { categoryLabel, CATEGORIES, type CategoryId } from '../domain/categories'
import { spendAmount } from '../domain/types'
import { fullDayLabel, monthLabel } from '../core/date'
import { money2 } from '../core/money'
import { Button, Empty } from '../ui/primitives'
import { TransactionItem } from '../ui/TransactionItem'
import { useTransactionDelete } from '../ui/useTransactionDelete'
import { CardStatementStatus, useCardPeriods } from './CardsView'
import { BankLogo } from '../ui/BankLogo'
import '../styles/cards.css'

export function CardDetailView({ cardId, onBack }: { cardId: string; onBack: () => void }) {
  const { state } = useStore()
  const sheets = useSheets()
  const remove = useTransactionDelete()
  const periods = useCardPeriods()
  const period = periods.find(item => item.id === cardId)
  const rows = period?.transactions.filter(tx => tx.kind === 'expense' || tx.kind === 'refund') ?? []
  const categories = useMemo(() => {
    const totals = new Map<CategoryId, number>()
    for (const tx of period?.transactions ?? []) if (tx.kind === 'expense' || tx.kind === 'refund') totals.set(tx.category, (totals.get(tx.category) ?? 0) + spendAmount(tx))
    return [...totals].map(([id, total]) => ({ id, total, label: categoryLabel(id), color: CATEGORIES.find(cat => cat.id === id)?.color ?? 'var(--accent)' })).sort((a, b) => b.total - a.total)
  }, [period])
  const selected = state.filters.month
  const month = selected === 'all' ? 'Tüm dönemler' : monthLabel(selected)

  return <div className="card-detail-page">
    <button type="button" className="card-back-button" onClick={onBack}><ArrowLeft size={18} /> Kartlara dön</button>
    {!period ? <Empty title="Kart bu dönemde görünmüyor" description="Kart kaldırılmış olabilir veya bu ay için kayıt bulunmayabilir. Başka bir dönem seçebilir ya da kartlarına dönebilirsin." action={<Button onClick={onBack}>Kartlarım</Button>} /> : <>
      <header className="dashboard-title card-context-heading">
        <div className="card-context-title"><BankLogo bank={period.card?.bank ?? period.bank} /><div><h1>{period.name}</h1><p>{period.bank} · {month}</p></div></div>
        <Button onClick={() => sheets.openImport(period.card && !period.archived && period.card.bank !== 'other' ? period.card.id : period.statements.length ? period.id : undefined)}><Upload size={17} /> Ekstre yükle</Button>
      </header>
      {period.statements.length > 0 && <section className="card-detail-documents"><h2>Ekstreler</h2><ul>{[...period.statements].sort((a, b) => (b.periodEnd ?? '').localeCompare(a.periodEnd ?? '')).map(statement => {
        const debt = statement.summary?.totalDebt ?? statement.reconciliation?.printedDebt ?? null
        return <li key={statement.id}><button type="button" className="card-document-link" onClick={() => sheets.openStatement(statement.id)}>
          <span>{statement.periodEnd ? fullDayLabel(statement.periodEnd) : statement.label}<small>{statement.dueDate ? `Son ödeme ${fullDayLabel(statement.dueDate)}` : 'Son ödeme tarihi okunamadı'}</small></span>
          <span><strong className="num">{debt === null ? '—' : money2(debt)}</strong><small>Bankanın dönem borcu</small></span>
          <ChevronRight size={17} aria-label="Ekstreyi aç" />
        </button></li>
      })}</ul></section>}
      <section className="card-detail-summary" aria-label="Kartın seçili dönem özeti"><div><span>Takvim ayındaki net harcama</span><strong className="num">{money2(period.netSpend)}</strong><p>{rows.length} harcama ve iade kaydı.</p></div><div><CardStatementStatus period={period} />{period.cutoff && <p>Ekstre kesimi {fullDayLabel(period.cutoff)}</p>}</div></section>
      <section className="card-detail-records"><div className="mizan-panel-heading"><h2>{month} hareketleri</h2><span>{rows.length} kayıt</span></div>{rows.length ? <ul>{rows.map(tx => <li key={tx.id}><TransactionItem transaction={tx} onDelete={() => remove(tx)} /></li>)}</ul> : <Empty compact title="Bu kartta bu dönem harcama kaydı yok" description="Bir ekstre yüklediğinde bu karta ait harcamalar ve kategorileri burada görünür." action={<Button onClick={() => sheets.openImport(period.card && !period.archived ? period.card.id : undefined)}>Ekstre ekle</Button>} />}</section>
      {categories.length > 0 && <details className="card-detail-categories month-detail"><summary>Kategori dağılımı <ChevronDown size={17} /></summary><ul>{categories.map(category => <li key={category.id}><span className="category-color" style={{ background: category.color }} /><span>{category.label}</span><strong className="num">{money2(category.total)}</strong></li>)}</ul></details>}
    </>}
  </div>
}
