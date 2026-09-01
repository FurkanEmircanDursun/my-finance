import type {
  Transaction,
  AnalysisResult,
  CategoryTotal,
  DailyPoint,
  Merchant,
  InstallmentMonth,
  Subscription,
  WeekdayPoint,
  HealthScore,
  Summary,
} from '../types/finance'

const COLOR_MAP: Record<string, string> = {
  'Market':           '#22c55e',
  'Yeme & İçme':      '#f97316',
  'Abonelik':         '#8b5cf6',
  'E-Ticaret':        '#3b82f6',
  'Fatura & Telekom': '#06b6d4',
  'Ulaşım & Araç':    '#eab308',
  'Sağlık':           '#ec4899',
  'Eğitim & Kitap':   '#14b8a6',
  'Finans & Cüzdan':  '#f59e0b',
  'Diğer':            '#6b7280',
}

function parseDate(dateStr: string): Date {
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const [day, month, year] = parts
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  }
  // Fallback to avoid complete crash
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? new Date() : d
}

function computeCategoryTotals(spending: Transaction[], totalSpending: number): CategoryTotal[] {
  const totals: Record<string, number> = {}
  for (const t of spending) {
    totals[t.category] = (totals[t.category] || 0) + t.amount
  }

  const result: CategoryTotal[] = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([name, total]) => ({
      name,
      total,
      percentage: totalSpending > 0 ? parseFloat(((total / totalSpending) * 100).toFixed(1)) : 0,
      color: COLOR_MAP[name] || COLOR_MAP['Diğer'],
    }))

  return result
}

function computeDailyTrend(spending: Transaction[]): DailyPoint[] {
  if (!spending.length) return []

  const sorted = [...spending].sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime())
  
  const daily: Record<string, number> = {}
  for (const t of sorted) {
    const d = parseDate(t.date)
    const key = d.toISOString().split('T')[0]
    daily[key] = (daily[key] || 0) + t.amount
  }

  const dates = Object.keys(daily).sort()
  const start = new Date(dates[0])
  const end = new Date(dates[dates.length - 1])
  
  const filledDaily: DailyPoint[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0]
    const amount = daily[key] || 0
    filledDaily.push({
      date: key,
      label: d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }),
      amount,
      moving_avg: 0, // Calculated next
    })
  }

  // Calculate 7-day moving average
  for (let i = 0; i < filledDaily.length; i++) {
    let sum = 0
    let count = 0
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      sum += filledDaily[j].amount
      count++
    }
    filledDaily[i].moving_avg = parseFloat((sum / count).toFixed(2))
  }

  return filledDaily
}

function computeTopMerchants(spending: Transaction[]): Merchant[] {
  const merchants: Record<string, { total: number; count: number; category: string }> = {}
  
  for (const t of spending) {
    if (!merchants[t.description]) {
      merchants[t.description] = { total: 0, count: 0, category: t.category }
    }
    merchants[t.description].total += t.amount
    merchants[t.description].count += 1
  }

  return Object.entries(merchants)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([name, data]) => ({
      name,
      total: parseFloat(data.total.toFixed(2)),
      count: data.count,
      category: data.category,
    }))
}

