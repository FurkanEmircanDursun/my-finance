import { ArrowUpRight, Plus, ShieldAlert, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { money2 } from '../core/money'
import { MoneyValue, RollingNumber } from './MoneyValue'
import { AnimatedProgress, RadialGauge, resolveBudgetTone } from './motion'

export function BudgetRibbon({
  limit,
  spend,
  scoped,
  onEdit,
}: {
  limit: number
  spend: number
  scoped: boolean
  onEdit: () => void
}) {
  const ratio = limit > 0 ? Math.max(0, spend / limit) : 0
  const usedPct = Math.round(ratio * 100)
  const over = spend > limit && limit > 0
  const tone = resolveBudgetTone(ratio)

  return (
    <section
      className={`bento-card mizan-budget-card ${over ? 'mizan-budget-card--over' : ''}`}
      aria-labelledby="budget-title"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-micro font-medium uppercase text-faint">Bütçe Kapasitesi</span>
          <h2 id="budget-title" className="mt-0.5 text-title font-semibold text-ink">
            Aylık harcama alanın
          </h2>
        </div>
        <button
          type="button"
          className="toolbar-icon"
          onClick={onEdit}
          aria-label="Aylık harcama limitini düzenle"
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>

      {limit > 0 ? (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <div
                className={`break-words text-[clamp(1.5rem,2.6vw,2.15rem)] font-bold leading-none tracking-[-0.035em] ${
                  over ? 'text-negative' : 'text-ink'
                }`}
              >
                <MoneyValue value={Math.abs(limit - spend)} />
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-label font-medium">
                {over ? (
                  <span className="inline-flex items-center gap-1 text-negative">
                    <ShieldAlert size={14} /> Limit üzerinde
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-positive">
                    <ShieldCheck size={14} /> Kullanılabilir alan
                  </span>
                )}
              </div>
            </div>

            <RadialGauge value={Math.min(100, usedPct)} max={100} size={76} strokeWidth={7} tone={tone}>
              <RollingNumber
                value={usedPct}
                suffix="%"
                className="text-body font-semibold text-ink"
              />
            </RadialGauge>
          </div>

          <div className="mt-5 space-y-2">
            <AnimatedProgress
              value={spend}
              max={limit}
              tone={tone}
              height={8}
              label="Aylık limit kullanımı"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-label text-muted">
              <span className="num">%{usedPct} kullanıldı</span>
              <span className="num font-medium text-ink">{money2(limit)} limit</span>
            </div>
          </div>

          <p className="mt-4 text-label leading-relaxed text-muted">
            {over
              ? 'Limitini veya bu ayın kayıtlarını gözden geçir.'
              : 'Her kayıtta anlık güncellenir. Harcama hızın dengede.'}
          </p>
        </>
      ) : (
        <div className="mt-5 flex flex-1 flex-col justify-between gap-4">
          <div>
            <p className="text-[1.35rem] font-semibold tracking-[-0.03em] text-ink">
              Kendi dengeni kur.
            </p>
            <p className="mt-2 max-w-[30ch] text-label leading-relaxed text-muted">
              {scoped
                ? 'Aylık bir harcama sınırı belirle; her işlemde kalan payını canlı takip et.'
                : 'Limitini görmek için üstten tek bir ay seç.'}
            </p>
          </div>
          <div>
            <button type="button" className="quiet-button" onClick={onEdit}>
              <Plus size={15} /> Limit belirle <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
