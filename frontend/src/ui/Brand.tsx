import { useId } from 'react'

/**
 * Mizan Equilibrium Monogram:
 * Architectural balanced M pillars converging onto a luminous jade fulcrum diamond,
 * uniting financial inflows, outflows, and precision balance on a 64×64 geometric grid.
 */
export function BrandMark({
  size = 36,
  className = '',
  animated = false,
}: {
  size?: number
  className?: string
  animated?: boolean
}) {
  const uid = useId().replace(/:/g, '')
  const bgId = `mizan-bg-${uid}`
  const rimId = `mizan-rim-${uid}`
  const glowId = `mizan-glow-${uid}`
  const jadeId = `mizan-jade-${uid}`
  const sheenId = `mizan-sheen-${uid}`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={`mizan-mark ${animated ? 'mizan-mark--animated' : ''} ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={bgId} x1="6" y1="2" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#18202B" />
          <stop offset="55%" stopColor="#0D1219" />
          <stop offset="100%" stopColor="#07090D" />
        </linearGradient>
        <linearGradient id={rimId} x1="8" y1="2" x2="56" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.26" />
          <stop offset="50%" stopColor="#E2C27D" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#2BD49B" stopOpacity="0.34" />
        </linearGradient>
        <radialGradient id={glowId} cx="32" cy="44" r="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2BD49B" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#2BD49B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={jadeId} x1="27" y1="38" x2="37" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5CF0BF" />
          <stop offset="100%" stopColor="#14B881" />
        </linearGradient>
        <linearGradient id={sheenId} x1="16" y1="18" x2="48" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#D6DFEA" />
        </linearGradient>
      </defs>

      {/* Obsidian vault squircle */}
      <rect x="1" y="1" width="62" height="62" rx="17" fill={`url(#${bgId})`} />
      {/* Subtle jade fulcrum aura */}
      <rect x="1" y="1" width="62" height="62" rx="17" fill={`url(#${glowId})`} />
      {/* Precision 1px specular border */}
      <rect x="1.5" y="1.5" width="61" height="61" rx="16.5" stroke={`url(#${rimId})`} strokeWidth="1.2" />

      {/* Whispered balance axis */}
      <line x1="12" y1="34.5" x2="52" y2="34.5" stroke="#FFFFFF" strokeOpacity="0.06" strokeWidth="1" />

      {/* Architectural M pillars & balance beam */}
      <path
        className="mizan-mark__beam"
        d="M16.5 46V21.5L32 35L47.5 21.5V46"
        stroke={`url(#${sheenId})`}
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Luminous Jade Equilibrium Fulcrum Diamond */}
      <path
        className="mizan-mark__fulcrum"
        d="M32 39.2L37.2 44.4L32 49.6L26.8 44.4Z"
        fill={`url(#${jadeId})`}
      />
    </svg>
  )
}

export function Brand({
  size = 34,
  wordmark = true,
  subtitle,
  animated = false,
  className = '',
}: {
  size?: number
  wordmark?: boolean
  subtitle?: string
  animated?: boolean
  className?: string
}) {
  return (
    <span className={`mizan-brand ${className}`.trim()}>
      <BrandMark size={size} animated={animated} />
      {wordmark && (
        <span className="mizan-brand__text">
          <span className="mizan-wordmark">Mizan</span>
          {subtitle && <span className="mizan-brand__subtitle">{subtitle}</span>}
        </span>
      )}
    </span>
  )
}
