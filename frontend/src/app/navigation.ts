import { LayoutDashboard, BarChart3, CreditCard, List } from 'lucide-react'
import type { ComponentType } from 'react'

export type ViewId = 'overview' | 'transactions' | 'analysis' | 'spending' | 'future' | 'assets' | 'cards' | 'card-detail' | 'statement' | 'settings'
export interface AppRoute { view: ViewId; cardId?: string; statementId?: string }
export interface NavItem {
  id: ViewId
  label: string
  icon: ComponentType<{ size?: number | string; className?: string }>
}

/** Daily destinations, in the same order on both navigation surfaces. */
export const NAV: NavItem[] = [
  { id: 'overview', label: 'Ay Özeti', icon: LayoutDashboard },
  { id: 'transactions', label: 'İşlemler', icon: List },
  { id: 'cards', label: 'Kartlar', icon: CreditCard },
  { id: 'analysis', label: 'Analiz', icon: BarChart3 },
]
const VIEWS = new Set<ViewId>([...NAV.map(item => item.id), 'spending', 'future', 'assets', 'card-detail', 'statement', 'settings'])
const LEGACY: Record<string, ViewId> = {
  insights: 'overview', ledger: 'overview', import: 'overview',
  recurring: 'spending', commitments: 'future',
}
export function isViewId(value: string): value is ViewId { return VIEWS.has(value as ViewId) }
export function navigationSection(view: ViewId): ViewId {
  if (view === 'card-detail' || view === 'statement') return 'cards'
  if (view === 'assets' || view === 'future' || view === 'spending') return 'analysis'
  return view
}
export function parseRoute(hash: string): AppRoute {
  const [name, encodedId] = hash.replace(/^#?\/?/, '').split('/')
  if (name === 'cards' && encodedId) {
    try { return { view: 'card-detail', cardId: decodeURIComponent(encodedId) } }
    catch { return { view: 'cards' } }
  }
  if (name === 'statements' && encodedId) {
    try { return { view: 'statement', statementId: decodeURIComponent(encodedId) } }
    catch { return { view: 'cards' } }
  }
  if (name === 'card-detail' || name === 'statement' || name === 'statements') return { view: 'cards' }
  return { view: isViewId(name) ? name : LEGACY[name] ?? 'overview' }
}
export function resolveView(value: string): ViewId { return parseRoute(value).view }
export function routeHash(view: ViewId, id?: string): string {
  if (view === 'card-detail' || view === 'statement') {
    return id ? `#/${view === 'statement' ? 'statements' : 'cards'}/${encodeURIComponent(id)}` : '#/cards'
  }
  return `#/${view}`
}
export function navigateTo(view: ViewId, id?: string): void {
  const hash = routeHash(view, id)
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
