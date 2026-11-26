import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  CreditCard as CreditCardIcon,
  FileWarning,
  Gift,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'
import { useNow } from '../app/useNow'
import { CardEditor } from '../app/CardsSheet'
import { buildCardPeriods, type CardPeriod } from '../domain/cardLifecycle'
import { cardDisplayName } from '../domain/cards'
import { buildRewards } from '../analytics/rewards'
import { fullDayLabel, monthLabel } from '../core/date'
import { money, money2 } from '../core/money'
import type { CreditCard } from '../domain/types'
import { Button, Empty } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { useFeedback } from '../ui/Feedback'
import { PhysicalCard } from '../ui/PhysicalCard'
import { MoneyValue } from '../ui/MoneyValue'
import { AnimatedProgress, Stagger } from '../ui/motion'
import '../styles/cards.css'

export function useCardPeriods(): CardPeriod[] {
  const { state } = useStore()
  const now = useNow()
  const today = new Date(now)
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return useMemo(
    () =>
      buildCardPeriods({
        cards: state.profile.cards ?? [],
        archivedCards: state.profile.archivedCards ?? [],
        statements: state.statements,
        transactions: state.transactions,
        month: state.filters.month,
        today: day,
      }),
    [state.profile.cards, state.profile.archivedCards, state.statements, state.transactions, state.filters.month, day],
  )
}

export function CardStatementStatus({ period }: { period: CardPeriod }) {
  const labels = {
    ready: 'Ekstre yüklü',
    missing: 'Ekstre eksik',
    upcoming: 'Kesim bekleniyor',
    untracked: period.archived ? 'Arşivli kart' : 'Takip kapalı',
  }
  return (
    <span className={`card-statement-status card-statement-status--${period.status}`}>
      {period.status === 'missing' ? <FileWarning size={13} /> : <CalendarDays size={13} />}
      {labels[period.status]}
    </span>
  )
}

