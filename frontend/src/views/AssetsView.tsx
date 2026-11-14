import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Coins, Edit3, Plus, RefreshCw, Trash2, WifiOff } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useNow } from '../app/useNow'
import { ASSET_INSTRUMENTS, formatAssetQuantity, parseAssetQuantity, portfolioValue, quantityInput, type AssetHolding, type AssetInstrument, type AssetQuote } from '../domain/assets'
import { cachedAssetRates, isQuoteAvailable, isQuoteStale, refreshAssetRates, type RateSnapshot } from '../platform/rates'
import { uid } from '../core/hash'
import { money2 } from '../core/money'
import { Button, Field, TextInput } from '../ui/primitives'
import { Modal } from '../ui/Modal'
import { MoneyValue } from '../ui/MoneyValue'
import { useFeedback } from '../ui/Feedback'
import { trackProductEvent } from '../platform/analytics'
import { useAssetValuationCapture } from '../hooks/useAssetValuationCapture'
import './assets.css'

const stamp = (value: number) => new Date(value).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const quoteStamp = (value: AssetQuote) => value.kind === 'reference' ? new Date(value.asOf).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric' }) : stamp(value.asOf)
const provider = (value: AssetQuote) => value.source === 'truncgil' ? 'Truncgil' : value.source === 'frankfurter' ? 'Frankfurter' : 'ExchangeRate-API'

