import { Eye, EyeOff, Plus, Settings2 } from 'lucide-react'
import { Fragment, type MouseEvent } from 'react'
import { Brand, BrandMark } from '../ui/Brand'
import { hapticTap } from '../platform/haptics'
import { AccountPanel } from './AccountPanel'
import { ScopeButton } from './ScopeButton'
import { useSheets } from './sheets'
import { NAV, navigationSection, routeHash, type NavItem, type ViewId } from './navigation'

type Navigate = (view: ViewId) => void

function follow(event: MouseEvent<HTMLAnchorElement>, view: ViewId, onSelect: Navigate) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  onSelect(view)
}

function NavLink({ item, view, onSelect }: { item: NavItem; view: ViewId; onSelect: Navigate }) {
  const { id, label, icon: Icon } = item
  return <a href={routeHash(id)} onClick={event => follow(event, id, onSelect)}
    aria-current={view === id ? 'page' : navigationSection(view) === id ? 'location' : undefined}>
    <Icon size={19} aria-hidden="true" /><span>{label}</span>
  </a>
}

export function WorkspaceRail({ view, onSelect }: { view: ViewId; onSelect: Navigate }) {
  return <aside className="workspace-rail">
    <a href={routeHash('overview')} onClick={event => follow(event, 'overview', onSelect)} className="workspace-brand" aria-label="Mizan ana sayfa"><Brand size={31} /></a>
    <nav aria-label="Ana gezinme" className="workspace-nav">
      {NAV.map(item => <NavLink key={item.id} item={item} view={view} onSelect={onSelect} />)}
    </nav>
    <nav aria-label="Uygulama tercihleri" className="workspace-nav workspace-rail-settings">
      <NavLink item={{ id: 'settings', label: 'Ayarlar', icon: Settings2 }} view={view} onSelect={onSelect} />
    </nav>
  </aside>
}

export function WorkspaceToolbar({ view, privateMode, onTogglePrivate }: { view: ViewId; privateMode: boolean; onTogglePrivate: () => void }) {
  const sheets = useSheets()
  const showPeriod = view === 'overview' || view === 'transactions' || view === 'cards' || view === 'card-detail' || view === 'spending'
  return <header className="workspace-toolbar">
    <div className="workspace-toolbar-context">
      <a href={routeHash('overview')} className="mobile-brand" aria-label="Mizan ana sayfa"><BrandMark size={28} /></a>
      {showPeriod && <ScopeButton />}
    </div>
    <div className="toolbar-actions">
      <button type="button" className="toolbar-icon" onClick={onTogglePrivate} aria-label={privateMode ? 'Tutarları göster' : 'Tutarları gizle'} aria-pressed={privateMode}>
        {privateMode ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
      <AccountPanel onOpen={sheets.openAccount} compact />
      <button type="button" onClick={sheets.openSettings} aria-label="Ayarlar" className="toolbar-icon toolbar-settings"><Settings2 size={19} /></button>
      <button type="button" className="primary-button workspace-add" onClick={() => { hapticTap(); sheets.openEntry() }}>
        <Plus size={18} aria-hidden="true" /> İşlem ekle
      </button>
    </div>
  </header>
}

export function BottomNav({ view, onSelect, onAdd }: { view: ViewId; onSelect: Navigate; onAdd: () => void }) {
  return <nav className="workspace-bottom-nav" aria-label="Mobil gezinme">
    {NAV.map((item, index) => <Fragment key={item.id}>
      {index === 2 && <button type="button" className="workspace-mobile-add" aria-label="İşlem ekle" onClick={() => { hapticTap(); onAdd() }}>
        <Plus size={23} aria-hidden="true" />
      </button>}
      <NavLink item={item} view={view} onSelect={onSelect} />
    </Fragment>)}
  </nav>
}