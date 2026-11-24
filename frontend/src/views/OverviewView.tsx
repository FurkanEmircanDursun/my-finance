import { useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Plus,
  ShieldCheck,
  Upload,
  Wallet,
  X,
} from 'lucide-react'
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
import { MoneyValue } from '../ui/MoneyValue'
import { Stagger } from '../ui/motion'
import { Modal } from '../ui/Modal'
import { FindingsSheet } from './FindingsSheet'
import { useOverviewModel } from './useOverviewModel'
import type { ViewId } from '../app/navigation'

export function OverviewView({
  onNavigate,
  privateMode,
}: {
  onNavigate: (view: ViewId) => void
  privateMode: boolean
}) {
  const sheets = useSheets()
  const remove = useTransactionDelete()
  const {
    state,
    demo,
    setDemo,
    sampleRows,
    rows,
    current,
    profile,
    spend,
    income,
    scopedBudget,
    limit,
    period,
    recent,
    unknown,
    statementLedgers,
    upcoming,
    methods,
    historyReady,
    today,
    month,
    spending,
    habit,
    budgetOverrun,
  } = useOverviewModel()

  const [detail, setDetail] = useState<'sources' | 'findings' | 'demo-records' | null>(null)
  const [demoSelection, setDemoSelection] = useState<{ day?: string; category?: string }>({})
  const showDemo = (filter: typeof demoSelection = {}) => {
    setDemoSelection(filter)
    setDetail('demo-records')
  }
  const startReal = () => {
    setDemo(false)
    setDetail(null)
    sheets.openEntry()
  }
  const showTransactions = () => (demo ? showDemo() : onNavigate('transactions'))
  const cardStatements = statementLedgers.ledgers.filter(
    (ledger) => ledger.statement.bank !== 'CSV',
  )
  const mismatches = cardStatements.filter(
    (ledger) =>
      (historyReady ? ledger.status : ledger.statement.reconciliation?.status) === 'mismatch',
  )
  const displayedDebt =
    demo || month === 'all'
      ? null
      : cardStatements.reduce<number | null>(
          (sum, { printedDebt }) => (printedDebt === null ? sum : (sum ?? 0) + printedDebt),
          null,
        )
  const showDebt = () => {
    if (!demo && cardStatements.length === 1) sheets.openStatement(cardStatements[0].statement.id)
    else sheets.openCards()
  }

  const setup = [
    { label: 'Kartını ekle', done: Boolean(state.profile.cards?.length), action: sheets.openCards },
    { label: 'Gelirini kaydet', done: income > 0, action: sheets.openIncomeEntry },
    {
      label: 'İlk giderini ekle',
      done: rows.some((tx) => tx.kind === 'expense'),
      action: sheets.openEntry,
    },
    { label: 'Aylık limitini belirle', done: profile.spendingLimit > 0, action: sheets.openBudgets },
  ]

  const advice: PeriodAdvice[] = []
  const addAdvice = (title: string, description: string, label?: string, run?: () => void) =>
    advice.push({ title, description, action: label && run ? { label, run } : undefined })
  const action = (run: () => void) => (demo ? undefined : run)

  if (spending.gross <= 0) {
    addAdvice(
      'Kayıtlarını tamamla',
      'Bir gider veya ekstre ekleyerek hangi harcamaları düzenli takip etmek istediğini belirle.',
      'İşlem ekle',
      action(startReal),
    )
  } else {
    if (scopedBudget && limit > 0 && spend > limit) {
      addAdvice(
        'Aylık limit aşıldı',
        `Net harcaman aylık limitini ${money2(spend - limit)} aştı. Esnek giderlerden birini seçip bir sonraki alışveriş için sınır koy.`,
        'Kategorileri incele',
        action(() =>
          document.getElementById('overview-categories')?.scrollIntoView({ block: 'start' }),
        ),
      )
    }
    if (scopedBudget && budgetOverrun) {
      addAdvice(
        `${categoryLabel(budgetOverrun.category)} limitini gözden geçir`,
        `Bu kategoride limitin ${money2(budgetOverrun.difference)} üzerinde harcama var. Tek seferlik giderleri düzenli olanlardan ayır.`,
        'İşlemleri aç',
        action(() => sheets.openTransactions({ category: budgetOverrun.category })),
      )
    }
    if (scopedBudget && income > 0 && spend > income) {
      addAdvice(
        'Giderler kayıtlı geliri aştı',
        `Fark ${money2(spend - income)}. Gelir kayıtlarını kontrol et ve erteleyebileceğin giderleri belirle.`,
        'Gelir ekle',
        action(sheets.openIncomeEntry),
      )
    }
    if (scopedBudget && limit === 0) {
      addAdvice(
        'Aylık bir harcama limiti belirle',
        'Önce kira, fatura ve diğer zorunlu ödemeleri ayır. Kalan tutarı esnek giderler için planla.',
        'Limit belirle',
        action(sheets.openBudgets),
      )
    }
    if (scopedBudget && limit > spend && month !== 'all' && month === monthOf(today)) {
      const remainingDays = daysInMonth(month) - Number(today.slice(-2))
      if (remainingDays > 0) {
        addAdvice(
          'Kalan bütçeyi günlere böl',
          `Ayın kalan ${remainingDays} günü için günlük ortalama alan ${money2(Math.floor((limit - Math.max(0, spend)) / remainingDays))}. Yaklaşan sabit ödemeleri önce ayır.`,
        )
      }
    }
    if (unknown.length > 0) {
      addAdvice(
        'Diğer kategorisini gözden geçir',
        `${unknown.length} gider Diğer kategorisinde. Düzenli olanları ayırmak, bütçeyi planlamayı kolaylaştırır.`,
        'Kayıtları incele',
        action(() => sheets.openTransactions({ category: 'other' })),
      )
    }
    if (scopedBudget && !income) {
      addAdvice(
        'Gelirini de kaydet',
        'Kaydedilen geliri giderle karşılaştırarak ay sonunda ne kadar kaldığını görebilirsin.',
        'Gelir ekle',
        action(sheets.openIncomeEntry),
      )
    }
    if (advice.length < 2) {
      const flexible = spending.categories.find((item) => item.nature === 'want')
      if (flexible) {
        addAdvice(
          `${flexible.label} harcamalarını incele`,
          'Tekrarlanan küçük kalemleri kontrol et. Sürdürmek istediklerin için bir kategori limiti belirleyebilirsin.',
          'İşlemleri aç',
          action(() => sheets.openTransactions({ category: flexible.id })),
        )
      } else if (spending.peak) {
        addAdvice(
          'En yüksek günü incele',
          'Tek seferlik büyük giderleri düzenli ödemelerden ayırarak gelecek aya daha gerçekçi bir bütçe ayırabilirsin.',
        )
      }
    }
  }
  if (!advice.length) {
    addAdvice(
      'Kayıtlarını düzenli gözden geçir',
      'Takip etmek istediğin harcamalar için bir ay seçerek giderlerini ve bütçeni karşılaştır.',
    )
  }

  const spendIncomeRatio = income > 0 ? Math.min(1, Math.max(0, spend / income)) : 0
  const overIncome = income > 0 && spend > income

  return (
    <div className="month-overview">
      <header className="overview-title">
        <div>
          <h1>Ay Özeti</h1>
          <p>{period} · Finansal kokpitin</p>
        </div>
        {!demo && spending.gross > 0 && !privateMode && (
          <button
            type="button"
            className="quiet-button"
            onClick={() => setDetail('findings')}
          >
            <ShieldCheck size={16} className="text-accent-text" />
            Bütçe bulguları
          </button>
        )}
      </header>

      {demo && (
        <div className="demo-banner" role="status">
          <p>
            <strong>Örnek bütçe</strong> · Bu kayıtlar yalnızca denemek için; hesabına yazılmaz.
          </p>
          <button type="button" onClick={startReal}>
            Kendi kaydını ekle <ArrowRight size={15} />
          </button>
          <button
            type="button"
            onClick={() => setDemo(false)}
            aria-label="Örnek görünümü kapat"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* ── Bento Row 1: Hero Vault Balance + Budget Gauge ──────────────────── */}
      <div className="overview-bento-top" key={period}>
        <Stagger index={0} className="overview-col-7">
          <section className="bento-hero overview-hero" aria-label={period}>
            <div>
              <div className="overview-hero__header">
                <span className="overview-hero__eyebrow">Gelirden kalan</span>
                <span className="overview-hero__period">{period}</span>
              </div>

              <div
                className={`overview-hero__figure ${
                  overIncome ? 'overview-hero__figure--negative' : ''
                }`}
              >
                {income ? (
                  <MoneyValue value={income - spend} />
                ) : (
                  <span className="num">—</span>
                )}
              </div>

              <p className="overview-hero__note">
                {income
                  ? 'Kaydedilen gelir eksi net harcama · banka bakiyesi değildir'
                  : 'Gelir eklediğinde ay sonu dengen anında hesaplanır'}
              </p>

              {income > 0 && (
                <div className="overview-hero__ratio">
                  <div className="overview-hero__ratio-bar" aria-hidden="true">
                    <span
                      style={{
                        transform: `scaleX(${spendIncomeRatio})`,
                        background: overIncome
                          ? '#FB7185'
                          : spendIncomeRatio > 0.8
                            ? '#FBBF24'
                            : '#2BD49B',
                      }}
                    />
                  </div>
                  <div className="overview-hero__ratio-meta num">
                    <span>Gelirin %{Math.round(spendIncomeRatio * 100)}&apos;i harcandı</span>
                    <span>{overIncome ? 'Gelir aşıldı' : 'Dengede'}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="overview-hero__metrics">
              <button
                type="button"
                className="overview-hero__metric"
                onClick={sheets.openIncomeEntry}
              >
                <span className="overview-hero__metric-label">
                  Kaydedilen gelir <ChevronRight size={14} />
                </span>
                <span className="overview-hero__metric-value">
                  {income ? <MoneyValue value={income} /> : <span className="num">—</span>}
                </span>
                <span className="overview-hero__metric-sub">Gelir ekle</span>
              </button>

              <button
                type="button"
                className="overview-hero__metric"
                onClick={() => setDetail('sources')}
              >
                <span className="overview-hero__metric-label">
                  Net harcama <ChevronRight size={14} />
                </span>
                <span className="overview-hero__metric-value">
                  <MoneyValue value={spend} />
                </span>
                <span className="overview-hero__metric-sub">Kaynak dökümü</span>
              </button>

              <button
                type="button"
                className="overview-hero__metric"
                onClick={showDebt}
              >
                <span className="overview-hero__metric-label">
                  Dönem borcu <ChevronRight size={14} />
                </span>
                <span className="overview-hero__metric-value">
                  {displayedDebt === null ? (
                    <span className="num">—</span>
                  ) : (
                    <MoneyValue value={displayedDebt} />
                  )}
                </span>
                <span className="overview-hero__metric-sub">
                  {displayedDebt !== null
                    ? 'Yüklü ekstrelerden'
                    : state.filters.month === 'all'
                      ? 'Ay seç'
                      : 'Borç kaydı yok'}
                </span>
              </button>
            </div>
          </section>
        </Stagger>

        <Stagger index={1} className="overview-col-5">
          <div className="overview-budget-slot">
            {!privateMode && scopedBudget ? (
              <BudgetRibbon limit={limit} spend={spend} scoped onEdit={sheets.openBudgets} />
            ) : (
              <section className="bento-card flex flex-1 flex-col justify-between">
                <div>
                  <span className="text-micro font-semibold uppercase text-faint">
                    Bütçe Kapasitesi
                  </span>
                  <h2 className="mt-1 text-title font-semibold text-ink">
                    {privateMode ? 'Gizlilik modu açık' : 'Aylık harcama alanın'}
                  </h2>
                  <p className="mt-2 text-label leading-relaxed text-muted">
                    {privateMode
                      ? 'Tutarlar gizliyken bütçe göstergesi korunur.'
                      : 'Aylık harcama limitini takip etmek için üstten tek bir ay ve tüm hesapları seç.'}
                  </p>
                </div>
                {!privateMode && (
                  <div className="mt-4">
                    <button
                      type="button"
                      className="quiet-button"
                      onClick={sheets.openBudgets}
                    >
                      Limit ayarları
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        </Stagger>
      </div>

      {/* ── Bento Row 2: Daily/Cumulative Flow + Interactive Exploding Donut ── */}
      <div className="overview-evidence">
        <Stagger index={2} className="overview-col-7">
          <OverviewDaily
            key={`${demo ? 'demo' : 'account'}:${month}`}
            days={spending.days}
            peak={spending.peak}
            privateMode={privateMode}
            unavailable={
              month === 'all'
                ? 'Günlük harcamaları görmek için üstten bir ay seç.'
                : month > monthOf(today)
                  ? 'Bu ay henüz başlamadı.'
                  : 'Bu ay için harcama veya iade kaydı yok.'
            }
            onAnalysis={demo ? undefined : () => onNavigate('analysis')}
            onDay={(day) =>
              demo
                ? showDemo({ day })
                : sheets.openTransactions({
                    day,
                    title: fullDayLabel(day),
                    kinds: ['expense', 'refund'],
                  })
            }
          />
        </Stagger>

        <Stagger index={3} className="overview-col-5">
          <OverviewCategories
            spending={spending}
            privateMode={privateMode}
            onCategory={(category) =>
              demo
                ? showDemo({ category })
                : sheets.openTransactions({ category, kinds: ['expense'] })
            }
          />
        </Stagger>
      </div>

      {/* ── Bento Row 3: Habit Score Radial Gauge + Actionable Advice ───────── */}
      <Stagger index={4}>
        <OverviewReview
          habit={habit}
          advice={advice.slice(0, 3)}
          privateMode={privateMode}
          unavailable={
            !scopedBudget
              ? 'Puan için tek ayı ve tüm hesapları seç.'
              : !spending.gross
                ? 'Gider kaydı eklendiğinde puan hesaplanabilir.'
                : 'Puan için bir aylık limit veya gelir kaydı ekle.'
          }
        />
      </Stagger>

      {/* ── Bento Row 4: Recent Transactions + Card Statements ─────────────── */}
      <div className="month-work">
        <Stagger index={5} className="overview-col-7">
          <section className="bento-card month-activity" aria-labelledby="recent-heading">
            <div className="workspace-section-heading">
              <h2 id="recent-heading">Son işlemler</h2>
              {recent.length > 0 && (
                <button type="button" className="text-button" onClick={showTransactions}>
                  Tüm işlemler <ArrowRight size={15} />
                </button>
              )}
            </div>
            {recent.length ? (
              <ul key={period}>
                {recent.map((tx) => (
                  <li key={tx.id}>
                    <TransactionItem
                      transaction={tx}
                      onOpen={showTransactions}
                      onDelete={demo ? undefined : () => remove(tx)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-[var(--radius)] border border-dashed border-line bg-sunken/50 p-6 text-center">
                <p className="text-body text-muted">Bu dönemde işlem kaydı yok.</p>
                <button
                  type="button"
                  className="primary-button mt-3"
                  onClick={startReal}
                >
                  <Plus size={16} /> İlk işlemi ekle
                </button>
              </div>
            )}
          </section>
        </Stagger>

        <Stagger index={6} className="overview-col-5">
          <section className="bento-card month-statements" aria-labelledby="month-statements-heading">
            <div className="workspace-section-heading">
              <h2 id="month-statements-heading">Kart ekstreleri</h2>
              <button
                type="button"
                className="text-button"
                onClick={() => sheets.openImport()}
              >
                <Upload size={15} /> Ekstre yükle
              </button>
            </div>

            {!demo && mismatches.length > 0 && (
              <div className="month-statement-note">
                <p className="font-semibold">{mismatches.length} ekstre kontrol bekliyor.</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => sheets.openStatement(mismatches[0].statement.id)}
                >
                  Farkı incele <ArrowRight size={14} />
                </button>
              </div>
            )}

            {!demo && cardStatements.length > 0 ? (
              <ul key={period} className="divide-y divide-line">
                {cardStatements.slice(0, 3).map((ledger) => (
                  <li key={ledger.statement.id}>
                    <button
                      type="button"
                      className="month-statement-row"
                      onClick={() => sheets.openStatement(ledger.statement.id)}
                    >
                      <span className="month-statement-icon" aria-hidden="true">
                        <CreditCard size={17} />
                      </span>
                      <span className="min-w-0">
                        <strong className="truncate">{ledger.card}</strong>
                        <small>
                          {ledger.statement.dueDate
                            ? `Son ödeme ${fullDayLabel(ledger.statement.dueDate)}`
                            : 'Son ödeme tarihi okunamadı'}
                        </small>
                      </span>
                      <ChevronRight size={16} className="text-faint" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : !demo && upcoming.length ? (
              <p className="workspace-empty-line">
                {cardDisplayName(upcoming[0].card)} · sonraki kesim{' '}
                {upcoming[0].date.toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
            ) : (
              <p className="workspace-empty-line">Bu dönem için yüklü ekstre yok.</p>
            )}

            <div className="mt-3 border-t border-line pt-3">
              <button type="button" className="text-button" onClick={sheets.openCards}>
                Kartlarını gör <ArrowRight size={15} />
              </button>
            </div>
          </section>
        </Stagger>
      </div>

      {/* ── Collapsible Setup & Discovery ──────────────────────────────────── */}
      {!demo && (
        <details className="month-detail">
          <summary>
            <span>Mizan’ı kur ve keşfet</span>
            <ChevronDown size={18} className="transition-transform duration-200" />
          </summary>
          <div className="month-detail-body">
            {setup.some((item) => !item.done) && (
              <div className="mizan-setup-steps">
                {setup.map((item) => (
                  <button type="button" key={item.label} onClick={item.action}>
                    <span className={item.done ? 'is-done' : ''}>
                      {item.done ? <Check size={13} /> : <Plus size={13} />}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            <div className="month-utilities">
              <button type="button" className="text-button" onClick={() => setDemo(true)}>
                Örnek bütçeyi dene <ArrowRight size={15} />
              </button>
              <button type="button" className="text-button" onClick={sheets.openIncome}>
                Sabit gelir ve giderler <ArrowRight size={15} />
              </button>
              <button type="button" className="text-button" onClick={sheets.openRewards}>
                Bonus ve puanlar <ArrowRight size={15} />
              </button>
            </div>
            <p className="text-label leading-relaxed text-muted">
              Ay özeti takvim ayına göre hesaplanır. Eski tarihli taksitler ekstre kesim tarihinde sayılır. Kart borcu ödemesi harcamaya eklenmez. Gelirden kalan, banka bakiyesini göstermez.
            </p>
          </div>
        </details>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <Modal
        open={detail === 'sources'}
        onClose={() => setDetail(null)}
        title="Harcamanın kaynakları"
        description={`${period} · net harcama`}
      >
        <div className="source-breakdown">
          {methods.map(({ label, value }) => (
            <div key={label}>
              <Wallet size={18} className="text-accent-text" />
              <span className="text-muted">{label}</span>
              <strong className="num text-ink">{money2(value)}</strong>
            </div>
          ))}
          <div>
            <Wallet size={18} className="text-ink" />
            <strong className="text-ink">Toplam</strong>
            <strong className="num text-ink">{money2(spend)}</strong>
          </div>
        </div>
        <p className="mt-4 text-label text-muted">
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
        <div className="divide-y divide-line">
          {sampleRows
            .filter(
              (tx) =>
                (!demoSelection.day || (tx.date === demoSelection.day && tx.kind !== 'income')) &&
                (!demoSelection.category ||
                  (tx.category === demoSelection.category && tx.kind === 'expense')),
            )
            .map((tx) => (
              <div className="flex items-center justify-between gap-3 py-3 text-body" key={tx.id}>
                <span className="text-ink">{tx.description}</span>
                <strong className="num text-ink">{money2(tx.amount)}</strong>
              </div>
            ))}
        </div>
        <button type="button" className="primary-button mt-5 w-full" onClick={startReal}>
          Kendi bütçeme başla <ArrowRight size={16} />
        </button>
      </Modal>
    </div>
  )
}