export function AssetsView() {
  const { state, dispatch } = useStore()
  const feedback = useFeedback()
  const now = useNow(60_000)
  const holdings = state.profile.assets ?? []
  const latestHoldings = useRef(holdings)
  latestHoldings.current = holdings
  const [snapshot, setSnapshot] = useState<RateSnapshot | null>(() => cachedAssetRates())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<{ holding: AssetHolding | null } | null>(null)
  const mounted = useRef(false)
  const pending = useRef(false)

  const refresh = useCallback(async (force = false) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await refreshAssetRates(force)
      if (mounted.current) setSnapshot(result)
    } catch {
      if (mounted.current) setError('Kurlar alınamadı. Kayıtların güvende; yeniden deneyebilirsin.')
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void refresh()
    return () => { mounted.current = false }
  }, [refresh])

  const quotes = useMemo(() => Object.fromEntries(Object.entries(snapshot?.quotes ?? {}).filter(([, quote]) => quote && isQuoteAvailable(quote, now))), [snapshot, now])
  useAssetValuationCapture(quotes)
  const portfolio = portfolioValue(holdings, quotes)
  const relevantQuotes = holdings.map(row => quotes[row.instrument]).filter((value): value is AssetQuote => Boolean(value))
  const stale = relevantQuotes.some(value => isQuoteStale(value, now))
  const cached = relevantQuotes.some(value => value.cached)
  const reference = relevantQuotes.some(value => value.kind === 'reference')
  const displayedQuotes = holdings.length ? relevantQuotes : Object.values(quotes)
  const oldest = displayedQuotes.reduce<AssetQuote | undefined>((oldest, value) => !oldest || value.asOf < oldest.asOf ? value : oldest, undefined)
  const distribution = ASSET_INSTRUMENTS.map(item => ({ ...item, value: portfolio.rows.filter(row => row.holding.instrument === item.id).reduce((sum, row) => sum + (row.value ?? 0), 0) })).filter(row => row.value > 0)

  const remove = (holding: AssetHolding) => {
    dispatch({ type: 'setProfile', profile: { assets: holdings.filter(row => row.id !== holding.id) } })
    void trackProductEvent('asset_deleted')
    feedback({ message: 'Varlık silindi.', undo: () => {
      if (!latestHoldings.current.some(row => row.id === holding.id)) dispatch({ type: 'setProfile', profile: { assets: [...latestHoldings.current, holding] } })
    } })
  }

  const save = (instrument: AssetInstrument, quantityMicros: number, previous: AssetHolding | undefined) => {
    const saved: AssetHolding = { id: previous?.id ?? uid('asset-'), instrument, quantityMicros, updatedAt: Date.now() }
    const assets = previous ? holdings.map(row => row.id === previous.id ? saved : row) : [...holdings, saved]
    dispatch({ type: 'setProfile', profile: { assets } })
    setEditor(null)
    void trackProductEvent('asset_saved')
    feedback({ message: previous ? 'Varlığın güncellendi.' : 'Varlık eklendi.', undo: () => {
      const current = latestHoldings.current
      dispatch({ type: 'setProfile', profile: { assets: previous ? current.map(row => row.id === saved.id ? previous : row) : current.filter(row => row.id !== saved.id) } })
    } })
  }

  return <div className="assets-page">
    <header className="dashboard-title"><div><h1>Varlıkların.</h1><p>Bütçenden ayrı, birikimlerin bir arada.</p></div><button className="primary-button" onClick={() => setEditor({ holding: null })}><Plus size={18} /> Varlık ekle</button></header>
    <section className="assets-summary" aria-labelledby="assets-total-title">
      <div className="assets-summary-value"><h2 id="assets-total-title">{portfolio.missing ? 'Portföy değerini tamamlıyoruz' : 'Varlıklarının TL karşılığı'}</h2>
        <div className="assets-total">{holdings.length && portfolio.total !== null ? <MoneyValue value={portfolio.total} /> : <span className="num">—</span>}</div>
        <p>{portfolio.missing ? <>{portfolio.missing} kaydın fiyatı bulunamadı.{portfolio.knownValue !== null && portfolio.knownValue > 0 && <> Fiyatlanabilen bölüm: <span className="num">{money2(portfolio.knownValue)}</span>.</>}</> : holdings.length ? 'Güncel kaynak fiyatlarıyla tahmini değer. Gelir veya banka bakiyesi değildir.' : 'Altın, gümüş veya dövizini ekleyerek başla.'}</p>
      </div>
      <div className="assets-summary-state"><button className="quiet-button" onClick={() => void refresh(true)} disabled={busy}><RefreshCw size={16} className={busy ? 'assets-refreshing' : ''} />{busy ? 'Kurlar alınıyor' : 'Kurları yenile'}</button>
        <p role="status">{busy ? 'Kaynaklar kontrol ediliyor.' : oldest ? `${quoteStamp(oldest)} itibarıyla` : snapshot?.fetchedAt ? 'Fiyatlar henüz bulunamadı.' : 'Fiyatlar hazırlanıyor.'}</p>
        {holdings.length > 0 && <span className={`assets-rate-badge ${stale || cached ? 'is-cached' : ''}`}>{stale ? 'Eski fiyat · tarihi kontrol et' : cached ? 'Önbellekteki son fiyatlar' : reference ? 'Günlük referans fiyatları' : 'Güncel piyasa referansı'}</span>}
      </div>
    </section>
    {(error || snapshot?.warning || stale) && <div className="assets-notice" role="status"><WifiOff size={18} /><p>{error || snapshot?.warning || 'Bazı fiyatlar güncelliğini yitirdi. Toplam, ekranda belirtilen tarihteki veriye dayanır.'}</p><button onClick={() => void refresh(true)} disabled={busy}>Yeniden dene</button></div>}
    {holdings.length > 0 ? <div className="assets-workspace">
      <section className="assets-holdings" aria-labelledby="holdings-title"><div className="assets-section-heading"><h2 id="holdings-title">Birikimlerin</h2><span>{holdings.length} kayıt</span></div><ul>{portfolio.rows.map(({ holding, value }) => {
        const instrument = ASSET_INSTRUMENTS.find(item => item.id === holding.instrument)!
        const currentQuote = quotes[holding.instrument]
        return <li key={holding.id} className="assets-holding"><button className="assets-holding-main" onClick={() => setEditor({ holding })}><span className="assets-instrument-mark" style={{ color: instrument.color }}><Coins size={21} /></span><span className="assets-holding-copy"><strong>{instrument.label}</strong><small className="num">{formatAssetQuantity(holding.quantityMicros)} {instrument.unit}</small><small>{currentQuote ? `${provider(currentQuote)} · ${quoteStamp(currentQuote)}${currentQuote.cached ? ' · önbellek' : ''}` : 'Fiyat bekleniyor'}</small></span><span className="assets-holding-value"><strong className="num">{value === null ? '—' : money2(value)}</strong><Edit3 size={14} /></span></button><button className="assets-delete" aria-label={`${instrument.label} varlığını sil`} onClick={() => remove(holding)}><Trash2 size={18} /></button></li>
      })}</ul></section>
      <section className="assets-allocation" aria-labelledby="allocation-title"><h2 id="allocation-title">{portfolio.missing ? 'Fiyatlanabilen dağılım' : 'Portföy dağılımı'}</h2>
        {distribution.length && portfolio.knownValue ? <><div className="assets-distribution" aria-hidden="true">{distribution.map(item => <span key={item.id} style={{ flex: item.value, background: item.color }} />)}</div><ul>{distribution.map(item => <li key={item.id}><span style={{ background: item.color }} /><strong>{item.label}</strong><span className="num">%{Math.round(item.value / portfolio.knownValue! * 100)}</span></li>)}</ul></> : <p>Fiyatlar geldiğinde dağılımın burada görünür.</p>}
        <p>Varlık eklemek harcama veya gelir oluşturmaz. Kayıtlarını dilediğinde düzenleyebilirsin.</p>
      </section>
    </div> : <section className="assets-empty"><div className="assets-empty-symbol"><Coins size={42} strokeWidth={1.3} /></div><h2>Birikimlerine bir yer aç.</h2><p>Gram altın, çeyrek altın, gümüş, dolar veya euro. Yalnızca elindeki miktarı yaz; TL karşılığını Mizan hesaplasın.</p><button className="primary-button" onClick={() => setEditor({ holding: null })}>İlk varlığını ekle <ArrowUpRight size={17} /></button></section>}
    <details className="assets-methodology"><summary>Fiyatlar nasıl hesaplanıyor?</summary><div><p>Truncgil fiyatlarında alış ve satış ortalaması kullanılır. Kaynak erişilemezse Frankfurter’ın tarihli referans fiyatları, döviz için ayrıca ExchangeRate-API ve cihazdaki son fiyatlar denenir. Fiyatı bulunmayan kayıtlar toplamda sıfır sayılmaz. Bir dakikadan sık kaynak isteği yapılmaz; ekranda arka plan yenilemesi yoktur.</p><p>Gram altın saf / has altın referansıdır. Çeyrek, Darphane’nin 1,754 gram ve 916,6 milyem ziynet standardıyla hesaplanan metal değeridir; kulp, işçilik, prim ve işlem makası dahil değildir. Gümüş saf gram karşılığıdır. Bunlar alım veya bozum teklifi değildir.</p><div className="assets-source-links"><a href="https://finans.truncgil.com/" target="_blank" rel="noreferrer">Truncgil Finans</a><a href="https://frankfurter.dev/" target="_blank" rel="noreferrer">Frankfurter</a><a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API</a><a href="https://www.darphane.gov.tr/cumhuriyet-altini-uretimi" target="_blank" rel="noreferrer">Darphane standardı</a></div></div></details>
    {editor && <AssetEditor holding={editor.holding} holdings={holdings} quotes={quotes} onSave={save} onClose={() => setEditor(null)} />}
  </div>
}