function computeInstallmentProjection(transactions: Transaction[]): InstallmentMonth[] {
  const projection: Record<string, Record<string, number>> = {}
  
  // Find transactions with installments like "2/5"
  const instTxs = transactions.filter(t => t.installment && t.amount > 0)
  
  for (const t of instTxs) {
    const [currentStr, totalStr] = t.installment!.split('/')
    const current = parseInt(currentStr)
    const totalInst = parseInt(totalStr)
    const remaining = totalInst - current + 1
    
    if (remaining <= 0) continue

    const d = parseDate(t.date)
    // Add current month + next months
    for (let i = 0; i < remaining; i++) {
      const targetDate = new Date(d.getFullYear(), d.getMonth() + i, 1)
      const key = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`
      
      if (!projection[key]) projection[key] = {}
      projection[key][t.category] = (projection[key][t.category] || 0) + t.amount
    }
  }

  // Sort and format for the next 6 months
  const sortedKeys = Object.keys(projection).sort().slice(0, 6)
  const result: InstallmentMonth[] = []
  
  for (const key of sortedKeys) {
    const [year, month] = key.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, 1)
    const breakdown = projection[key]
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
    
    result.push({
      month: key,
      label: date.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' }),
      total: parseFloat(total.toFixed(2)),
      breakdown,
    })
  }
  
  return result
}

function detectSubscriptions(spending: Transaction[]): Subscription[] {
  // Simplistic local subscription detection based on same merchant, similar amount (+-5%)
  const merchants: Record<string, Transaction[]> = {}
  for (const t of spending) {
    if (!merchants[t.description]) merchants[t.description] = []
    merchants[t.description].push(t)
  }

  const subs: Subscription[] = []
  for (const [merchant, txs] of Object.entries(merchants)) {
    if (txs.length >= 2) {
      // Very basic logic: if multiple transactions with similar amounts
      const amounts = txs.map(t => t.amount)
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length
      const allSimilar = amounts.every(a => Math.abs(a - avg) / avg < 0.1) // 10% tolerance
      
      if (allSimilar || txs[0].category === 'Abonelik') {
        const sortedTxs = [...txs].sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime())
        const latestAmount = sortedTxs[0].amount
        subs.push({
          merchant,
          category: txs[0].category,
          monthly_amount: parseFloat(latestAmount.toFixed(2)),
          annual_cost: parseFloat((latestAmount * 12).toFixed(2)),
          price_increase_pct: null, // Hard to calculate accurately with limited local history without complex logic
          payment_count: txs.length,
          last_payment_date: sortedTxs[0].date
        })
      }
    }
  }
  
  // Sort by amount descending
  return subs.sort((a, b) => b.monthly_amount - a.monthly_amount)
}

function computeWeekdayHeatmap(spending: Transaction[]): WeekdayPoint[] {
  const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
  const map: Record<number, { total: number, count: number }> = {}
  
  for (let i = 0; i < 7; i++) map[i] = { total: 0, count: 0 }

  for (const t of spending) {
    const d = parseDate(t.date)
    let day = d.getDay() // 0 = Sunday, 1 = Monday
    day = day === 0 ? 6 : day - 1 // Convert to 0=Monday, 6=Sunday
    
    map[day].total += t.amount
    map[day].count += 1
  }

  const result: WeekdayPoint[] = []
  for (let i = 0; i < 7; i++) {
    const avg = map[i].count > 0 ? map[i].total / map[i].count : 0
    result.push({
      day: WEEKDAYS[i],
      dayIndex: i,
      total: parseFloat(map[i].total.toFixed(2)),
      count: map[i].count,
      avg: parseFloat(avg.toFixed(2))
    })
  }
  return result
}

function computeHealthScore(spending: Transaction[], totalSpending: number): HealthScore {
  let score = 100
  const breakdown: { rule: string, points: number }[] = []

  const cats = computeCategoryTotals(spending, totalSpending)
  const getPct = (name: string) => cats.find(c => c.name === name)?.percentage || 0

  const yemePct = getPct('Yeme & İçme')
  if (yemePct > 25) {
    const ded = Math.min(15, Math.floor((yemePct - 25) / 2))
    score -= ded
    breakdown.push({ rule: `Yeme & İçme oranı yüksek (%${yemePct})`, points: -ded })
  }

  const abonePct = getPct('Abonelik')
  if (abonePct > 10) {
    const ded = Math.min(10, Math.floor((abonePct - 10) / 2))
    score -= ded
    breakdown.push({ rule: `Abonelik oranı yüksek (%${abonePct})`, points: -ded })
  }

  const eTicaretPct = getPct('E-Ticaret')
  if (eTicaretPct > 20) {
    const ded = Math.min(10, Math.floor((eTicaretPct - 20) / 2))
    score -= ded
    breakdown.push({ rule: `E-Ticaret oranı yüksek (%${eTicaretPct})`, points: -ded })
  }

  const instTxs = spending.filter(t => t.installment)
  const instTotal = instTxs.reduce((a, b) => a + b.amount, 0)
  const instPct = totalSpending > 0 ? (instTotal / totalSpending) * 100 : 0
  
  if (instPct > 40) {
    const ded = Math.min(20, Math.floor((instPct - 40) / 2))
    score -= ded
    breakdown.push({ rule: `Taksit yükü yüksek (%${instPct.toFixed(1)})`, points: -ded })
  } else if (instTxs.length === 0) {
    score = Math.min(100, score + 10)
    breakdown.push({ rule: `Taksitsiz dönem`, points: 10 })
  }

  const digerPct = getPct('Diğer')
  if (digerPct > 15) {
    const ded = Math.min(5, Math.floor((digerPct - 15) / 5))
    score -= ded
    breakdown.push({ rule: `Kategorisiz harcama oranı yüksek (%${digerPct})`, points: -ded })
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score))

  let label = 'İyi'
  let color: 'green' | 'yellow' | 'red' | 'gray' = 'green'
  if (score < 40) { label = 'Riskli'; color = 'red' }
  else if (score < 70) { label = 'Dikkat Edilmeli'; color = 'yellow' }

  return { score, label, color, breakdown }
}

export function analyzeTransactions(transactions: Transaction[]): AnalysisResult {
  const spending = transactions.filter(t => t.amount > 0)
  const totalSpending = spending.reduce((s, t) => s + t.amount, 0)

  const category_totals = computeCategoryTotals(spending, totalSpending)
  const topCategory = category_totals.length > 0 ? category_totals[0] : { name: '-', total: 0, percentage: 0, color: '' }

  const summary: Summary = {
    total_spending: parseFloat(totalSpending.toFixed(2)),
    transaction_count: transactions.length,
    top_category: topCategory,
    health_score: computeHealthScore(spending, totalSpending),
  }

  return {
    summary,
    category_totals,
    daily_trend: computeDailyTrend(spending),
    top_merchants: computeTopMerchants(spending),
    installment_projection: computeInstallmentProjection(transactions),
    subscriptions: detectSubscriptions(spending),
    weekday_heatmap: computeWeekdayHeatmap(spending),
  }
}
