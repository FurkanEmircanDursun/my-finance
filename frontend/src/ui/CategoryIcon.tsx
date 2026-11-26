import {
  Banknote,
  Clapperboard,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Percent,
  Plane,
  Receipt,
  Repeat,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Sofa,
  Tag,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { categoryColor, type CategoryId } from '../domain/categories'

const CATEGORY_ICONS: Record<CategoryId, LucideIcon> = {
  market: ShoppingCart,
  dining: UtensilsCrossed,
  subscription: Repeat,
  ecommerce: ShoppingBag,
  bills: Receipt,
  transport: Fuel,
  health: HeartPulse,
  education: GraduationCap,
  entertainment: Clapperboard,
  clothing: Shirt,
  rent: Home,
  home: Sofa,
  travel: Plane,
  tax: Landmark,
  insurance: ShieldCheck,
  fintech: Wallet,
  cash: Banknote,
  fees: Percent,
  rewards: Gift,
  other: Tag,
}

export function CategoryIcon({
  category,
  size = 16,
  className,
}: {
  category: CategoryId
  size?: number
  className?: string
}) {
  const Icon = CATEGORY_ICONS[category] ?? Tag
  return <Icon size={size} strokeWidth={2.15} className={className} aria-hidden="true" />
}

/**
 * Crafted dual-tone squircle category badge used globally across ledger rows,
 * statement lines, and category summaries.
 */
export function CategoryBadge({
  category,
  size = 'md',
  className,
}: {
  category: CategoryId
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  const color = categoryColor(category)
  const iconSize = size === 'xs' ? 13 : size === 'sm' ? 15 : 17
  const dim = size === 'xs' ? 26 : size === 'sm' ? 32 : 38
  const radius = size === 'xs' ? 8 : size === 'sm' ? 10 : 12
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: dim,
        height: dim,
        borderRadius: radius,
        flexShrink: 0,
        color,
        background: `linear-gradient(145deg, ${color}26 0%, ${color}10 100%)`,
        border: `1px solid ${color}42`,
        boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 2px 6px ${color}16`,
      }}
    >
      <CategoryIcon category={category} size={iconSize} />
    </span>
  )
}