export function CardsView({ onOpenCard }: { onOpenCard: (cardId: string) => void }) {
  const { state, dispatch } = useStore()
  const { openImport, openRewards } = useSheets()
  const feedback = useFeedback()
  const periods = useCardPeriods()
  const [editing, setEditing] = useState<CreditCard | 'new' | null>(null)
  const selected = state.filters.month
  const periodLabel = selected === 'all' ? 'Tüm dönemler' : monthLabel(selected)
  const missing = periods.filter((period) => period.status === 'missing').length

  // Aggregate wallet debt, limit utilization, due dates & rewards
  const walletStats = useMemo(() => {
    let totalDebt = 0
    let totalSpend = 0
    let totalCreditLimit = 0
    let totalMinPayment = 0
    let nextDue: { card: string; date: string; amount: number | null } | null = null

    for (const p of periods) {
      totalSpend += p.netSpend
      const latest = p.statements.reduce<(typeof p.statements)[number] | undefined>(
        (prev, st) => (!prev || (st.periodEnd ?? '') > (prev.periodEnd ?? '') ? st : prev),
        undefined,
      )
      const debt = latest?.summary?.totalDebt ?? latest?.reconciliation?.printedDebt ?? null
      totalDebt += debt ?? p.netSpend
      if (latest?.summary?.creditLimit) totalCreditLimit += latest.summary.creditLimit
      if (latest?.summary?.minPayment) totalMinPayment += latest.summary.minPayment
      if (latest?.dueDate) {
        if (!nextDue || latest.dueDate < nextDue.date) {
          nextDue = { card: p.name, date: latest.dueDate, amount: debt }
        }
      }
    }

    const rewards = buildRewards({ statements: state.statements, transactions: state.transactions })
    const rewardTotal = rewards.programmes.reduce((s, r) => s + (r.balance ?? r.earned), 0)

    return {
      totalDebt,
      totalSpend,
      totalCreditLimit,
      totalMinPayment,
      nextDue,
      rewardTotal,
      rewardProgrammes: rewards.programmes.length,
    }
  }, [periods, state.statements, state.transactions])

  const remove = (card: CreditCard) => {
    dispatch({ type: 'removeCard', cardId: card.id })
    feedback({
      message: `${cardDisplayName(card)} kaldırıldı. İşlemlerin ve ekstrelerin korundu.`,
      undo: () => dispatch({ type: 'upsertCard', card }),
    })
  }

  return (
    <div className="cards-page space-y-5">
      <header className="dashboard-title">
        <div>
          <h1>Kart Cüzdanı & Ekstreler</h1>
          <p>{periodLabel} · Kart borçların, limit kullanımın, kesim günlerin ve bonusların</p>
        </div>
        <div className="workspace-heading-actions">
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={16} /> Kart ekle
          </Button>
          <Button onClick={() => openImport()}>
            <Upload size={16} /> Ekstre yükle
          </Button>
        </div>
      </header>

      {periods.length > 0 && (
        <Stagger index={0}>
          <section className="bento-hero cards-wallet-hero" aria-label="Cüzdan özeti">
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <span className="overview-hero__eyebrow">Toplam Kart Borcu & Harcama</span>
                <div className="overview-hero__figure mt-1">
                  <MoneyValue value={walletStats.totalDebt} />
                </div>
                <p className="overview-hero__note">
                  {walletStats.totalMinPayment > 0
                    ? `Toplam asgari ödeme: ${money2(walletStats.totalMinPayment)} · ${periods.length} aktif kart`
                    : `${periods.length} kart ve ekstre grubu takip ediliyor`}
                </p>

                {walletStats.totalCreditLimit > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <AnimatedProgress
                      value={walletStats.totalDebt}
                      max={walletStats.totalCreditLimit}
                      height={7}
                    />
                    <div className="num flex flex-wrap justify-between gap-x-2 text-xs text-[var(--hero-surface-muted)]">
                      <span>
                        Limit kullanımı %
                        {Math.round((walletStats.totalDebt / walletStats.totalCreditLimit) * 100)}
                      </span>
                      <span>Toplam limit: {money(walletStats.totalCreditLimit)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:col-span-7">
                <div className="overview-hero__metric">
                  <span className="overview-hero__metric-label">Dönem Net Harcama</span>
                  <span className="overview-hero__metric-value">
                    <MoneyValue value={walletStats.totalSpend} />
                  </span>
                  <span className="overview-hero__metric-sub">{periodLabel}</span>
                </div>

                <div className="overview-hero__metric">
                  <span className="overview-hero__metric-label">En Yakın Son Ödeme</span>
                  <span className="overview-hero__metric-value">
                    {walletStats.nextDue ? fullDayLabel(walletStats.nextDue.date) : '—'}
                  </span>
                  <span className="overview-hero__metric-sub">
                    {walletStats.nextDue ? walletStats.nextDue.card : 'Ekstre bekleniyor'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={openRewards}
                  className="overview-hero__metric text-left"
                >
                  <span className="overview-hero__metric-label">
                    Puan &amp; Ödüller <Gift size={14} className="text-gold" />
                  </span>
                  <span className="overview-hero__metric-value text-gold">
                    <MoneyValue value={walletStats.rewardTotal} />
                  </span>
                  <span className="overview-hero__metric-sub">
                    {walletStats.rewardProgrammes > 0
                      ? `${walletStats.rewardProgrammes} sadakat programı →`
                      : 'Puan detaylarını gör →'}
                  </span>
                </button>
              </div>
            </div>

            {/* Billing Cycle Timeline Strip */}
            {periods.some((p) => p.card) && (
              <div className="cards-cycle-strip">
                <span className="cards-cycle-strip__label">
                  <CalendarDays size={14} /> Kesim Günü Takvimi:
                </span>
                <div className="cards-cycle-strip__items">
                  {[...periods]
                    .filter((p) => p.card)
                    .sort((a, b) => (a.card?.statementDay ?? 0) - (b.card?.statementDay ?? 0))
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onOpenCard(p.id)}
                        className={`cards-cycle-chip cards-cycle-chip--${p.status}`}
                      >
                        <strong>Her ayın {p.card!.statementDay}. günü</strong>
                        <span>{p.name}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </section>
        </Stagger>
      )}

      {missing > 0 && (
        <div className="cards-missing-notice" role="status">
          <FileWarning size={20} />
          <p>
            <strong>{missing} kartın ekstresi bekleniyor.</strong>
            <span>Kesim günü geçmiş kartlarını aşağıdan tek dokunuşla tamamlayabilirsin.</span>
          </p>
        </div>
      )}

      {selected === 'all' && periods.length > 0 && (
        <p className="cards-period-note">
          Eksik ekstre durumunu görmek için üstteki dönem seçicisinden bir ay seç.
        </p>
      )}

      {periods.length ? (
        <ul className="cards-period-list">
          {periods.map((period, index) => {
            const latest = period.statements.reduce<(typeof period.statements)[number] | undefined>(
              (previous, statement) =>
                !previous || (statement.periodEnd ?? '') > (previous.periodEnd ?? '')
                  ? statement
                  : previous,
              undefined,
            )
            const debt = latest?.summary?.totalDebt ?? latest?.reconciliation?.printedDebt ?? null
            return (
              <Stagger
                as="li"
                key={period.id}
                index={index}
                className={`card-period-item ${
                  period.status === 'missing' ? 'card-period-item--missing' : ''
                }`}
              >
                  <button
                    type="button"
                    className="card-period-open"
                    onClick={() => onOpenCard(period.id)}
                  >
                    <PhysicalCard
                      bank={period.card?.bank ?? period.bank}
                      bankLabel={period.bank}
                      name={period.name}
                      last4={period.card?.last4}
                      color={period.card?.color}
                      amount={debt ?? period.netSpend}
                      amountLabel={
                        debt === null
                          ? 'Net harcama'
                          : selected === 'all'
                            ? 'Son ekstre borcu'
                            : 'Bankanın dönem borcu'
                      }
                      badge={<CardStatementStatus period={period} />}
                      interactive
                    />
                  </button>

                  <div className="card-period-footer">
                    <span>
                      {period.card
                        ? `Kesim: her ayın ${period.card.statementDay}. günü`
                        : `${period.transactions.filter((tx) => tx.kind === 'expense').length} harcama kaydı`}
                    </span>
                    <div>
                      {period.status === 'missing' && (
                        <button
                          type="button"
                          className="card-inline-action card-inline-action--primary"
                          onClick={() => openImport(period.card?.id)}
                        >
                          <Upload size={14} /> Ekstre yükle
                        </button>
                      )}
                    </div>
                  </div>

                  {period.card && !period.archived && (
                    <details className="card-management">
                      <summary>
                        Kart ayarları <ChevronDown size={14} />
                      </summary>
                      <div>
                        <button
                          type="button"
                          className="card-inline-action"
                          onClick={() => setEditing(period.card!)}
                          aria-label={`${period.name} kartını düzenle`}
                        >
                          <Pencil size={14} /> Düzenle
                        </button>
                        <button
                          type="button"
                          className="card-inline-action card-inline-action--danger"
                          onClick={() => remove(period.card!)}
                          aria-label={`${period.name} kartını sil`}
                        >
                          <Trash2 size={14} /> Kartı kaldır
                        </button>
                      </div>
                    </details>
                  )}
              </Stagger>
            )
          })}
        </ul>
      ) : (
        <Empty
          icon={<CreditCardIcon size={24} />}
          title="İlk kartınla başla"
          description="Kartını ekle veya bir ekstre yükle. Harcamaların ve borçların kart bazında burada görünsün."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="primary" onClick={() => setEditing('new')}>
                <Plus size={16} /> Kart ekle
              </Button>
              <Button onClick={() => openImport()}>
                <Upload size={16} /> Ekstre yükle
              </Button>
            </div>
          }
        />
      )}

      {(state.profile.archivedCards?.length ?? 0) > 0 && (
        <details className="cards-archived">
          <summary>Kaldırılan kartlar</summary>
          <p>Kartı geri eklemek önceki ekstreleri ve kayıtlarıyla aynı kimliği korur.</p>
          <ul>
            {state.profile.archivedCards?.map((card) => (
              <li key={card.id}>
                <span>{cardDisplayName(card)}</span>
                <Button size="sm" onClick={() => setEditing(card)}>
                  <Plus size={15} /> Geri ekle
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="cards-privacy-note">
        Kart eklemek bankana bağlanmaz. Kartı silmek finansal geçmişini silmez.
      </p>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Kart ekle' : 'Kartını düzenle'}
      >
        {editing && (
          <CardEditor
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? undefined : editing}
            existingCards={state.profile.cards ?? []}
            onSave={(card) => {
              dispatch({ type: 'upsertCard', card })
              setEditing(null)
              feedback({ message: 'Kart kaydedildi.' })
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  )
}
