import { useState, type ReactNode } from 'react'
import { ChevronDown, Cloud, History, Lock, LockOpen, ShieldCheck, Target, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Field, Segmented, Skeleton, TextInput } from '../ui/primitives'
import { ConfirmDialog, Modal } from '../ui/Modal'
import { money, toMinor, toMajor, count } from '../core/money'
import { todayKey, monthOf, monthLabel, monthDiff } from '../core/date'
import { hashPin, randomSalt, verifyPin, PIN_LENGTH } from '../core/pin'
import type { SavingsGoal } from '../domain/types'
import { useStore } from '../store/AppStore'
import { describeSync } from '../sync/present'
import { useNow } from './useNow'
import { useSheets } from './sheets'

/**
 * Ayarlar, as a sheet with four blocks instead of a page with ten sections.
 *
 * What went, and why:
 *
 *   Bulut bölümü      only renders when Firebase is actually configured. A
 *                     section whose entire content is "this is not set up"
 *                     is a row of noise on every install that never will be.
 *   Kategori kuralları the list was never managed by hand — a rule is created
 *                     by correcting a transaction. One button to forget them
 *                     all replaces a scrolling inventory.
 *   OCR servis adresi  moved under Gelişmiş with the theme and the period
 *                     grouping: real settings, but not ones anybody opens
 *                     this sheet to change.
 *   Kategori bütçeleri moved next to the categories they cap, in Harcamalar.
 */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch, authUser, cloudAvailable } = useStore()
  const { openArchive, openAccount } = useSheets()
  const [resetOpen, setResetOpen] = useState(false)

  const { profile, settings, transactions, statements, rules } = state

  const setProfileNumber = (key: 'monthlyIncome' | 'spendingLimit' | 'currentBalance', raw: string) =>
    dispatch({
      type: 'setProfile',
      profile: { [key]: toMinor(Number.parseFloat(raw.replace(',', '.')) || 0) },
    })

  return (
    <Modal open={open} onClose={onClose} title="Ayarlar" variant="sheet">
      <div className="space-y-10">
        {/* ── Para ────────────────────────────────────────────────────────── */}
        <Block title="Para">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Aylık net gelir (₺)">
              <TextInput
                inputMode="decimal"
                placeholder="0"
                value={profile.monthlyIncome ? String(toMajor(profile.monthlyIncome)) : ''}
                onChange={(e) => setProfileNumber('monthlyIncome', e.target.value)}
              />
            </Field>
            <Field label="Aylık harcama limiti (₺)">
              <TextInput
                inputMode="decimal"
                placeholder="0"
                value={profile.spendingLimit ? String(toMajor(profile.spendingLimit)) : ''}
                onChange={(e) => setProfileNumber('spendingLimit', e.target.value)}
              />
            </Field>
            <Field label="Bugünkü nakit (₺)" hint="Girilirse nakit akışı tahmini gerçek bakiye üzerinden yürür">
              <TextInput
                inputMode="decimal"
                placeholder="0"
                value={profile.currentBalance ? String(toMajor(profile.currentBalance)) : ''}
                onChange={(e) => setProfileNumber('currentBalance', e.target.value)}
              />
            </Field>
          </div>

          <GoalBlock />
        </Block>

        {/* ── Kilit ───────────────────────────────────────────────────────── */}
        <Block title="Uygulama kilidi">
          <AppLock />
        </Block>

        {/* ── Hesap ───────────────────────────────────────────────────────── */}
        {cloudAvailable && (
          <Block title="Hesap ve senkron">
            <AccountRow
              onOpen={() => {
                onClose()
                openAccount()
              }}
            />
          </Block>
        )}

        {/* ── Veri ────────────────────────────────────────────────────────── */}
        <Block
          title="Veri"
          note={
            authUser
              ? 'Bu cihazda saklanır ve hesabınla bulutta eşitlenir.'
              : cloudAvailable
                ? 'Her şey bu cihazda saklanır; bulut senkronu kapalı.'
                : 'Her şey bu cihazda saklanır, hiçbir sunucuya gönderilmez.'
          }
        >
          <p className="text-body text-muted">
            {count(transactions.length)} işlem · {count(statements.length)} ekstre
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Export, restore and the per-statement checks live in one place;
                this sheet only needs to point at it. */}
            <Button
              onClick={() => {
                onClose()
                openArchive()
              }}
            >
              <History size={16} />
              Geçmiş, dışa aktar, geri yükle
            </Button>
            <Button variant="danger" onClick={() => setResetOpen(true)}>
              <Trash2 size={16} />
              Her şeyi sil
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
              <Button onClick={() => dispatch({ type: 'setSettings', settings: { onboardingSeen: false } })}>
                Tanıtımı tekrar göster
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
                  <Field label="Servis adresi">
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
          My Finance {__APP_VERSION__} · {authUser ? 'bulutla eşitleniyor' : 'veriler bu cihazda'}
        </p>
      </div>

      <ConfirmDialog
        open={resetOpen}
        title="Her şeyi sil"
        message="Ekstreler, işlemler, kurallar ve profil ayarları kalıcı olarak silinir. Geri alınamaz — önce JSON yedeği al."
        confirmLabel="Kalıcı olarak sil"
        destructive
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          dispatch({ type: 'reset' })
          setResetOpen(false)
          onClose()
        }}
      />
    </Modal>
  )
}

/* ── Building blocks ─────────────────────────────────────────────────────── */

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
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
    <section>
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

  const [targetAmount, setTargetAmount] = useState(initial ? String(toMajor(initial.targetAmount)) : '')
  const [targetMonth, setTargetMonth] = useState(initial?.targetMonth ?? '')
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? currentMonth)
  const [startingAmount, setStartingAmount] = useState(
    initial?.startingAmount ? String(toMajor(initial.startingAmount)) : '',
  )

  const amount = toMinor(Number.parseFloat(targetAmount.replace(',', '.')) || 0)
  const starting = toMinor(Number.parseFloat(startingAmount.replace(',', '.')) || 0)
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
        PIN yalnızca bu cihazda tuzlanmış özet olarak saklanır; bulut senkronu açıkken bile PIN ve özeti
        hiçbir yere gönderilmez.
      </p>
    </div>
  )
}

/* ── Cloud account ───────────────────────────────────────────────────────── */

/**
 * One line that says where the account stands and one button that opens the
 * place to change it. The forms live in the account sheet, not here: Ayarlar is
 * for things set once, and signing in is a flow, not a setting.
 */
function AccountRow({ onOpen }: { onOpen: () => void }) {
  const { authReady, authUser, sync } = useStore()
  const now = useNow()

  if (!authReady) return <Skeleton className="h-11 w-full" />

  if (!authUser) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-body text-muted">Kapalı. Veriler yalnızca bu cihazda.</p>
        <Button onClick={onOpen}>
          <Cloud size={16} />
          Giriş yap
        </Button>
      </div>
    )
  }

  const view = describeSync(sync, now)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-ink">
          {authUser.isAnonymous ? 'Hesapsız oturum' : (authUser.displayName ?? authUser.email ?? 'Hesabım')}
        </p>
        <p className="text-label text-muted">
          {view.title}
          {view.tone === 'positive' && ' · '}
          {view.tone === 'positive' && view.detail.replace(/\.$/, '')}
        </p>
      </div>
      <Button onClick={onOpen}>Yönet</Button>
    </div>
  )
}