function AssetEditor({ holding, holdings, quotes, onSave, onClose }: { holding: AssetHolding | null; holdings: AssetHolding[]; quotes: Record<string, AssetQuote>; onSave: (instrument: AssetInstrument, quantityMicros: number, previous: AssetHolding | undefined) => void; onClose: () => void }) {
  const [instrument, setInstrument] = useState<AssetInstrument>(() => holding?.instrument ?? ASSET_INSTRUMENTS.find(item => !holdings.some(row => row.instrument === item.id))?.id ?? 'gold-gram')
  const existing = holding ?? holdings.find(row => row.instrument === instrument)
  const [quantity, setQuantity] = useState(() => existing ? quantityInput(existing.quantityMicros) : '')
  const submitted = useRef(false)
  const definition = ASSET_INSTRUMENTS.find(item => item.id === instrument)!
  const micros = parseAssetQuantity(quantity)
  const estimate = micros && quotes[instrument] ? portfolioValue([{ id: 'preview', instrument, quantityMicros: micros, updatedAt: 0 }], quotes).total : null
  return <Modal open onClose={onClose} title={existing ? 'Varlığını düzenle' : 'Varlık ekle'} description="Yalnızca sahip olduğun miktar kaydedilir." size="sm">
    <form className="asset-editor" onSubmit={event => { event.preventDefault(); if (micros === null || submitted.current) return; submitted.current = true; onSave(instrument, micros, existing) }}>
      <Field label="Varlık türü"><select className="finance-select" value={instrument} disabled={Boolean(holding)} onChange={event => { const next = event.target.value as AssetInstrument; setInstrument(next); const row = holdings.find(item => item.instrument === next); setQuantity(row ? quantityInput(row.quantityMicros) : '') }}>{ASSET_INSTRUMENTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
      <Field label={`Elindeki toplam miktar (${definition.unit})`} hint="En fazla 6 ondalık basamak. Örnek: 12,5"><TextInput inputMode="decimal" value={quantity} maxLength={24} onChange={event => setQuantity(event.target.value)} placeholder="0" aria-invalid={Boolean(quantity && micros === null)} /></Field>
      {quantity && micros === null && <p className="asset-editor-error" role="alert">Sıfırdan büyük geçerli bir miktar yaz. Örnek: 12,5</p>}
      {existing && !holding && <p className="asset-editor-note">Bu varlık zaten kayıtlı. Toplam miktarını güncelleyeceksin.</p>}
      <div className="asset-editor-estimate"><span>Tahmini TL karşılığı</span><strong className="num">{estimate === null ? 'Fiyat bekleniyor' : money2(estimate)}</strong><small>{definition.note}</small></div>
      <Button type="submit" variant="primary" disabled={micros === null}>{existing ? 'Miktarı güncelle' : 'Varlığı kaydet'}</Button>
    </form>
  </Modal>
}
