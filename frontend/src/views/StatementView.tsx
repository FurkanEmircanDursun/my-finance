import { useMemo } from 'react'
import { clsx } from 'clsx'
import { ArrowLeft, ChevronDown, Upload } from 'lucide-react'
import { useSheets } from '../app/sheets'
import { cardBankFromName, legacyCardKey } from '../domain/cardLifecycle'
import { Badge, Button, Empty } from '../ui/primitives'
import { LedgerEquation, carriedSentence } from '../ui/ledger'
import { RewardsCard } from '../ui/rewards'
import { SummaryFacts } from '../ui/statements'
import { count, money2 } from '../core/money'
import { dayLabel, fullDayLabel } from '../core/date'
import { categoryColor, categoryLabel } from '../domain/categories'
import { buildLedger, type LedgerSection } from '../analytics/ledger'
import { buildRewards } from '../analytics/rewards'
import { useStore } from '../store/AppStore'
import { cardOf, type Transaction } from '../domain/types'

/**
 * One statement, every line of it, added up the way the bank adds it.
 *
 * This is the page to hold next to the paper: the equation at the top, then each
 * kind of line with its own subtotal, then the one figure those subtotals make.
 * Nothing here is estimated or rounded to the lira; a number is either the bank's
 * or a sum of numbers that are on this page.
 */
export function StatementView({ statementId, onBack }: { statementId: string; onBack: () => void }) {
  const { state } = useStore()
  const { openImport } = useSheets()
  const statement = state.statements.find(item => item.id === statementId)

  const ledger = useMemo(
    () => (statement ? buildLedger(statement, state.transactions) : null),
    [statement, state.transactions],
  )
  const rewards = useMemo(
    () => (statement ? buildRewards({ statements: [statement], transactions: state.transactions }) : null),
    [statement, state.transactions],
  )

  const back = <button type="button" className="card-back-button" onClick={onBack}><ArrowLeft size={18} /> Geri dön</button>
  if (!statement || !ledger) return <div className="statement-page">
    {back}<Empty title="Ekstre bulunamadı" description="Bu kayıt silinmiş veya henüz cihazına eşitlenmemiş olabilir." />
  </div>

  const range = statement.periodStart && statement.periodEnd
    ? `${dayLabel(statement.periodStart)} – ${fullDayLabel(statement.periodEnd)}`
    : statement.periodEnd ? fullDayLabel(statement.periodEnd) : null
  const sentence = ledger.status === 'match' ? carriedSentence(ledger.previousBalance, ledger.payments) : null
  const cardId = statement.cardId ?? (cardBankFromName(statement.bank) ? legacyCardKey(statement.bank, cardOf(statement)) : undefined)
  const difference = ledger.status === 'mismatch' ? ledger.delta : null
  const status = ledger.status === 'match' ? 'Doğrulandı' : difference !== null ? 'Tutarlar uyuşmuyor' : 'Doğrulanamadı'
  const retry = <Button type="button" onClick={() => openImport(cardId)}><Upload size={16} /> PDF’yi yeniden yükle</Button>

  return <div className="statement-page">
    {back}
    <header className="dashboard-title statement-heading">
      <div><h1>Ekstre Detayı</h1><p>{ledger.card}{range && <> · {range}</>}</p></div>
      {ledger.status === 'match' && retry}
    </header>
    <section className="statement-hero" aria-label="Ekstre özeti">
      <dl>
        <div><dt>Bankanın dönem borcu</dt><dd className="num statement-debt">{ledger.printedDebt === null ? '—' : money2(ledger.printedDebt)}</dd></div>
        <div><dt>Son ödeme tarihi</dt><dd>{statement.dueDate ? fullDayLabel(statement.dueDate) : 'Okunamadı'}</dd></div>
        <div><dt>Doğrulama durumu</dt><dd className={`statement-status statement-status--${ledger.status}`}>{status}</dd></div>
      </dl>
      {ledger.status !== 'match' && <div className="statement-recovery">
        <p>{difference !== null ? <>Kaydedilen harcama, bankanın ekstrede bildirdiği harcamadan <strong className="num">{money2(Math.abs(difference))}</strong> {difference > 0 ? 'fazla' : 'eksik'}.</> : 'Bankanın karşılaştırma için gereken tutarları bu ekstrede okunamadı.'}</p>
        {retry}
      </div>}
    </section>

    <div className="statement-body">
        <aside className="statement-aside" aria-label="Hesap ve ekstre bilgileri">
          <details className="statement-details">
            <summary>Ekstre hesabı <ChevronDown size={16} /></summary>
            <div>
              <LedgerEquation previousBalance={ledger.previousBalance} payments={ledger.payments} charges={ledger.charges} printedDebt={ledger.printedDebt} rowCount={ledger.rowCount} />
              {sentence && <p className="mt-3 text-body text-muted">{sentence}</p>}
            </div>
          </details>

        {rewards && rewards.programmes.length > 0 && (
          <section className="space-y-4 rounded-[var(--radius-lg)] border border-line p-4">
            <p className="text-label text-muted">
              Bonus ve puan hareketleri borç veya harcama hesabına dahil edilmez.
            </p>
            {rewards.programmes.map((programme) => (
              <RewardsCard key={`${programme.bank}|${programme.programme}`} programme={programme} />
            ))}
          </section>
        )}

          {statement.summary && <details className="statement-details">
            <summary>Ekstre bilgileri <ChevronDown size={16} /></summary>
            <div><SummaryFacts summary={statement.summary} showLoyalty={false} /></div>
          </details>}
        </aside>

        <section className="statement-rows" aria-labelledby="statement-rows-title">
          <div className="workspace-section-heading"><h2 id="statement-rows-title">Ekstre hareketleri</h2><span>{count(ledger.rowCount)} satır</span></div>
          {ledger.sections.length === 0 && <p className="workspace-empty-line">Bu ekstrede harcama veya ödeme satırı yok.</p>}
          {ledger.sections.map((section) => (
            <Section key={section.id} section={section} />
          ))}

          <div className="border-t border-line pt-3">
            <div className="flex items-baseline justify-between gap-3 px-2">
              <span className="text-body font-semibold text-ink">
                Dönem harcamaları
                <span className="ml-2 text-label font-normal text-faint">
                  {ledger.sections
                    .filter((s) => s.sign !== 0)
                    .map((s) => `${s.sign > 0 ? '+' : '−'} ${s.label.toLocaleLowerCase('tr')}`)
                    .join(' ')
                    .replace(/^\+ /, '')}
                </span>
              </span>
              <span className="num shrink-0 text-body font-semibold text-ink">{money2(ledger.charges)}</span>
            </div>
          </div>
        </section>
    </div>
  </div>
}

