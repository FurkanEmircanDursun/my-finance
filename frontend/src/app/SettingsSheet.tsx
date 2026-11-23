import { MoneySetting, settingAmount, settingAmountText } from '../ui/MoneySetting'
import { useEffect, useState, type ReactNode } from 'react'
import { trackScreen } from '../platform/analytics'
import { ArrowLeft, ChevronDown, CreditCard, History, Lock, LockOpen, ShieldCheck, Target } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Field, Segmented, TextInput } from '../ui/primitives'
import { money, count } from '../core/money'
import { todayKey, monthOf, monthLabel, monthDiff } from '../core/date'
import { hashPin, randomSalt, verifyPin, PIN_LENGTH } from '../core/pin'
import type { SavingsGoal } from '../domain/types'
import { useStore } from '../store/AppStore'
import { useSheets } from './sheets'
import { NotificationSettings } from './NotificationSettings'
import { AccountPanel } from './AccountPanel'
import { DiagnosticsSettings } from './DiagnosticsSettings'
import { CloudServicesSettings } from './CloudServicesSettings'

/** Full-page preferences keep long-lived settings outside transient sheets. */
export function SettingsPage({ onClose }: { onClose: () => void }) {
  useEffect(() => { trackScreen('settings') }, [])
  const { state, dispatch } = useStore()
  const { openArchive, openAccount, openCards } = useSheets()

  const { profile, settings, transactions, statements, rules } = state

  return (
    <div className="settings-page"><header className="page-heading"><button className="page-back" onClick={onClose} aria-label="Önceki sayfaya dön"><ArrowLeft size={20} /></button><div><h1>Ayarlar</h1></div></header>
      <div className="settings-grid">
        <AccountPanel onOpen={openAccount} />
        <div className="settings-block"><CloudServicesSettings /><DiagnosticsSettings /></div>
        <Block title="Kartlar ve hatırlatmalar">
          <Button onClick={openCards}><CreditCard size={18} /> Kartlarım ({profile.cards?.length ?? 0})</Button>
          <NotificationSettings />
        </Block>
        {/* ── Para ────────────────────────────────────────────────────────── */}
        <Block title="Para">
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneySetting label="Aylık gelir planı (₺)" hint="Tahminlerde kullanılır; gelir kaydı oluşturmaz." value={profile.monthlyIncome} onCommit={monthlyIncome => dispatch({ type: 'setProfile', profile: { monthlyIncome } })} />
            <MoneySetting label="Aylık harcama limiti (₺)" value={profile.spendingLimit} onCommit={spendingLimit => dispatch({ type: 'setProfile', profile: { spendingLimit } })} />
            <MoneySetting label="Bugünkü nakit (₺)" hint="Nakit akışı tahmininin başlangıç tutarı." value={profile.currentBalance} onCommit={currentBalance => dispatch({ type: 'setProfile', profile: { currentBalance } })} />
          </div>

          <GoalBlock />
        </Block>

        {/* ── Kilit ───────────────────────────────────────────────────────── */}
        <Block title="Uygulama kilidi" note="PIN bu oturum boyunca uygulama arka plana geçtiğinde sorulur. Uygulama kapandığında PIN sıfırlanır.">
          <AppLock />
        </Block>

        {/* ── Hesap ───────────────────────────────────────────────────────── */}

        {/* ── Veri ────────────────────────────────────────────────────────── */}
        <Block title="Veri" note="Kayıtların Firebase hesabında saklanır.">
          <p className="text-body text-muted">
            {count(transactions.length)} işlem · {count(statements.length)} ekstre
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Export, restore and the per-statement checks live in one place;
                this sheet only needs to point at it. */}
            <Button
              onClick={() => {
                openArchive()
              }}
            >
              <History size={16} />
              Geçmiş, dışa aktar, geri yükle
            </Button>
          </div>
        </Block>

        {/* ── Gelişmiş ────────────────────────────────────────────────────── */}
        <Disclosure title="Gelişmiş">
          <div className="space-y-6">
            <Field label="Tema">
              <Segmented
                value={settings.theme}
                onChange={(theme) => dispatch({ type: 'setSettings', settings: { theme } })}
                options={[
                  { value: 'system', label: 'Sistem' },
                  { value: 'light', label: 'Açık' },
                  { value: 'dark', label: 'Koyu' },
                ]}
              />
            </Field>

            <Field label="Tanıtım" hint="Uygulamanın ne yaptığını anlatan giriş ekranları">
              <Button onClick={() => { onClose(); dispatch({ type: 'setSettings', settings: { onboardingSeen: false } }) }}>
                Kurulum rehberini aç
              </Button>
            </Field>

            <div>
              <label className="flex cursor-pointer items-start gap-3 text-body text-muted">
                <input
                  type="checkbox"
                  checked={settings.useLocalOcr}
                  onChange={(e) =>
                    dispatch({ type: 'setSettings', settings: { useLocalOcr: e.target.checked } })
                  }
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                Taranmış PDF'ler için yerel OCR servisini kullan
              </label>
              {settings.useLocalOcr && (
                <div className="mt-3">
                  <Field label="Servis adresi" hint="Bu oturum için geçerlidir.">
                    <TextInput
                      value={settings.ocrEndpoint}
                      onChange={(e) =>
                        dispatch({ type: 'setSettings', settings: { ocrEndpoint: e.target.value } })
                      }
                    />
                  </Field>
                </div>
              )}
            </div>

            {rules.length > 0 && (
              <div>
                <p className="mb-2 text-body text-muted">
                  {count(rules.length)} işyeri için kategori öğrenildi.
                </p>
                <Button
                  variant="danger"
                  onClick={() => rules.forEach((rule) => dispatch({ type: 'removeRule', ruleId: rule.id }))}
                >
                  Öğrenilenleri sıfırla
                </Button>
              </div>
            )}
          </div>
        </Disclosure>

        <p className="pt-2 text-center text-label text-faint">
          Mizan {__APP_VERSION__}
        </p>
      </div>

    </div>
  )
}

