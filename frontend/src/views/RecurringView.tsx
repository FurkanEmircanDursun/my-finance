import { useState } from 'react'
import { Badge, Empty, Grid, Section, Segmented, Stat } from '../ui/primitives'
import { money, count, percent, signedPercent } from '../core/money'
import { fullDayLabel } from '../core/date'
import { categoryLabel } from '../domain/categories'
import type { Analysis, RecurringPayment } from '../analytics/types'

type Scope = 'active' | 'lapsed' | 'all'

export function RecurringView({ analysis }: { analysis: Analysis }) {
  const [scope, setScope] = useState<Scope>('active')
  const { recurring, totals } = analysis

  if (!recurring.length) {
    return (
      <Empty
        title="Düzenli ödeme bulunamadı"
        description="Bir ödemenin düzenli sayılması için aynı işyerinden en az üç, benzer tutarlı ve düzenli aralıklı işlem gerekir — abonelik olduğu zaten belli olanlarda iki yeterli. Daha fazla dönem yükleyince liste dolar."
      />
    )
  }

  const active = recurring.filter((r) => r.status === 'active')
  const monthly = active.reduce((s, r) => s + r.monthlyEquivalent, 0)
  const annual = active.reduce((s, r) => s + r.annualCost, 0)
  const lapsed = recurring.filter((r) => r.status === 'lapsed')

  const rows =
    scope === 'all' ? recurring : scope === 'active' ? active : lapsed

  return (
    <div className="space-y-4">
      <p className="text-label text-faint">Tüm işlem geçmişiniz taranır; bu sekme bir döneme daraltılamaz.</p>

      <Grid className="sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Aktif düzenli ödeme" value={count(active.length)} hint={`${count(lapsed.length)} durmuş görünüyor`} />
        <Stat label="Aylık yük" value={money(monthly)} hint="Takvim ayına normalize edilmiş" />
        <Stat label="Yıllık karşılığı" value={money(annual)} hint="Mevcut tutarlar sabit kalırsa" />
        <Stat
          label="Harcamadaki payı"
          value={totals.netSpend > 0 ? percent((monthly / Math.max(totals.netSpend, 1)) * 100) : '—'}
          hint="Dönem net harcamasına oranla"
        />
      </Grid>

      <Section
        title="Tespit edilen düzenli ödemeler"
        description="Aralık düzeni, tutar istikrarı ve tekrar sayısı birlikte değerlendirilir"
        actions={
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'active', label: `Aktif (${active.length})` },
              { value: 'lapsed', label: `Durmuş (${lapsed.length})` },
              { value: 'all', label: 'Tümü' },
            ]}
          />
        }
        padded={false}
      >
        {rows.length === 0 ? (
          <Empty compact title="Bu grupta kayıt yok" />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((item) => (
              <RecurringRow key={item.merchant} item={item} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Tespit yöntemi">
        <ul className="space-y-2 text-label leading-relaxed text-muted">
          <li>
            <span className="font-medium text-ink">Aralık düzeni.</span> Ardışık ödemeler arasındaki gün
            farklarının medyanı bir periyot bandına (haftalık, aylık, üç aylık, yıllık) düşmelidir. Sapma
            medyanın %20'sini aştığında güven düşer.
          </li>
          <li>
            <span className="font-medium text-ink">Tutar istikrarı.</span> Tutarların medyan mutlak sapması
            %10 bandı içinde kalmalıdır. Tek seferlik zam güveni bitirmez, dalgalı tutar bitirir.
          </li>
          <li>
            <span className="font-medium text-ink">Kanıt miktarı.</span> İki ödeme tesadüfen düzenli
            görünebilir; bu yüzden en az üç tekrar aranır. Abonelik olduğu adından belli olan
            işyerlerinde iki yeterlidir, ama güven tavanla sınırlanır.
          </li>
          <li>
            <span className="font-medium text-ink">Durum.</span> Son ödemenin üzerinden periyodun 1,6 katı
            geçtiyse ödeme durmuş kabul edilir.
          </li>
        </ul>
      </Section>
    </div>
  )
}

function RecurringRow({ item }: { item: RecurringPayment }) {
  const rise = item.priceChangePct !== null && item.priceChangePct >= 10

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-hover">
      <div className="min-w-[180px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body font-medium text-ink">{item.label}</span>
          <Badge>{categoryLabel(item.category)}</Badge>
          <Badge tone={item.status === 'active' ? 'accent' : 'neutral'}>{item.cadenceLabel}</Badge>
          {item.status === 'lapsed' && <Badge tone="warning">Durmuş</Badge>}
          {rise && <Badge tone="negative">{signedPercent(item.priceChangePct!)} zam</Badge>}
        </div>
        <p className="mt-1 text-label text-faint">
          {count(item.occurrences)} ödeme · her {item.intervalDays} günde bir · {fullDayLabel(item.firstSeen)}
          {' — '}
          {fullDayLabel(item.lastSeen)}
        </p>
      </div>

      <div className="flex items-center gap-6">
        <Figure label="Son tutar" value={money(item.lastAmount, { decimals: true })} />
        <Figure label="Aylık" value={money(item.monthlyEquivalent)} />
        <Figure label="Yıllık" value={money(item.annualCost)} />
        <Figure
          label={item.status === 'active' ? 'Sonraki' : 'Beklenen'}
          value={fullDayLabel(item.nextExpected)}
          muted
        />
        <Figure label="Güven" value={percent(item.confidence * 100, 0)} muted />
      </div>
    </div>
  )
}

function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="text-right">
      <p className="text-label text-faint">{label}</p>
      <p className={`num text-label font-medium ${muted ? 'text-muted' : 'text-ink'}`}>{value}</p>
    </div>
  )
}