function Section({ section }: { section: LedgerSection }) {
  const prefix = section.sign > 0 ? '+' : section.sign < 0 ? '−' : ''
  return (
    <section className="statement-lines">
      <header>
        <h3 className="text-title font-semibold text-ink">
          {section.label}
          <span className="ml-2 text-label font-normal text-faint">{count(section.count)} satır</span>
        </h3>
        <span className="num shrink-0 text-title font-semibold text-ink">
          {prefix}
          {money2(section.total)}
        </span>
      </header>
      {section.sign === 0 && (
        <p className="px-2 pb-1 text-label text-faint">Önceki dönemin borcunu kapatır; harcama sayılmaz.</p>
      )}
      <ul>
        {section.rows.map((tx) => (
          <Row key={tx.id} tx={tx} sign={section.sign} />
        ))}
      </ul>
    </section>
  )
}

function Row({ tx, sign }: { tx: Transaction; sign: 1 | -1 | 0 }) {
  return (
    <li className="statement-line">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: categoryColor(tx.category) }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-body text-ink">{tx.description}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-label text-faint">
          <span>{dayLabel(tx.date)}</span>
          <span>{categoryLabel(tx.category)}</span>
          {tx.installment && (
            <Badge>
              taksit {tx.installment.current}/{tx.installment.total}
            </Badge>
          )}
          {tx.reward ? <span>+{money2(tx.reward)} bonus</span> : null}
        </span>
      </span>
      <span
        className={clsx(
          'num shrink-0 text-body font-semibold',
          sign < 0 ? 'text-positive' : sign === 0 ? 'text-muted' : 'text-ink',
        )}
      >
        {sign < 0 ? '−' : ''}
        {money2(tx.amount)}
      </span>
    </li>
  )
}
