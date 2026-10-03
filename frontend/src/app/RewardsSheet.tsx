import { useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { Empty } from '../ui/primitives'
import { RewardsCard } from '../ui/rewards'
import { buildRewards } from '../analytics/rewards'
import { statementsInScope } from '../store/selectors'
import { monthLabel } from '../core/date'
import { useStore } from '../store/AppStore'

/**
 * Bonus and chip-para for whatever statements are on screen: what each card gave
 * back this period, where it came from (the automatic-bill bonus, a campaign, the
 * shopping itself), and what it was spent on.
 */
export function RewardsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useStore()
  const { filters, statements, transactions } = state

  const report = useMemo(
    () => buildRewards({ statements: statementsInScope(statements, filters), transactions }),
    [statements, transactions, filters],
  )

  const scope = [
    filters.month === 'all' ? 'Tüm dönemler' : monthLabel(filters.month),
    filters.cards.length === 1 ? filters.cards[0] : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Modal open={open} onClose={onClose} title="Bonus ve puan" description={scope} variant="sheet">
      {report.programmes.length === 0 ? (
        <Empty title="Bu ekstrede bonus ya da puan hareketi yok" compact />
      ) : (
        <div className="space-y-8">
          {report.programmes.map((programme) => (
            <RewardsCard key={`${programme.bank}|${programme.programme}`} programme={programme} />
          ))}
          <p className="text-label text-faint">
            Bonus ve Chip-para lira değerindedir (ekstrede "Bonus (TL)" ve "Chip-para" olarak yazar). Harcama
            toplamına katılmaz; bankanın verdiği krediyi gösterir. Kalan, seçili ekstrelerin en yenisindeki
            bakiyedir.
          </p>
        </div>
      )}
    </Modal>
  )
}
