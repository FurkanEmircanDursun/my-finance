import { Archive, CreditCard, Eye, EyeOff, List, PieChart, Plus, Settings2, ShieldCheck, Upload, Wallet } from 'lucide-react'
import { Brand, BrandMark } from '../ui/Brand'
import { AccountPanel } from './AccountPanel'
import { ScopeButton } from './ScopeButton'
import { useSheets } from './sheets'
import { NAV, type ViewId } from './navigation'

export function WorkspaceRail({ view, onSelect }: { view: ViewId; onSelect: (view: ViewId) => void }) {
  const sheets = useSheets()
  return <aside className="desktop-sidebar">
    <a href="#/overview" className="brand" aria-label="Mizan ana sayfa"><Brand size={35} /></a>
    <p className="sidebar-caption">Hayatınla aynı dengede.</p>
    <button className="primary-button sidebar-add" onClick={sheets.openEntry}><Plus size={18} /> Kayıt ekle</button>
    <nav aria-label="Ana gezinme" className="sidebar-nav">
      {NAV.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onSelect(id)} aria-current={view === id ? 'page' : undefined}><Icon size={19} />{label}<span className="nav-active-dot" /></button>)}
      <button onClick={() => sheets.openTransactions()}><List size={19} /> Tüm işlemler</button>
    </nav>
    <div className="sidebar-secondary">
      <button onClick={() => onSelect('spending')} aria-current={view === 'spending' ? 'page' : undefined}><PieChart size={18} /> Harcamalar</button>
      <button onClick={sheets.openCards} aria-current={view === 'cards' || view === 'card-detail' ? 'page' : undefined}><CreditCard size={18} /> Kartlarım</button>
      <button onClick={sheets.openIncome}><Wallet size={18} /> Gelir ve sabit giderler</button>
      <button onClick={() => sheets.openImport()}><Upload size={18} /> Ekstre yükle</button>
      <button onClick={sheets.openArchive}><Archive size={18} /> Ekstreler ve yedekler</button>
    </div>
    <div className="sidebar-bottom">
      <div className="sidebar-local-note"><ShieldCheck size={17} /><span>Önce senin cihazın.<small>Hesap bağlamak isteğe bağlı.</small></span></div>
      <AccountPanel onOpen={sheets.openAccount} compact />
      <button onClick={sheets.openSettings} aria-current={view === 'settings' ? 'page' : undefined}><Settings2 size={18} /> Ayarlar</button>
    </div>
  </aside>
}

export function WorkspaceToolbar({ view, privateMode, onTogglePrivate }: { view: ViewId; privateMode: boolean; onTogglePrivate: () => void }) {
  const sheets = useSheets()
  return <header className="workspace-toolbar" style={{ paddingTop: 'var(--safe-top)' }}>
    <a href="#/overview" className="mobile-brand" aria-label="Mizan ana sayfa"><BrandMark size={30} /></a>
    <div className="toolbar-period">{view === 'assets' || view === 'settings' || view === 'analysis' ? <span className="toolbar-context">{view === 'assets' ? 'Varlıklarım' : view === 'analysis' ? 'Finansal analiz' : 'Tercihler'}</span> : <><ScopeButton /><span className="calendar-label">Aylık görünüm</span></>}</div>
    <div className="toolbar-actions">
      <button type="button" onClick={onTogglePrivate} aria-label={privateMode ? 'Tutarları göster' : 'Tutarları gizle'} aria-pressed={privateMode} className="toolbar-icon">{privateMode ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      <AccountPanel onOpen={sheets.openAccount} compact />
      <button type="button" onClick={sheets.openSettings} aria-label="Ayarlar" className="toolbar-icon toolbar-settings"><Settings2 size={18} /></button>
    </div>
  </header>
}
