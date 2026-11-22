import { CreditCard } from 'lucide-react'
import { useState } from 'react'
import { identifyBank } from '../domain/banks'

const assets = import.meta.glob<string>('../assets/banks/*.svg', { eager: true, query: '?url', import: 'default' })

/** The visible bank name labels the card. The mark is decorative in both views. */
export function BankLogo({ bank }: { bank: string }) {
  const id = identifyBank(bank)
  const src = id && assets[`../assets/banks/${id}.svg`]
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const showLogo = src && failedSource !== src
  return <span className={`card-brand-icon${showLogo ? ' card-brand-icon--logo' : ''}`} aria-hidden="true">
    {showLogo ? <img src={src} alt="" width={84} height={28} onError={() => setFailedSource(src)} />
      : <CreditCard size={24} strokeWidth={1.5} />}
  </span>
}
