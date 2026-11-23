import { useState, type FormEvent, type ReactNode } from 'react'
import { ChevronDown, CircleCheck, CloudOff, Eye, EyeOff, LogOut, RefreshCw, TriangleAlert } from 'lucide-react'
import { clsx } from 'clsx'
import { Button, Field, Skeleton, TextInput } from '../ui/primitives'
import { ConfirmDialog, Modal } from '../ui/Modal'
import { count } from '../core/money'
import { useStore } from '../store/AppStore'
import { describeSync, type Tone } from '../sync/present'
import {
  authErrorMessage, continueWithEmail, reauthenticate, registerWithEmail, sendPasswordReset,
  signInWithGoogle, type AuthUser,
} from '../firebase/auth'
import { useNow } from './useNow'
import { GoogleMark } from './GoogleConnectButton'
import { UserFacingError } from '../core/errors'

/**
 * Hesap ve senkron — the whole cloud story on one screen, and only when asked.
 *
 * Signed out it is one decision with two doors (Google, or an e-posta + şifre
 * form), and the form is a single form for both: it signs in, and only when
 * that fails does it offer to create the account. Firebase hides whether an
 * address is registered, so no screen can know in advance; what it can do is
 * never make the person choose between "kayıt ol" and "giriş yap" before they
 * have typed anything.
 *
 * Signed in it is a status and an exit. The sheet stays open through the
 * sign-in itself — it turns from the form into the status in place — so the
 * answer to "did that work?" is on screen the moment it is true.
 */
export function AccountSheet({ open, onClose, startDeletion = false }: { open: boolean; onClose: () => void; startDeletion?: boolean }) {
  const { cloudAvailable, authReady, authUser, authError, retryAuth, sessionError } = useStore()

  return (
    <Modal open={open} onClose={onClose} title="Hesap ve senkron">
      {sessionError && <p className="mb-4 text-body text-negative" role="alert">{sessionError}</p>}
      {authError && (
        <div className="mb-5 space-y-2" role="alert">
          <p className="text-body text-negative">{authError}</p>
          <Button size="sm" onClick={retryAuth}>Bağlantıyı yeniden dene</Button>
        </div>
      )}
      {!cloudAvailable ? (
        <p className="text-body text-muted">Bu dağıtımda Firebase bağlantısı yapılandırılmamış.</p>
      ) : !authReady ? (
        <div className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : authUser && !authUser.isAnonymous ? (
        <SignedIn user={authUser} startDeletion={startDeletion} />
      ) : (
        <AccountSignInForm upgrading={authUser?.isAnonymous === true} />
      )}
      <PrivacyPolicyLink />
    </Modal>
  )
}

export function PrivacyPolicyLink() {
  return <a className="mt-4 inline-block text-body text-accent underline" href="https://my-finance-webapp-fd.web.app/privacy.html" target="_blank" rel="noopener noreferrer">Gizlilik politikası</a>
}

/* ── Signed out ──────────────────────────────────────────────────────────── */

type Busy = 'google' | 'email' | 'create' | 'reset' | null

export function AccountSignInForm({ upgrading }: { upgrading: boolean }) {
  const { refreshAuthUser } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [noMatch, setNoMatch] = useState(false)

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim())

  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    // Whatever was said about the last attempt no longer describes this one.
    setError(null)
    setNotice(null)
    setNoMatch(false)
  }

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const google = () =>
    run('google', async () => {
      const outcome = await signInWithGoogle()
      if (outcome === 'done') refreshAuthUser()
      if (outcome === 'redirecting') setNotice("Google'a yönlendiriliyorsun…")
      if (outcome === 'cancelled') setNotice('Giriş iptal edildi. İstediğin zaman yeniden deneyebilirsin.')
    })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!emailOk || !password || busy) return
    void run('email', async () => {
      const outcome = await continueWithEmail(email, password)
      if (outcome === 'signed-in') refreshAuthUser()
      else setNoMatch(true)
    })
  }

  const create = () => {
    if (password.length < 6) {
      setError('Hesap oluşturmak için şifre en az 6 karakter olmalı.')
      return
    }
    void run('create', async () => {
      try {
        await registerWithEmail(email, password)
      } catch (err) {
        // Reached from "no match", so the person has just typed this address with
        // this password and been refused: "sign in if the password is right" would
        // send them in a circle. What is left is a reset, or another way in.
        if ((err as { code?: string })?.code === 'auth/email-already-in-use') {
          throw new UserFacingError(
            'Bu e-posta zaten kayıtlı ve şifre uyuşmuyor. "Şifremi sıfırla"yı dene; hesabı Google ile açtıysan Google ile devam et.',
          )
        }
        throw err
      }
      refreshAuthUser()
    })
  }

  const reset = () =>
    run('reset', async () => {
      await sendPasswordReset(email)
      setNotice('Bu adreste bir hesap varsa şifre sıfırlama bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.')
    })

  return (
    <div className="space-y-5">
      {upgrading && (
        <p className="rounded-[var(--radius)] bg-warning-soft px-4 py-3 text-label text-warning">
          Şu an hesapsız bir oturum açık: verilerin yedekleniyor ama başka bir cihazdan açılamaz. Google veya
          e-posta ekleyerek aynı verilere her cihazdan ulaş.
        </p>
      )}

      <p className="text-body text-muted">
        Kayıtların Firebase hesabında saklanır. Telefonunda ve bilgisayarında aynı hesapla giriş yapabilirsin.
      </p>

      <Button className="google-connect-button w-full" onClick={google} disabled={busy !== null} aria-busy={busy === 'google'}>
        <GoogleMark />
        {busy === 'google' ? 'Google bekleniyor…' : 'Google ile devam et'}
      </Button>

      {error && <p className="text-body text-negative" role="alert">{error}</p>}
      {notice && <p className="text-body text-muted" role="status">{notice}</p>}

      <details className="account-email-options">
      <summary className="flex min-h-11 cursor-pointer items-center text-body font-semibold text-muted">E-posta ile devam et</summary>
      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <Field label="E-posta">
          <TextInput
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ornek@eposta.com"
            value={email}
            onChange={(e) => edit(setEmail)(e.target.value)}
          />
        </Field>

        <Field label="Şifre" hint={noMatch ? undefined : 'Hesabın yoksa bir sonraki adımda oluşturabilirsin.'}>
          <div className="relative">
            <TextInput
              type={reveal ? 'text' : 'password'}
              name="password"
              autoComplete={noMatch ? 'new-password' : 'current-password'}
              className="pr-11"
              placeholder="••••••••"
              value={password}
              onChange={(e) => edit(setPassword)(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? 'Şifreyi gizle' : 'Şifreyi göster'}
              aria-pressed={reveal}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-ink"
            >
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        {noMatch ? (
          <div className="space-y-3 rounded-[var(--radius-lg)] bg-sunken p-4" role="status">
            <div>
              <p className="text-body font-semibold text-ink">Bu bilgilerle giriş yapılamadı</p>
              <p className="mt-0.5 text-label text-muted">
                Bu e-postayla hesap açılmamış olabilir ya da şifre yanlış. Hangisi olduğunu güvenlik için
                söyleyemiyoruz.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={create} disabled={busy !== null}>
                {busy === 'create' ? 'Oluşturuluyor…' : 'Yeni hesap oluştur'}
              </Button>
              <Button onClick={reset} disabled={busy !== null || !emailOk}>
                {busy === 'reset' ? 'Gönderiliyor…' : 'Şifremi sıfırla'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={busy !== null || !emailOk || !password}>
              {busy === 'email' ? 'Kontrol ediliyor…' : 'Devam et'}
            </Button>
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy !== null || !emailOk}>
              {busy === 'reset' ? 'Gönderiliyor…' : 'Şifremi unuttum'}
            </Button>
          </div>
        )}
      </form>
      </details>

      <p className="text-label text-faint">
        İşlemler, ekstreler, kategori kuralları, hedef ve bütçeler, tema bulutta yalnızca senin hesabının
        erişebileceği şekilde saklanır. Uygulama kilidi (PIN) hiçbir zaman gönderilmez.
      </p>
    </div>
  )
}

