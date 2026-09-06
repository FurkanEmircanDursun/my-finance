import { Modal } from '../ui/Modal'
import { TextInput } from '../ui/primitives'
import { useStore } from '../store/AppStore'
import { toMajor, toMinor } from '../core/money'
import { CATEGORIES, type CategoryId } from '../domain/categories'

/**
 * Category ceilings, set next to the categories they cap.
 *
 * These used to live in Ayarlar, three screens away from the list of what was
 * actually spent — so setting a limit meant remembering a number from one place
 * and typing it in another. A blank field means "not tracked", which is why
 * there is no on/off switch: leaving it empty is the off switch.
 */
export function BudgetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const { budgets } = state.profile

  const setBudget = (category: CategoryId, raw: string) => {
    const limit = toMinor(Number.parseFloat(raw.replace(',', '.')) || 0)
    const rest = budgets.filter((b) => b.category !== category)
    dispatch({
      type: 'setProfile',
      profile: { budgets: limit > 0 ? [...rest, { category, limit }] : rest },
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Aylık limitler"
      description="Boş bıraktığın kategoriler takip edilmez"
    >
      <ul className="-mx-2">
        {CATEGORIES.filter((c) => c.nature !== 'neutral').map((def) => {
          const budget = budgets.find((b) => b.category === def.id)
          return (
            <li key={def.id} className="flex min-h-[56px] items-center gap-3 px-2 py-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.color }} />
              <span className="min-w-0 flex-1 truncate text-body text-ink">{def.label}</span>
              <TextInput
                inputMode="decimal"
                aria-label={`${def.label} aylık limiti`}
                className="w-32 text-right"
                placeholder="—"
                value={budget ? String(toMajor(budget.limit)) : ''}
                onChange={(e) => setBudget(def.id, e.target.value)}
              />
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
