import { useState } from 'react'
import { Check, Target } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button, Field, TextInput } from '../ui/primitives'
import { useStore } from '../store/AppStore'
import { toMajor } from '../core/money'
import { entryAmount } from '../domain/entry'
import { CATEGORIES } from '../domain/categories'

export function BudgetSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { state, dispatch } = useStore()
  const initial = (amount: number) =>
    amount > 0 ? String(toMajor(amount)).replace('.', ',') : ''
  const [total, setTotal] = useState(initial(state.profile.spendingLimit))
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      state.profile.budgets.map((b) => [b.category, initial(b.limit)]),
    ),
  )
  const validValue = (raw: string) => !raw.trim() || entryAmount(raw) !== null
  const valid = validValue(total) && Object.values(drafts).every(validValue)
  const save = () => {
    if (!valid) return
    dispatch({
      type: 'setProfile',
      profile: {
        spendingLimit: entryAmount(total) ?? 0,
        budgets: CATEGORIES.flatMap((def) => {
          const limit = entryAmount(drafts[def.id] ?? '')
          return limit ? [{ category: def.id, limit }] : []
        }),
      },
    })
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bütçe rotanı belirle"
      description="Sana uygun bir sınır. Dilediğinde değiştirebilirsin."
      footer={
        <Button variant="primary" disabled={!valid} onClick={save}>
          <Check size={16} /> Limitleri kaydet
        </Button>
      }
    >
      <div className="budget-editor">
        <Target size={24} />
        <Field
          label="Toplam aylık harcama limiti (TL)"
          hint="Örnek: 30.000. Takibi kapatmak için boş bırak."
        >
          <TextInput
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="30.000"
            aria-invalid={!validValue(total)}
          />
        </Field>
      </div>
      <details className="category-budget-editor">
        <summary>Kategori bazında limit de belirle</summary>
        <ul>
          {CATEGORIES.filter((c) => c.nature !== 'neutral').map((def) => (
            <li key={def.id}>
              <span>{def.label}</span>
              <TextInput
                inputMode="decimal"
                aria-label={`${def.label} aylık limiti`}
                className="w-32 text-right"
                placeholder="—"
                value={drafts[def.id] ?? ''}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [def.id]: e.target.value }))
                }
                aria-invalid={!validValue(drafts[def.id] ?? '')}
              />
            </li>
          ))}
        </ul>
      </details>
      {!valid && (
        <p role="alert" className="text-body text-negative">
          Tutarı Türkçe biçimde gir: 1.250,50. Limiti kaldırmak için alanı boş
          bırak.
        </p>
      )}
    </Modal>
  )
}
