import { Badge, Empty, Section } from '../ui/primitives'
import { HealthPanel, InsightRow } from '../ui/finance'
import { money, money2, count } from '../core/money'
import { fullDayLabel } from '../core/date'
import { categoryLabel } from '../domain/categories'
import { withOverallForwardInsights } from '../analytics/insights'
import type { Analysis } from '../analytics/types'
import type { ViewId } from '../app/navigation'

export function InsightsView({
  analysis,
  overall,
  onNavigate,
}: {
  analysis: Analysis
  /** Only used to swap in whole-history goal/forecast insights, see `withOverallForwardInsights`. */
  overall: Analysis
  onNavigate: (view: ViewId) => void
}) {
  const { anomalies, duplicates, health, meta, merchantConcentration } = analysis
  const insights = withOverallForwardInsights(analysis.insights, overall.insights)

  if (!meta.transactionCount) {
    return <Empty title="Bu filtreyle işlem yok" description="Dönem veya arama kriterlerini genişletin." />
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Section title="Bulgular" description={`${count(insights.length)} kayıt · önem sırasına göre`}>
          {insights.length === 0 ? (
            <Empty compact title="Öne çıkan bir bulgu yok" />
          ) : (
            <div>
              {insights.map((insight) => (
                <InsightRow key={insight.id} insight={insight} onAction={(v) => onNavigate(v as ViewId)} />
              ))}
            </div>
          )}
        </Section>

        <Section title="Finansal sağlık" description="Bileşen bazlı açıklamalı skor">
          <HealthPanel health={health} />
        </Section>
      </div>

      {duplicates.length > 0 && (
        <Section
          title="Olası mükerrer çekimler"
          description="Aynı işyeri, aynı tutar, birkaç gün içinde. Düzenli ödemeler bu listeden çıkarılmıştır."
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line text-label text-faint">
                  <th className="px-4 py-2.5 font-medium">İşyeri</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tutar</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tekrar</th>
                  <th className="px-4 py-2.5 font-medium">Tarihler</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fazla tahsilat</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((group, index) => (
                  <tr
                    key={`${group.merchant}-${group.amount}-${index}`}
                    className="border-b border-line last:border-b-0 hover:bg-hover"
                  >
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-label font-medium text-ink">
                      {group.label}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-label text-ink">{money2(group.amount)}</td>
                    <td className="num px-4 py-2.5 text-right text-label text-muted">
                      {count(group.transactions.length)}×
                    </td>
                    <td className="px-4 py-2.5 text-label text-muted">
                      {group.transactions.map((tx) => fullDayLabel(tx.date)).join(' · ')}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-label font-medium text-negative">
                      {money(group.amount * (group.transactions.length - 1))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {anomalies.length > 0 && (
        <Section
          title="Sıra dışı işlemler"
          description="Kategori veya işyeri geçmişine göre olağandışı büyüklükte olanlar"
          padded={false}
        >
          <div className="divide-y divide-line">
            {anomalies.slice(0, 20).map((anomaly) => (
              <div key={anomaly.transaction.id} className="flex items-start gap-3 px-4 py-3 hover:bg-hover">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-label font-medium text-ink">
                      {anomaly.transaction.description}
                    </span>
                    <Badge>{categoryLabel(anomaly.transaction.category)}</Badge>
                    <Badge tone="warning">
                      {anomaly.reason === 'merchant-outlier' ? 'İşyeri geçmişi' : 'Kategori normali'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-label text-muted">{anomaly.note}</p>
                  <p className="mt-0.5 text-label text-faint">
                    {fullDayLabel(anomaly.transaction.date)} · {anomaly.transaction.bank}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-body font-semibold text-ink">
                    {money2(anomaly.transaction.amount)}
                  </p>
                  <p className="num text-label text-faint">z {anomaly.score}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Yöntem notu">
        <div className="space-y-2 text-label leading-relaxed text-muted">
          <p>
            Sıra dışılık testi ortalama ve standart sapma yerine medyan ve medyan mutlak sapma kullanır.
            Kişisel harcama dağılımı sağa çarpık olduğu için tek bir büyük ödeme ortalama tabanlı bir eşiği
            şişirir ve gerçek aykırı değerleri gizler. Eşik, normal dağılıma denk gelecek şekilde ölçeklenmiş
            robust z-skorunda 3,5'tir.
          </p>
          <p>
            İşyeri yoğunlaşma endeksi (normalize Herfindahl-Hirschman) şu an{' '}
            <span className="num font-medium text-ink">{merchantConcentration}</span>. 0 harcamanın çok
            sayıda işyerine dağıldığını, 1 tek bir işyerinde toplandığını gösterir.
          </p>
          <p>
            Harcamanın{' '}
            <span className="num font-medium text-ink">
              {Math.round(meta.classifiedShare * 100)}%
            </span>{' '}
            kadarı adlandırılmış bir kategoriye düştü. Bu oran düştükçe kategori bazlı bulguların güveni
            azalır.
          </p>
        </div>
      </Section>
    </div>
  )
}