/* ── Signed in ───────────────────────────────────────────────────────────── */

const PROVIDER: Record<string, string> = { 'google.com': 'Google', password: 'E-posta' }

function SignedIn({ user, startDeletion }: { user: AuthUser; startDeletion: boolean }) {
  const { state, sync, authUser, eraseCloud, logout, historyReady } = useStore()
  const [leaving, setLeaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const via = user.providers.map((p) => PROVIDER[p]).filter(Boolean).join(' · ')
  const name = user.displayName ?? user.email ?? 'Hesabım'

  const signOut = async () => {
    setBusy(true)
    setError(null)
    try {
      await logout()
    } catch (err) {
      setError(authErrorMessage(err))
      setBusy(false)
    }
  }

  const wipe = async () => {
    setWipeOpen(false)
    setBusy(true)
    setError(null)
    try {
      await eraseCloud({ deleteAccount: false })
    } catch (err) {
      setError(authErrorMessage(err))
      setBusy(false)
    }
  }

  const unsent = sync.pending > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Avatar user={user} />
        <div className="min-w-0">
          <p className="truncate text-title font-semibold text-ink">{name}</p>
          {user.displayName && user.email && <p className="truncate text-label text-muted">{user.email}</p>}
          {via && <p className="text-label text-faint">{via} ile giriş</p>}
        </div>
      </div>

      <StatusPanel />

      <p className="text-label text-muted">
        Hesabında {historyReady && `${count(state.transactions.length)} işlem · `}{count(state.statements.length)} ekstre var.
        Giriş yaptığın diğer cihazlarda aynı veriyi görürsün.
      </p>

      {error && (
        <p className="text-body text-negative" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <Button className="w-full sm:w-auto" onClick={() => setLeaving(true)} disabled={busy}>
          <LogOut size={16} />
          Çıkış yap
        </Button>
      </div>

      <Disclosure title="Veri ve hesap" initiallyOpen={startDeletion}>
        <div className="space-y-5">
          <div className="space-y-2">
            <Button variant="danger" onClick={() => setWipeOpen(true)} disabled={busy}>
              Bulut verilerimi sil
            </Button>
            <p className="text-label text-faint">
              Hesabındaki kayıtlar kalıcı olarak silinir ve çıkış yapılır.
            </p>
          </div>
          <div className="space-y-2">
            <Button variant="danger" onClick={() => setDeleteOpen(true)} disabled={busy}>
              Hesabımı sil
            </Button>
            <p className="text-label text-faint">Hesap ve buluttaki tüm veriler kalıcı olarak silinir.</p>
          </div>
        </div>
      </Disclosure>

      <Modal
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Çıkış yap"
        footer={<><Button onClick={() => setLeaving(false)}>Vazgeç</Button><Button variant="primary" onClick={() => { setLeaving(false); void signOut() }}>Çıkış yap</Button></>}
      >
        <div className="space-y-4">
          <p className="text-body text-muted">Hesabındaki bulut verileri korunur. Tekrar giriş yaptığında kayıtlarına ulaşabilirsin.</p>
          {unsent && <p className="text-label text-warning" role="status">{sync.pending} değişiklik buluta kaydedilmeyi bekliyor.</p>}
        </div>
      </Modal>

      <ConfirmDialog
        open={wipeOpen}
        title="Bulut verilerini sil"
        message="Hesabındaki işlemler, ekstreler, kategori kuralları, kartlar ve ayarlar kalıcı olarak silinir ve çıkış yapılır."
        confirmLabel="Buluttakini sil"
        destructive
        onCancel={() => setWipeOpen(false)}
        onConfirm={wipe}
      />

      {deleteOpen && authUser && <DeleteAccountDialog user={authUser} onClose={() => setDeleteOpen(false)} />}
    </div>
  )
}

function Avatar({ user }: { user: AuthUser }) {
  const [broken, setBroken] = useState(false)
  const initial = (user.displayName ?? user.email ?? '?').trim().charAt(0).toLocaleUpperCase('tr-TR')

  if (user.photoURL && !broken) {
    return (
      <img
        src={user.photoURL}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-12 w-12 shrink-0 rounded-full bg-sunken object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-title font-semibold text-accent-text"
    >
      {initial}
    </span>
  )
}

const TONE_TEXT: Record<Tone, string> = {
  positive: 'text-positive',
  accent: 'text-accent',
  warning: 'text-warning',
  negative: 'text-negative',
  neutral: 'text-muted',
}

function StatusPanel() {
  const { sync, syncNow } = useStore()
  const now = useNow()
  const view = describeSync(sync, now)

  const Icon = view.busy
    ? RefreshCw
    : sync.status === 'synced'
      ? CircleCheck
      : sync.status === 'offline'
        ? CloudOff
        : TriangleAlert

  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-sunken p-4" role="status">
      <Icon size={20} className={clsx('mt-0.5 shrink-0', TONE_TEXT[view.tone], view.busy && 'motion-safe:animate-spin')} />
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">{view.title}</p>
        <p className="mt-0.5 text-label text-muted">{view.detail}</p>
      </div>
      <Button size="sm" onClick={syncNow} disabled={view.busy}>
        Şimdi eşitle
      </Button>
    </div>
  )
}

/**
 * Deleting an account is refused unless the sign-in is recent, so this proves it
 * again *before* anything is erased — a refusal halfway through would have wiped
 * the cloud copy of an account that then could not be closed.
 */
function DeleteAccountDialog({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const { eraseCloud } = useStore()
  const usesPassword = user.providers.includes('password')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || (usesPassword && !password)) return
    setBusy(true)
    setError(null)
    try {
      await reauthenticate(usesPassword ? password : undefined)
      await eraseCloud({ deleteAccount: true })
      onClose()
    } catch (err) {
      setError(authErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Hesabı sil"
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button type="submit" form="delete-account" variant="danger" disabled={busy || (usesPassword && !password)}>
            {busy ? 'Siliniyor…' : 'Hesabı kalıcı olarak sil'}
          </Button>
        </>
      }
    >
      <form id="delete-account" onSubmit={submit} className="space-y-4">
        <p className="text-body text-muted">
          Mizan hesabın ve hesabındaki finans kayıtları kalıcı olarak silinir. İndirdiğin dosyaları cihazından ayrıca silebilirsin.
        </p>
        {usesPassword ? (
          <Field label="Şifren" hint="Devam etmek için kimliğini doğrula.">
            <TextInput
              type="password"
              name="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
            />
          </Field>
        ) : (
          <p className="text-label text-faint">Devam edince Google kimliğini yeniden doğrulaman istenecek.</p>
        )}
        {error && (
          <p className="text-body text-negative" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

function Disclosure({ title, children, initiallyOpen = false }: { title: string; children: ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="-ml-2 flex h-11 items-center gap-1.5 rounded-[var(--radius)] px-2 text-body font-semibold text-muted transition-colors duration-200 hover:bg-hover hover:text-ink"
      >
        {title}
        <ChevronDown size={16} className={clsx('transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && <div className="rise-in mt-3">{children}</div>}
    </section>
  )
}
