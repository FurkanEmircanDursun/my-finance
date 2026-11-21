import { CalendarClock, LayoutDashboard, BarChart3, Gem } from 'lucide-react'
import type { ComponentType } from 'react'

export type ViewId = 'overview' | 'analysis' | 'spending' | 'future' | 'assets' | 'cards' | 'card-detail' | 'settings'
export interface AppRoute { view: ViewId; cardId?: string }
export interface NavItem {
  id: ViewId
  label: string
  icon: ComponentType<{ size?: number | string; className?: string }>
}

/** Four everyday destinations; cards and settings have their own full pages. */
export const NAV: NavItem[] = [
  { id: 'overview', label: 'Özet', icon: LayoutDashboard },
  { id: 'analysis', label: 'Analiz', icon: BarChart3 },
  { id: 'assets', label: 'Varlıklarım', icon: Gem },
  { id: 'future', label: 'Gelecek', icon: CalendarClock },
]
const VIEWS = new Set<ViewId>([...NAV.map(item => item.id), 'spending', 'cards', 'card-detail', 'settings'])
const LEGACY: Record<string, ViewId> = {
  insights: 'overview', ledger: 'overview', import: 'overview',
  recurring: 'spending', transactions: 'spending', commitments: 'future',
}
export function isViewId(value: string): value is ViewId { return VIEWS.has(value as ViewId) }
export function parseRoute(hash: string): AppRoute {
  const [name, encodedId] = hash.replace(/^#?\/?/, '').split('/')
  if (name === 'cards' && encodedId) {
    try { return { view: 'card-detail', cardId: decodeURIComponent(encodedId) } }
    catch { return { view: 'cards' } }
  }
  return { view: isViewId(name) && name !== 'card-detail' ? name : LEGACY[name] ?? 'overview' }
}
export function resolveView(value: string): ViewId { return parseRoute(value).view }
export function routeHash(view: ViewId, cardId?: string): string {
  return view === 'card-detail' && cardId ? `#/cards/${encodeURIComponent(cardId)}` : `#/${view === 'card-detail' ? 'cards' : view}`
}
export function navigateTo(view: ViewId, cardId?: string): void {
  const hash = routeHash(view, cardId)
  if (window.location.hash === hash) return
  window.history.pushState({ mizanPreviousHash: window.location.hash || '#/overview' }, '', hash)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
export function goBack(fallback: ViewId = 'overview'): void {
  if (window.history.state?.mizanPreviousHash) window.history.back()
  else {
    window.history.replaceState(null, '', routeHash(fallback))
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
}
