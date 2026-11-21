import { useEffect, useState } from 'react'
import { entryAmount } from '../domain/entry'
import { Field, TextInput } from './primitives'

export function settingAmount(raw: string): number | null {
  const text = raw.trim()
  return text === '' || /^0(?:,0{1,2})?$/.test(text) ? 0 : entryAmount(text)
}
export function settingAmountText(value: number): string {
  return value ? (value / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : ''
}

/** Editing is local; only a complete, valid Turkish amount enters the profile. */
export function MoneySetting({ label, hint, value, onCommit }: {
  label: string; hint?: string; value: number; onCommit: (value: number) => void
}) {
  const [text, setText] = useState(() => settingAmountText(value))
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => { if (!editing) setText(settingAmountText(value)) }, [value, editing])
  return <div><Field label={label} hint={hint}>
    <TextInput inputMode="decimal" autoComplete="off" placeholder="0,00" value={text} maxLength={18}
      aria-invalid={error}
      onFocus={() => setEditing(true)}
      onChange={event => { setText(event.target.value); setError(false) }}
      onBlur={() => {
        const amount = settingAmount(text)
        if (amount === null) { setError(true); return }
        onCommit(amount)
        setEditing(false)
        setText(settingAmountText(amount))
      }}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
  </Field>{error && <p className="text-label text-negative mt-2" role="alert">Geçerli tutar yaz. Örnek: 15.000,50</p>}</div>
}
