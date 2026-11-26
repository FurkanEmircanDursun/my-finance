import { Eye, EyeOff, Monitor, Moon, Plus, Settings2, Sun, Upload } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Brand, BrandMark } from '../ui/Brand'
import { hapticTap } from '../platform/haptics'
import { useStore } from '../store/AppStore'
import { AccountPanel } from './AccountPanel'
import { HeaderSearch } from './HeaderSearch'
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
  return (
    <a
      href={routeHash(id)}
      onClick={(event) => follow(event, id, onSelect)}
      aria-current={
        view === id ? 'page' : navigationSection(view) === id ? 'location' : undefined
      }
    >
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </a>
  )
}

export function WorkspaceRail({
  view,
  onSelect,
}: {
  view: ViewId
  onSelect: Navigate
}) {
  const { state, dispatch } = useStore()
  const sheets = useSheets()
  const theme = state.settings.theme

  const setTheme = (next: 'system' | 'light' | 'dark') => {
    hapticTap()
    dispatch({ type: 'setSettings', settings: { theme: next } })
  }

  return (
    <aside className="workspace-rail">
      <a
        href={routeHash('overview')}
        onClick={(event) => follow(event, 'overview', onSelect)}
        className="workspace-brand"
        aria-label="Mizan ana sayfa"
      >
        <Brand size={34} subtitle="Finans Kokpiti" />
      </a>

      <div className="workspace-rail-actions">
        <button
          type="button"
          className="primary-button workspace-rail-cta"
          onClick={() => {
            hapticTap()
            sheets.openEntry()
          }}
        >
          <Plus size={17} aria-hidden="true" />
          İşlem ekle
        </button>
        <button
          type="button"
          className="quiet-button workspace-rail-subcta"
          onClick={() => {
            hapticTap()
            sheets.openImport()
          }}
        >
          <Upload size={15} aria-hidden="true" />
          Ekstre yükle
        </button>
      </div>

      <nav aria-label="Ana gezinme" className="workspace-nav">
        <span className="workspace-nav-label">Çalışma Alanı</span>
        {NAV.map((item) => (
          <NavLink key={item.id} item={item} view={view} onSelect={onSelect} />
        ))}
      </nav>

      <div className="workspace-rail-footer">
        <nav aria-label="Uygulama tercihleri" className="workspace-nav" style={{ marginTop: 0 }}>
          <NavLink
            item={{ id: 'settings', label: 'Ayarlar', icon: Settings2 }}
            view={view}
            onSelect={onSelect}
          />
        </nav>

        <div className="workspace-theme-switch" role="group" aria-label="Tema seçimi">
          <button
            type="button"
            aria-pressed={theme === 'dark'}
            aria-label="Koyu tema"
            title="Koyu tema"
            onClick={() => setTheme('dark')}
          >
            <Moon size={13} /> Koyu
          </button>
          <button
            type="button"
            aria-pressed={theme === 'light'}
            aria-label="Açık tema"
            title="Açık tema"
            onClick={() => setTheme('light')}
          >
            <Sun size={13} /> Açık
          </button>
          <button
            type="button"
            aria-pressed={theme === 'system'}
            aria-label="Sistem teması"
            title="Sistem teması"
            onClick={() => setTheme('system')}
          >
            <Monitor size={13} /> Oto
          </button>
        </div>
      </div>
    </aside>
  )
}

export function WorkspaceToolbar({
  view,
  onNavigate,
  privateMode,
  onTogglePrivate,
}: {
  view: ViewId
  onNavigate: Navigate
  privateMode: boolean
  onTogglePrivate: () => void
}) {
  const sheets = useSheets()
  const showPeriod =
    view === 'overview' ||
    view === 'transactions' ||
    view === 'cards' ||
    view === 'card-detail' ||
    view === 'spending' ||
    view === 'future'

  return (
    <header className="workspace-toolbar">
      <div className="workspace-toolbar-context">
        <a
          href={routeHash('overview')}
          onClick={(event) => follow(event, 'overview', onNavigate)}
          className="mobile-brand"
          aria-label="Mizan ana sayfa"
        >
          <BrandMark size={30} />
        </a>
        {showPeriod && <ScopeButton />}
      </div>

      <HeaderSearch
        onNavigate={onNavigate}
        privateMode={privateMode}
        onTogglePrivate={onTogglePrivate}
      />

      <div className="toolbar-actions">
        <button
          type="button"
          className="toolbar-icon"
          onClick={() => {
            hapticTap()
            onTogglePrivate()
          }}
          aria-label={privateMode ? 'Tutarları göster' : 'Tutarları gizle'}
          aria-pressed={privateMode}
          title={privateMode ? 'Tutarları göster' : 'Gizlilik modu'}
        >
          {privateMode ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>

        <AccountPanel onOpen={sheets.openAccount} compact />

        <button
          type="button"
          onClick={() => {
            hapticTap()
            sheets.openEntry()
          }}
          aria-label="İşlem ekle"
          className="toolbar-mobile-add"
        >
          <Plus size={18} strokeWidth={2.2} />
        </button>

        <button
          type="button"
          onClick={() => {
            hapticTap()
            sheets.openSettings()
          }}
          aria-label="Ayarlar"
          className="toolbar-icon toolbar-settings"
        >
          <Settings2 size={17} />
        </button>
      </div>
    </header>
  )
}

export function BottomNav({
  view,
  onSelect,
}: {
  view: ViewId
  onSelect: Navigate
  onAdd?: () => void
}) {
  return (
    <nav className="workspace-bottom-nav" aria-label="Mobil gezinme">
      {NAV.map((item) => (
        <NavLink key={item.id} item={item} view={view} onSelect={onSelect} />
      ))}
    </nav>
  )
}
