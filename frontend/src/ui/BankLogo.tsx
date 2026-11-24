import { CreditCard } from 'lucide-react'
import { useState } from 'react'
import { identifyBank } from '../domain/banks'

const assets = import.meta.glob<string>('../assets/banks/*.svg', { eager: true, query: '?url', import: 'default' })

/** Bank mark wrapped in a high-contrast satin badge legible across dark and light modes. */
export function BankLogo({ bank }: { bank: string }) {
  const id = identifyBank(bank)
  const src = id && assets[`../assets/banks/${id}.svg`]
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const showLogo = src && failedSource !== src
  return (
    <span className={`card-brand-icon${showLogo ? ' card-brand-icon--logo' : ''}`} aria-hidden="true">
      {showLogo ? (
        <img src={src} alt="" width={84} height={24} onError={() => setFailedSource(src)} />
      ) : (
        <CreditCard size={22} strokeWidth={1.6} />
      )}
    </span>
  )
}
