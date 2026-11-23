import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Check, CreditCard, Home, LockKeyhole, SlidersHorizontal, Wallet } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { CardEditor } from './CardsSheet'
import { NotificationSettings } from './NotificationSettings'
import { createEntry, entryAmount } from '../domain/entry'
import { todayKey, monthOf } from '../core/date'
import { money2 } from '../core/money'
import { Brand } from '../ui/Brand'
import { Button, Field, TextInput } from '../ui/primitives'
import { setBackInterceptor } from '../platform/native'
import { trackProductEvent } from '../platform/analytics'
import { hapticTap } from '../platform/haptics'
import './onboarding.css'

const steps = [
  { label: 'Mizan’ı tanı', icon: SlidersHorizontal },
  { label: 'Kartını ekle', icon: CreditCard },
  { label: 'Gelirini ekle', icon: Wallet },
  { label: 'Hatırlatmaları seç', icon: Bell },
]

/** Preview controls only change component state; financial records stay untouched. */
function BudgetPlayground() {
  const [income, setIncome] = useState(4500000)
  const [withRent, setWithRent] = useState(true)
  const [limit, setLimit] = useState(3500000)
  const spend = 1845000 + (withRent ? 1200000 : 0)
  const remaining = income - spend
  const used = Math.min(100, Math.round(spend / limit * 100))

  return (
    <section className="onb-preview" aria-labelledby="preview-title">
      <div className="onb-preview-heading">
        <h2 id="preview-title">Bir ayı deneyimle.</h2>
        <span className="onb-sample-label">Örnek bütçe</span>
      </div>
      <p className="onb-preview-hint">Tutarları değiştir. Dengenin nasıl değiştiğini gör.</p>
      <div className="onb-demo-income">
        <span><ArrowDownLeft size={18} /> Aylık gelir</span>
        <div className="onb-income-choices" aria-label="Örnek aylık gelir">
          {[4500000, 6000000].map(value => <button key={value} type="button" aria-pressed={income === value} onClick={() => setIncome(value)}>{money2(value)}</button>)}
        </div>
      </div>
      <div className="onb-flow" role="img" aria-label={`Örnek gelir ${money2(income)}, gider ${money2(spend)}, gelirden kalan ${money2(remaining)}`}>
        <span className="onb-flow-spend" style={{ flexGrow: spend }} />
        <span className="onb-flow-remaining" style={{ flexGrow: remaining }} />
      </div>
      <div className="onb-flow-key"><span><i />Gider</span><span><i />Gelirden kalan</span></div>
      <div className="onb-demo-row"><span><ArrowUpRight size={17} /> Günlük giderler</span><strong className="num">{money2(1845000)}</strong></div>
      <label className="onb-demo-row onb-rent-toggle">
        <span><Home size={17} /> Kira</span>
        <strong className="num">{money2(1200000)}</strong>
        <input type="checkbox" checked={withRent} onChange={event => setWithRent(event.target.checked)} aria-label="Örnek bütçeye kirayı dahil et" />
      </label>
      <div className="onb-demo-result" aria-live="polite" aria-atomic="true">
        <span>Sana kalan</span>
        <strong className="num">{money2(remaining)}</strong>
        <small>Kaydedilen gelir eksi gider; banka bakiyesi değil.</small>
      </div>
      <div className="onb-demo-limit">
        <label htmlFor="onb-sample-limit">Harcama limitini dene <strong className="num">{money2(limit)}</strong></label>
        <input id="onb-sample-limit" type="range" min={2000000} max={4500000} step={100000} value={limit} onChange={event => setLimit(Number(event.target.value))} aria-valuetext={money2(limit)} style={{ '--onb-range-fill': `${(limit - 2000000) / 2500000 * 100}%` } as CSSProperties} />
        <p>{spend > limit ? <><span className="onb-limit-over">{money2(spend - limit)} limit üzerinde</span><span>Örnek gider: {money2(spend)}</span></> : <><span>{money2(limit - spend)} harcama payın var</span><span>%{used} kullanıldı</span></>}</p>
      </div>
      <p className="onb-preview-footnote"><LockKeyhole size={13} /> Bu örnekler kayıtlarına eklenmez.</p>
    </section>
  )
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useStore()
  const [step, setStep] = useState(0)
  const [amount, setAmount] = useState('')
  const [savedIncome, setSavedIncome] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const incomeSaving = useRef(false)
  const finishing = useRef(false)
  const thisMonth = monthOf(todayKey())
  const hasIncome = state.transactions.some(tx => tx.kind === 'income' && monthOf(tx.date) === thisMonth)
  const cards = state.profile.cards ?? []
  const finish = (completed = true) => {
    if (finishing.current) return
    finishing.current = true
    if (state.transactions.length === 0) dispatch({ type: 'setFilters', filters: { month: thisMonth } })
    hapticTap()
    if (completed) trackProductEvent('onboarding_completed')
    onDone()
  }

  useEffect(() => { heading.current?.focus() }, [step])
  useEffect(() => {
    setBackInterceptor(() => {
      if (step === 0) return false
      setStep(current => current - 1)
      return true
    })
    return () => setBackInterceptor(null)
  }, [step])

  const saveIncome = () => {
    if (hasIncome || savedIncome || incomeSaving.current) return
    const transaction = createEntry({ description: 'Aylık gelir', amount, date: todayKey(), category: 'other', kind: 'income', method: 'Banka / EFT' })
    if (!transaction) return
    incomeSaving.current = true
    dispatch({ type: 'addManual', transaction })
    dispatch({ type: 'setFilters', filters: { month: thisMonth } })
    setSavedIncome(true)
    setStep(3)
  }

  return (
    <main className={`mizan-onboarding ${step === 0 ? 'onb-welcome' : 'onb-setting-up'}`}>
      <header className="onb-header">
        <Brand size={36} />
        <button type="button" className="onb-quiet-action" onClick={() => finish(false)}>Kurulumu atla <ArrowRight size={16} /></button>
      </header>
      <div className="onb-layout">
        <aside className="onb-story">
          <h1 ref={step === 0 ? heading : undefined} tabIndex={step === 0 ? -1 : undefined}>{step === 0 ? <>Ayın dengesi,<br /><span>senin elinde.</span></> : <>Küçük adımlar.<br /><span>Daha net bir ay.</span></>}</h1>
          <p>{step === 0 ? 'Kartların, günlük giderlerin ve gelirin. Mizan hepsini aynı resimde buluşturur.' : 'Sana uygun bir başlangıç yapalım. Her adımı atlayabilir, sonradan tamamlayabilirsin.'}</p>
          {step === 0 ? <>
            <div className="onb-start-actions">
              <Button variant="primary" className="onb-primary" onClick={() => { hapticTap(); setStep(1) }}>Mizan’a başla <ArrowRight size={18} /></Button>
            </div>
          </> : <ol className="onb-steps" aria-label="Kurulum adımları">
            {steps.map(({ label, icon: Icon }, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={index < step ? 'onb-step-complete' : ''}>
              <span>{index < step ? <Check size={16} /> : <Icon size={17} />}</span><strong>{label}</strong>
            </li>)}
          </ol>}
          <p className="onb-privacy"><LockKeyhole size={15} aria-hidden="true" /> Kayıtların Firebase hesabında saklanır.</p>
        </aside>
        {step === 0 ? <BudgetPlayground /> : <section className="onb-form-panel" aria-labelledby="onb-step-title">
          <div className="onb-step-progress" aria-label={`Kurulum adımı ${step + 1}, toplam ${steps.length}`}>
            {steps.map((item, index) => <span key={item.label} className={index <= step ? 'onb-progress-done' : ''} />)}
          </div>
          <h2 id="onb-step-title" ref={heading} tabIndex={-1}>{['', 'Önce kartını tanıyalım.', 'Bu ayki gelirini ekle.', 'Tarihleri aklında tutma.'][step]}</h2>
          {step === 1 && <>
            <p>Tam kart numaran gerekmez. Kartını ekleyip kesim ve hatırlatma günlerini belirle.</p>
            {cards.length > 0 && <p className="onb-saved" role="status"><Check size={17} /> {cards.length} kart hazır. Mevcut kartlarınla devam edebilirsin.</p>}
            <CardEditor existingCards={cards} onSave={card => { dispatch({ type: 'upsertCard', card }); setStep(2) }} submitLabel={cards.length ? 'Yeni kartı kaydet ve devam et' : 'Kartı kaydet ve devam et'} />
            <button type="button" className="onb-quiet-action onb-skip" onClick={() => setStep(2)}>{cards.length ? 'Mevcut kartlarla devam et' : 'Şimdilik kart ekleme'} <ArrowRight size={15} /></button>
          </>}
          {step === 2 && <>
            <p>Bugünün tarihine gelir kaydı eklenir. Sonraki aylarda gelirini yeniden kaydedebilirsin.</p>
            {hasIncome || savedIncome ? <>
              <p className="onb-saved" role="status"><Check size={18} /> Bu ay için gelirin zaten kayıtlı.</p>
              <Button variant="primary" className="onb-primary" onClick={() => setStep(3)}>Devam et <ArrowRight size={17} /></Button>
            </> : <form onSubmit={event => { event.preventDefault(); saveIncome() }} className="onb-income-form">
              <Field label="Bu ay aldığın toplam gelir (₺)" hint="Örnek: 45.000,00">
                <TextInput inputMode="decimal" autoComplete="off" value={amount} placeholder="0,00" maxLength={18} onChange={event => setAmount(event.target.value)} aria-invalid={amount !== '' && entryAmount(amount) === null} />
              </Field>
              {amount && entryAmount(amount) === null && <p role="alert" className="text-body text-negative">Geçerli bir tutar yaz. Örnek: 45.000,00</p>}
              {entryAmount(amount) !== null && <p className="text-body text-muted num">Kaydedilecek gelir: {money2(entryAmount(amount)!)}</p>}
              <Button type="submit" variant="primary" className="onb-primary" disabled={entryAmount(amount) === null}>Geliri kaydet ve devam et <ArrowRight size={17} /></Button>
            </form>}
            {!hasIncome && !savedIncome && <button type="button" className="onb-quiet-action onb-skip" onClick={() => setStep(3)}>Gelirimi sonra ekleyeceğim <ArrowRight size={15} /></button>}
          </>}
          {step === 3 && <>
            <p>Kartının ekstre kesim ve veri giriş gününde hatırlatma al. Tarihleri Kartlarım’dan değiştirebilirsin.</p>
            <NotificationSettings />
            <div className="onb-finish"><Button variant="primary" className="onb-primary" onClick={() => finish()}>Mizan’ı aç <ArrowRight size={17} /></Button><span>İlk kaydını eklemek için her şey hazır.</span></div>
          </>}
          <button type="button" className="onb-quiet-action onb-back" onClick={() => setStep(current => current - 1)}><ArrowLeft size={15} /> Önceki adım</button>
        </section>}
      </div>
    </main>
  )
}
