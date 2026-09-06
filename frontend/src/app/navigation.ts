import {
  CalendarClock, LayoutDashboard, Lightbulb, PieChart, Receipt, RefreshCcw,
  Settings, Upload, Wallet,
} from 'lucide-react'
import type { ComponentType } from 'react'

export type ViewId =
  | 'overview'
  | 'ledger'
  | 'spending'
  | 'recurring'
  | 'commitments'
  | 'transactions'
  | 'insights'
  | 'import'
  | 'settings'

export interface NavItem {
  id: ViewId
  label: string
  icon: ComponentType<{ size?: number | string; className?: string }>
  /** Reached from a link or the header, not from the tab strip. */
  secondary?: boolean
}

/**
 * Six tabs, in the order someone actually asks their questions:
 * what happened → did I end up or down → where did it go → what repeats →
 * what is already owed → show me the rows.
 *
 * An earlier build had seven, splitting cash flow from categories and giving
 * findings a tab of their own. Both splits made the first screen a menu rather
 * than an answer, so cash flow and categories are one "Harcamalar" page and the
 * findings surface on the overview. "Gelir–Gider" earns its place instead by
 * being the only screen that takes input rather than reporting: a statement
 * cannot know a salary or a rent, and without them no page can answer whether
 * a month ended up or down.
 */
export const NAV: NavItem[] = [
  { id: 'overview', label: 'Özet', icon: LayoutDashboard },
  { id: 'ledger', label: 'Gelir–Gider', icon: Wallet },
  { id: 'spending', label: 'Harcamalar', icon: PieChart },
  { id: 'recurring', label: 'Düzenli ödemeler', icon: RefreshCcw },
  { id: 'commitments', label: 'Gelecek', icon: CalendarClock },
  { id: 'transactions', label: 'İşlemler', icon: Receipt },
  { id: 'insights', label: 'Bulgular', icon: Lightbulb, secondary: true },
  { id: 'import', label: 'Ekstreler', icon: Upload, secondary: true },
  { id: 'settings', label: 'Ayarlar', icon: Settings, secondary: true },
]

export const PRIMARY_NAV = NAV.filter((item) => !item.secondary)

export function isViewId(value: string): value is ViewId {
  return NAV.some((item) => item.id === value)
}
