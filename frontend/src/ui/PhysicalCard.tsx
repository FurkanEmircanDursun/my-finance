import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { CreditCard as CreditCardIcon, Wifi } from 'lucide-react'
import { identifyBank, type CardBank } from '../domain/banks'
import { money2 } from '../core/money'
import { MoneyValue } from './MoneyValue'

const bankLogos = import.meta.glob<string>('../assets/banks/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

interface BankFoilTheme {
  foil: string
  glow: string
}

/** Subtle brushed-obsidian metallic finishes tuned to each Turkish bank's identity. */
const BANK_FOILS: Record<CardBank, BankFoilTheme> = {
  akbank: {
    foil: 'linear-gradient(135deg, #241319 0%, #101116 52%, #1C1016 100%)',
    glow: 'rgba(239, 68, 68, 0.24)',
  },
  garanti: {
    foil: 'linear-gradient(135deg, #0E221B 0%, #0B1214 54%, #10261F 100%)',
    glow: 'rgba(43, 212, 155, 0.28)',
  },
  isbank: {
    foil: 'linear-gradient(135deg, #101B2E 0%, #0B1018 55%, #12213A 100%)',
    glow: 'rgba(59, 130, 246, 0.26)',
  },
  yapikredi: {
    foil: 'linear-gradient(135deg, #101E30 0%, #0A1018 55%, #0F233A 100%)',
    glow: 'rgba(56, 189, 248, 0.24)',
  },
  ziraat: {
    foil: 'linear-gradient(135deg, #251316 0%, #110F13 55%, #201216 100%)',
    glow: 'rgba(225, 29, 72, 0.24)',
  },
  vakifbank: {
    foil: 'linear-gradient(135deg, #231D11 0%, #121113 55%, #221B0E 100%)',
    glow: 'rgba(234, 179, 8, 0.24)',
  },
  qnb: {
    foil: 'linear-gradient(135deg, #1B152A 0%, #0E0F17 55%, #1B1630 100%)',
    glow: 'rgba(139, 92, 246, 0.26)',
  },
  enpara: {
    foil: 'linear-gradient(135deg, #20142A 0%, #100F18 55%, #231632 100%)',
    glow: 'rgba(192, 132, 252, 0.25)',
  },
  teb: {
    foil: 'linear-gradient(135deg, #0F221C 0%, #0B1215 55%, #0F261F 100%)',
    glow: 'rgba(16, 185, 129, 0.25)',
  },
  denizbank: {
    foil: 'linear-gradient(135deg, #0E1D2C 0%, #0B1118 55%, #0F2438 100%)',
    glow: 'rgba(14, 165, 233, 0.26)',
  },
  dunyakatilim: {
    foil: 'linear-gradient(135deg, #0E2125 0%, #0B1216 55%, #10262B 100%)',
    glow: 'rgba(45, 212, 191, 0.24)',
  },
  halkbank: {
    foil: 'linear-gradient(135deg, #101D2E 0%, #0B1118 55%, #102438 100%)',
    glow: 'rgba(56, 189, 248, 0.24)',
  },
  kuveytturk: {
    foil: 'linear-gradient(135deg, #0E231D 0%, #0B1214 55%, #122820 100%)',
    glow: 'rgba(52, 211, 153, 0.25)',
  },
  other: {
    foil: 'linear-gradient(135deg, #18202B 0%, #0C1016 55%, #141C26 100%)',
    glow: 'rgba(226, 194, 125, 0.20)',
  },
}

function EmvChip() {
  const gradId = `mizan-emv-${useId().replace(/:/g, '')}`
  return (
    <svg width="34" height="25" viewBox="0 0 34 25" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="34" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F0D9A3" />
          <stop offset="50%" stopColor="#CFA75C" />
          <stop offset="100%" stopColor="#9A7836" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="33" height="24" rx="5" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.35)" />
      <path d="M11 0.5V24.5M23 0.5V24.5M0.5 8.5H11M23 8.5H33.5M0.5 16.5H11M23 16.5H33.5M11 12.5H23" stroke="rgba(16,18,22,0.42)" strokeWidth="1" />
    </svg>
  )
}

export function PhysicalCard({
  bank,
  bankLabel,
  name,
  last4,
  amount,
  amountLabel,
  badge,
  animatedAmount = true,
  interactive = false,
  compact = false,
  className = '',
}: {
  bank: string
  bankLabel: string
  name: string
  last4?: string
  amount?: number | null
  amountLabel?: string
  badge?: ReactNode
  animatedAmount?: boolean
  interactive?: boolean
  compact?: boolean
  className?: string
}) {
  const bankId = identifyBank(bank) ?? 'other'
  const foil = BANK_FOILS[bankId]
  const src = bankLogos[`../assets/banks/${bankId}.svg`]
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showLogo = Boolean(src && failedSrc !== src)

  return (
    <div
      className={`physical-card ${interactive ? 'physical-card--interactive' : ''} ${className}`.trim()}
      style={{
        '--card-foil': foil.foil,
        '--card-glow': foil.glow,
        minHeight: compact ? 156 : 196,
      } as CSSProperties}
    >
      <div className="physical-card__top">
        {showLogo ? (
          <span className="physical-card__logo-badge" aria-hidden="true">
            <img src={src} alt="" width={80} height={18} onError={() => setFailedSrc(src)} />
          </span>
        ) : (
          <span className="physical-card__logo-fallback" aria-hidden="true">
            <CreditCardIcon size={15} />
            {bankLabel}
          </span>
        )}
        {badge}
      </div>

      <div className="physical-card__chip-row">
        <EmvChip />
        <Wifi size={16} style={{ transform: 'rotate(90deg)', opacity: 0.45 }} aria-hidden="true" />
        <span className="physical-card__digits num">
          {last4 ? `•••• ${last4}` : '•••• ••••'}
        </span>
      </div>

      <div className="physical-card__bottom">
        <div className="physical-card__name">
          <span>{bankLabel}</span>
          <strong>{name}</strong>
        </div>
        {amount !== undefined && (
          <div className="physical-card__amount">
            <strong>
              {amount === null ? (
                <span className="num">—</span>
              ) : animatedAmount ? (
                <MoneyValue value={amount} />
              ) : (
                <span className="num">{money2(amount)}</span>
              )}
            </strong>
            {amountLabel && <small>{amountLabel}</small>}
          </div>
        )}
      </div>
    </div>
  )
}
