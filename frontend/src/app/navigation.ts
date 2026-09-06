import { CalendarClock, LayoutDashboard, PieChart } from 'lucide-react'
import type { ComponentType } from 'react'

export type ViewId = 'overview' | 'spending' | 'future'

export interface NavItem {
  id: ViewId
  label: string
  icon: ComponentType<{ size?: number | string; className?: string }>
}

/**
 * Three tabs, one per tense.
 *
 *   Özet       what is true right now
 *   Harcamalar what already happened, and where it went
 *   Gelecek    what is already committed
 *
 * The build before this one had nine destinations, six of them in the tab
 * strip. Five of those nine were not places at all:
 *
 *   Bulgular  rendered the same insight rows the overview already showed
 *   Ekstreler was an action ("import a statement"), so it is now the `+` button
 *             and a drop target on every screen
 *   Düzenli   was one table, and belongs beside the categories it explains
 *   Gelir–Gider was data entry for a setting, so it opens as a sheet
 *   İşlemler  is a destination you arrive at from a category or a merchant,
 *             never something you set out for — so it is a drill-down sheet
 *   Ayarlar   is a sheet, as settings almost always should be
 *
 * A first screen that offers nine doors is a menu. This one is an answer.
 */
export const NAV: NavItem[] = [
  { id: 'overview', label: 'Özet', icon: LayoutDashboard },
  { id: 'spending', label: 'Harcamalar', icon: PieChart },
  { id: 'future', label: 'Gelecek', icon: CalendarClock },
]

/**
 * Old view ids still arrive from two places: a bookmarked `#/recurring` hash,
 * and the `action.view` deep links the analytics layer attaches to insights.
 * Both are mapped to wherever that content now lives rather than being dropped
 * on the floor, so no insight loses its "take me there" link.
 */
const LEGACY: Record<string, ViewId> = {
  insights: 'overview',
  ledger: 'overview',
  import: 'overview',
  settings: 'overview',
  recurring: 'spending',
  transactions: 'spending',
  commitments: 'future',
}

export function isViewId(value: string): value is ViewId {
  return NAV.some((item) => item.id === value)
}

/** Resolves any id — current, legacy or nonsense — to a tab that exists. */
export function resolveView(value: string): ViewId {
  if (isViewId(value)) return value
  return LEGACY[value] ?? 'overview'
}
