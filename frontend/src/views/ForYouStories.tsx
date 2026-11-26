import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Coins,
  Flame,
  Scale,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react'
import { daysInMonth, fullDayLabel, monthOf } from '../core/date'
import { count, money, money2 } from '../core/money'
import { portfolioValue, type AssetHolding } from '../domain/assets'
import type { Statement } from '../domain/types'
import type { Analysis } from '../analytics/types'
import { buildUpcomingPayments } from '../analytics/upcoming'
import { computeFiftyThirtyTwenty } from '../analytics/fiftyThirtyTwenty'
import { buildRewards } from '../analytics/rewards'
import { cachedAssetRates } from '../platform/rates'
import { hapticTap } from '../platform/haptics'
import { HorizontalScrollStrip } from '../ui/HorizontalScrollStrip'
import { MoneyValue } from '../ui/MoneyValue'
import { AnimatedProgress } from '../ui/motion'

export interface StorySlide {
  id: string
  tag: string
  title: string
  metricLabel: string
  metricValue: number | null
  metricText?: string
  subtitle: string
  tone: 'jade' | 'gold' | 'amber' | 'crimson' | 'sky' | 'violet'
  icon: ReactNode
  bullets: Array<{ label: string; value: string }>
  ratio?: { value: number; max: number; label: string }
  cta: { label: string; onClick: () => void }
}

