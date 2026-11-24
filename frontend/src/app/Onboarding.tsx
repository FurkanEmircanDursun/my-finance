import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CreditCard,
  Home,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { useStore } from '../store/AppStore'
import { CardEditor } from './CardsSheet'
import { NotificationSettings } from './NotificationSettings'
import { createEntry, entryAmount } from '../domain/entry'
import { todayKey, monthOf } from '../core/date'
import { money2 } from '../core/money'
import { Brand } from '../ui/Brand'
import { Button, Field, TextInput } from '../ui/primitives'
import { MoneyValue } from '../ui/MoneyValue'
import { AnimatedProgress, resolveBudgetTone } from '../ui/motion'
import { InteractiveDonutChart, type DonutSlice } from '../ui/charts'
import { PhysicalCard } from '../ui/PhysicalCard'
import { setBackInterceptor } from '../platform/native'
import { trackProductEvent } from '../platform/analytics'
import { hapticImpact, hapticTap } from '../platform/haptics'
import './onboarding.css'

const steps = [
  { label: 'Mizan’ı tanı', icon: SlidersHorizontal },
  { label: 'Kartını ekle', icon: CreditCard },
  { label: 'Gelirini ekle', icon: Wallet },
  { label: 'Hatırlatmaları seç', icon: Bell },
]

