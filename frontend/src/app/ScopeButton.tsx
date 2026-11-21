import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useStore } from '../store/AppStore'
import { availablePeriodYears } from '../store/selectors'
import { monthLabel, monthOf, todayKey } from '../core/date'
import { useExplore } from './ExploreContext'
import { Button, Field } from '../ui/primitives'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

/** A period is chosen before a card; even an empty historical month is usable. */
export function ScopeButton() {
  const { state, dispatch } = useStore()
  const { stopExplore, exploring } = useExplore()
  const [open, setOpen] = useState(false)
  const current = monthOf(todayKey())
  const selected = state.filters.month
  const [year, setYear] = useState(Number(selected === 'all' ? current.slice(0, 4) : selected.slice(0, 4)))
  const currentYear = Number(current.slice(0, 4))
  const years = useMemo(() => availablePeriodYears(state.transactions, state.statements), [state.transactions, state.statements])
  const activeYear = years.includes(year) ? year : years[0]
  const choose = (month: string) => {
    stopExplore()
    dispatch({ type: 'setFilters', filters: { month, cards: [], categories: [], query: '' } })
    setOpen(false)
  }
  const title = exploring ? 'Örnek bütçe' : selected === 'all' ? 'Tüm dönemler' : monthLabel(selected)
  return <>
    <button type="button" className="period-trigger" aria-label={`Dönem seç: ${title}`} onClick={() => {
      const selectedYear = Number(selected === 'all' ? current.slice(0, 4) : selected.slice(0, 4))
      setYear(years.includes(selectedYear) ? selectedYear : years[0] ?? currentYear)
      setOpen(true)
    }}><CalendarDays size={17} /><span>{title}</span><ChevronDown size={15} /></button>
    <Modal open={open} onClose={() => setOpen(false)} title="Dönem seç" description={years.length ? 'Önce kayıtlarının bulunduğu yılı, sonra ayı seç.' : 'Ekstre veya işlem eklediğinde kayıtlı yılların burada görünür.'} footer={<div className="period-shortcuts"><Button variant="ghost" onClick={() => choose('all')}>Tüm dönemler</Button>{years.includes(currentYear) && <Button variant="primary" onClick={() => choose(current)}>Bu aya dön</Button>}</div>}>
      {years.length > 0 ? <div className="period-picker">
        <Field label="Yıl"><select className="finance-select" value={activeYear} onChange={event => setYear(Number(event.target.value))}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
        <fieldset><legend>Ay</legend><div className="period-month-grid">{MONTHS.map((label, index) => {
          const month = `${activeYear}-${String(index + 1).padStart(2, '0')}`
          return <button key={label} type="button" aria-pressed={selected === month} onClick={() => choose(month)}><span>{label}</span>{month === current && <small>Bu ay</small>}</button>
        })}</div></fieldset>
      </div> : <p className="text-body text-muted">Henüz kayıtlı bir dönem yok.</p>}
    </Modal>
  </>
}
