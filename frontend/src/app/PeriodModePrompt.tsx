import { CalendarDays, Receipt } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useStore } from '../store/AppStore'
import { statementSpansMonths } from '../domain/types'
import { fullDayLabel } from '../core/date'

/**
 * A card statement runs roughly "27th to 26th", not calendar month to
 * calendar month. That mismatch is invisible until someone actually loads a
 * statement — so the first time one is found to cross a month boundary, ask
 * once, in plain terms, which grouping they want. The answer is a setting
 * (`Settings.periodGrouping`), changeable later from Ayarlar; nothing else in
 * the app assumes an answer until this fires.
 */
export function PeriodModePrompt() {
  const { state, dispatch } = useStore()

  if (!state.hydrated || state.settings.periodGrouping !== null) return null

  const spanning = state.statements.find(statementSpansMonths)
  if (!spanning) return null

  const choose = (periodGrouping: 'calendar' | 'statement') =>
    dispatch({ type: 'setSettings', settings: { periodGrouping } })

  return (
    <Modal
      open
      onClose={() => {}}
      title="Ekstreniz ay ortasında kesiliyor"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-ink">
          {spanning.label} dönemi{' '}
          <span className="num font-medium">
            {fullDayLabel(spanning.periodStart!)} — {fullDayLabel(spanning.periodEnd!)}
          </span>{' '}
          arası, yani iki takvim ayına yayılıyor. Harcamaları nasıl gruplayalım?
        </p>

        <button
          type="button"
          onClick={() => choose('calendar')}
          className="flex w-full items-start gap-3 rounded border border-line bg-sunken p-3 text-left transition-colors hover:border-accent hover:bg-hover"
        >
          <CalendarDays size={16} className="mt-0.5 shrink-0 text-muted" />
          <span>
            <span className="block text-[13px] font-medium text-ink">Takvim ayına göre</span>
            <span className="mt-0.5 block text-2xs text-muted">
              Her ay kendi dilimi olur. Bu ekstre iki aya bölünür.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => choose('statement')}
          className="flex w-full items-start gap-3 rounded border border-line bg-sunken p-3 text-left transition-colors hover:border-accent hover:bg-hover"
        >
          <Receipt size={16} className="mt-0.5 shrink-0 text-muted" />
          <span>
            <span className="block text-[13px] font-medium text-ink">Ekstre dönemine göre</span>
            <span className="mt-0.5 block text-2xs text-muted">
              Bu ekstrenin tüm harcamaları tek dönem sayılır, iki aya bölünmez.
            </span>
          </span>
        </button>

        <p className="text-2xs text-faint">Bunu sonra Ayarlar bölümünden değiştirebilirsiniz.</p>
      </div>
    </Modal>
  )
}
