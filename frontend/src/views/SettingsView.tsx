import { useState } from 'react'
import {
  Cloud, Download, Lock, LockOpen, LogIn, LogOut, RefreshCw, ShieldCheck, Target, Trash2, UserPlus,
} from 'lucide-react'
import { Badge, Button, Empty, Field, Section, Segmented, TextInput } from '../ui/primitives'
import { ConfirmDialog } from '../ui/Modal'
import { money, toMinor, toMajor, count } from '../core/money'
import { todayKey, monthOf, monthLabel, monthDiff } from '../core/date'
import { hashPin, randomSalt, verifyPin, PIN_LENGTH } from '../core/pin'
import { CATEGORIES, categoryLabel } from '../domain/categories'
import type { CategoryId } from '../domain/categories'
import type { SavingsGoal } from '../domain/types'
import { useStore, type SyncStatus } from '../store/AppStore'
import { isFirebaseConfigured } from '../firebase/config'
import {
  authErrorMessage, deleteCurrentAccount, registerWithEmail, signInWithEmail,
  signInWithGoogle, signOutSession, startAnonymousSession,
} from '../firebase/auth'
import { wipeCloudData } from '../firebase/sync'

export function SettingsView() {
  const { state, dispatch, authUser } = useStore()
  const [resetOpen, setResetOpen] = useState(false)

  const { profile, settings, rules, transactions, statements } = state

  const setBudget = (category: CategoryId, value: string) => {
    const limit = toMinor(Number.parseFloat(value.replace(',', '.')) || 0)
    const budgets = profile.budgets.filter((b) => b.category !== category)
    dispatch({
      type: 'setProfile',
      profile: { budgets: limit > 0 ? [...budgets, { category, limit }] : budgets },
    })
  }

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      rules,
      statements,
      transactions,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `my-finance-yedek-${todayKey()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <AccountSection />

      <AppLockSection />

      <Section
        title="Finansal profil"
        description="Bu değerler sağlık skorunu, limit takibini ve tasarruf bulgularını besler"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Aylık net gelir (₺)" hint="Boş bırakılırsa tasarruf bileşeni hesaplanmaz">
            <TextInput
              inputMode="decimal"
              value={profile.monthlyIncome ? String(toMajor(profile.monthlyIncome)) : ''}
              placeholder="0"
              onChange={(e) =>
                dispatch({
                  type: 'setProfile',
                  profile: { monthlyIncome: toMinor(Number.parseFloat(e.target.value.replace(',', '.')) || 0) },
                })
              }
            />
          </Field>

          <Field label="Aylık harcama limiti (₺)" hint="Ay sonu projeksiyonu buna göre uyarır">
            <TextInput
              inputMode="decimal"
              value={profile.spendingLimit ? String(toMajor(profile.spendingLimit)) : ''}
              placeholder="0"
              onChange={(e) =>
                dispatch({
                  type: 'setProfile',
                  profile: { spendingLimit: toMinor(Number.parseFloat(e.target.value.replace(',', '.')) || 0) },
                })
              }
            />
          </Field>

          <Field
            label="Bugünkü nakit (₺)"
            hint="Hesabınızdaki güncel para. Girilirse nakit akışı tahmini gerçek bakiye üzerinden yürür, girilmezse bugüne göreli çalışır."
          >
            <TextInput
              inputMode="decimal"
              value={profile.currentBalance ? String(toMajor(profile.currentBalance)) : ''}
              placeholder="0"
              onChange={(e) =>
                dispatch({
                  type: 'setProfile',
                  profile: { currentBalance: toMinor(Number.parseFloat(e.target.value.replace(',', '.')) || 0) },
                })
              }
            />
          </Field>
        </div>

        {profile.monthlyIncome > 0 && (
          <p className="mt-3 text-label leading-relaxed text-faint">
            Kredi kartı ekstresinde maaş satırı yer almaz. Bu yüzden bir ayda gelir kaydı yoksa tasarruf ve
            hedef hesapları buradaki aylık geliri varsayar; gelir satırı olan aylarda gerçek tutar kullanılır.
          </p>
        )}
      </Section>

      <GoalSection />

      <Section
        title="Kategori bütçeleri"
        description="Doldurduğunuz kategoriler için aylık tavan belirleyin; boş bırakılanlar takip edilmez"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES.filter((c) => c.nature !== 'neutral').map((def) => {
            const budget = profile.budgets.find((b) => b.category === def.id)
            return (
              <div key={def.id} className="flex items-center gap-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.color }} />
                <span className="min-w-0 flex-1 truncate text-label text-ink">{def.label}</span>
                <TextInput
                  inputMode="decimal"
                  className="h-8 w-28 text-right"
                  placeholder="—"
                  value={budget ? String(toMajor(budget.limit)) : ''}
                  onChange={(e) => setBudget(def.id, e.target.value)}
                />
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Görünüm">
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

        <div className="mt-4">
          <Field
            label="Dönem gruplaması"
            hint="Ekstre dönemi genelde bir takvim ayının ortasında başlayıp ortasında biter. İkisi karışırsa değişimi burada değiştirin."
          >
            <Segmented
              value={settings.periodGrouping ?? 'calendar'}
              onChange={(periodGrouping) => dispatch({ type: 'setSettings', settings: { periodGrouping } })}
              options={[
                { value: 'calendar', label: 'Takvim ayına göre' },
                { value: 'statement', label: 'Ekstre dönemine göre' },
              ]}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Taranmış PDF desteği"
        description="Metin katmanı olmayan ekstreler için yerel OCR servisi"
      >
        <label className="flex cursor-pointer items-start gap-2.5 rounded border border-line bg-sunken px-3 py-2.5">
          <input
            type="checkbox"
            checked={settings.useLocalOcr}
            onChange={(e) => dispatch({ type: 'setSettings', settings: { useLocalOcr: e.target.checked } })}
            className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
          />
          <span className="text-label leading-relaxed text-muted">
            <span className="font-medium text-ink">Yerel OCR servisini kullan.</span> Kapalıyken taranmış
            PDF'ler tarayıcı içi OCR ile okunur; bu doğru ama yavaştır. Açtığınızda dosya yalnızca kendi
            makinenizde çalışan servise gönderilir — internete çıkmaz.
          </span>
        </label>

        {settings.useLocalOcr && (
          <div className="mt-3">
            <Field label="Servis adresi" hint="backend/main.py varsayılan olarak bu adreste çalışır">
              <TextInput
                value={settings.ocrEndpoint}
                onChange={(e) => dispatch({ type: 'setSettings', settings: { ocrEndpoint: e.target.value } })}
              />
            </Field>
          </div>
        )}
      </Section>

      <Section
        title="Öğrenilmiş kategori kuralları"
        description="İşlemler bölümünde kategori atadığınızda otomatik oluşur"
      >
        {rules.length === 0 ? (
          <Empty
            compact
            title="Henüz kural yok"
            description="Bir işlemin kategorisini düzelttiğinizde aynı işyerinin diğer kayıtları da güncellenir."
          />
        ) : (
          <div className="space-y-1.5">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-3 rounded border border-line bg-sunken px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-label font-medium text-ink">{rule.merchant}</span>
                <Badge>{categoryLabel(rule.category)}</Badge>
                <button
                  type="button"
                  aria-label="Kuralı kaldır"
                  onClick={() => dispatch({ type: 'removeRule', ruleId: rule.id })}
                  className="rounded p-1 text-faint hover:bg-hover hover:text-negative"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Veri"
        description={
          authUser
            ? "Her şey bu tarayıcıda saklanır ve hesabınıza bağlı olarak Firebase'de yedeklenir"
            : 'Her şey bu tarayıcıda saklanır, hiçbir sunucuya gönderilmez'
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure label="İşlem" value={count(transactions.length)} />
            <Figure label="Ekstre" value={count(statements.length)} />
            <Figure
              label="Toplam net harcama"
              value={money(
                transactions.reduce(
                  (s, t) => s + (t.kind === 'expense' ? t.amount : t.kind === 'refund' ? -t.amount : 0),
                  0,
                ),
              )}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={exportJson}>
              <Download size={12} />
              JSON yedek al
            </Button>
            <Button size="sm" variant="danger" onClick={() => setResetOpen(true)}>
              <Trash2 size={12} />
              Tüm verileri sil
            </Button>
          </div>
        </div>
      </Section>

      <ConfirmDialog
        open={resetOpen}
        title="Tüm verileri sil"
        message="Yüklenen ekstreler, işlemler, kurallar ve profil ayarları kalıcı olarak silinir. Bu işlem geri alınamaz — önce JSON yedeği almanız önerilir."
        confirmLabel="Kalıcı olarak sil"
        destructive
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          dispatch({ type: 'reset' })
          setResetOpen(false)
        }}
      />
    </div>
  )
}

/**
 * Cloud sync is entirely opt-in. Doing nothing here keeps the app exactly as
 * local-only as before; signing up, signing in, or starting an anonymous
 * backup is what switches `AppStore` into pushing/pulling Firestore (see the
 * cloud effects there) — this component only drives that decision and shows
 * where it currently stands.
 */
function AccountSection() {
  const { authUser, syncStatus, syncNow, refreshAuthUser } = useStore()
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!isFirebaseConfigured()) {
    return (
      <Section title="Hesap ve bulut yedekleme" description="Bu kurulumda bulut senkronizasyonu yapılandırılmamış">
        <p className="text-label text-muted">Veriler yalnızca bu tarayıcıda kalır.</p>
      </Section>
    )
  }

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
      <Section
        title="Hesap ve bulut yedekleme"
        description="Verileriniz bu hesaba bağlı olarak Firebase'de senkronize edilir"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="positive">{authUser.email ?? authUser.displayName ?? 'Giriş yapıldı'}</Badge>
            <SyncBadge status={syncStatus} />
          </div>

          {error && <p className="text-label text-negative">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={syncNow} disabled={syncStatus === 'syncing'}>
              <RefreshCw size={12} />
              Şimdi senkronize et
            </Button>
            <Button size="sm" onClick={() => run(signOutSession)} disabled={busy}>
              <LogOut size={12} />
              Çıkış yap
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={12} />
              Hesabı ve bulut verilerimi sil
            </Button>
          </div>
        </div>

        <ConfirmDialog
          open={deleteOpen}
          title="Hesabı ve bulut verilerini sil"
          message="Firebase'deki tüm işlem, ekstre, kural ve profil verileriniz kalıcı olarak silinir; hesap kapatılır. Bu cihazdaki yerel veriler etkilenmez. Bu işlem geri alınamaz."
          confirmLabel="Kalıcı olarak sil"
          destructive
          onCancel={() => setDeleteOpen(false)}
          onConfirm={deleteAccount}
        />
      </Section>
    )
  }

  return (
    <Section
      title="Hesap ve bulut yedekleme"
      description={
        authUser?.isAnonymous
          ? 'Anonim yedekleme aktif — kalıcı hale getirmek için e-posta veya Google ekleyin'
          : "İsteğe bağlı: kayıt olursanız veriler Firebase'de yedeklenir ve cihazlar arasında senkronize olur"
      }
    >
      <div className="space-y-3">
        {authUser?.isAnonymous && (
          <div className="flex items-center gap-2">
            <Badge tone="warning">Anonim oturum</Badge>
            <SyncBadge status={syncStatus} />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
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

        {error && <p className="text-label text-negative">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {mode === 'signup' ? (
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !email || password.length < 6}
              onClick={() => run(() => registerWithEmail(email, password))}
            >
              <UserPlus size={12} />
              Kayıt ol
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !email || !password}
              onClick={() => run(() => signInWithEmail(email, password))}
            >
              <LogIn size={12} />
              Giriş yap
            </Button>
          )}
          <Button size="sm" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
            {mode === 'signup' ? 'Zaten hesabım var' : 'Hesap oluştur'}
          </Button>
          <Button size="sm" onClick={() => run(signInWithGoogle)} disabled={busy}>
            Google ile devam et
          </Button>
          {!authUser && (
            <Button size="sm" variant="ghost" onClick={() => run(startAnonymousSession)} disabled={busy}>
              <Cloud size={12} />
              Hesapsız yalnızca yedekle
            </Button>
          )}
        </div>

        <p className="text-label text-faint">
          Hiçbir şey yapmazsanız veriler yalnızca bu tarayıcıda kalır — varsayılan budur. Kayıt olduğunuzda
          veya anonim yedeklemeyi başlattığınızda işlemler, ekstreler, kurallar ve profil ayarlarınız
          Firebase'e senkronize edilmeye başlar.
        </p>
      </div>
    </Section>
  )
}

function SyncBadge({ status }: { status: SyncStatus }) {
  if (status === 'syncing') return <Badge tone="accent">Senkronize ediliyor…</Badge>
  if (status === 'synced') return <Badge tone="positive">Senkronize</Badge>
  if (status === 'error') return <Badge tone="negative">Senkronizasyon hatası</Badge>
  return <Badge tone="neutral">Bekliyor</Badge>
}

/**
 * Only the salted hash lives in `Settings` (see `core/pin.ts`) — this
 * component is the only place the actual 4-digit PIN passes through memory,
 * and only for as long as it takes to hash or verify it.
 */
function AppLockSection() {
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
      setError('Girdiğiniz PIN\'ler eşleşmiyor.')
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

  return (
    <Section
      title="Uygulama kilidi"
      description="Açık uygulamaya bakan biri finansal verilerinizi görmesin"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {hasPin ? (
            <Badge tone="positive">
              <Lock size={11} /> Kilit açık
            </Badge>
          ) : (
            <Badge tone="neutral">
              <LockOpen size={11} /> Kilit kapalı
            </Badge>
          )}
        </div>

        {mode === 'idle' && (
          <div className="flex flex-wrap gap-2">
            {!hasPin && (
              <Button size="sm" variant="primary" onClick={() => setMode('setup')}>
                <ShieldCheck size={12} />
                PIN belirle
              </Button>
            )}
            {hasPin && (
              <>
                <Button size="sm" onClick={() => setMode('change')}>
                  PIN değiştir
                </Button>
                <Button size="sm" variant="danger" onClick={() => setMode('remove')}>
                  <Trash2 size={12} />
                  Kilidi kaldır
                </Button>
              </>
            )}
          </div>
        )}

        {(mode === 'setup' || mode === 'change') && (
          <div className="space-y-3 rounded border border-line bg-sunken p-3">
            {mode === 'change' && (
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
            <div className="grid gap-3 sm:grid-cols-2">
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
              <Field label="Yeni PIN (tekrar)">
                <TextInput
                  type="password"
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(digitsOnly(e.target.value))}
                  placeholder="••••"
                />
              </Field>
            </div>

            {error && <p className="text-label text-negative">{error}</p>}

            <div className="flex gap-2">
              <Button size="sm" variant="primary" disabled={busy} onClick={saveNewPin}>
                Kaydet
              </Button>
              <Button size="sm" onClick={reset}>
                Vazgeç
              </Button>
            </div>
          </div>
        )}

        {mode === 'remove' && (
          <div className="space-y-3 rounded border border-line bg-sunken p-3">
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
            {error && <p className="text-label text-negative">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="danger" disabled={busy} onClick={removePin}>
                <Trash2 size={12} />
                Kilidi kaldır
              </Button>
              <Button size="sm" onClick={reset}>
                Vazgeç
              </Button>
            </div>
          </div>
        )}

        <p className="text-label text-faint">
          PIN yalnızca bu cihazda tuzlanmış özet (hash) olarak saklanır — bulut senkronizasyonu açıksa bile
          gerçek PIN hiçbir yere gönderilmez. PIN'i unutursanız kilit ekranından "PIN'i mi unuttunuz?" ile bu
          cihazdaki verileri sıfırlayabilirsiniz; kalıcı olarak saklamak için bulut yedeğini (yukarıda) veya
          JSON yedeğini (aşağıda, Veri bölümü) kullanın.
        </p>
      </div>
    </Section>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-sunken px-3 py-2">
      <p className="text-label text-faint">{label}</p>
      <p className="num mt-0.5 text-[15px] font-semibold text-ink">{value}</p>
    </div>
  )
}

/**
 * A goal is a target amount by a target month, tracked from a start month
 * (usually now, but adjustable — someone six months into saving should be
 * able to say so, rather than have the trajectory chart start counting from
 * today and misjudge their pace). `Gelecek` renders the trajectory this feeds;
 * this section is only where the goal itself is set.
 */
function GoalSection() {
  const { state, dispatch } = useStore()
  const goal = state.profile.goal
  const [editing, setEditing] = useState(!goal)

  const removeGoal = () => {
    dispatch({ type: 'setProfile', profile: { goal: null } })
    setEditing(true)
  }

  return (
    <Section
      title="Tasarruf hedefi"
      description="Bir tutar ve bir ay belirleyin; Gelecek sekmesi bunu aylık performansınıza göre takip eder"
    >
      {!editing && goal ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure label="Hedef" value={money(goal.targetAmount)} />
            <Figure label="Hedef ayı" value={monthLabel(goal.targetMonth)} />
            <Figure
              label="Başlangıç"
              value={`${monthLabel(goal.startMonth, true)}${goal.startingAmount ? ` · ${money(goal.startingAmount)}` : ''}`}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setEditing(true)}>
              <Target size={12} />
              Düzenle
            </Button>
            <Button size="sm" variant="danger" onClick={removeGoal}>
              <Trash2 size={12} />
              Hedefi kaldır
            </Button>
          </div>
        </div>
      ) : (
        <GoalForm
          initial={goal}
          onCancel={goal ? () => setEditing(false) : undefined}
          onSave={(next) => {
            dispatch({ type: 'setProfile', profile: { goal: next } })
            setEditing(false)
          }}
        />
      )}
    </Section>
  )
}

function GoalForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SavingsGoal | null
  onSave: (goal: SavingsGoal) => void
  onCancel?: () => void
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
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hedef tutar (₺)">
          <TextInput
            inputMode="decimal"
            placeholder="0"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
          />
        </Field>
        <Field label="Hedef ayı" hint="Bu tutara ulaşmak istediğiniz ay">
          <TextInput type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
        </Field>
        <Field label="Başlangıç ayı" hint="Birikime fiilen başladığınız ay">
          <TextInput type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
        </Field>
        <Field label="Başlangıç birikimi (₺)" hint="O ayın başında elinizde olan tutar, varsa">
          <TextInput
            inputMode="decimal"
            placeholder="0"
            value={startingAmount}
            onChange={(e) => setStartingAmount(e.target.value)}
          />
        </Field>
      </div>

      {error && <p className="text-label text-negative">{error}</p>}
      {!error && monthsSpan !== null && monthsSpan >= 0 && (
        <p className="text-label text-faint">
          {monthsSpan === 0
            ? 'Başlangıç ve hedef ayı aynı — bu ayın sonunda tüm tutarın birikmiş olması beklenir.'
            : `${monthsSpan} ay içinde, ayda ortalama ${money(Math.round((amount - starting) / Math.max(monthsSpan, 1)))} biriktirmeniz gerekir.`}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!canSave}
          onClick={() =>
            canSave &&
            onSave({ targetAmount: amount, targetMonth, startMonth, startingAmount: starting })
          }
        >
          <Target size={12} />
          Hedefi kaydet
        </Button>
        {onCancel && (
          <Button size="sm" onClick={onCancel}>
            Vazgeç
          </Button>
        )}
      </div>
    </div>
  )
}
