import { useState } from 'react'
import { ArrowRight, Activity, Check, Copy } from 'lucide-react'
import { Button, Empty, Meter, Section } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { DailySpendChart } from '../ui/charts'
import { HealthPanel, InsightRow, TrendPill } from '../ui/finance'
import { money, count, percent, signedPercent } from '../core/money'
import { dayLabel, monthLabel, todayKey } from '../core/date'
import { withOverallForwardInsights } from '../analytics/insights'
import { buildSummary } from '../analytics/summary'
import type { Analysis } from '../analytics/types'
import type { Profile } from '../domain/types'
import type { ViewId } from '../app/navigation'

/**
 * The overview has one job: answer "how am I doing" without the reader having
 * to assemble anything. It opens with a sentence, then three numbers, then the
 * few things worth acting on. Everything else is one click away.
 *
 * `analysis` is scoped to whatever period is selected in the filter bar —
 * right, for the headline spend figure and the category breakdown. `overall`
 * is the whole account, unfiltered — used only for the savings-goal tile,
 * because a goal is measured against months of saving, not against whichever
 * single month happens to be selected right now.
 */
export function OverviewView({
  analysis,
  overall,
  profile,
  periodLabel,
  onNavigate,
}: {
  analysis: Analysis
  overall: Analysis
  profile: Profile
  periodLabel: string
  onNavigate: (view: ViewId) => void
}) {
  const [healthOpen, setHealthOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const { totals, trend, meta, categories, health, daily, commitments } = analysis
  const { goal } = overall
  const insights = withOverallForwardInsights(analysis.insights, overall.insights)

  if (!meta.transactionCount) {
    return (
      <Empty
        title="Bu dönemde işlem yok"
        description="Üstteki dönem seçiminden başka bir ay seçin veya yeni bir ekstre yükleyin."
      />
    )
  }

  const topCategory = categories[0]
  const nextMonth = commitments[0]
  const limit = profile.spendingLimit
  const projected = trend.projectedMonthEnd

  return (
    <div className="space-y-4">
      {/* ── The sentence ─────────────────────────────────────────────────── */}
      <section className="surface p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-2xs uppercase tracking-wide text-faint">{periodLabel}</p>
          <Button size="sm" variant="ghost" onClick={() => setSummaryOpen(true)}>
            <Copy size={12} />
            Özet çıkar
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
          <span className="num text-[40px] font-semibold leading-none tracking-tight text-ink">
            {money(totals.netSpend)}
          </span>
          {/* A month-over-month pill with nothing to compare against is noise;
              it only appears once there are two comparable periods. */}
          {trend.momPct !== null && (
            <span className="pb-1">
              <TrendPill value={trend.momPct} suffix="önceki aya göre" />
            </span>
          )}
        </div>

        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted">
          {meta.from && meta.to && (
            <>
              {dayLabel(meta.from)} — {dayLabel(meta.to)} arasında {count(meta.spendCount)} harcama,
              günde ortalama <span className="font-medium text-ink">{money(trend.averageDailySpend)}</span>.{' '}
            </>
          )}
          {topCategory && (
            <>
              En çok <span className="font-medium text-ink">{topCategory.label}</span> için harcadınız:{' '}
              <span className="font-medium text-ink">{money(topCategory.total)}</span> (
              {percent(topCategory.share * 100)}).{' '}
            </>
          )}
          {totals.refunds > 0 && <>İadeler düşüldükten sonraki net tutar bu. </>}
          {(nextMonth?.total ?? 0) > 0 && (
            <>
              Gelecek ay şimdiden{' '}
              <span className="font-medium text-ink">{money(nextMonth.total)}</span> bağlı.
            </>
          )}
        </p>
      </section>

      {/* ── Headline numbers ─────────────────────────────────────────────── */}
      <div className={`grid gap-3 sm:grid-cols-2 ${goal ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <Tile
          label={projected !== null ? 'Ay sonu tahmini' : 'Aylık ortalama'}
          value={money(projected ?? Math.round(totals.netSpend / Math.max(meta.monthsEquivalent, 1)))}
          foot={
            limit > 0 && projected !== null ? (
              <div className="space-y-1.5">
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
          label="Gelecek ay bağlı"
          value={money(nextMonth?.total ?? 0)}
          foot={
            nextMonth && nextMonth.total > 0
              ? [
                  monthLabel(nextMonth.month),
                  // Only name the parts that actually contribute; "+ düzenli ₺0"
                  // is noise on a screen meant to be read at a glance.
                  nextMonth.installments > 0 ? `taksit ${money(nextMonth.installments)}` : null,
                  nextMonth.recurring > 0 ? `düzenli ödeme ${money(nextMonth.recurring)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Açık taksit veya abonelik yok'
          }
          onClick={() => onNavigate('commitments')}
        />

        <Tile
          label="Finansal sağlık"
          value={
            <span
              className={
                health.band === 'strong'
                  ? 'text-positive'
                  : health.band === 'weak'
                    ? 'text-negative'
                    : 'text-ink'
              }
            >
              {health.score}
              <span className="text-base font-normal text-faint">/100</span>
            </span>
          }
          foot={health.label}
          onClick={() => setHealthOpen(true)}
          icon={<Activity size={13} />}
        />

        {goal && (
          <Tile
            label="Tasarruf hedefi"
            value={
              <span
                className={
                  goal.status === 'ahead' || goal.status === 'reached'
                    ? 'text-positive'
                    : goal.status === 'behind' || goal.status === 'ended'
                      ? 'text-negative'
                      : 'text-ink'
                }
              >
                {goal.status === 'reached'
                  ? 'Ulaşıldı'
                  : goal.status === 'not-started'
                    ? 'Başlamadı'
                    : money(goal.delta, { sign: true })}
              </span>
            }
            foot={
              goal.status === 'ahead' || goal.status === 'behind'
                ? `${monthLabel(goal.goal.targetMonth)} hedefine göre${
                    goal.maxMonthlySpend !== null ? ` · bu ay en fazla ${money(goal.maxMonthlySpend)}` : ''
                  }`
                : `Hedef: ${money(goal.goal.targetAmount)} · ${monthLabel(goal.goal.targetMonth)}`
            }
            onClick={() => onNavigate('commitments')}
          />
        )}
      </div>

      {/* ── What to look at ──────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <Section
          title="Dikkat edilecekler"
          description="Bu dönemde öne çıkan bulgular"
          actions={
            insights.length > 3 && (
              <Button size="sm" variant="ghost" onClick={() => onNavigate('insights')}>
                Tümü ({insights.length})
                <ArrowRight size={12} />
              </Button>
            )
          }
        >
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
        description={`${categories.length} kategori · ilk 5 gösteriliyor`}
        actions={
          <Button size="sm" variant="ghost" onClick={() => onNavigate('spending')}>
            Tümü
            <ArrowRight size={12} />
          </Button>
        }
      >
        <ol className="space-y-3">
          {categories.slice(0, 5).map((stat) => (
            <li key={stat.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: stat.color }} />
                  <span className="truncate text-[13px] text-ink">{stat.label}</span>
                </span>
                <span className="num shrink-0 text-[13px] font-medium text-ink">{money(stat.total)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(stat.total / (categories[0]?.total || 1)) * 100}%`,
                      background: stat.color,
                    }}
                  />
                </div>
                <span className="num w-20 shrink-0 text-right text-2xs text-faint">
                  {percent(stat.share * 100)} · {count(stat.count)} işlem
                </span>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Rhythm ───────────────────────────────────────────────────────── */}
      <Section
        title="Günlük akış"
        description="Kesikli çizgi 7 günlük ortalama"
        actions={
          <Button size="sm" variant="ghost" onClick={() => onNavigate('spending')}>
            Detay
            <ArrowRight size={12} />
          </Button>
        }
      >
        <DailySpendChart data={daily} height={180} />
      </Section>

      <Modal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title="Dönem özeti"
        description="Panoya kopyalayın veya dosya olarak indirin — her sayı yanındaki varsayımla birlikte"
      >
        <SummaryPanel
          text={buildSummary(analysis, overall, profile, periodLabel)}
          copied={copied}
          onCopied={() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
          }}
        />
      </Modal>

      <Modal
        open={healthOpen}
        onClose={() => setHealthOpen(false)}
        title="Finansal sağlık nasıl hesaplandı"
        description="Her bileşen kendi ekseninde puanlanır, ağırlığıyla toplanır"
      >
        <HealthPanel health={health} />
        <p className="mt-4 rounded border border-line bg-sunken px-3 py-2.5 text-2xs leading-relaxed text-muted">
          Gelir girilmediğinde tasarruf bileşeni hesaplanamaz ve kalan bileşenlerin ağırlıkları yeniden
          ölçeklenir. Gelirinizi Ayarlar bölümünden girerseniz skor tamamlanır.
        </p>
      </Modal>
    </div>
  )
}

function SummaryPanel({
  text,
  copied,
  onCopied,
}: {
  text: string
  copied: boolean
  onCopied: () => void
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      onCopied()
    } catch {
      // Clipboard access can be refused (an insecure origin, a locked-down
      // browser). The text is on screen and selectable either way, so this
      // fails quietly rather than throwing an error at someone who can simply
      // select it by hand.
    }
  }

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `my-finance-ozet-${todayKey()}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <pre className="num max-h-[45vh] overflow-auto rounded border border-line bg-sunken p-3 text-2xs leading-relaxed text-ink">
        {text}
      </pre>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Kopyalandı' : 'Panoya kopyala'}
        </Button>
        <Button size="sm" onClick={download}>
          Dosya olarak indir
        </Button>
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  foot,
  onClick,
  icon,
}: {
  label: string
  value: React.ReactNode
  foot?: React.ReactNode
  onClick?: () => void
  icon?: React.ReactNode
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</span>
        {(icon || onClick) && (
          <span className="text-faint">{icon ?? <ArrowRight size={13} />}</span>
        )}
      </div>
      <div className="num mt-3 text-[28px] font-semibold leading-none tracking-tight text-ink">{value}</div>
      {foot && <div className="mt-2 text-2xs leading-relaxed text-muted">{foot}</div>}
    </>
  )

  if (!onClick) return <div className="surface p-4">{body}</div>

  return (
    <button type="button" onClick={onClick} className="surface p-4 text-left transition-colors hover:bg-hover">
      {body}
    </button>
  )
}

/** Re-exported for the shell's period label. */
export { signedPercent }
