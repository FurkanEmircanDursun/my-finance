import { useState, type ReactNode } from 'react'
import {
  ChevronDown, Cloud, Download, Lock, LockOpen, LogIn, LogOut, RefreshCw,
  ShieldCheck, Target, Trash2, UserPlus,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Badge, Button, Field, Segmented, TextInput } from '../ui/primitives'
import { ConfirmDialog, Modal } from '../ui/Modal'
import { money, toMinor, toMajor, count } from '../core/money'
import { todayKey, monthOf, monthLabel, monthDiff } from '../core/date'
import { hashPin, randomSalt, verifyPin, PIN_LENGTH } from '../core/pin'
import { categoryLabel } from '../domain/categories'
import type { SavingsGoal } from '../domain/types'
import { useStore, type SyncStatus } from '../store/AppStore'
import { isFirebaseConfigured } from '../firebase/config'
import {
  authErrorMessage, deleteCurrentAccount, registerWithEmail, signInWithEmail,
  signInWithGoogle, signOutSession, startAnonymousSession,
} from '../firebase/auth'
import { wipeCloudData } from '../firebase/sync'

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
  const { state, dispatch, authUser } = useStore()
  const [resetOpen, setResetOpen] = useState(false)

  const { profile, settings, transactions, statements, rules } = state

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      rules,
      statements,
      transactions,
    }
    download(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      `my-finance-yedek-${todayKey()}.json`,
    )
  }

  const exportCsv = () => {
    const header = ['Tarih', 'Açıklama', 'İşyeri', 'Kategori', 'Tutar', 'Banka', 'Taksit']
    const rows = transactions.map((tx) => [
      tx.date,
      tx.description.replace(/"/g, '""'),
      tx.merchant,
      categoryLabel(tx.category),
      (tx.amount / 100).toFixed(2).replace('.', ','),
      tx.bank,
      tx.installment ? `${tx.installment.current}/${tx.installment.total}` : '',
    ])
    const csv = [header, ...rows].map((r) => r.map((cell) => `"${cell}"`).join(';')).join('\r\n')
    // BOM so Excel opens Turkish characters correctly.
    download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `my-finance-islemler-${todayKey()}.csv`)
  }

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

        {/* ── Yedekleme ───────────────────────────────────────────────────── */}
        {isFirebaseConfigured() && (
          <Block title="Bulut yedekleme">
            <Account />
          </Block>
        )}

        {/* ── Veri ────────────────────────────────────────────────────────── */}
        <Block
          title="Veri"
          note={
            authUser
              ? "Bu cihazda saklanır, hesabına bağlı olarak Firebase'de yedeklenir."
              : 'Her şey bu cihazda saklanır, hiçbir sunucuya gönderilmez.'
          }
        >
          <p className="text-body text-muted">
            {count(transactions.length)} işlem · {count(statements.length)} ekstre
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportJson}>
              <Download size={16} />
              JSON yedek
            </Button>
            <Button onClick={exportCsv}>
              <Download size={16} />
              CSV
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

            <Field
              label="Dönem gruplaması"
              hint="Ekstre dönemi genelde ayın ortasında başlar. Uygulama bunu kendi seçer; burada değiştirebilirsin."
            >
              <Segmented
                value={settings.periodGrouping ?? 'calendar'}
                onChange={(periodGrouping) => dispatch({ type: 'setSettings', settings: { periodGrouping } })}
                options={[
                  { value: 'calendar', label: 'Takvim ayı' },
                  { value: 'statement', label: 'Ekstre dönemi' },
                ]}
              />
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
          My Finance {__APP_VERSION__} · veriler bu cihazda
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

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
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
        PIN yalnızca bu cihazda tuzlanmış özet olarak saklanır; bulut yedeklemesi açıkken bile gerçek PIN
        hiçbir yere gönderilmez.
      </p>
    </div>
  )
}

/* ── Cloud account ───────────────────────────────────────────────────────── */

function Account() {
  const { authUser, syncStatus, syncNow, refreshAuthUser } = useStore()
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      setPassword('')
      refreshAuthUser()
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const deleteAccount = async () => {
    if (!authUser) return
    setBusy(true)
    setError(null)
    try {
      await wipeCloudData(authUser.uid)
      await deleteCurrentAccount()
      setDeleteOpen(false)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (authUser && !authUser.isAnonymous) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="positive">{authUser.email ?? authUser.displayName ?? 'Giriş yapıldı'}</Badge>
          <SyncBadge status={syncStatus} />
        </div>

        {error && <p className="text-body text-negative">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={syncNow} disabled={syncStatus === 'syncing'}>
            <RefreshCw size={14} />
            Şimdi senkronize et
          </Button>
          <Button size="sm" onClick={() => run(signOutSession)} disabled={busy}>
            <LogOut size={14} />
            Çıkış
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>
            Hesabı sil
          </Button>
        </div>

        <ConfirmDialog
          open={deleteOpen}
          title="Hesabı ve bulut verilerini sil"
          message="Firebase'deki tüm işlem, ekstre, kural ve profil verilerin kalıcı olarak silinir; hesap kapatılır. Bu cihazdaki yerel veriler etkilenmez."
          confirmLabel="Kalıcı olarak sil"
          destructive
          onCancel={() => setDeleteOpen(false)}
          onConfirm={deleteAccount}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {authUser?.isAnonymous && (
        <div className="flex items-center gap-2">
          <Badge tone="warning">Anonim oturum</Badge>
          <SyncBadge status={syncStatus} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-posta">
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@eposta.com"
          />
        </Field>
        <Field label="Şifre" hint="En az 6 karakter">
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
      </div>

      {error && <p className="text-body text-negative">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {mode === 'signup' ? (
          <Button
            variant="primary"
            disabled={busy || !email || password.length < 6}
            onClick={() => run(() => registerWithEmail(email, password))}
          >
            <UserPlus size={16} />
            Kayıt ol
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={busy || !email || !password}
            onClick={() => run(() => signInWithEmail(email, password))}
          >
            <LogIn size={16} />
            Giriş yap
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
          {mode === 'signup' ? 'Zaten hesabım var' : 'Hesap oluştur'}
        </Button>
        <Button size="sm" onClick={() => run(signInWithGoogle)} disabled={busy}>
          Google
        </Button>
        {!authUser && (
          <Button size="sm" variant="ghost" onClick={() => run(startAnonymousSession)} disabled={busy}>
            <Cloud size={14} />
            Hesapsız yedekle
          </Button>
        )}
      </div>

      <p className="text-label text-faint">
        Hiçbir şey yapmazsan veriler yalnızca bu cihazda kalır — varsayılan budur.
      </p>
    </div>
  )
}

function SyncBadge({ status }: { status: SyncStatus }) {
  if (status === 'syncing') return <Badge tone="accent">Senkronize ediliyor…</Badge>
  if (status === 'synced') return <Badge tone="positive">Senkronize</Badge>
  if (status === 'error') return <Badge tone="negative">Hata</Badge>
  return <Badge tone="neutral">Bekliyor</Badge>
}
