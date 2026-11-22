import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fullDayLabel } from '../core/date'
import { count, money2, moneyCompact } from '../core/money'
import type { overviewSpending } from './overviewSpending'

type Spending = ReturnType<typeof overviewSpending>

export function OverviewDaily({ days, peak, privateMode, onDay, onAnalysis, unavailable }: {
  days: Spending['days']
  peak: Spending['peak']
  privateMode: boolean
  onDay: (day: string) => void
  onAnalysis?: () => void
  unavailable: string
}) {
  const [selected, setSelected] = useState('')
  const picked = days.find(day => day.date === selected) ?? peak ?? [...days].reverse().find(day => day.count > 0)
  const hasData = Boolean(picked)
  const max = Math.max(0, ...days.map(day => day.net ?? 0))
  const min = Math.min(0, ...days.map(day => day.net ?? 0))
  const top = max || (min === 0 ? 1 : 0)
  const range = top - min
  const zero = top / range * 100
  const index = picked ? days.indexOf(picked) : -1
  const move = (step: number) => {
    const next = days[index + step]
    if (next) setSelected(next.date)
  }
  return <section className="overview-daily overview-panel" aria-labelledby="overview-daily">
    <header className="overview-panel-heading">
      <div><h2 id="overview-daily">Günlük harcamalar</h2><p>Harcama eksi iade · Taksitler yansıdığı günde</p></div>
      {onAnalysis && <button className="text-button" onClick={onAnalysis}>Analizi aç <ChevronRight size={16} aria-hidden="true" /></button>}
    </header>
    {privateMode ? <p className="overview-placeholder">Günlük tutarlar gizli.</p> : !hasData || !picked ? (
      <p className="overview-placeholder">{unavailable}</p>
    ) : <>
      <div className="overview-day-selection" aria-live="polite">
        <div><p>{fullDayLabel(picked.date)}{picked.date === peak?.date && ' · En yüksek gün'}</p>
          <strong className="num">{picked.net === null ? '—' : money2(picked.net)}</strong>
        </div>
        <div className="overview-day-arrows">
          <button type="button" disabled={index <= 0} aria-label="Önceki gün" onClick={() => move(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" disabled={index >= days.length - 1} aria-label="Sonraki gün" onClick={() => move(1)}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="overview-plot">
        <div className="overview-plot-scale num" aria-hidden="true">
          {max > 0 && <span style={{ top: 0 }}>{moneyCompact(max)}</span>}
          <span style={{ top: `${zero}%` }}>₺0</span>
          {min < 0 && <span style={{ top: '100%' }}>{moneyCompact(min)}</span>}
        </div>
        <div className="overview-plot-series" role="group" aria-label="Grafik günleri" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          <span className="overview-plot-zero" style={{ top: `${zero}%` }} aria-hidden="true" />
          {days.map((day, position) => {
            const value = day.net ?? 0
            const active = day.date === picked.date
            return <button key={day.date} type="button" aria-pressed={active}
              aria-label={`${fullDayLabel(day.date)} · ${day.net === null ? 'Tutar yok' : money2(day.net)}`}
              tabIndex={active ? 0 : -1}
              onKeyDown={event => {
                const next = event.key === 'ArrowLeft' ? position - 1 : event.key === 'ArrowRight' ? position + 1
                  : event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : null
                if (next === null || !days[next]) return
                event.preventDefault()
                setSelected(days[next].date)
                event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus()
              }} onClick={() => setSelected(day.date)}>
                <span aria-hidden="true" data-negative={value < 0 || undefined} className="overview-bar"
                  style={{ top: `${(top - Math.max(0, value)) / range * 100}%`, height: `${Math.abs(value) / range * 100}%` }} />
                {(position === 0 || (position + 1) % 5 === 0) && <small aria-hidden="true">{position + 1}</small>}
              </button>
          })}
        </div>
      </div>
      <div className="overview-day-footer">
        <span>{picked.count ? `${count(picked.count)} harcama / iade kaydı` : 'Seçili günde kayıt yok'}</span>
        {picked.count > 0 && <button className="text-button" onClick={() => onDay(picked.date)}>Günün işlemleri <ChevronRight size={15} aria-hidden="true" /></button>}
      </div>
      <details className="overview-data">
        <summary>Günlük tutar tablosu</summary>
        <table>
          <thead><tr><th scope="col">Gün</th><th scope="col">Kayıt</th><th scope="col">Net harcama</th></tr></thead>
          <tbody>{days.map(day => <tr key={day.date}><th scope="row">{fullDayLabel(day.date)}</th><td>{count(day.count)}</td><td className="num">{day.net === null ? '—' : money2(day.net)}</td></tr>)}</tbody>
        </table>
      </details>
    </>}
  </section>
}
