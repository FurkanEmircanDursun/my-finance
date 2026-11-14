import { trackProductEvent, trackScreen } from '../platform/analytics'
import { hapticImpact } from '../platform/haptics'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { CalendarDays, CreditCard as CreditCardIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { uid } from '../core/hash'
import { cardBankLabel, cardDisplayName, isCardDay, nextCardDate } from '../domain/cards'
import type { CardBank, CreditCard } from '../domain/types'
import { useStore } from '../store/AppStore'
import { Modal } from '../ui/Modal'
import { Button, Field, TextInput } from '../ui/primitives'

export function CardEditor({ initial, onSave, onCancel, submitLabel, existingCards = [] }: {
  initial?: CreditCard
  onSave: (card: CreditCard) => void
  onCancel?: () => void
  submitLabel?: string
  existingCards?: readonly CreditCard[]
}) {
  const id = useId()
  const [bank, setBank] = useState<CardBank>(initial?.bank ?? 'akbank')
  const [name, setName] = useState(initial?.name ?? 'Akbank Axess')
  const [last4, setLast4] = useState(initial?.last4 ?? '')
  const [statementDay, setStatementDay] = useState(String(initial?.statementDay ?? ''))
  const [entryDay, setEntryDay] = useState(String(initial?.entryDay ?? ''))
  const [remindersEnabled, setRemindersEnabled] = useState(initial?.remindersEnabled !== false)
  const [error, setError] = useState('')

  function save(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) { setError('Kartına kısa bir ad ver.'); return }
    if (last4 && !/^\d{4}$/.test(last4)) { setError('Son 4 haneyi gir veya alanı boş bırak.'); return }
    if (!isCardDay(Number(statementDay)) || !isCardDay(Number(entryDay))) {
      setError('Ekstre kesim ve veri giriş günlerini 1–31 arasında gir.'); return
    }
    const card: CreditCard = {
      id: initial?.id ?? uid('card-'), bank, name: name.trim(),
      ...(last4 ? { last4 } : {}), statementDay: Number(statementDay), entryDay: Number(entryDay), remindersEnabled,
    }
    if (existingCards.some((item) => item.id !== card.id && cardDisplayName(item).toLocaleLowerCase('tr-TR') === cardDisplayName(card).toLocaleLowerCase('tr-TR'))) {
      setError('Bu adla bir kartın var. Farklı bir ad veya son 4 hane kullan.'); return
    }
    hapticImpact()
    if (!initial) void trackProductEvent('card_added')
    onSave(card)
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Field label="Banka" hint={initial ? 'Banka değişikliği için yeni kart ekleyebilirsin.' : undefined}>
        <select className="h-11 w-full rounded-[var(--radius)] border border-line bg-raised px-3 text-body text-ink disabled:opacity-70" value={bank} disabled={Boolean(initial)} onChange={(event) => {
          const value = event.target.value as CardBank
          setBank(value)
          if (name === 'Akbank Axess' || name === 'Garanti Bonus') setName(value === 'akbank' ? 'Akbank Axess' : 'Garanti Bonus')
        }}>
          <option value="akbank">Akbank</option>
          <option value="garanti">Garanti BBVA</option>
        </select>
      </Field>
      <Field label="Kart adı" hint="Örneğin: Ev harcamaları veya Bonus kartım">
        <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required autoComplete="off" />
      </Field>
      <Field label="Son 4 hane (isteğe bağlı)" hint="Kartları ayırt etmek için. Tam kart numaranı girme.">
        <TextInput value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="1234" autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ekstre kesim günü">
          <TextInput type="number" min={1} max={31} step={1} inputMode="numeric" placeholder="Örn. 20" value={statementDay} onChange={(event) => setStatementDay(event.target.value)} required />
        </Field>
        <Field label="Aylık veri giriş günü">
          <TextInput type="number" min={1} max={31} step={1} inputMode="numeric" placeholder="Örn. 21" value={entryDay} onChange={(event) => setEntryDay(event.target.value)} required />
        </Field>
      </div>
      <p className="text-label text-muted">Seçtiğin gün kısa aylarda yoksa ayın son günü kullanılır.</p>
      <label htmlFor={`${id}-reminders`} className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink">
        <input id={`${id}-reminders`} type="checkbox" checked={remindersEnabled} onChange={(event) => setRemindersEnabled(event.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
        Bu kartın tarihlerini hatırlat
      </label>
      {error && <p role="alert" className="text-body text-negative">{error}</p>}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" variant="primary" className="flex-1">{submitLabel ?? (initial ? 'Değişiklikleri kaydet' : 'Kartı ekle')}</Button>
        {onCancel && <Button onClick={onCancel}>Vazgeç</Button>}
      </div>
    </form>
  )
}

export function CardsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => { if (open) trackScreen('cards') }, [open])
  const { state, dispatch } = useStore()
  const cards = state.profile.cards ?? []
  const [editing, setEditing] = useState<CreditCard | 'new' | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  return (
    <Modal open={open} onClose={onClose} title={editing ? (editing === 'new' ? 'Kart ekle' : 'Kartı düzenle') : 'Kartlarım'}>
      {editing ? <CardEditor key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} existingCards={cards} onSave={(card) => {
        dispatch({ type: 'upsertCard', card }); setEditing(null); setMessage('Kart kaydedildi.')
      }} onCancel={() => setEditing(null)} /> : <div className="space-y-5">
        <p className="text-body leading-relaxed text-muted">Kartlarını ve aylık tarihlerini tek yerden yönet. Ekstre eklerken ilgili kartı seç.</p>
        {message && <p role="status" className="text-body text-positive">{message}</p>}
        {cards.length === 0 && <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CreditCardIcon size={32} className="text-muted" />
          <p className="text-title font-semibold text-ink">İlk kartını ekle</p>
          <p className="max-w-xs text-body text-muted">Akbank ve Garanti BBVA kartlarını ekleyebilir, her biri için ayrı tarih belirleyebilirsin.</p>
        </div>}
        <ul className="divide-y divide-line">
          {cards.map((card) => <li key={card.id} className="py-5 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-label text-muted">{cardBankLabel(card.bank)}</p>
                <h3 className="break-words text-title font-semibold text-ink">{cardDisplayName(card)}</h3>
              </div>
              <Button aria-label={`${cardDisplayName(card)} kartını düzenle`} onClick={() => { setEditing(card); setDeleting(null); setMessage('') }}><Pencil size={16} /></Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-body">
              <div><p className="text-label text-muted">Ekstre kesimi</p><p className="mt-1 font-semibold text-ink">Her ayın {card.statementDay}. günü</p></div>
              <div><p className="text-label text-muted">Veri girişi</p><p className="mt-1 font-semibold text-ink">Her ayın {card.entryDay}. günü</p></div>
            </div>
            <p className="mt-3 flex items-center gap-2 text-label text-muted"><CalendarDays size={15} />Sonraki kesim: {nextCardDate(card.statementDay).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</p>
            <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink">
              <input type="checkbox" checked={card.remindersEnabled !== false} onChange={(event) => dispatch({ type: 'upsertCard', card: { ...card, remindersEnabled: event.target.checked } })} className="h-5 w-5 accent-[var(--accent)]" />
              Tarihleri hatırlat
            </label>
            {deleting === card.id ? <div className="mt-2 space-y-3 rounded-[var(--radius)] bg-sunken p-3">
              <p className="text-body text-muted">Kart ve hatırlatmaları kaldırılsın mı? Yüklediğin ekstreler ve işlemler korunur.</p>
              <div className="flex gap-2"><Button variant="danger" onClick={() => { dispatch({ type: 'removeCard', cardId: card.id }); setDeleting(null); setMessage('Kart kaldırıldı. İşlemlerin korundu.') }}>Kartı kaldır</Button><Button onClick={() => setDeleting(null)}>Vazgeç</Button></div>
            </div> : <Button variant="ghost" onClick={() => setDeleting(card.id)} className="mt-2"><Trash2 size={15} />Kartı kaldır</Button>}
          </li>)}
        </ul>
        <Button variant="primary" className="w-full" onClick={() => { setEditing('new'); setDeleting(null); setMessage('') }}><Plus size={17} />Kart ekle</Button>
        {(state.profile.archivedCards?.length ?? 0) > 0 && <details className="border-t border-line pt-4">
          <summary className="min-h-11 cursor-pointer text-body font-semibold text-ink">Kaldırılan kartı geri ekle</summary>
          <p className="mb-2 text-label text-muted">Aynı kartı yeniden kullanırken eski ekstrelerinle bağlantısı korunur.</p>
          <ul className="space-y-2">{state.profile.archivedCards?.map((card) => <li key={card.id}>
            <Button className="w-full justify-between" onClick={() => { setEditing(card); setMessage('') }}>{cardDisplayName(card)}<Plus size={16} /></Button>
          </li>)}</ul>
        </details>}
        <p className="text-label leading-relaxed text-muted">Kart eklemek bankana bağlanmaz. Hatırlatmalar için Ayarlar bölümünden bildirim iznini aç.</p>
      </div>}
    </Modal>
  )
}
