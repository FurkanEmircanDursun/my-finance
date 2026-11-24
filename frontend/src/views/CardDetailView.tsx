import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, CreditCard, Upload } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'
import { categoryLabel, CATEGORIES, type CategoryId } from '../domain/categories'
import { spendAmount } from '../domain/types'
import { fullDayLabel, monthLabel } from '../core/date'
import { money2 } from '../core/money'
import { Button, Empty } from '../ui/primitives'
import { TransactionItem } from '../ui/TransactionItem'
import { useTransactionDelete } from '../ui/useTransactionDelete'
import { PhysicalCard } from '../ui/PhysicalCard'
import { MoneyValue } from '../ui/MoneyValue'
import { InteractiveDonutChart } from '../ui/charts'
import { CardStatementStatus, useCardPeriods } from './CardsView'
import '../styles/cards.css'

export function CardDetailView({ cardId, onBack }: { cardId: string; onBack: () => void }) {
  const { state } = useStore()
  const sheets = useSheets()
  const remove = useTransactionDelete()
  const periods = useCardPeriods()
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const period = periods.find((item) => item.id === cardId)
  const rows = period?.transactions.filter((tx) => tx.kind === 'expense' || tx.kind === 'refund') ?? []

  const categories = useMemo(() => {
    const totals = new Map<CategoryId, number>()
    for (const tx of period?.transactions ?? []) {
      if (tx.kind === 'expense' || tx.kind === 'refund') {
        totals.set(tx.category, (totals.get(tx.category) ?? 0) + spendAmount(tx))
      }
    }
    return [...totals]
      .filter(([, total]) => total > 0)
      .map(([id, total]) => ({
        id,
        value: total,
        total,
        label: categoryLabel(id),
        color: CATEGORIES.find((cat) => cat.id === id)?.color ?? 'var(--accent)',
      }))
      .sort((a, b) => b.total - a.total)
  }, [period])

  const selected = state.filters.month
  const month = selected === 'all' ? 'Tüm dönemler' : monthLabel(selected)

  return (
    <div className="card-detail-page">
      <button type="button" className="card-back-button" onClick={onBack}>
        <ArrowLeft size={17} /> Kartlara dön
      </button>

      {!period ? (
        <Empty
          icon={<CreditCard size={24} />}
          title="Kart bu dönemde görünmüyor"
          description="Kart kaldırılmış olabilir veya bu ay için kayıt bulunmayabilir. Başka bir dönem seçebilir ya da kartlarına dönebilirsin."
          action={<Button onClick={onBack}>Kartlarım</Button>}
        />
      ) : (
        <>
          <header className="dashboard-title">
            <div>
              <h1>{period.name}</h1>
              <p>
                {period.bank} · {month}
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() =>
                sheets.openImport(
                  period.card && !period.archived && period.card.bank !== 'other'
                    ? period.card.id
                    : period.statements.length
                      ? period.id
                      : undefined,
                )
              }
            >
              <Upload size={16} /> Ekstre yükle
            </Button>
          </header>

          <div className="card-detail-hero-grid">
            <PhysicalCard
              bank={period.card?.bank ?? period.bank}
              bankLabel={period.bank}
              name={period.name}
              last4={period.card?.last4}
              amount={period.netSpend}
              amountLabel="Takvim ayı net harcama"
              badge={<CardStatementStatus period={period} />}
            />

            <section className="bento-card flex flex-col justify-between" aria-label="Kartın seçili dönem özeti">
              <div>
                <span className="text-micro font-semibold uppercase text-faint">Dönem Özeti</span>
                <div className="mt-2 text-[clamp(1.75rem,3vw,2.35rem)] font-bold tracking-[-0.035em] text-ink">
                  <MoneyValue value={period.netSpend} />
                </div>
                <p className="mt-2 text-label text-muted">
                  {rows.length} harcama ve iade kaydı
                  {period.cutoff ? ` · Ekstre kesimi ${fullDayLabel(period.cutoff)}` : ''}
                </p>
              </div>
              {period.statements.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <span className="text-label font-semibold text-accent-text">
                    {period.statements.length} yüklü ekstre belgesi
                  </span>
                </div>
              )}
            </section>
          </div>

          {period.statements.length > 0 && (
            <section className="card-detail-documents">
              <h2>Ekstreler</h2>
              <ul className="divide-y divide-line">
                {[...period.statements]
                  .sort((a, b) => (b.periodEnd ?? '').localeCompare(a.periodEnd ?? ''))
                  .map((statement) => {
                    const debt =
                      statement.summary?.totalDebt ?? statement.reconciliation?.printedDebt ?? null
                    return (
                      <li key={statement.id}>
                        <button
                          type="button"
                          className="card-document-link"
                          onClick={() => sheets.openStatement(statement.id)}
                        >
                          <span>
                            <strong className="font-semibold text-ink">
                              {statement.periodEnd ? fullDayLabel(statement.periodEnd) : statement.label}
                            </strong>
                            <small>
                              {statement.dueDate
                                ? `Son ödeme ${fullDayLabel(statement.dueDate)}`
                                : 'Son ödeme tarihi okunamadı'}
                            </small>
                          </span>
                          <span>
                            <strong className="num font-semibold text-ink">
                              {debt === null ? '—' : money2(debt)}
                            </strong>
                            <small>Bankanın dönem borcu</small>
                          </span>
                          <ChevronRight size={17} className="text-faint" aria-label="Ekstreyi aç" />
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </section>
          )}

          {categories.length > 0 && (
            <section className="card-detail-categories">
              <h2>Kategori dağılımı</h2>
              <div className="grid items-center gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
                <InteractiveDonutChart
                  data={categories}
                  height={200}
                  activeId={activeCat}
                  onSelect={setActiveCat}
                  totalLabel="Kart harcaması"
                />
                <ul className="divide-y divide-line">
                  {categories.map((cat) => (
                    <li key={cat.id} className="flex items-center gap-3 py-2.5 text-body">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: cat.color }}
                      />
                      <span className="flex-1 text-ink">{cat.label}</span>
                      <strong className="num font-semibold text-ink">{money2(cat.total)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <section className="card-detail-records">
            <div className="workspace-section-heading">
              <h2>{month} hareketleri</h2>
              <span>{rows.length} kayıt</span>
            </div>
            {rows.length ? (
              <ul>
                {rows.map((tx) => (
                  <li key={tx.id}>
                    <TransactionItem transaction={tx} onDelete={() => remove(tx)} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                compact
                title="Bu kartta bu dönem harcama kaydı yok"
                description="Bir ekstre yüklediğinde bu karta ait harcamalar ve kategorileri burada görünür."
                action={
                  <Button
                    onClick={() =>
                      sheets.openImport(period.card && !period.archived ? period.card.id : undefined)
                    }
                  >
                    Ekstre ekle
                  </Button>
                }
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}