/* ── Building blocks ─────────────────────────────────────────────────────── */

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="settings-block space-y-4">
      <div>
        <h3 className="text-title font-semibold text-ink">{title}</h3>
        {note && <p className="mt-1 text-label text-faint">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="settings-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="-ml-2 flex h-11 items-center gap-1.5 rounded-[var(--radius)] px-2 text-title font-semibold text-muted transition-colors duration-200 hover:bg-hover hover:text-ink"
      >
        {title}
        <ChevronDown size={17} className={clsx('transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && <div className="rise-in mt-4">{children}</div>}
    </section>
  )
}

/* ── Savings goal ────────────────────────────────────────────────────────── */

function GoalBlock() {
  const { state, dispatch } = useStore()
  const goal = state.profile.goal
  const [editing, setEditing] = useState(false)

  if (goal && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-body text-muted">
          Hedef <span className="num font-semibold text-ink">{money(goal.targetAmount)}</span> ·{' '}
          {monthLabel(goal.targetMonth)}
        </p>
        <Button size="sm" onClick={() => setEditing(true)}>
          Düzenle
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => dispatch({ type: 'setProfile', profile: { goal: null } })}
        >
          Kaldır
        </Button>
      </div>
    )
  }

  if (!goal && !editing) {
    return (
      <Button onClick={() => setEditing(true)}>
        <Target size={16} />
        Tasarruf hedefi koy
      </Button>
    )
  }

  return (
    <GoalForm
      initial={goal}
      onCancel={() => setEditing(false)}
      onSave={(next) => {
        dispatch({ type: 'setProfile', profile: { goal: next } })
        setEditing(false)
      }}
    />
  )
}

function GoalForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SavingsGoal | null
  onSave: (goal: SavingsGoal) => void
  onCancel: () => void
}) {
  const currentMonth = monthOf(todayKey())

  const [targetAmount, setTargetAmount] = useState(initial ? settingAmountText(initial.targetAmount) : '')
  const [targetMonth, setTargetMonth] = useState(initial?.targetMonth ?? '')
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? currentMonth)
  const [startingAmount, setStartingAmount] = useState(
    initial?.startingAmount ? settingAmountText(initial.startingAmount) : '',
  )

  const amount = settingAmount(targetAmount) ?? 0
  const starting = settingAmount(startingAmount) ?? 0
  const monthsSpan = targetMonth && startMonth ? monthDiff(startMonth, targetMonth) : null

  const error = monthsSpan !== null && monthsSpan < 0 ? 'Hedef ayı başlangıçtan önce olamaz.' : null
  const canSave = amount > 0 && !!targetMonth && !!startMonth && (monthsSpan ?? 0) >= 0

  return (
    <div className="space-y-4 rounded-[var(--radius-lg)] bg-sunken p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hedef tutar (₺)">
          <TextInput
            inputMode="decimal"
            placeholder="0"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
          />
        </Field>
        <Field label="Hedef ayı">
          <TextInput type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
        </Field>
        <Field label="Başlangıç ayı" hint="Birikime fiilen başladığın ay">
          <TextInput type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
        </Field>
        <Field label="Başlangıç birikimi (₺)">
          <TextInput
            inputMode="decimal"
            placeholder="0"
            value={startingAmount}
            onChange={(e) => setStartingAmount(e.target.value)}
          />
        </Field>
      </div>

      {error && <p className="text-body text-negative">{error}</p>}
      {!error && monthsSpan !== null && monthsSpan > 0 && (
        <p className="text-label text-faint">
          {monthsSpan} ay içinde ayda ortalama{' '}
          {money(Math.round((amount - starting) / Math.max(monthsSpan, 1)))} biriktirmen gerekir.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={!canSave}
          onClick={() =>
            canSave && onSave({ targetAmount: amount, targetMonth, startMonth, startingAmount: starting })
          }
        >
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}

/* ── App lock ────────────────────────────────────────────────────────────── */

/**
 * Only the salted hash lives in `Settings` (see `core/pin.ts`) — this component
 * is the only place the actual 4-digit PIN passes through memory, and only for
 * as long as it takes to hash or verify it.
 */
function AppLock() {
  const { state, dispatch } = useStore()
  const { lockPinHash, lockPinSalt } = state.settings
  const hasPin = Boolean(lockPinHash && lockPinSalt)

  const [mode, setMode] = useState<'idle' | 'setup' | 'change' | 'remove'>('idle')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setMode('idle')
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
    setError(null)
  }

  const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH)

  const confirmCurrentPin = async (): Promise<boolean> => {
    if (!lockPinHash || !lockPinSalt) return true
    return verifyPin(currentPin, lockPinSalt, lockPinHash)
  }

  const saveNewPin = async () => {
    setError(null)
    if (newPin.length !== PIN_LENGTH) {
      setError(`PIN ${PIN_LENGTH} haneli olmalı.`)
      return
    }
    if (newPin !== confirmPin) {
      setError("Girdiğin PIN'ler eşleşmiyor.")
      return
    }
    setBusy(true)
    if (mode === 'change' && !(await confirmCurrentPin())) {
      setError('Mevcut PIN yanlış.')
      setBusy(false)
      return
    }
    const salt = randomSalt()
    const hash = await hashPin(newPin, salt)
    dispatch({ type: 'setSettings', settings: { lockPinHash: hash, lockPinSalt: salt } })
    setBusy(false)
    reset()
  }

  const removePin = async () => {
    setError(null)
    setBusy(true)
    if (!(await confirmCurrentPin())) {
      setError('PIN yanlış.')
      setBusy(false)
      return
    }
    dispatch({ type: 'setSettings', settings: { lockPinHash: null, lockPinSalt: null } })
    setBusy(false)
    reset()
  }

  if (mode === 'idle') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={hasPin ? 'positive' : 'neutral'}>
          {hasPin ? <Lock size={12} /> : <LockOpen size={12} />}
          {hasPin ? 'Açık' : 'Kapalı'}
        </Badge>
        {hasPin ? (
          <>
            <Button size="sm" onClick={() => setMode('change')}>
              PIN değiştir
            </Button>
            <Button size="sm" variant="danger" onClick={() => setMode('remove')}>
              Kaldır
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setMode('setup')}>
            <ShieldCheck size={14} />
            PIN belirle
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-[var(--radius-lg)] bg-sunken p-4">
      {(mode === 'change' || mode === 'remove') && (
        <Field label="Mevcut PIN">
          <TextInput
            type="password"
            inputMode="numeric"
            autoFocus
            value={currentPin}
            onChange={(e) => setCurrentPin(digitsOnly(e.target.value))}
            placeholder="••••"
          />
        </Field>
      )}

      {mode !== 'remove' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Yeni PIN" hint={`${PIN_LENGTH} haneli`}>
            <TextInput
              type="password"
              inputMode="numeric"
              autoFocus={mode === 'setup'}
              value={newPin}
              onChange={(e) => setNewPin(digitsOnly(e.target.value))}
              placeholder="••••"
            />
          </Field>
          <Field label="Tekrar">
            <TextInput
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(digitsOnly(e.target.value))}
              placeholder="••••"
            />
          </Field>
        </div>
      )}

      {error && <p className="text-body text-negative">{error}</p>}

      <div className="flex gap-2">
        {mode === 'remove' ? (
          <Button variant="danger" disabled={busy} onClick={removePin}>
            Kilidi kaldır
          </Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={saveNewPin}>
            Kaydet
          </Button>
        )}
        <Button variant="ghost" onClick={reset}>
          Vazgeç
        </Button>
      </div>

      <p className="text-label text-faint">
        PIN bu oturumun belleğinde tutulur ve çıkışta temizlenir.
      </p>
    </div>
  )
}