/** Interactive live financial cockpit sandbox; zero sample records touch the user's ledger. */
function BudgetPlayground() {
  const [income, setIncome] = useState(5500000)
  const [withRent, setWithRent] = useState(true)
  const [limit, setLimit] = useState(3800000)
  const [activeSlice, setActiveSlice] = useState<string | null>(null)

  const dailySpend = 1645000
  const billsSpend = 320000
  const rentSpend = withRent ? 1400000 : 0
  const spend = dailySpend + billsSpend + rentSpend
  const remaining = Math.max(0, income - spend)
  const netRemaining = income - spend
  const ratio = limit > 0 ? spend / limit : 0
  const used = Math.round(ratio * 100)
  const tone = resolveBudgetTone(ratio)

  const slices = useMemo<DonutSlice[]>(() => {
    const items: DonutSlice[] = [
      { id: 'daily', label: 'Günlük gider', value: dailySpend, color: '#2BD49B' },
      { id: 'bills', label: 'Fatura & sabit', value: billsSpend, color: '#38BDF8' },
    ]
    if (withRent) {
      items.push({ id: 'rent', label: 'Kira & aidat', value: rentSpend, color: '#E2C27D' })
    }
    if (remaining > 0) {
      items.push({ id: 'left', label: 'Sana kalan', value: remaining, color: '#64748B' })
    }
    return items
  }, [withRent, rentSpend, remaining])

  return (
    <section className="onb-preview" aria-labelledby="preview-title">
      <div className="onb-preview-heading">
        <div>
          <span className="onb-eyebrow">Canlı Önizleme</span>
          <h2 id="preview-title">Bir ayı deneyimle.</h2>
        </div>
        <span className="onb-sample-label">Örnek bütçe</span>
      </div>
      <p className="onb-preview-hint">
        Geliri değiştir, kirayı açıp kapat veya limitini kaydır. Kokpitin canlı tepkisini izle.
      </p>

      {/* Live Rolling Hero Readout + Interactive Exploding Donut */}
      <div className="onb-cockpit-visual">
        <div className="onb-donut-wrap">
          <InteractiveDonutChart
            data={slices}
            height={176}
            activeId={activeSlice}
            onSelect={setActiveSlice}
            totalLabel="Aylık gelir"
          />
        </div>
        <div className="onb-cockpit-stats" aria-live="polite" aria-atomic="true">
          <span className="onb-stat-kicker">Sana kalan</span>
          <div className={`onb-stat-hero ${netRemaining < 0 ? 'text-negative' : 'text-positive'}`}>
            <MoneyValue value={netRemaining} />
          </div>
          <p className="onb-stat-note">Kaydedilen gelir eksi gider; banka bakiyesi değil.</p>
          <div className="onb-mini-chips">
            <span>
              <i style={{ background: '#2BD49B' }} />
              Gider <strong className="num">{money2(spend)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Income Preset Pills */}
      <div className="onb-demo-income">
        <span>
          <ArrowDownLeft size={16} /> Örnek aylık gelir
        </span>
        <div className="onb-income-choices" role="group" aria-label="Örnek aylık gelir">
          {[4500000, 5500000, 7500000].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={income === value}
              onClick={() => {
                hapticTap()
                setIncome(value)
              }}
            >
              {money2(value)}
            </button>
          ))}
        </div>
      </div>

      {/* Expense Breakdown & Interactive Rent Switch */}
      <div className="onb-demo-list">
        <div className="onb-demo-row">
          <span>
            <ArrowUpRight size={16} /> Günlük & fatura
          </span>
          <strong className="num">{money2(dailySpend + billsSpend)}</strong>
        </div>
        <label className="onb-demo-row onb-rent-toggle">
          <span>
            <Home size={16} /> Kira & aidat
          </span>
          <strong className="num">{money2(1400000)}</strong>
          <input
            type="checkbox"
            checked={withRent}
            onChange={(event) => {
              hapticTap()
              setWithRent(event.target.checked)
            }}
            aria-label="Örnek bütçeye kirayı dahil et"
          />
        </label>
      </div>

      {/* Smart Threshold Limit Slider */}
      <div className="onb-demo-limit">
        <label htmlFor="onb-sample-limit">
          <span>Harcama limiti</span>
          <strong className="num">{money2(limit)}</strong>
        </label>
        <input
          id="onb-sample-limit"
          type="range"
          min={2000000}
          max={5500000}
          step={100000}
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
          aria-valuetext={money2(limit)}
          style={
            {
              '--onb-range-fill': `${((limit - 2000000) / 3500000) * 100}%`,
            } as CSSProperties
          }
        />
        <AnimatedProgress value={spend} max={limit} tone={tone} height={6} />
        <p className="onb-limit-caption">
          {spend > limit ? (
            <>
              <span className="onb-limit-over num">{money2(spend - limit)} limit üzerinde</span>
              <span className="num">%{used}</span>
            </>
          ) : (
            <>
              <span className="num">{money2(limit - spend)} harcama payın var</span>
              <span className="num">%{used} kullanıldı</span>
            </>
          )}
        </p>
      </div>

      <p className="onb-preview-footnote">
        <LockKeyhole size={13} /> Bu örnekler kayıtlarına eklenmez.
      </p>
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
  const hasIncome = state.transactions.some(
    (tx) => tx.kind === 'income' && monthOf(tx.date) === thisMonth,
  )
  const cards = state.profile.cards ?? []

  const finish = (completed = true) => {
    if (finishing.current) return
    finishing.current = true
    if (state.transactions.length === 0) {
      dispatch({ type: 'setFilters', filters: { month: thisMonth } })
    }
    hapticImpact()
    if (completed) trackProductEvent('onboarding_completed')
    onDone()
  }

  useEffect(() => {
    heading.current?.focus()
  }, [step])

  useEffect(() => {
    setBackInterceptor(() => {
      if (step === 0) return false
      setStep((current) => current - 1)
      return true
    })
    return () => setBackInterceptor(null)
  }, [step])

  const saveIncome = () => {
    if (hasIncome || savedIncome || incomeSaving.current) return
    const transaction = createEntry({
      description: 'Aylık gelir',
      amount,
      date: todayKey(),
      category: 'other',
      kind: 'income',
      method: 'Banka / EFT',
    })
    if (!transaction) return
    incomeSaving.current = true
    dispatch({ type: 'addManual', transaction })
    dispatch({ type: 'setFilters', filters: { month: thisMonth } })
    hapticImpact()
    setSavedIncome(true)
    setStep(3)
  }

  return (
    <main className={`mizan-onboarding ${step === 0 ? 'onb-welcome' : 'onb-setting-up'}`}>
      <header className="onb-header">
        <Brand size={36} animated />
        <button
          type="button"
          className="onb-quiet-action"
          onClick={() => finish(false)}
        >
          Kurulumu atla <ArrowRight size={15} />
        </button>
      </header>

      <div className="onb-layout">
        <aside className="onb-story">
          {step === 0 && (
            <span className="onb-badge">
              <Sparkles size={13} /> Yeni Nesil Kişisel Finans
            </span>
          )}
          <h1
            ref={step === 0 ? heading : undefined}
            tabIndex={step === 0 ? -1 : undefined}
          >
            {step === 0 ? (
              <>
                Ayın dengesi,
                <br />
                <span>senin elinde.</span>
              </>
            ) : (
              <>
                Küçük adımlar.
                <br />
                <span>Daha net bir ay.</span>
              </>
            )}
          </h1>
          <p>
            {step === 0
              ? 'Kartların, günlük giderlerin, varlıkların ve gelirin. Mizan hepsini tek bir yüksek hassasiyetli kokpitte buluşturur.'
              : 'Sana uygun bir başlangıç yapalım. Her adımı atlayabilir, dilediğinde Ayarlar’dan değiştirebilirsin.'}
          </p>

          {step === 0 ? (
            <>
              <div className="onb-start-actions">
                <Button
                  variant="primary"
                  className="onb-primary"
                  onClick={() => {
                    hapticTap()
                    setStep(1)
                  }}
                >
                  Mizan’a başla <ArrowRight size={17} />
                </Button>
              </div>
              <ul className="onb-pillars">
                <li>
                  <ShieldCheck size={16} />
                  <span>PDF ekstrelerin cihazında ayrıştırılır, bankanla kuruşu kuruşuna doğrulanır.</span>
                </li>
                <li>
                  <LockKeyhole size={16} />
                  <span>Kayıtların yalnızca senin Firebase hesabında saklanır.</span>
                </li>
              </ul>
            </>
          ) : (
            <ol className="onb-steps" aria-label="Kurulum adımları">
              {steps.map(({ label, icon: Icon }, index) => (
                <li
                  key={label}
                  aria-current={step === index ? 'step' : undefined}
                  className={index < step ? 'onb-step-complete' : ''}
                >
                  <span>
                    {index < step ? <Check size={15} /> : <Icon size={16} />}
                  </span>
                  <strong>{label}</strong>
                </li>
              ))}
            </ol>
          )}
        </aside>

        {step === 0 ? (
          <BudgetPlayground />
        ) : (
          <section
            key={step}
            className="onb-form-panel rise-in"
            aria-labelledby="onb-step-title"
          >
            <div
              className="onb-step-progress"
              aria-label={`Kurulum adımı ${step + 1}, toplam ${steps.length}`}
            >
              {steps.map((item, index) => (
                <span
                  key={item.label}
                  className={index <= step ? 'onb-progress-done' : ''}
                />
              ))}
            </div>

            <h2 id="onb-step-title" ref={heading} tabIndex={-1}>
              {[
                '',
                'Önce kartını tanıyalım.',
                'Bu ayki gelirini ekle.',
                'Tarihleri aklında tutma.',
              ][step]}
            </h2>

            {step === 1 && (
              <>
                <p>
                  Tam kart numaran gerekmez. Kartını ekleyip kesim ve hatırlatma günlerini belirle.
                </p>
                {cards.length > 0 ? (
                  <div className="mb-4 space-y-3">
                    <p className="onb-saved" role="status">
                      <Check size={16} /> {cards.length} kart hazır. Mevcut kartlarınla devam edebilirsin.
                    </p>
                    <PhysicalCard
                      bank={cards[0].bank}
                      bankLabel={cards[0].bank.toUpperCase()}
                      name={cards[0].name}
                      last4={cards[0].last4}
                      compact
                    />
                  </div>
                ) : null}
                <CardEditor
                  existingCards={cards}
                  onSave={(card) => {
                    dispatch({ type: 'upsertCard', card })
                    setStep(2)
                  }}
                  submitLabel={
                    cards.length
                      ? 'Yeni kartı kaydet ve devam et'
                      : 'Kartı kaydet ve devam et'
                  }
                />
                <button
                  type="button"
                  className="onb-quiet-action onb-skip"
                  onClick={() => {
                    hapticTap()
                    setStep(2)
                  }}
                >
                  {cards.length
                    ? 'Mevcut kartlarla devam et'
                    : 'Şimdilik kart ekleme'}{' '}
                  <ArrowRight size={15} />
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <p>
                  Bugünün tarihine gelir kaydı eklenir. Gelirden kalan tutar anında hesaplanır.
                </p>
                {hasIncome || savedIncome ? (
                  <div className="space-y-4">
                    <p className="onb-saved" role="status">
                      <Check size={17} /> Bu ay için gelirin zaten kayıtlı.
                    </p>
                    <Button
                      variant="primary"
                      className="onb-primary w-full"
                      onClick={() => {
                        hapticTap()
                        setStep(3)
                      }}
                    >
                      Devam et <ArrowRight size={17} />
                    </Button>
                  </div>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      saveIncome()
                    }}
                    className="onb-income-form"
                  >
                    <div className="onb-quick-amounts" aria-label="Hızlı tutar seçenekleri">
                      {['35.000', '50.000', '75.000', '100.000'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            hapticTap()
                            setAmount(preset)
                          }}
                          aria-pressed={amount === preset}
                        >
                          ₺{preset}
                        </button>
                      ))}
                    </div>
                    <Field label="Bu ay aldığın toplam gelir (₺)" hint="Örnek: 45.000,00">
                      <TextInput
                        inputMode="decimal"
                        autoComplete="off"
                        value={amount}
                        placeholder="0,00"
                        maxLength={18}
                        onChange={(event) => setAmount(event.target.value)}
                        aria-invalid={amount !== '' && entryAmount(amount) === null}
                      />
                    </Field>
                    {amount && entryAmount(amount) === null && (
                      <p role="alert" className="text-label text-negative">
                        Geçerli bir tutar yaz. Örnek: 45.000,00
                      </p>
                    )}
                    {entryAmount(amount) !== null && (
                      <p className="text-label text-positive num">
                        Kaydedilecek gelir: {money2(entryAmount(amount)!)}
                      </p>
                    )}
                    <Button
                      type="submit"
                      variant="primary"
                      className="onb-primary w-full"
                      disabled={entryAmount(amount) === null}
                    >
                      Geliri kaydet ve devam et <ArrowRight size={17} />
                    </Button>
                  </form>
                )}
                {!hasIncome && !savedIncome && (
                  <button
                    type="button"
                    className="onb-quiet-action onb-skip"
                    onClick={() => {
                      hapticTap()
                      setStep(3)
                    }}
                  >
                    Gelirimi sonra ekleyeceğim <ArrowRight size={15} />
                  </button>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <p>
                  Kartının ekstre kesim ve veri giriş gününde nazik hatırlatma al. Tarihleri dilediğinde Kartlarım’dan değiştirebilirsin.
                </p>
                <NotificationSettings />
                <div className="onb-finish">
                  <Button
                    variant="primary"
                    className="onb-primary w-full"
                    onClick={() => finish()}
                  >
                    Mizan’ı aç <ArrowRight size={17} />
                  </Button>
                  <span>Her şey hazır. Ayın dengesi seni bekliyor.</span>
                </div>
              </>
            )}

            <button
              type="button"
              className="onb-quiet-action onb-back"
              onClick={() => {
                hapticTap()
                setStep((current) => current - 1)
              }}
            >
              <ArrowLeft size={15} /> Önceki adım
            </button>
          </section>
        )}
      </div>
    </main>
  )
}
