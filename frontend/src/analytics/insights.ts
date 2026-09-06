import { money, percent, signedPercent, round } from '../core/money'
import { fullDayLabel, monthLabel } from '../core/date'
import { categoryLabel } from '../domain/categories'
import { sliceForecast } from './forecast'
import type { Profile } from '../domain/types'
import type { Analysis, Insight } from './types'

/**
 * Turns the computed analysis into a ranked list of things worth acting on.
 *
 * Every rule reads only from already-computed aggregates, so adding a rule
 * costs nothing at analysis time. Weight decides ordering; the shell shows the
 * top handful on the overview and the whole list on the insights view.
 */
export function buildInsights(
  analysis: Omit<Analysis, 'insights'>,
  profile: Profile,
): Insight[] {
  const out: Insight[] = []
  const { totals, categories, recurring, commitments, anomalies, duplicates, habits, trend, meta, budgets } = analysis

  // ── Budget pace ─────────────────────────────────────────────────────────────
  if (profile.spendingLimit > 0 && trend.projectedMonthEnd !== null) {
    const overshoot = trend.projectedMonthEnd - profile.spendingLimit
    if (overshoot > 0) {
      out.push({
        id: 'budget-overshoot',
        severity: 'critical',
        title: 'Aylık limit aşılacak',
        body: `Mevcut hıza göre ay sonu ${money(trend.projectedMonthEnd)} · limit ${money(profile.spendingLimit)}. Fark ${money(overshoot)}.`,
        weight: 100,
        action: { view: 'spending', label: 'Nakit akışını gör' },
      })
    } else {
      out.push({
        id: 'budget-ontrack',
        severity: 'positive',
        title: 'Limit içinde ilerliyor',
        body: `Ay sonu projeksiyonu ${money(trend.projectedMonthEnd)}, limitin ${money(-overshoot)} altında.`,
        weight: 30,
      })
    }
  }

  // ── Category budgets ─────────────────────────────────────────────────────────
  const overBudget = budgets.items.filter((b) => b.status === 'over')
  if (overBudget.length) {
    const worst = overBudget[0]
    out.push({
      id: 'budget-over',
      severity: 'critical',
      title: `${worst.label} bütçesi ${money(worst.spent - worst.limit)} aşıldı`,
      body:
        overBudget.length > 1
          ? `${money(worst.spent)} harcandı, limit ${money(worst.limit)}. ${overBudget.length - 1} kategori daha bütçesini aştı.`
          : `${money(worst.spent)} harcandı, limit ${money(worst.limit)}.`,
      weight: 98,
      action: { view: 'spending', label: 'Bütçeleri gör' },
    })
  } else {
    const trending = budgets.items.find((b) => b.status === 'warning')
    if (trending) {
      out.push({
        id: 'budget-warning',
        severity: 'warning',
        title: `${trending.label} bütçesine yaklaşılıyor`,
        body: trending.projected
          ? `Mevcut hızla ay sonu ${money(trending.projected)}, limit ${money(trending.limit)}.`
          : `${money(trending.spent)} harcandı, limit ${money(trending.limit)}.`,
        weight: 70,
        action: { view: 'spending', label: 'Bütçeleri gör' },
      })
    }
  }

  // ── Committed outflow ───────────────────────────────────────────────────────
  const nextMonth = commitments[0]
  if (nextMonth && nextMonth.total > 0) {
    const reference = profile.monthlyIncome > 0 ? profile.monthlyIncome : analysis.trend.averageDailySpend * 30
    const share = reference > 0 ? nextMonth.total / reference : 0
    out.push({
      id: 'commitment-load',
      severity: share > 0.4 ? 'critical' : share > 0.25 ? 'warning' : 'info',
      title: `${monthLabel(nextMonth.month)} için ${money(nextMonth.total)} bağlı`,
      body: `${money(nextMonth.installments)} taksit + ${money(nextMonth.recurring)} düzenli ödeme. ${
        reference > 0 ? `Referans gelirin ${percent(share * 100)}'i.` : ''
      }`,
      weight: 90 + share * 20,
      action: { view: 'commitments', label: 'Yükümlülükleri gör' },
    })
  }

  // ── Recurring cost ──────────────────────────────────────────────────────────
  const activeRecurring = recurring.filter((r) => r.status === 'active')
  if (activeRecurring.length) {
    const monthly = activeRecurring.reduce((s, r) => s + r.monthlyEquivalent, 0)
    const annual = activeRecurring.reduce((s, r) => s + r.annualCost, 0)
    out.push({
      id: 'recurring-total',
      severity: 'info',
      title: `${activeRecurring.length} düzenli ödeme · ${money(monthly)}/ay`,
      body: `Yıllık karşılığı ${money(annual)}. En büyüğü ${activeRecurring[0].label} (${money(activeRecurring[0].monthlyEquivalent)}/ay).`,
      weight: 70,
      action: { view: 'recurring', label: 'Düzenli ödemeler' },
    })
  }

  const priceRises = activeRecurring.filter((r) => (r.priceChangePct ?? 0) >= 10)
  if (priceRises.length) {
    const worst = priceRises.reduce((a, b) => ((b.priceChangePct ?? 0) > (a.priceChangePct ?? 0) ? b : a))
    out.push({
      id: 'recurring-price-rise',
      severity: 'warning',
      title: `${priceRises.length} abonelikte fiyat artışı`,
      body: `${worst.label} ilk ödemeye göre ${signedPercent(worst.priceChangePct ?? 0)} arttı · şimdi ${money(worst.lastAmount)}.`,
      weight: 78,
      action: { view: 'recurring', label: 'Düzenli ödemeler' },
    })
  }

  const lapsed = recurring.filter((r) => r.status === 'lapsed')
  if (lapsed.length) {
    out.push({
      id: 'recurring-lapsed',
      severity: 'info',
      title: `${lapsed.length} düzenli ödeme durmuş görünüyor`,
      body: `${lapsed[0].label} en son ${fullDayLabel(lapsed[0].lastSeen)} tarihinde tahsil edildi. İptal edildiyse ${money(lapsed.reduce((s, r) => s + r.annualCost, 0))} yıllık tasarruf.`,
      weight: 45,
      action: { view: 'recurring', label: 'Düzenli ödemeler' },
    })
  }

  // ── Category movers ─────────────────────────────────────────────────────────
  const riser = trend.movers.find((m) => (m.deltaPct ?? 0) > 25 && m.delta > 50_000)
  if (riser) {
    out.push({
      id: `mover-${riser.id}`,
      severity: 'warning',
      title: `${riser.label} harcaması ${signedPercent(riser.deltaPct ?? 0)}`,
      body: `Önceki ay ${money(riser.previous)} · bu ay ${money(riser.current)}. Fark ${money(riser.delta)}.`,
      weight: 75,
      action: { view: 'spending', label: 'Kategorileri gör' },
    })
  }

  const faller = [...trend.movers].reverse().find((m) => (m.deltaPct ?? 0) < -20 && m.previous > 50_000)
  if (faller) {
    out.push({
      id: `mover-down-${faller.id}`,
      severity: 'positive',
      title: `${faller.label} harcaması ${signedPercent(faller.deltaPct ?? 0)}`,
      body: `${money(-faller.delta)} daha az harcandı.`,
      weight: 35,
    })
  }

  // ── Concentration ───────────────────────────────────────────────────────────
  const top = analysis.merchants[0]
  if (top && top.share > 0.2) {
    out.push({
      id: 'merchant-concentration',
      severity: 'info',
      title: `Harcamanın ${percent(top.share * 100)}'i tek işyerinde`,
      body: `${top.label} · ${money(top.total)} · ${top.count} işlem.`,
      weight: 55,
      action: { view: 'spending', label: 'İşyerlerini gör' },
    })
  }

  // ── Anomalies ───────────────────────────────────────────────────────────────
  if (anomalies.length) {
    const worst = anomalies[0]
    out.push({
      id: 'anomaly',
      severity: 'warning',
      title: `${anomalies.length} sıra dışı işlem`,
      body: `En büyüğü ${money(worst.transaction.amount)} · ${worst.transaction.description} · ${fullDayLabel(worst.transaction.date)}. ${worst.note}`,
      weight: 80,
      action: { view: 'insights', label: 'Tümünü incele' },
    })
  }

  // ── Possible double charges ─────────────────────────────────────────────────
  if (duplicates.length) {
    const total = duplicates.reduce((s, g) => s + g.amount * (g.transactions.length - 1), 0)
    out.push({
      id: 'duplicates',
      severity: 'critical',
      title: `${duplicates.length} olası mükerrer çekim`,
      body: `Aynı işyeri, aynı tutar, birkaç gün arayla. Toplam fazla tahsilat riski ${money(total)}.`,
      weight: 95,
      action: { view: 'insights', label: 'Tümünü incele' },
    })
  }

  // ── Small leaks ─────────────────────────────────────────────────────────────
  const leak = habits[0]
  if (leak && leak.annualProjection > 500_000) {
    out.push({
      id: 'habit-leak',
      severity: 'info',
      title: `${leak.label} alışkanlığı yılda ${money(leak.annualProjection)}`,
      body: `Ayda ${leak.perMonth} işlem, tipik tutar ${money(leak.medianAmount)}. Tek tek küçük, toplamı büyük.`,
      weight: 60,
      action: { view: 'spending', label: 'Alışkanlıkları gör' },
    })
  }

  // ── Data quality ────────────────────────────────────────────────────────────
  if (meta.classifiedShare < 0.85) {
    const other = categories.find((c) => c.id === 'other')
    out.push({
      id: 'unclassified',
      severity: 'info',
      title: `Harcamanın ${percent((1 - meta.classifiedShare) * 100)}'i sınıflandırılmadı`,
      body: `${money(other?.total ?? 0)} "Diğer" içinde. İşlemler görünümünden kategori atadığınızda kural olarak kaydedilir ve sonraki ekstrelerde otomatik uygulanır.`,
      weight: 50,
      action: { view: 'transactions', label: 'İşlemleri düzenle' },
    })
  }

  // ── Savings goal ────────────────────────────────────────────────────────────
  const { goal } = analysis
  if (goal) {
    const { status, delta, remainingAmount, monthsRemaining, requiredMonthlyPaceFromNow, maxMonthlySpend } = goal

    if (status === 'reached') {
      out.push({
        id: 'goal-reached',
        severity: 'positive',
        title: `${money(goal.goal.targetAmount)} hedefine ulaşıldı`,
        body: `${monthLabel(goal.goal.targetMonth)} hedeflenmişti, şimdiden ${money(goal.currentActual)} birikti.`,
        weight: 40,
        action: { view: 'commitments', label: 'Hedefi gör' },
      })
    } else if (status === 'ended') {
      // Reaching the target takes priority over the deadline elsewhere in
      // computeGoalProgress, so 'ended' only occurs when the target was
      // missed — remainingAmount is always positive here.
      out.push({
        id: 'goal-ended',
        severity: 'warning',
        title: `Hedef tarihi geçti, ${money(remainingAmount)} eksik kaldı`,
        body: `${monthLabel(goal.goal.targetMonth)} için ${money(goal.goal.targetAmount)} hedeflenmişti · birikim ${money(goal.currentActual)}.`,
        weight: 65,
        action: { view: 'commitments', label: 'Hedefi gör' },
      })
    } else if (status === 'ahead' || status === 'behind') {
      const onPace = status === 'ahead'
      const paceLine =
        requiredMonthlyPaceFromNow !== null
          ? `Hedefi tutturmak için aydan aya ${money(requiredMonthlyPaceFromNow)} biriktirmeniz gerekiyor${
              maxMonthlySpend !== null ? `; bu ay en fazla ${money(maxMonthlySpend)} harcayabilirsiniz.` : '.'
            }`
          : ''
      out.push({
        id: 'goal-pace',
        severity: onPace ? 'positive' : monthsRemaining <= 2 ? 'critical' : 'warning',
        title: onPace
          ? `Tasarruf hedefinin ${money(delta)} önündesiniz`
          : `Tasarruf hedefinin ${money(-delta)} gerisindesiniz`,
        body: paceLine || `${monthLabel(goal.goal.targetMonth)} hedefine ${money(remainingAmount)} kaldı.`,
        weight: onPace ? 32 : monthsRemaining <= 2 ? 92 : 74,
        action: { view: 'commitments', label: 'Hedefi gör' },
      })
    }
  }

  // ── Cash-flow dip ────────────────────────────────────────────────────────────
  //
  // Without a balance on file the projection starts at zero, so it dips below
  // it before every payday — true of every monthly-paid household and not a
  // shortfall. In that case the only honest signal is the 30-day *net*: money
  // out genuinely exceeding money in. With a balance on file, a crossing of
  // zero is a real projected shortfall and is reported as one.
  const near = sliceForecast(analysis.forecast, 30)
  if (near.hasOpeningBalance && near.lowestBalance < 0 && near.lowestDate) {
    out.push({
      id: 'cashflow-dip',
      severity: 'critical',
      title: `${fullDayLabel(near.lowestDate)} civarında paranız bitebilir`,
      body: `Bugünkü ${money(near.openingBalance)} bakiyeden başlayarak, bilinen ödemeler ve alışılmış harcama hızıyla bakiye ${money(near.lowestBalance)} seviyesine iniyor.`,
      weight: 96,
      action: { view: 'commitments', label: 'Nakit akışını gör' },
    })
  } else if (!near.hasOpeningBalance && near.totalIn > 0 && near.totalIn < near.totalOut) {
    out.push({
      id: 'cashflow-dip',
      severity: 'warning',
      title: `Önümüzdeki 30 günde gelirden ${money(near.totalOut - near.totalIn)} fazla çıkış görünüyor`,
      body: `Beklenen gelir ${money(near.totalIn)}, beklenen gider ${money(near.totalOut)}. Bu fark birikimden karşılanır.`,
      weight: 82,
      action: { view: 'commitments', label: 'Nakit akışını gör' },
    })
  }

  // ── Cash result ─────────────────────────────────────────────────────────────
  if (totals.refunds > 0) {
    out.push({
      id: 'refunds',
      severity: 'positive',
      title: `${money(totals.refunds)} iade alındı`,
      body: `Brüt harcama ${money(totals.spend)}, iadeler düşülünce net ${money(totals.netSpend)} (${percent(round((totals.refunds / totals.spend) * 100, 1))}).`,
      weight: 25,
    })
  }

  return out.sort((a, b) => b.weight - a.weight)
}

