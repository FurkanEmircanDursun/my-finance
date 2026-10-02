import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { count } from '../core/money'
import { todayKey } from '../core/date'
import { saveTextFile, type SaveOutcome } from '../platform/files'
import { backupFileName, buildBackup } from '../store/backup'
import { useStore } from '../store/AppStore'

/**
 * "Bu cihazda başka bir hesabın verileri var."
 *
 * The only moment sync has to ask. A device that held one account's money and is
 * now signed in to another could, without a word, pour the first into the
 * second — somebody else's statements appearing in your account, or yours in
 * theirs on a shared phone. So nothing moves until this is answered, and both
 * answers are said in terms of what happens to the money on screen.
 *
 * "Replace" is the one that destroys something, so it takes two taps, and the
 * backup that makes it safe is one tap away on the same screen.
 */
export function SyncDecision() {
  const { state, overall, resolveSync } = useStore()
  const [confirming, setConfirming] = useState(false)
  const [saved, setSaved] = useState<SaveOutcome | null>(null)

  const here = `${count(state.transactions.length)} işlem · ${count(state.statements.length)} ekstre`

  const backup = async () => {
    const file = buildBackup({ state, overall, appVersion: __APP_VERSION__, period: 'all' })
    setSaved(await saveTextFile(backupFileName('all', todayKey()), JSON.stringify(file, null, 2), 'application/json'))
  }

  return (
    <div className="space-y-5">
      <p className="text-body text-muted">
        Bu cihazda başka bir hesaba ait veriler duruyor ({here}). Şimdi giriş yaptığın hesapla ne yapalım?
      </p>

      <div className="space-y-2">
        <Choice
          title="Birleştir"
          detail="Bu cihazdaki kayıtlar bu hesaba da eklenir. Aynı kayıt iki kez görünmez."
          onClick={() => resolveSync('merge')}
        />

        {!confirming ? (
          <Choice
            title="Yalnızca bu hesabınkini kullan"
            detail="Bu cihazdaki veriler silinir, yerine hesabındakiler yüklenir."
            onClick={() => setConfirming(true)}
          />
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-negative p-4" role="alert">
            <p className="text-body font-semibold text-ink">Bu cihazdaki {here} silinecek.</p>
            <p className="mt-1 text-label text-muted">Geri alınamaz. İstersen önce yedeğini al.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => resolveSync('replace')}>
                Evet, sil ve yükle
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Vazgeç
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={backup}>
          <Download size={14} />
          Önce bu cihazın yedeğini indir
        </Button>
        {saved && (
          <span className="text-label text-muted" role="status">
            {saved === 'failed'
              ? 'Yedek alınamadı. Ayarlar → Geçmiş bölümünden dene.'
              : saved === 'cancelled'
                ? 'Vazgeçildi.'
                : 'Yedek kaydedildi.'}
          </span>
        )}
      </div>
    </div>
  )
}

function Choice({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-[var(--radius-lg)] border border-line bg-raised p-4 text-left transition-colors duration-200 hover:bg-hover"
    >
      <span className="block text-body font-semibold text-ink">{title}</span>
      <span className="mt-0.5 block text-label text-muted">{detail}</span>
    </button>
  )
}

/**
 * Opens by itself the moment sync needs the answer, wherever the person happens
 * to be. It can be put away — nothing syncs and nothing is lost meanwhile — and
 * the header's amber cloud brings it back through the account sheet.
 */
export function SyncGate() {
  const { sync } = useStore()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (sync.status !== 'decision') setDismissed(false)
  }, [sync.status])

  return (
    <Modal
      open={sync.status === 'decision' && !dismissed}
      onClose={() => setDismissed(true)}
      title="Bu cihazdaki veriler"
    >
      <SyncDecision />
    </Modal>
  )
}
