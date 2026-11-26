import { Modal } from '../ui/Modal'
import { HealthPanel } from '../ui/finance'
import { money2 } from '../core/money'
import { useSheets } from '../app/sheets'
import type { Analysis } from '../analytics/types'

export function FindingsSheet({
  open,
  onClose,
  analysis,
}: {
  open: boolean
  onClose: () => void
  analysis: Analysis
}) {
  const { openTransactions } = useSheets()
  return (
    <Modal
      open={open}
      onClose={() => onClose()}
      title="Bulgular ve finansal sağlık"
      variant="sheet"
    >
      <div className="space-y-6">
        <HealthPanel health={analysis.health} />

        <section>
          <h3 className="text-title font-semibold text-ink">Bulgular</h3>
          {analysis.insights.map((insight) => (
            <div className="insight-line" key={insight.id}>
              <h3>{insight.title}</h3>
              <p className="num">{insight.body}</p>
            </div>
          ))}
          {!analysis.insights.length && (
            <p className="mt-2 text-body text-muted">
              Bu dönemde öne çıkan bulgu yok.
            </p>
          )}
        </section>

        <section>
          <h3 className="text-title font-semibold text-ink">Olası mükerrer çekimler</h3>
          <p className="mt-1 text-label text-muted">
            Benzer kayıtlar kesin mükerrer değildir; silmeden önce ekstrenle karşılaştır.
          </p>
          {analysis.duplicates.map((group, i) => (
            <button
              type="button"
              key={`${group.merchant}-${i}`}
              className="archive-link"
              onClick={() => {
                onClose()
                openTransactions({ merchant: group.merchant })
              }}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{group.label}</span>
              <span className="num shrink-0 font-semibold text-warning">
                {money2(group.amount)} · {group.transactions.length} işlem
              </span>
            </button>
          ))}
          {!analysis.duplicates.length && (
            <p className="mt-2.5 text-body text-muted">Benzer çekim bulunmadı.</p>
          )}
        </section>

        <section>
          <h3 className="text-title font-semibold text-ink">Sıra dışı harcamalar</h3>
          {analysis.anomalies.map((item) => (
            <button
              type="button"
              className="archive-link"
              key={item.transaction.id}
              onClick={() => {
                onClose()
                openTransactions({ merchant: item.transaction.merchant })
              }}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{item.transaction.description}</span>
              <span className="num shrink-0 font-semibold text-ink">{money2(item.transaction.amount)}</span>
            </button>
          ))}
          {!analysis.anomalies.length && (
            <p className="mt-2.5 text-body text-muted">
              Sıra dışı harcama bulunmadı.
            </p>
          )}
        </section>
      </div>
    </Modal>
  )
}
