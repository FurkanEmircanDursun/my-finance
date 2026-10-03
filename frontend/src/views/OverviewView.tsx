import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, ChevronRight, Copy } from 'lucide-react'
import { clsx } from 'clsx'
import { Button, Empty, Meter, Section } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { DailySpendChart } from '../ui/charts'
import { HealthPanel, InsightRow, TrendPill } from '../ui/finance'
import { LedgerSummary } from '../ui/ledger'
import { BreakdownFooter } from '../ui/breakdown'
import { RewardsSection } from '../ui/rewards'
import { money, money2, count, percent } from '../core/money'
import { dayLabel, monthLabel } from '../core/date'
import { withOverallForwardInsights } from '../analytics/insights'
import { buildSummary } from '../analytics/summary'
import { describeSync } from '../sync/present'
import { buildLedgers } from '../analytics/ledger'
import { buildRewards } from '../analytics/rewards'
import { buildStatementMonthIndex, statementsInScope } from '../store/selectors'
import { useStore } from '../store/AppStore'
import { useSheets } from '../app/sheets'
import type { ViewId } from '../app/navigation'

/**
 * "How am I doing" — answered before anything is touched.
 *
 * One number, one sentence, two figures, and the few things worth acting on.
 * The previous version opened with the same sentence *and* four tiles that
 * repeated it, plus a 0–100 health score whose two-point movements meant
 * nothing to anyone. A screen that states the same fact three ways is not
 * being thorough, it is refusing to decide what matters.
 */
