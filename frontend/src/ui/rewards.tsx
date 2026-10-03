import { ChevronRight } from 'lucide-react'
import { count, money2 } from '../core/money'
import { fullDayLabel } from '../core/date'
import type { ProgrammeRewards, RewardLine, RewardsReport } from '../analytics/rewards'
import { programmeWord } from '../analytics/rewards'

/**
 * Bonus and chip-para, as a person keeps them in their head: what came in, what
 * went out, what is left — and where each came from.
 *
 * Both are counted in lira, but none of it is spending: it is credit the card
 * gave back, so it sits beside the spending figures, never inside them.
 */

function Lines({ title, sign, lines }: { title: string; sign: '+' | '−'; lines: RewardLine[] }) {
  if (lines.length === 0) return null
  return (
    <div>
      <h4 className="mb-1 text-label font-semibold uppercase tracking-wide text-faint">{title}</h4>
      <ul>
        {lines.map((line) => (
          <li key={line.label} className="flex min-h-[36px] items-baseline justify-between gap-3">
            <span className="min-w-0 text-body text-muted">
              {line.label}
              {line.count > 1 && <span className="ml-2 text-label text-faint">{count(line.count)} kez</span>}
            </span>
            <span className="num shrink-0 text-body text-ink">
              {sign}
              {money2(line.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RewardsCard({ programme }: { programme: ProgrammeRewards }) {
  const word = programmeWord(programme.programme)
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-title font-semibold text-ink">
          {programme.bank} · {programme.programme}
        </h3>
        <p className="mt-0.5 text-label text-faint">
          {count(programme.statements)} ekstre{programme.balanceAsOf ? ` · bakiye ${fullDayLabel(programme.balanceAsOf)} itibarıyla` : ''}
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <Figure label="Kazanılan" value={`+${money2(programme.earned)}`} tone="positive" />
        <Figure label="Harcanan" value={`−${money2(programme.spent)}`} />
        <Figure label="Kalan" value={programme.balance === null ? '—' : money2(programme.balance)} strong />
      </dl>

      <Lines title={`Nereden ${word} kazandın`} sign="+" lines={programme.earnedBy} />
      <Lines title={`${programme.programme} nasıl harcandı`} sign="−" lines={programme.spentOn} />
    </section>
  )
}

function Figure({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: string
  tone?: 'positive'
  strong?: boolean
}) {
  return (
    <div className="rounded-[var(--radius)] bg-sunken px-3 py-2.5">
      <dt className="text-label text-muted">{label}</dt>
      <dd
        className={`num mt-0.5 break-words text-body font-semibold ${tone === 'positive' ? 'text-positive' : 'text-ink'} ${strong ? '' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}

/** The overview's block: one tappable line per programme. */
export function RewardsSection({ report, onOpen }: { report: RewardsReport; onOpen: () => void }) {
  if (report.programmes.length === 0) return null
  return (
    <ul className="-mx-2">
      {report.programmes.map((programme) => (
        <li key={`${programme.bank}|${programme.programme}`}>
          <button
            type="button"
            onClick={onOpen}
            className="flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius)] px-2 py-2.5 text-left transition-colors duration-200 hover:bg-hover"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body text-ink">
                {programme.bank} {programme.programme}
              </span>
              <span className="num mt-0.5 block text-label text-muted">
                +{money2(programme.earned)} kazanıldı · −{money2(programme.spent)} harcandı
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="num block text-body font-semibold text-ink">
                {programme.balance === null ? '—' : money2(programme.balance)}
              </span>
              <span className="block text-label text-faint">kalan</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-faint" />
          </button>
        </li>
      ))}
    </ul>
  )
}