export const SEVERITY_ORDER: Record<Insight['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
  positive: 3,
}

export function severityLabel(severity: Insight['severity']): string {
  switch (severity) {
    case 'critical':
      return 'Acil'
    case 'warning':
      return 'Dikkat'
    case 'positive':
      return 'Olumlu'
    default:
      return 'Bilgi'
  }
}

/** Re-exported so views can label a category without importing the domain. */
export { categoryLabel }

const FORWARD_LOOKING_INSIGHT_IDS = new Set(['goal-reached', 'goal-ended', 'goal-pace', 'cashflow-dip'])

/**
 * A savings goal and a cash-flow forecast both span months ahead; whatever
 * they produce from a period-filtered slice of transactions (e.g. "Ağustos
 * 2026" selected) reflects only that slice, not the account's actual
 * trajectory. Swap the filtered version of each, if present, for the one
 * computed from the full history instead of dropping or duplicating it.
 */
export function withOverallForwardInsights(periodInsights: Insight[], overallInsights: Insight[]): Insight[] {
  const withoutForward = periodInsights.filter((i) => !FORWARD_LOOKING_INSIGHT_IDS.has(i.id))
  const forwardInsights = overallInsights.filter((i) => FORWARD_LOOKING_INSIGHT_IDS.has(i.id))
  const merged = [...withoutForward, ...forwardInsights]
  return merged.sort((a, b) => b.weight - a.weight)
}
