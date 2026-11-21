import { useMemo, useState } from 'react'
import { Bell, Check, CreditCard as CardIcon } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { importedCardDraft, linkImportedCard } from '../domain/cardLifecycle'
import type { CreditCard, Statement } from '../domain/types'
import { CardEditor } from './CardsSheet'
import { Button } from '../ui/primitives'
import { useFeedback } from '../ui/Feedback'
import { NotificationSettings } from './NotificationSettings'

/** Importing the file is separate from opting into a saved card and reminders. */
export function SaveImportedCardOffer({ statement, relatedStatements, onFinished }: {
  statement: Statement
  relatedStatements: Statement[]
  onFinished: () => void
}) {
  const { state, dispatch } = useStore()
  const feedback = useFeedback()
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const existingCards = state.profile.cards ?? []
  const draft = useMemo(() => importedCardDraft(statement, state.profile.archivedCards ?? [], existingCards.map(card => card.id)), [statement, state.profile.archivedCards, state.profile.cards])
  if (!draft && !saved) return null
  const save = (card: CreditCard) => {
    dispatch({ type: 'upsertCard', card })
    dispatch({ type: 'import', transactions: [], outcomes: [], statements: relatedStatements.map(item => linkImportedCard(state.statements.find(current => current.id === item.id) ?? item, card)) })
    setSaved(true)
    setEditing(false)
    feedback({ message: 'Kartın ve ekstre kesim günün kaydedildi.' })
  }
  return <section className="import-card-offer" aria-labelledby={`save-card-${statement.id}`}>
    {saved ? <><p role="status" className="import-card-offer-saved"><Check size={18} /> Kartın ve ekstre günün hazır.</p><NotificationSettings /><Button className="mt-4" onClick={onFinished}>Devam et</Button></> : <>
      <div className="import-card-offer-heading"><CardIcon size={23} /><div><h3 id={`save-card-${statement.id}`}>Kartını kaydetmek ister misin?</h3><p>{statement.accountLabel ?? statement.bank}</p></div></div>
      <p><Bell size={16} /> Ekstre kesim tarihinde hatırlatma al. Tam kart numaran gerekmez; işlemlerin zaten güvende.</p>
      {editing && draft ? <CardEditor key={draft.id} initial={draft} existingCards={existingCards} submitLabel="Kartı ve kesim gününü kaydet" onSave={save} onCancel={() => setEditing(false)} /> : <div className="import-card-offer-actions"><Button variant="primary" onClick={() => setEditing(true)}>Kartımı kaydet</Button><Button variant="ghost" onClick={onFinished}>Şimdi değil</Button></div>}
    </>}
  </section>
}
