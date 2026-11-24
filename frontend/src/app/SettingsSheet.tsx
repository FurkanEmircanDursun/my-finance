import { MoneySetting, settingAmount, settingAmountText } from '../ui/MoneySetting'
import { useEffect, useState, type ReactNode } from 'react'
import { trackScreen } from '../platform/analytics'
import {
  ArrowLeft,
  ChevronDown,
  CreditCard,
  Database,
  History,
  Lock,
  LockOpen,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Target,
  Wallet,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Field, TextInput } from '../ui/primitives'
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
import { hapticTap } from '../platform/haptics'
import { Stagger } from '../ui/motion'

export function SettingsPage({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    trackScreen('settings')
  }, [])
  const { state, dispatch } = useStore()
  const { openArchive, openAccount, openCards } = useSheets()

  const { profile, settings, transactions, statements, rules } = state

  const setTheme = (theme: 'system' | 'light' | 'dark') => {
    hapticTap()
    dispatch({ type: 'setSettings', settings: { theme } })
  }

  return (
    <div className="settings-page">
      <header className="page-heading">
        <button
          type="button"
          className="page-back"
          onClick={onClose}
          aria-label="Önceki sayfaya dön"
        >
          <ArrowLeft size={19} />
        </button>
        <div>
          <h1>Ayarlar</h1>
          <p>Hesap, görünüm, finansal hedefler, güvenlik ve veri yedekleri</p>
        </div>
      </header>

      <div className="settings-grid">
        <Stagger index={0}>
          <AccountPanel onOpen={openAccount} />
        </Stagger>

        <Stagger index={1}>
          <Block
            icon={<Palette size={17} />}
            title="Görünüm ve tema"
            note="Obsidian Studio (Koyu) veya Alabaster Vault (Açık) temasını seç."
          >
            <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Tema">
              {(
                [
                  { value: 'dark', label: 'Koyu', desc: 'Obsidian', icon: Moon },
                  { value: 'light', label: 'Açık', desc: 'Alabaster', icon: Sun },
                  { value: 'system', label: 'Sistem', desc: 'Otomatik', icon: Monitor },
                ] as const
              ).map(({ value, label, desc, icon: Icon }) => {
                const active = settings.theme === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTheme(value)}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 rounded-[var(--radius)] border p-3.5 text-center transition-all duration-200 active:scale-[0.97]',
                      active
                        ? 'border-accent-border bg-accent-soft text-accent-text shadow-card'
                        : 'border-line bg-sunken text-muted hover:border-line-strong hover:text-ink',
                    )}
                  >
                    <Icon size={18} />
                    <span className="text-label font-semibold">{label}</span>
                    <span className="text-[11px] opacity-75">{desc}</span>
                  </button>
                )
              })}
            </div>
          </Block>
        </Stagger>

        <Stagger index={2}>
          <Block
            icon={<Wallet size={17} />}
            title="Para ve hedefler"
            note="Bütçe göstergesi, nakit akışı tahmini ve tasarruf hedefin için referanslar."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneySetting
                label="Aylık gelir planı (₺)"
                hint="Tahminlerde kullanılır; gelir kaydı oluşturmaz."
                value={profile.monthlyIncome}
                onCommit={(monthlyIncome) =>
                  dispatch({ type: 'setProfile', profile: { monthlyIncome } })
                }
              />
              <MoneySetting
                label="Aylık harcama limiti (₺)"
                value={profile.spendingLimit}
                onCommit={(spendingLimit) =>
                  dispatch({ type: 'setProfile', profile: { spendingLimit } })
                }
              />
              <MoneySetting
                label="Bugünkü nakit (₺)"
                hint="Nakit akışı tahmininin başlangıç tutarı."
                value={profile.currentBalance}
                onCommit={(currentBalance) =>
                  dispatch({ type: 'setProfile', profile: { currentBalance } })
                }
              />
            </div>

            <div className="border-t border-line pt-4">
              <GoalBlock />
            </div>
          </Block>
        </Stagger>

        <Stagger index={3}>
          <Block icon={<CreditCard size={17} />} title="Kartlar ve hatırlatmalar">
            <Button onClick={openCards}>
              <CreditCard size={16} /> Kartlarım ({profile.cards?.length ?? 0})
            </Button>
            <NotificationSettings />
          </Block>
        </Stagger>

        <Stagger index={4}>
          <Block
            icon={<Lock size={17} />}
            title="Uygulama kilidi"
            note="PIN bu oturum boyunca uygulama arka plana geçtiğinde sorulur. Uygulama kapandığında PIN sıfırlanır."
          >
            <AppLock />
          </Block>
        </Stagger>

        <Stagger index={5}>
          <Block
            icon={<Database size={17} />}
            title="Veri ve yedekler"
            note="Kayıtların Firebase hesabında saklanır. İstediğin an JSON veya CSV dışa aktarabilirsin."
          >
            <p className="num text-body font-medium text-ink">
              {count(transactions.length)} işlem · {count(statements.length)} ekstre
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={openArchive}>
                <History size={16} />
                Geçmiş, dışa aktar, geri yükle
              </Button>
            </div>
          </Block>
        </Stagger>

        <div className="settings-block space-y-6">
          <CloudServicesSettings />
          <div className="border-t border-line pt-5">
            <DiagnosticsSettings />
          </div>
        </div>

        <Disclosure icon={<SlidersHorizontal size={17} />} title="Gelişmiş">
          <div className="space-y-6">
            <Field label="Tanıtım" hint="Uygulamanın ne yaptığını anlatan etkileşimli giriş ekranları">
              <Button
                onClick={() => {
                  onClose()
                  dispatch({ type: 'setSettings', settings: { onboardingSeen: false } })
                }}
              >
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
                Taranmış PDF&apos;ler için yerel OCR servisini kullan
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
              <div className="border-t border-line pt-4">
                <p className="mb-2.5 text-body text-muted">
                  {count(rules.length)} işyeri için kategori öğrenildi.
                </p>
                <Button
                  variant="danger"
                  onClick={() =>
                    rules.forEach((rule) => dispatch({ type: 'removeRule', ruleId: rule.id }))
                  }
                >
                  Öğrenilenleri sıfırla
                </Button>
              </div>
            )}
          </div>
        </Disclosure>

        <p className="pt-2 text-center text-label text-faint">
          Mizan {__APP_VERSION__} · Obsidian Equilibrium
        </p>
      </div>
    </div>
  )
}

