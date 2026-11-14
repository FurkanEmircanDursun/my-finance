/** Mizan's folded M holds the two sides of a monthly balance together. */
export function BrandMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <rect width="64" height="64" rx="18" fill="#7161d8" />
      <path d="M17 44V24c0-4 3-5 6-2l9 12 9-12c3-3 6-2 6 2v20" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m23 22 9 12 9-12" stroke="#d7d0ff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Brand({ size = 36, wordmark = true, className = '' }: { size?: number; wordmark?: boolean; className?: string }) {
  return (
    <span className={`mizan-brand ${className}`.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <BrandMark size={size} />
      {wordmark && <span className="mizan-wordmark" style={{ fontWeight: 650, letterSpacing: '-0.035em' }}>Mizan</span>}
    </span>
  )
}
