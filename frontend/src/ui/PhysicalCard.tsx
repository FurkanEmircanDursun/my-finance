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

/** Authentic signature color gradients tuned to each Turkish bank's identity. */
const BANK_FOILS: Record<CardBank, BankFoilTheme> = {
  akbank: {
    foil: 'linear-gradient(135deg, #C81E1E 0%, #991B1B 54%, #6D1414 100%)',
    glow: 'rgba(239, 68, 68, 0.36)',
  },
  garanti: {
    foil: 'linear-gradient(135deg, #059669 0%, #047857 54%, #064E3B 100%)',
    glow: 'rgba(16, 185, 129, 0.38)',
  },
  isbank: {
    foil: 'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 54%, #172554 100%)',
    glow: 'rgba(59, 130, 246, 0.36)',
  },
  yapikredi: {
    foil: 'linear-gradient(135deg, #0284C7 0%, #0369A1 54%, #0C4A6E 100%)',
    glow: 'rgba(56, 189, 248, 0.36)',
  },
  ziraat: {
    foil: 'linear-gradient(135deg, #BE123C 0%, #9F1239 54%, #6B0F28 100%)',
    glow: 'rgba(225, 29, 72, 0.36)',
  },
  vakifbank: {
    foil: 'linear-gradient(135deg, #CA8A04 0%, #A16207 54%, #713F12 100%)',
    glow: 'rgba(234, 179, 8, 0.38)',
  },
  qnb: {
    foil: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 54%, #251F6E 100%)',
    glow: 'rgba(129, 140, 248, 0.38)',
  },
  enpara: {
    foil: 'linear-gradient(135deg, #9333EA 0%, #7E22CE 54%, #581C87 100%)',
    glow: 'rgba(192, 132, 252, 0.38)',
  },
  teb: {
    foil: 'linear-gradient(135deg, #0D9488 0%, #0F766E 54%, #115E59 100%)',
    glow: 'rgba(20, 184, 166, 0.36)',
  },
  denizbank: {
    foil: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 54%, #075985 100%)',
    glow: 'rgba(56, 189, 248, 0.36)',
  },
  dunyakatilim: {
    foil: 'linear-gradient(135deg, #0891B2 0%, #0E7490 54%, #155E75 100%)',
    glow: 'rgba(34, 211, 238, 0.36)',
  },
  halkbank: {
    foil: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 54%, #1E3A8A 100%)',
    glow: 'rgba(96, 165, 250, 0.36)',
  },
  kuveytturk: {
    foil: 'linear-gradient(135deg, #059669 0%, #047857 54%, #065F46 100%)',
    glow: 'rgba(52, 211, 153, 0.36)',
  },
  other: {
    foil: 'linear-gradient(135deg, #475569 0%, #334155 54%, #1E293B 100%)',
    glow: 'rgba(148, 163, 184, 0.30)',
  },
}

export const CARD_COLOR_PRESETS: Array<{
  id: string
  label: string
  swatch: string
  foil: string
  glow: string
}> = [
  {
    id: 'crimson',
    label: 'Kızıl',
    swatch: '#C81E1E',
    foil: 'linear-gradient(135deg, #C81E1E 0%, #991B1B 54%, #6D1414 100%)',
    glow: 'rgba(239, 68, 68, 0.36)',
  },
  {
    id: 'emerald',
    label: 'Zümrüt',
    swatch: '#059669',
    foil: 'linear-gradient(135deg, #059669 0%, #047857 54%, #064E3B 100%)',
    glow: 'rgba(16, 185, 129, 0.38)',
  },
  {
    id: 'sapphire',
    label: 'Safir',
    swatch: '#1D4ED8',
    foil: 'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 54%, #172554 100%)',
    glow: 'rgba(59, 130, 246, 0.36)',
  },
  {
    id: 'ocean',
    label: 'Okyanus',
    swatch: '#0284C7',
    foil: 'linear-gradient(135deg, #0284C7 0%, #0369A1 54%, #0C4A6E 100%)',
    glow: 'rgba(56, 189, 248, 0.36)',
  },
  {
    id: 'turquoise',
    label: 'Turkuaz',
    swatch: '#0D9488',
    foil: 'linear-gradient(135deg, #0D9488 0%, #0F766E 54%, #115E59 100%)',
    glow: 'rgba(20, 184, 166, 0.36)',
  },
  {
    id: 'violet',
    label: 'Mor',
    swatch: '#7E22CE',
    foil: 'linear-gradient(135deg, #9333EA 0%, #7E22CE 54%, #581C87 100%)',
    glow: 'rgba(192, 132, 252, 0.38)',
  },
  {
    id: 'gold',
    label: 'Altın',
    swatch: '#CA8A04',
    foil: 'linear-gradient(135deg, #CA8A04 0%, #A16207 54%, #713F12 100%)',
    glow: 'rgba(234, 179, 8, 0.38)',
  },
  {
    id: 'slate',
    label: 'Grafit',
    swatch: '#475569',
    foil: 'linear-gradient(135deg, #475569 0%, #334155 54%, #1E293B 100%)',
    glow: 'rgba(148, 163, 184, 0.30)',
  },
]

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
  color,
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
  color?: string
  amount?: number | null
  amountLabel?: string
  badge?: ReactNode
  animatedAmount?: boolean
  interactive?: boolean
  compact?: boolean
  className?: string
}) {
  const bankId = identifyBank(bank) ?? 'other'
  const customPreset = color ? CARD_COLOR_PRESETS.find((c) => c.id === color) : undefined
  const foil = customPreset ?? BANK_FOILS[bankId]
  const src = bankLogos[`../assets/banks/${bankId}.svg`]
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showLogo = Boolean(src && failedSrc !== src)
  const cleanName =
    last4 && name.endsWith(`· ${last4}`)
      ? name.slice(0, -(`· ${last4}`.length)).trim()
      : name

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
        <Wifi size={16} style={{ transform: 'rotate(90deg)', opacity: 0.55 }} aria-hidden="true" />
        <span className="physical-card__digits num">
          {last4 ? `•••• ${last4}` : '•••• ••••'}
        </span>
      </div>

      <div className="physical-card__bottom">
        <div className="physical-card__name">
          <span>{bankLabel}</span>
          <strong>{cleanName}</strong>
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