function Block({
  icon,
  title,
  note,
  children,
}: {
  icon?: ReactNode
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section className="settings-block space-y-4">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent-border bg-accent-soft text-accent-text">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-title font-semibold text-ink">{title}</h3>
          {note && <p className="mt-0.5 text-label text-muted">{note}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Disclosure({
  icon,
  title,
  children,
}: {
  icon?: ReactNode
  title: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className="settings-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius)] text-left text-title font-semibold text-ink"
      >
        <span className="flex items-center gap-3">
          {icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-sunken text-muted">
              {icon}
            </span>
          )}
          {title}
        </span>
        <ChevronDown
          size={17}
          className={clsx('text-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open && <div className="rise-in mt-5 border-t border-line pt-5">{children}</div>}
    </section>
  )
}

function GoalBlock() {
  const { state, dispatch } = useStore()
  const goal = state.profile.goal
  const [editing, setEditing] = useState(false)

  if (goal && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-line bg-sunken p-3.5">
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

  const [targetAmount, setTargetAmount] = useState(
    initial ? settingAmountText(initial.targetAmount) : '',
  )
  const [targetMonth, setTargetMonth] = useState(initial?.targetMonth ?? '')
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? currentMonth)
  const [startingAmount, setStartingAmount] = useState(
    initial?.startingAmount ? settingAmountText(initial.startingAmount) : '',
  )

  const amount = settingAmount(targetAmount) ?? 0
  const starting = settingAmount(startingAmount) ?? 0
  const monthsSpan = targetMonth && startMonth ? monthDiff(startMonth, targetMonth) : null

  const error =
    monthsSpan !== null && monthsSpan < 0 ? 'Hedef ayı başlangıçtan önce olamaz.' : null
  const canSave = amount > 0 && !!targetMonth && !!startMonth && (monthsSpan ?? 0) >= 0

  return (
    <div className="space-y-4 rounded-[var(--radius-lg)] border border-line bg-sunken p-4">
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
          <TextInput
            type="month"
            value={targetMonth}
            onChange={(e) => setTargetMonth(e.target.value)}
          />
        </Field>
        <Field label="Başlangıç ayı" hint="Birikime fiilen başladığın ay">
          <TextInput
            type="month"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
          />
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
          <strong className="num text-ink">
            {money(Math.round((amount - starting) / Math.max(monthsSpan, 1)))}
          </strong>{' '}
          biriktirmen gerekir.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={!canSave}
          onClick={() =>
            canSave &&
            onSave({ targetAmount: amount, targetMonth, startMonth, startingAmount: starting })
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
    <div className="space-y-4 rounded-[var(--radius-lg)] border border-line bg-sunken p-4">
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
