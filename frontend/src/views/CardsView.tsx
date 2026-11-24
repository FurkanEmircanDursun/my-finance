import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, CreditCard as CreditCardIcon, FileWarning, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'
import { useNow } from '../app/useNow'
import { CardEditor } from '../app/CardsSheet'
import { buildCardPeriods, type CardPeriod } from '../domain/cardLifecycle'
import { cardDisplayName } from '../domain/cards'
import { monthLabel } from '../core/date'
import type { CreditCard } from '../domain/types'
import { Button, Empty } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { useFeedback } from '../ui/Feedback'
import { PhysicalCard } from '../ui/PhysicalCard'
import { Stagger } from '../ui/motion'
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
  const { openImport } = useSheets()
  const feedback = useFeedback()
  const periods = useCardPeriods()
  const [editing, setEditing] = useState<CreditCard | 'new' | null>(null)
  const selected = state.filters.month
  const periodLabel = selected === 'all' ? 'Tüm dönemler' : monthLabel(selected)
  const missing = periods.filter((period) => period.status === 'missing').length

  const remove = (card: CreditCard) => {
    dispatch({ type: 'removeCard', cardId: card.id })
    feedback({
      message: `${cardDisplayName(card)} kaldırıldı. İşlemlerin ve ekstrelerin korundu.`,
      undo: () => dispatch({ type: 'upsertCard', card }),
    })
  }

  return (
    <div className="cards-page">
      <header className="dashboard-title">
        <div>
          <h1>Kartlar</h1>
          <p>{periodLabel} · Cüzdanın ve ekstre durumları</p>
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
              <Button onClick={() => openImport()}>Ekstre ekle</Button>
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
