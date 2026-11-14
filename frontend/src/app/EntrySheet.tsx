import { useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Coffee, Home, ShoppingBasket, Receipt, Car, MoreHorizontal } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button, Field, Segmented, TextInput } from '../ui/primitives'
import { CATEGORIES, categoryLabel, type CategoryId } from '../domain/categories'
import { createEntry, entryAmount, entryDateForPeriod, type EntryMethod } from '../domain/entry'
import { monthLabel } from '../core/date'
import { useStore } from '../store/AppStore'
import { useFeedback } from '../ui/Feedback'
import { hapticImpact, hapticTap } from '../platform/haptics'
import { trackProductEvent } from '../platform/analytics'
import '../ui/transaction-item.css'

const quickCategories = [
  { id: 'market', label: 'Market', icon: ShoppingBasket },
  { id: 'dining', label: 'Yeme içme', icon: Coffee },
  { id: 'transport', label: 'Ulaşım', icon: Car },
  { id: 'rent', label: 'Kira', icon: Home },
  { id: 'bills', label: 'Fatura', icon: Receipt },
  { id: 'other', label: 'Diğer', icon: MoreHorizontal },
] as const

export function EntrySheet({ onClose, initialKind = 'expense' }: { onClose: () => void; initialKind?: 'expense' | 'income' }) {
  const { state, dispatch } = useStore()
  const feedback = useFeedback()
  const submitted = useRef(false)
  const [kind, setKind] = useState<'expense' | 'income'>(initialKind)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => entryDateForPeriod(state.filters.month))
  const [category, setCategory] = useState<CategoryId>('other')
  const [method, setMethod] = useState<EntryMethod>(initialKind === 'income' ? 'Banka / EFT' : 'Nakit')
  const [error, setError] = useState('')
  const parsed = entryAmount(amount)

  return <Modal open onClose={onClose} title="Yeni kayıt" variant="sheet">
    <form className="entry-composer" onSubmit={event => {
      event.preventDefault()
      if (submitted.current) return
      const transaction = createEntry({
        description: description.trim() || (kind === 'income' ? 'Gelir' : categoryLabel(category)),
        amount, date, category: kind === 'income' ? 'other' : category, method, kind,
      })
      if (!transaction) { setError('Tutarı ve tarihi kontrol et. Örnek tutar: 1.250,50'); return }
      submitted.current = true
      dispatch({ type: 'addManual', transaction })
      dispatch({ type: 'setFilters', filters: { month: date.slice(0, 7), cards: [], categories: [], query: '' } })
      hapticImpact()
      void trackProductEvent('entry_saved')
      feedback({ message: `${kind === 'income' ? 'Gelir' : 'Gider'} kaydedildi.`, undo: () => dispatch({ type: 'deleteTransactions', ids: [transaction.id] }) })
      onClose()
    }}>
      <Segmented value={kind} onChange={next => { setKind(next); hapticTap() }} options={[
        { value: 'expense', label: <><ArrowUpRight size={15} /> Gider</> },
        { value: 'income', label: <><ArrowDownLeft size={15} /> Gelir</> },
      ]} />
      <label className="entry-amount-field">
        <span>Tutar</span>
        <div><span aria-hidden="true">₺</span><input aria-label="Tutar (TL)" inputMode="decimal" autoComplete="off" placeholder="0,00" maxLength={18} value={amount} onChange={event => { setAmount(event.target.value); setError('') }} aria-invalid={Boolean(amount && parsed === null)} required /></div>
      </label>
      {amount && parsed === null && <p role="alert" className="text-body text-negative">Geçerli tutar yaz. Örnek: 1.250,50</p>}
      {kind === 'expense' && <fieldset className="entry-category-picker">
        <legend>Kategori</legend>
        <div>{quickCategories.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={category === id} onClick={() => { setCategory(id); hapticTap() }}><Icon size={21} strokeWidth={1.6} /><span>{label}</span>{category === id && <Check className="entry-selected-check" size={12} />}</button>)}</div>
        <details><summary>Diğer kategoriler <ChevronDown size={15} /></summary><Field label="Tüm kategoriler"><select className="finance-select" value={category} onChange={event => setCategory(event.target.value as CategoryId)}>{CATEGORIES.filter(item => item.id !== 'rewards').map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field></details>
      </fieldset>}
      <Field label="Açıklama (isteğe bağlı)"><TextInput maxLength={160} value={description} onChange={event => setDescription(event.target.value)} placeholder={kind === 'income' ? 'Örn. Maaş' : 'Örn. Öğle yemeği'} /></Field>
      <div className="entry-date-row">
        <Field label="İşlem tarihi" hint={date ? `${monthLabel(date.slice(0, 7))} dönemine kaydedilir.` : 'Kayıt için bir tarih seç.'}>
          <TextInput required type="date" value={date} onChange={event => setDate(event.target.value)} />
        </Field>
        <Field label="Ödeme yöntemi">
          <select className="finance-select" value={method} onChange={event => setMethod(event.target.value as EntryMethod)}><option>Nakit</option><option>Banka / EFT</option><option>Diğer</option></select>
        </Field>
      </div>
      {error && <p role="alert" className="text-body text-negative">{error}</p>}
      <Button type="submit" variant="primary" disabled={parsed === null || !date} className="entry-submit"><Check size={18} />{kind === 'income' ? 'Geliri' : 'Gideri'} kaydet</Button>
      <p className="entry-footnote">Ekstredeki harcamayı tekrar ekleme. Kart borcu ödemesi yeni gider sayılmaz.</p>
    </form>
  </Modal>
}
