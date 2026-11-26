import { useId, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Coffee, Home, ShoppingBasket, Receipt, Car, MoreHorizontal } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button, Field, Segmented, TextInput } from '../ui/primitives'
import { Select } from '../ui/Select'
import { CategoryIcon } from '../ui/CategoryIcon'
import { SORTED_CATEGORIES, categoryColor, categoryLabel, type CategoryId } from '../domain/categories'
import { createEntry, entryAmount, entryDateForPeriod, type EntryMethod } from '../domain/entry'
import { fullDayLabel } from '../core/date'
import { useStore } from '../store/AppStore'
import { useFeedback } from '../ui/Feedback'
import { hapticImpact, hapticTap } from '../platform/haptics'
import { trackProductEvent } from '../platform/analytics'
import '../ui/transaction-item.css'

const quickCategories = [
  { id: 'bills', label: 'Fatura', icon: Receipt },
  { id: 'rent', label: 'Kira', icon: Home },
  { id: 'market', label: 'Market', icon: ShoppingBasket },
  { id: 'transport', label: 'Ulaşım', icon: Car },
  { id: 'dining', label: 'Yeme içme', icon: Coffee },
  { id: 'other', label: 'Diğer', icon: MoreHorizontal },
] as const

export interface EntryPrefill {
  kind?: 'expense' | 'income'
  description?: string
  amount?: string
  category?: CategoryId
}

export function EntrySheet({
  onClose,
  initialKind = 'expense',
  initialDraft,
}: {
  onClose: () => void
  initialKind?: 'expense' | 'income'
  initialDraft?: EntryPrefill
}) {
  const { state, dispatch } = useStore()
  const feedback = useFeedback()
  const submitted = useRef(false)
  const resolvedKind = initialDraft?.kind ?? initialKind
  const [kind, setKind] = useState<'expense' | 'income'>(resolvedKind)
  const [description, setDescription] = useState(initialDraft?.description ?? '')
  const [amount, setAmount] = useState(initialDraft?.amount ?? '')
  const [date, setDate] = useState(() => entryDateForPeriod(state.filters.month))
  const [category, setCategory] = useState<CategoryId>(initialDraft?.category ?? 'other')
  const [method, setMethod] = useState<EntryMethod>(
    resolvedKind === 'income' ? 'Banka / EFT' : 'Nakit',
  )
  const [error, setError] = useState('')
  const amountErrorId = useId()
  const parsed = entryAmount(amount)

  return (
    <Modal open onClose={onClose} title="İşlem Ekle" variant="sheet">
      <form
        className="entry-composer"
        onSubmit={(event) => {
          event.preventDefault()
          if (submitted.current) return
          const transaction = createEntry({
            description: description.trim() || (kind === 'income' ? 'Gelir' : categoryLabel(category)),
            amount,
            date,
            category: kind === 'income' ? 'other' : category,
            method,
            kind,
          })
          if (!transaction) {
            setError('Tutarı ve tarihi kontrol et. Örnek tutar: 1.250,50')
            return
          }
          submitted.current = true
          dispatch({ type: 'addManual', transaction })
          dispatch({
            type: 'setFilters',
            filters: { month: date.slice(0, 7), cards: [], categories: [], query: '' },
          })
          hapticImpact()
          void trackProductEvent('entry_saved')
          feedback({
            message: `${kind === 'income' ? 'Gelir' : 'Gider'} kaydedildi.`,
            undo: () => dispatch({ type: 'deleteTransactions', ids: [transaction.id] }),
          })
          onClose()
        }}
      >
        <Segmented
          value={kind}
          onChange={(next) => {
            if (method === (kind === 'income' ? 'Banka / EFT' : 'Nakit')) {
              setMethod(next === 'income' ? 'Banka / EFT' : 'Nakit')
            }
            setKind(next)
            hapticTap()
          }}
          options={[
            { value: 'expense', label: <><ArrowUpRight size={15} /> Gider</> },
            { value: 'income', label: <><ArrowDownLeft size={15} /> Gelir</> },
          ]}
        />

        <label className="entry-amount-field">
          <span>{kind === 'income' ? 'Gelir tutarı' : 'Harcama tutarı'}</span>
          <div>
            <span aria-hidden="true">₺</span>
            <input
              data-modal-initial-focus
              aria-label="Tutar (TL)"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              maxLength={18}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                setError('')
              }}
              aria-invalid={Boolean(amount && parsed === null)}
              aria-describedby={amount && parsed === null ? amountErrorId : undefined}
              required
            />
          </div>
        </label>

        {amount && parsed === null && (
          <p id={amountErrorId} role="alert" className="text-label text-negative">
            Tutarı 1.250,50 biçiminde yaz.
          </p>
        )}

        {kind === 'expense' && (
          <fieldset className="entry-category-picker">
            <legend>Kategori</legend>
            <div>
              {quickCategories.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={category === id}
                  onClick={() => {
                    setCategory(id)
                    hapticTap()
                  }}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-xl"
                    style={{
                      background: `${categoryColor(id)}1F`,
                      color: categoryColor(id),
                    }}
                  >
                    <Icon size={17} strokeWidth={1.9} />
                  </span>
                  <span className="text-center leading-tight">{label}</span>
                  {category === id && <Check className="entry-selected-check" size={13} />}
                </button>
              ))}
            </div>
            <details>
              <summary>
                <span>
                  Diğer kategoriler
                  {!quickCategories.some((q) => q.id === category) && (
                    <span className="ml-1.5 font-semibold text-accent-text">· {categoryLabel(category)}</span>
                  )}
                </span>
                <ChevronDown size={15} />
              </summary>
              <Field label="Tüm kategoriler">
                <Select
                  ariaLabel="Tüm kategoriler"
                  value={category}
                  onChange={(next) => setCategory(next as CategoryId)}
                  options={SORTED_CATEGORIES.filter((item) => item.id !== 'rewards').map((item) => ({
                    value: item.id,
                    label: item.label,
                    icon: (
                      <span style={{ color: item.color }}>
                        <CategoryIcon category={item.id} size={14} />
                      </span>
                    ),
                  }))}
                />
              </Field>
            </details>
          </fieldset>
        )}

        <details className="entry-details">
          <summary>
            <span>
              <strong>Ayrıntılar</strong>
              <small>
                {date ? fullDayLabel(date) : 'Tarih seç'} · {method}
              </small>
            </span>
            <ChevronDown size={17} />
          </summary>
          <div className="entry-details-fields">
            <Field label="Açıklama (isteğe bağlı)">
              <TextInput
                maxLength={160}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={kind === 'income' ? 'Örn. Maaş' : 'Örn. Öğle yemeği'}
              />
            </Field>
            <div className="entry-date-row">
              <Field label="İşlem tarihi">
                <TextInput
                  required
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </Field>
              <Field label="Ödeme yöntemi">
                <Select
                  ariaLabel="Ödeme yöntemi"
                  value={method}
                  onChange={(next) => setMethod(next as EntryMethod)}
                  options={[
                    { value: 'Nakit', label: 'Nakit' },
                    { value: 'Banka / EFT', label: 'Banka / EFT' },
                    { value: 'Diğer', label: 'Diğer' },
                  ]}
                />
              </Field>
            </div>
          </div>
        </details>

        {error && (
          <p role="alert" className="text-label text-negative">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={parsed === null || !date}
          className="entry-submit"
        >
          <Check size={17} />
          {kind === 'income' ? 'Geliri' : 'Gideri'} kaydet
        </Button>
      </form>
    </Modal>
  )
}