export function ForYouStories({
  period,
  month,
  today,
  spend,
  income,
  analysis,
  overall,
  statements,
  assets,
  privateMode,
  onOpenIncome,
  onOpenFindings,
  onNavigatePlan,
  onNavigateAssets,
  onNavigateTransactions,
}: {
  period: string
  month: string
  today: string
  spend: number
  income: number
  analysis: Analysis
  overall: Analysis
  statements: Statement[]
  assets: AssetHolding[]
  privateMode: boolean
  onOpenIncome: () => void
  onOpenFindings: () => void
  onNavigatePlan: () => void
  onNavigateAssets: () => void
  onNavigateTransactions: () => void
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const stories = useMemo<StorySlide[]>(() => {
    const currentMonth = month === 'all' ? monthOf(today) : month
    const totalDays = daysInMonth(currentMonth)
    const currentDay = currentMonth === monthOf(today) ? Math.max(1, Number(today.slice(-2))) : totalDays
    const avgDaily = currentDay > 0 ? Math.round(spend / currentDay) : 0

    // 50/30/20 Needs vs Wants — aligned with FutureView (includes groceries & transport in needs)
    const rule = computeFiftyThirtyTwenty(
      analysis.categories,
      income,
      spend,
      analysis.totals.unallocatedRefunds,
    )
    const { needTotal, wantTotal, otherTotal } = rule
    const classifiedTotal = Math.max(1, needTotal + wantTotal + otherTotal)
    const wantSharePct = Math.round((wantTotal / classifiedTotal) * 100)
    const needSharePct = Math.round((needTotal / classifiedTotal) * 100)

    // Upcoming payments & recurring
    const upcoming = buildUpcomingPayments(overall.recurring, statements, today)
    const activeSubs = overall.recurring.filter((r) => r.status === 'active')
    const monthlySubLoad = activeSubs.reduce((s, r) => s + r.monthlyEquivalent, 0)
    const priceHikes = activeSubs.filter((r) => (r.priceChangePct ?? 0) > 5)

    // Anomalies & duplicates
    const anomalyCount = analysis.anomalies.length + analysis.duplicates.length

    // Portfolio & rewards
    const snapshot = cachedAssetRates()
    const quotes = snapshot?.quotes ?? {}
    const portfolio = portfolioValue(assets, quotes)
    const rewards = buildRewards({ statements, transactions: [] })
    const portfolioVal = portfolio.total ?? portfolio.knownValue ?? 0
    const rewardBalance = rewards.programmes.reduce((s, p) => s + (p.balance ?? p.earned), 0)

    const topCat = analysis.categories[0]

    const list: StorySlide[] = [
      {
        id: 'pulse',
        tag: 'Ayın Nabzı',
        title: `${period} Nakit Dengesi`,
        metricLabel: income > 0 ? 'Gelirden Kalan' : 'Net Harcama',
        metricValue: income > 0 ? income - spend : spend,
        subtitle:
          income > 0
            ? `Gelirinin %${Math.round((spend / Math.max(1, income)) * 100)} kadarı harcandı. Günlük ortalama hızın ${money(avgDaily)}.`
            : `Bu dönemde günlük ortalama ${money(avgDaily)} harcadın. Gelirini ekleyerek net tasarruf oranını açabilirsin.`,
        tone: income > 0 && spend > income ? 'crimson' : 'jade',
        icon: <Flame size={17} />,
        bullets: [
          { label: 'Günlük ortalama', value: money2(avgDaily) },
          {
            label: 'Ay sonu tahmini',
            value: analysis.trend.projectedMonthEnd ? money(analysis.trend.projectedMonthEnd) : money(spend),
          },
          {
            label: 'En büyük kalem',
            value: topCat ? `${topCat.label} (${money(topCat.total)})` : 'Henüz kayıt yok',
          },
        ],
        ratio:
          income > 0
            ? { value: spend, max: income, label: `Gelir kullanımı: ${money(spend)} / ${money(income)}` }
            : undefined,
        cta: {
          label: income > 0 ? 'Tüm işlemleri incele' : 'Aylık gelirini kaydet',
          onClick: income > 0 ? onNavigateTransactions : onOpenIncome,
        },
      },
      {
        id: 'needs-wants',
        tag: '50 / 30 / 20 Kuralı',
        title: 'Zorunlu vs. Keyfi Harcama',
        metricLabel: 'Esnek (Keyfi) Harcama Payı',
        metricValue: wantTotal,
        subtitle:
          spend > 0
            ? `Harcamalarının %${needSharePct}’i zorunlu ihtiyaçlara (kira, fatura, market), %${wantSharePct}’i ise esnek/keyfi kalemlere gitti.`
            : 'Harcamaların eklendikçe zorunlu ihtiyaç ve keyfi istek dengen 50/30/20 standardına göre ölçülür.',
        tone: wantSharePct > 45 ? 'amber' : 'violet',
        icon: <Scale size={17} />,
        bullets: [
          { label: `Zorunlu ihtiyaçlar (%${needSharePct})`, value: money2(needTotal) },
          { label: `Esnek / keyfi (%${wantSharePct})`, value: money2(wantTotal) },
          {
            label: 'Önerilen üst sınır',
            value: wantSharePct <= 35 ? 'Dengeli (%35 altı)' : 'Esnek kalemler yüksek',
          },
        ],
        ratio:
          classifiedTotal > 1
            ? { value: needTotal, max: classifiedTotal, label: `Zorunlu %${needSharePct} · Keyfi %${wantSharePct}` }
            : undefined,
        cta: {
          label: 'Plan & Bütçe merkezini aç',
          onClick: onNavigatePlan,
        },
      },
      {
        id: 'upcoming-radar',
        tag: 'Ödeme & Abonelik',
        title: upcoming.length > 0 ? `${upcoming.length} Yaklaşan Ödeme` : 'Abonelik & Taksit Radarı',
        metricLabel: upcoming.length > 0 ? `Sıradaki: ${upcoming[0].label}` : 'Aylık Abonelik Yükü',
        metricValue: upcoming.length > 0 ? (upcoming[0].amount ?? monthlySubLoad) : monthlySubLoad,
        subtitle:
          upcoming.length > 0
            ? `${fullDayLabel(upcoming[0].date)} tarihinde (${upcoming[0].daysUntil === 0 ? 'bugün' : `${upcoming[0].daysUntil} gün sonra`}) ödemen var. Toplam ${count(activeSubs.length)} aktif abonelik izleniyor.`
            : `${count(activeSubs.length)} aktif düzenli ödeme ve ${count(overall.installments.filter((i) => i.remainingCount > 0).length)} açık taksit planı takip ediliyor.`,
        tone: priceHikes.length > 0 ? 'amber' : 'jade',
        icon: <CalendarClock size={17} />,
        bullets: [
          { label: 'Aktif abonelik yükü', value: `${money(monthlySubLoad)} / ay` },
          {
            label: 'Fiyat artışı yakalanan',
            value: priceHikes.length > 0 ? `${priceHikes.length} abonelikte zam` : 'Zam tespit edilmedi',
          },
          {
            label: 'Açık taksit planı',
            value: `${count(overall.installments.filter((i) => i.remainingCount > 0).length)} plan`,
          },
        ],
        cta: {
          label: 'Takvim ve ödeme planını gör',
          onClick: onNavigatePlan,
        },
      },
      {
        id: 'guard',
        tag: 'Akıllı Koruma',
        title: anomalyCount > 0 ? `${anomalyCount} Olağandışı Kayıt` : 'Çift Çekim & Anomali Yok',
        metricLabel: anomalyCount > 0 ? 'İncelenmesi önerilen işlem' : 'Finansal sağlık puanın',
        metricValue: anomalyCount > 0 ? analysis.anomalies[0]?.transaction.amount ?? analysis.duplicates[0]?.amount ?? 0 : analysis.health.score,
        metricText: anomalyCount > 0 ? undefined : `${analysis.health.score} / 100`,
        subtitle:
          anomalyCount > 0
            ? `${analysis.duplicates.length} olası mükerrer (çift) çekim ve ${analysis.anomalies.length} normalin üstünde harcama tespit edildi.`
            : 'Ekstre ve harcamalarında çift çekim veya olağandışı tutar sıçraması görünmüyor.',
        tone: anomalyCount > 0 ? 'crimson' : 'jade',
        icon: anomalyCount > 0 ? <ShieldAlert size={17} /> : <Sparkles size={17} />,
        bullets: [
          { label: 'Olası çift çekim', value: `${count(analysis.duplicates.length)} grup` },
          { label: 'Kategori/işyeri sapması', value: `${count(analysis.anomalies.length)} işlem` },
          { label: 'Finansal alışkanlık notu', value: `${analysis.health.score}/100 (${analysis.health.label})` },
        ],
        cta: {
          label: 'Bütçe bulgularını aç',
          onClick: onOpenFindings,
        },
      },
      {
        id: 'wealth',
        tag: 'Servet & Bonus',
        title: 'Portföy & Kart Puanları',
        metricLabel: portfolioVal > 0 ? 'Canlı Portföy Değeri' : 'Birikmiş Bonus & Puan',
        metricValue: portfolioVal > 0 ? portfolioVal : rewardBalance,
        subtitle:
          assets.length > 0
            ? `${count(assets.length)} varlık kalemi canlı altın/döviz kuruyla değerleniyor. Ekstrelerinde ${money2(rewardBalance)} bonus/puan birikti.`
            : 'Altın, gümüş ve döviz birikimlerini ekleyerek toplam net varlığını canlı kurlarla takip edebilirsin.',
        tone: 'gold',
        icon: <Coins size={17} />,
        bullets: [
          { label: 'Kayıtlı varlık kalemi', value: `${count(assets.length)} varlık` },
          { label: 'Kart bonus / chip-para', value: money2(rewardBalance) },
          { label: 'Canlı kur motoru', value: 'Altın · USD · EUR · Gümüş' },
        ],
        cta: {
          label: 'Varlıklar & Analiz’e git',
          onClick: onNavigateAssets,
        },
      },
    ]

    return list
  }, [
    period,
    month,
    today,
    spend,
    income,
    analysis,
    overall,
    statements,
    assets,
    onNavigateTransactions,
    onOpenIncome,
    onNavigatePlan,
    onOpenFindings,
    onNavigateAssets,
  ])

  // Keyboard navigation in story player
  useEffect(() => {
    if (activeIndex === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveIndex(null)
      else if (event.key === 'ArrowRight') {
        setActiveIndex((prev) => (prev === null ? null : prev < stories.length - 1 ? prev + 1 : null))
      } else if (event.key === 'ArrowLeft') {
        setActiveIndex((prev) => (prev === null ? null : Math.max(0, prev - 1)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeIndex, stories.length])

  const activeStory = activeIndex !== null ? stories[activeIndex] : null

  return (
    <>
      <section className="foryou-strip" aria-label="Senin için akıllı finans hikayeleri">
        <div className="foryou-strip__header">
          <span className="foryou-strip__badge">
            <Sparkles size={13} /> Senin İçin · Canlı İçgörüler
          </span>
        </div>

        <HorizontalScrollStrip scrollerClassName="foryou-cards">
          {stories.map((story, idx) => (
            <button
              key={story.id}
              type="button"
              className={`foryou-card foryou-card--${story.tone}`}
              onClick={() => {
                hapticTap()
                setActiveIndex(idx)
              }}
            >
              <div className="foryou-card__top">
                <span className="foryou-card__ring">{story.icon}</span>
                <span className="foryou-card__tag">{story.tag}</span>
              </div>
              <strong className="foryou-card__title">{story.title}</strong>
              <span className="foryou-card__metric num">
                {privateMode
                  ? '••••'
                  : story.metricText
                    ? story.metricText
                    : story.metricValue !== null
                      ? money(story.metricValue)
                      : '—'}
              </span>
            </button>
          ))}
        </HorizontalScrollStrip>
      </section>

      {activeStory && activeIndex !== null && (
        <div
          className="foryou-player-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={activeStory.title}
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveIndex(null)
          }}
        >
          <div className={`foryou-player foryou-player--${activeStory.tone}`}>
            {/* Story Progress Bars */}
            <div
              className="foryou-player__bars"
              style={{ gridTemplateColumns: `repeat(${stories.length}, minmax(0, 1fr))` }}
              aria-hidden="true"
            >
              {stories.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className={`foryou-player__bar ${
                    i < activeIndex ? 'is-done' : i === activeIndex ? 'is-active' : ''
                  }`}
                />
              ))}
            </div>

            <div className="foryou-player__header">
              <div className="foryou-player__meta">
                <span className="foryou-card__ring">{activeStory.icon}</span>
                <div>
                  <span className="foryou-player__tag">{activeStory.tag}</span>
                  <span className="foryou-player__period">{period}</span>
                </div>
              </div>
              <button
                type="button"
                className="foryou-player__close"
                aria-label="Hikayeyi kapat"
                onClick={() => setActiveIndex(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="foryou-player__body">
              <h2>{activeStory.title}</h2>

              <div className="foryou-player__hero-box">
                <span className="foryou-player__metric-label">{activeStory.metricLabel}</span>
                <div className="foryou-player__metric-value num">
                  {privateMode ? (
                    '••••••'
                  ) : activeStory.metricText ? (
                    activeStory.metricText
                  ) : activeStory.metricValue !== null ? (
                    <MoneyValue value={activeStory.metricValue} />
                  ) : (
                    '—'
                  )}
                </div>
                {activeStory.ratio && !privateMode && (
                  <div className="mt-3 space-y-1.5">
                    <AnimatedProgress
                      value={activeStory.ratio.value}
                      max={activeStory.ratio.max}
                      height={7}
                    />
                    <span className="block text-xs text-muted">{activeStory.ratio.label}</span>
                  </div>
                )}
              </div>

              <p className="foryou-player__subtitle">{activeStory.subtitle}</p>

              <dl className="foryou-player__bullets">
                {activeStory.bullets.map((b) => (
                  <div key={b.label}>
                    <dt>{b.label}</dt>
                    <dd className="num">{privateMode ? '••••' : b.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="foryou-player__footer">
              <div className="foryou-player__nav">
                <button
                  type="button"
                  disabled={activeIndex === 0}
                  onClick={() => {
                    hapticTap()
                    setActiveIndex((i) => (i !== null && i > 0 ? i - 1 : i))
                  }}
                  aria-label="Önceki hikaye"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="num text-xs text-muted">
                  {activeIndex + 1} / {stories.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    hapticTap()
                    setActiveIndex((i) =>
                      i !== null && i < stories.length - 1 ? i + 1 : null,
                    )
                  }}
                  aria-label="Sonraki hikaye"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <button
                type="button"
                className="primary-button w-full"
                onClick={() => {
                  const run = activeStory.cta.onClick
                  setActiveIndex(null)
                  run()
                }}
              >
                {activeStory.cta.label} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