export function OverviewView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { state, analysis, overall, cloudAvailable, authReady, authUser, sync } = useStore()
  const { openAccount, openArchive, openIncome, openRewards, openSettings, openStatement, openTransactions } = useSheets()
  const [healthOpen, setHealthOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)

  const { totals, trend, meta, categories, health, daily, commitments } = analysis
  const { goal } = overall
  // The "Gelecek ay şimdiden bağlı" tile already states what the commitment
  // insight states, until it becomes a warning — then it is news, and stays.
  const insights = withOverallForwardInsights(analysis.insights, overall.insights).filter(
    (insight) => !(insight.id === 'commitment-load' && insight.severity === 'info'),
  )
  const profile = state.profile

  // The statements this screen is about, laid out as the bank lays them out. The
  // hero figure and the category list below must agree with these to the kuruş.
  const scope = useMemo(
    () => statementsInScope(state.statements, state.filters),
    [state.statements, state.filters],
  )
  const { ledgers, totals: ledgerTotals } = useMemo(
    () => buildLedgers(scope, state.transactions),
    [scope, state.transactions],
  )
  const rewards = useMemo(
    () => buildRewards({ statements: scope, transactions: state.transactions }),
    [scope, state.transactions],
  )

  const peers = useMemo(
    () => statementsInScope(state.statements, { month: 'all', cards: state.filters.cards }),
    [state.statements, state.filters.cards],
  )
  const peerMonths = useMemo(() => new Set(buildStatementMonthIndex(peers).values()).size, [peers])
  const peerCharges = useMemo(() => buildLedgers(peers, state.transactions).totals.charges, [peers, state.transactions])

  const periodLabel =
    state.filters.month === 'all' ? 'Tüm dönemler' : monthLabel(state.filters.month)
  const cardLabel = state.filters.cards.length === 1 ? state.filters.cards[0] : null

  if (!meta.transactionCount) {
    return <Empty title="Bu dönemde işlem yok" description="Üstteki dönem seçiminden başka bir ay seç." />
  }

  // A statement whose rows do not add up to the bank's own total undermines every
  // figure below it, so it is said once, here, rather than left in an archive.
  const misread = state.statements.filter((st) => st.reconciliation?.status === 'mismatch')
  const misreadDelta = misread.reduce((sum, st) => sum + Math.abs(st.reconciliation?.delta ?? 0), 0)

  const topCategory = categories[0]
  const nextMonth = commitments[0]
  const limit = profile.spendingLimit
  const projected = trend.projectedMonthEnd

  // A finished period next to its own "monthly average" says the same number
  // twice. What a finished period needs is a yardstick: how it sits against the
  // months around it. Only offered when there is more than one month to average.
  // The yardstick is the same card's own statements (or all cards' together when
  // none is chosen): one card set against both cards' average would always read
  // "far below". A statement is a month, so the average is per statement month.
  const norm =
    projected === null && state.filters.month !== 'all' && peerMonths >= 2
      ? Math.round(peerCharges / peerMonths)
      : null
  const againstNorm = norm ? ((totals.netSpend - norm) / norm) * 100 : null

  return (
    <div className="space-y-10">
      {/* ── The answer ───────────────────────────────────────────────────── */}
      <section>
        <p className="text-label uppercase tracking-wide text-faint">
          {[state.filters.month === 'all' ? 'Tüm dönemler' : periodLabel, cardLabel].filter(Boolean).join(' · ')} harcaması
        </p>

        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className="num text-hero font-semibold text-ink">{money2(totals.netSpend)}</span>
          {/* A month-over-month pill with nothing to compare against is noise;
              it only appears once there are two comparable periods. */}
          {trend.momPct !== null && (
            <span className="pb-1.5">
              <TrendPill value={trend.momPct} suffix="önceki aya göre" />
            </span>
          )}
        </div>

        <p className="mt-4 max-w-xl text-body text-muted">
          {meta.from && meta.to && (
            <>
              {dayLabel(meta.from)} — {dayLabel(meta.to)} arası {count(meta.spendCount)} harcama, günde
              ortalama <span className="font-semibold text-ink">{money(trend.averageDailySpend)}</span>.{' '}
            </>
          )}
          {topCategory && (
            <>
              En çok <span className="font-semibold text-ink">{topCategory.label}</span>:{' '}
              <span className="font-semibold text-ink">{money(topCategory.total)}</span> (
              {percent(topCategory.share * 100)}).
            </>
          )}
        </p>
      </section>

      {/* ── Where the figure comes from ─────────────────────────────────── */}
      {/* The question the headline invites is "why is this not my statement's
          debt?". The statement's own sum answers it on the spot, with the
          bank's figures, rather than leaving it to be worked out. */}
      {ledgers.length > 0 && (
        <Section title="Ekstre hesabı" description="Dönem borcu = önceki bakiye − ödemeler + dönem harcamaları">
          <LedgerSummary
            ledgers={ledgers}
            totals={ledgerTotals}
            manual={totals.netSpend - ledgerTotals.charges}
            onOpen={openStatement}
          />
        </Section>
      )}

      {/* ── Two figures. Not four. ───────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Tile
          value={money(norm ?? projected ?? Math.round(totals.netSpend / Math.max(meta.monthsEquivalent, 1)))}
          label={norm !== null ? (cardLabel ? 'Bu kartın aylık ortalaması' : 'Aylık ortalaman') : projected !== null ? 'Ay sonunda' : 'Aylık ortalama'}
          foot={
            norm !== null && againstNorm !== null ? (
              Math.abs(againstNorm) < 3 ? (
                'Bu dönem ortalama düzeyinde'
              ) : (
                <span className={againstNorm > 0 ? 'text-negative' : 'text-positive'}>
                  Bu dönem ortalamanın %{Math.round(Math.abs(againstNorm))}{' '}
                  {againstNorm > 0 ? 'üzerinde' : 'altında'}
                </span>
              )
            ) : limit > 0 && projected !== null ? (
              <div className="space-y-2">
                <Meter
                  value={projected}
                  max={limit}
                  tone={projected > limit ? 'negative' : projected > limit * 0.85 ? 'warning' : 'positive'}
                />
                <span className={projected > limit ? 'text-negative' : 'text-positive'}>
                  {projected > limit
                    ? `Limitin ${money(projected - limit)} üzerinde`
                    : `Limitin ${money(limit - projected)} altında`}
                </span>
              </div>
            ) : projected !== null ? (
              `${trend.projectionBasisDays} günlük hıza göre`
            ) : (
              `${count(meta.coveredDays)} günlük veriye göre`
            )
          }
        />

        <Tile
          value={money(nextMonth?.total ?? 0)}
          label="Gelecek ay şimdiden bağlı"
          foot={
            nextMonth && nextMonth.total > 0
              ? [
                  monthLabel(nextMonth.month),
                  // Only name the parts that actually contribute; "+ düzenli ₺0"
                  // is noise on a screen meant to be read at a glance.
                  nextMonth.installments > 0 ? `taksit ${money(nextMonth.installments)}` : null,
                  nextMonth.recurring > 0 ? `abonelik ${money(nextMonth.recurring)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Açık taksit veya abonelik yok'
          }
          onClick={() => onNavigate('future')}
        />
      </div>

      {misread.length > 0 && (
        <button
          type="button"
          onClick={openArchive}
          className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius-lg)] bg-negative-soft px-4 py-3 text-left transition-colors duration-200 hover:brightness-95"
        >
          <AlertTriangle size={16} className="shrink-0 text-negative" />
          <span className="flex-1 text-body text-negative">
            {misread.length === 1 ? 'Bir ekstre' : `${misread.length} ekstre`} bankanın toplamıyla tutmuyor:{' '}
            <span className="num font-semibold">{money2(misreadDelta)}</span> fark. Ayrıntıya bak.
          </span>
          <ChevronRight size={18} className="shrink-0 text-negative" />
        </button>
      )}

      {/* ── What is missing ──────────────────────────────────────────────── */}
      {/* Asked here, once, at the moment it would change an answer on screen —
          not as a setup wizard before anything has been shown. */}
      {profile.monthlyIncome === 0 && (
        <button
          type="button"
          onClick={openIncome}
          className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius-lg)] bg-accent-soft px-4 py-3 text-left transition-colors duration-200 hover:brightness-95"
        >
          <span className="flex-1 text-body text-accent-text">
            Gelirini gir, ay sonunda ne kalacağını söyleyeyim.
          </span>
          <ChevronRight size={18} className="shrink-0 text-accent" />
        </button>
      )}

      {/* ── What to look at ──────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <Section title="Dikkat edilecekler">
          <div>
            {insights.slice(0, 3).map((insight) => (
              <InsightRow key={insight.id} insight={insight} onAction={(v) => onNavigate(v as ViewId)} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Where it went ────────────────────────────────────────────────── */}
      <Section
        title="Para nereye gitti"
        actions={
          <Button size="sm" variant="ghost" onClick={() => onNavigate('spending')}>
            Tümü
            <ArrowRight size={14} />
          </Button>
        }
      >
        <ul className="-mx-2">
          {categories.slice(0, 5).map((stat) => (
            <li key={stat.id}>
              <button
                type="button"
                onClick={() => openTransactions({ category: stat.id })}
                className="w-full rounded-[var(--radius)] px-2 py-2.5 text-left transition-colors duration-200 hover:bg-hover"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: stat.color }}
                      aria-hidden
                    />
                    <span className="truncate text-body text-ink">{stat.label}</span>
                  </span>
                  <span className="num shrink-0 text-body font-semibold text-ink">{money2(stat.total)}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(stat.total / (categories[0]?.total || 1)) * 100}%`,
                        background: stat.color,
                      }}
                    />
                  </div>
                  <span className="num w-10 shrink-0 text-right text-label text-faint">
                    {percent(stat.share * 100)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
        {/* What the five rows leave out, and the total they add up to. */}
        <BreakdownFooter
          categories={categories}
          shown={5}
          refundsOutside={totals.unallocatedRefunds}
          netSpend={totals.netSpend}
          onOpenRefunds={() => openTransactions({ kinds: ['refund'], title: 'İade ve indirimler' })}
        />
      </Section>

      {/* ── Bonus and points ─────────────────────────────────────────────── */}
      {/* Not spending, so never inside the figures above — but money the card gave
          back, which is worth knowing about: it is how a ₺3.000 "otomatik fatura
          bonusu" shows up here instead of vanishing into an archive. */}
      {rewards.programmes.length > 0 && (
        <Section title="Bonus ve puan" description="Borca etkisi yok; harcamaya katılmaz">
          <RewardsSection report={rewards} onOpen={openRewards} />
        </Section>
      )}

      {/* ── Rhythm ───────────────────────────────────────────────────────── */}
      <Section title="Günlük akış" description="Kesikli çizgi 7 günlük ortalama">
        <DailySpendChart data={daily} height={180} />
      </Section>

      {/* ── The quiet footer ─────────────────────────────────────────────── */}
      {/* Everything below is real but rarely wanted, so it sits at the end as
          one-line rows rather than competing for the top of the screen. */}
      <div className="space-y-1 border-t border-line pt-4">
        {goal && (
          <FootRow
            label="Tasarruf hedefi"
            value={
              goal.status === 'reached' ? 'Ulaşıldı'
              : goal.status === 'not-started' ? 'Başlamadı'
              : money(goal.delta, { sign: true })
            }
            tone={
              goal.status === 'ahead' || goal.status === 'reached' ? 'positive'
              : goal.status === 'behind' || goal.status === 'ended' ? 'negative'
              : undefined
            }
            onClick={() => onNavigate('future')}
          />
        )}

        {/* A band, not a score. The difference between 71 and 73 changes no
            decision; "İyi" versus "Zayıf" does. */}
        <FootRow
          label="Finansal sağlık"
          value={health.label}
          tone={health.band === 'strong' ? 'positive' : health.band === 'weak' ? 'negative' : undefined}
          onClick={() => setHealthOpen(true)}
        />

        {state.settings.periodGrouping === 'statement' && (
          <FootRow label="Dönem" value="Ekstre dönemine göre" onClick={openSettings} />
        )}

        <FootRow label="Dönem özeti" value="Kopyala" onClick={() => setSummaryOpen(true)} />

        <FootRow
          label="Geçmiş ve veri"
          value={`${count(state.statements.length)} ekstre`}
          onClick={openArchive}
        />

        {/* Always one row away, never a banner: the cloud is an option, and an
            option that nags is a decision made for the person. */}
        {cloudAvailable && authReady && (
          <FootRow
            label="Bulut senkronu"
            value={authUser ? describeSync(sync, Date.now()).title : 'Kapalı'}
            tone={authUser && sync.status === 'synced' ? 'positive' : undefined}
            onClick={openAccount}
          />
        )}
      </div>

      <Modal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title="Dönem özeti"
        description="Her sayı, yanındaki varsayımla birlikte"
      >
        <SummaryPanel text={buildSummary(analysis, overall, profile, periodLabel)} />
      </Modal>

      <Modal
        open={healthOpen}
        onClose={() => setHealthOpen(false)}
        title="Finansal sağlık"
        description="Her bileşen kendi ekseninde puanlanır, ağırlığıyla toplanır"
      >
        <HealthPanel health={health} />
      </Modal>
    </div>
  )
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function Tile({
  value,
  label,
  foot,
  onClick,
}: {
  value: React.ReactNode
  label: string
  foot?: React.ReactNode
  onClick?: () => void
}) {
  const body = (
    <>
      <div className="num text-figure font-semibold text-ink">{value}</div>
      <div className="mt-2 text-body text-muted">{label}</div>
      {foot && <div className="mt-3 text-label text-faint">{foot}</div>}
    </>
  )

  if (!onClick) return <div className="surface p-5">{body}</div>

  return (
    <button
      type="button"
      onClick={onClick}
      className="surface p-5 text-left transition-colors duration-200 hover:bg-hover"
    >
      {body}
    </button>
  )
}

function FootRow({
  label,
  value,
  tone,
  onClick,
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-[var(--radius)] px-2 text-left transition-colors duration-200 hover:bg-hover"
    >
      <span className="flex-1 text-body text-muted">{label}</span>
      <span
        className={clsx(
          'num text-body font-semibold',
          tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink',
        )}
      >
        {value}
      </span>
      <ChevronRight size={16} className="shrink-0 text-faint" />
    </button>
  )
}

function SummaryPanel({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused (an insecure origin, a locked-down
      // browser). The text is on screen and selectable either way, so this
      // fails quietly rather than throwing an error at someone who can simply
      // select it by hand.
    }
  }

  return (
    <div className="space-y-4">
      <pre className="num max-h-[45vh] overflow-auto rounded-[var(--radius)] bg-sunken p-4 text-label leading-relaxed text-ink">
        {text}
      </pre>
      <Button variant="primary" onClick={copy}>
        <Copy size={16} />
        {copied ? 'Kopyalandı' : 'Panoya kopyala'}
      </Button>
    </div>
  )
}
