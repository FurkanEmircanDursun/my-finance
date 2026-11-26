import { useState } from 'react'
import { Banknote, CreditCard, Landmark } from 'lucide-react'
import { identifyBank } from '../domain/banks'
import { cardOf, type TxSource } from '../domain/types'

const bankLogos = import.meta.glob<string>('../assets/banks/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

/**
 * Compact bank/card emblem rendered inside transaction rows and summary cards.
 * Uses the real Turkish bank SVG mark when recognized, or a clean payment-method badge for manual cash/EFT entries.
 */
export function BankLogoBadge({
  bank,
  accountLabel,
  source,
}: {
  bank: string
  accountLabel?: string
  source?: TxSource
}) {
  const bankId = identifyBank(bank) ?? (accountLabel ? identifyBank(accountLabel) : null)
  const src = bankId && bankId !== 'other' ? bankLogos[`../assets/banks/${bankId}.svg`] : undefined
  const [failed, setFailed] = useState(false)
  const label = cardOf({ bank, accountLabel })

  if (src && !failed) {
    return (
      <span className="tx-card-badge" title={label}>
        <span className="tx-card-badge__logo" aria-hidden="true">
          <img
            src={src}
            alt=""
            height={11}
            onError={() => setFailed(true)}
          />
        </span>
        <span className="tx-card-badge__label">{accountLabel?.trim() || bank}</span>
      </span>
    )
  }

  const isManual = source === 'manual' || bank === 'Manuel'
  const isTransfer = label.toLowerCase().includes('banka') || label.toLowerCase().includes('eft')

  return (
    <span className="tx-card-badge tx-card-badge--fallback" title={label}>
      {isManual ? (
        isTransfer ? (
          <Landmark size={11} aria-hidden="true" />
        ) : (
          <Banknote size={11} aria-hidden="true" />
        )
      ) : (
        <CreditCard size={11} aria-hidden="true" />
      )}
      <span className="tx-card-badge__label">{label}</span>
    </span>
  )
}
