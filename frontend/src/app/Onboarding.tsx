import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Lock, PieChart, TrendingUp, Upload } from 'lucide-react'
import { clsx } from 'clsx'
import { hapticTap } from '../platform/haptics'
import { setBackInterceptor } from '../platform/native'

/**
 * The intro, shown once before the first statement is imported.
 *
 * Every screen here is a claim the app then has to keep, so each one is
 * illustrated with the app's own furniture — the same tokens, the same bars,
 * the same rows the real screens use — rather than with stock artwork. Someone
 * who swipes through this has already seen what the product looks like by the
 * time they reach the file picker.
 *
 * Skippable from the first frame. An intro that cannot be dismissed is a toll
 * gate, and the person on the other side of it came here to read a statement.
 */

interface Slide {
  key: string
  icon: ReactNode
  title: string
  body: string
  visual: ReactNode
}

const SLIDES: Slide[] = [
  {
    key: 'import',
    icon: <Upload size={18} />,
    title: 'Ekstreni at, gerisini bırak',
    body: 'Akbank ve Garanti ekstrelerini olduğu gibi tanır. Tek tek işlem girmek yok — PDF yeter.',
    visual: <ImportVisual />,
  },
  {
    key: 'spending',
    icon: <PieChart size={18} />,
    title: 'Paran nereye gidiyor',
    body: 'Her harcama kendiliğinden kategorilenir. Abonelikler, tekrar eden ödemeler ve sıra dışı işlemler kendiliğinden yakalanır.',
    visual: <SpendingVisual />,
  },
  {
    key: 'future',
    icon: <TrendingUp size={18} />,
    title: 'Ay sonunu önceden gör',
    body: 'Taksitler, düzenli ödemeler ve alışılmış harcama hızın birleşir; hedefine yaklaşıyor musun, uzaklaşıyor musun söyler.',
    visual: <FutureVisual />,
  },
  {
    key: 'privacy',
    icon: <Lock size={18} />,
    title: 'Veri cihazından çıkmaz',
    body: 'Ekstreler tarayıcında okunur, analiz cihazında çalışır. İstersen kendi hesabınla buluta yedeklersin — istemezsen hiçbir şey gönderilmez.',
    visual: <PrivacyVisual />,
  },
]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const slide = SLIDES[index]
  const last = index === SLIDES.length - 1

  const go = (next: number) => {
    hapticTap()
    setIndex(next)
  }

  // Android's back button steps back through the slides rather than dropping
  // out of the app mid-intro. On the first slide it is not claimed, so back
  // does what back does everywhere else and leaves.
  useEffect(() => {
    setBackInterceptor(() => {
      if (index === 0) return false
      setIndex((i) => i - 1)
      return true
    })
    return () => setBackInterceptor(null)
  }, [index])

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-bg"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <span className="text-body font-semibold text-ink">My Finance</span>
        {!last && (
          <button
            type="button"
            onClick={onDone}
            className="h-11 px-2 text-body text-muted transition-colors duration-200 hover:text-ink"
          >
            Atla
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center overflow-hidden px-6">
        <div key={slide.key} className="mx-auto w-full max-w-sm slide-from-right">
          <div className="mb-8">{slide.visual}</div>

          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent-text">
            {slide.icon}
          </span>
          <h1 className="mt-4 text-display font-semibold tracking-tight text-ink">{slide.title}</h1>
          <p className="mt-3 text-body leading-relaxed text-muted">{slide.body}</p>
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="mx-auto flex w-full max-w-sm items-center gap-4">
          <div className="flex flex-1 gap-1.5">
            {SLIDES.map((item, i) => (
              <button
                key={item.key}
                type="button"
                aria-label={`${i + 1}. adım`}
                onClick={() => go(i)}
                className={clsx(
                  'h-1.5 rounded-full transition-all duration-200',
                  i === index ? 'w-6 bg-accent' : 'w-1.5 bg-line-strong',
                )}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => (last ? onDone() : go(index + 1))}
            className="inline-flex h-12 items-center gap-2 rounded-[var(--radius)] bg-accent px-5 text-body font-semibold text-white transition-colors duration-200 hover:bg-accent-hover"
          >
            {last ? 'Başla' : 'Devam'}
            {last ? <Check size={16} /> : <ArrowRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Visuals ─────────────────────────────────────────────────────────────── */
/*
 * Built from the same primitives the real screens use, at rest — no animation
 * loops. A moving illustration on a first run competes with the text next to
 * it, and this text is the only place the app gets to explain itself.
 */

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-bg-raised p-4 shadow-[var(--shadow-overlay)]">
      {children}
    </div>
  )
}

function ImportVisual() {
  return (
    <Frame>
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-line-strong py-8">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-muted">
          <Upload size={18} />
        </span>
        <span className="text-body font-semibold text-ink">ekstre-agustos.pdf</span>
        <span className="text-label text-faint">126 işlem okundu</span>
      </div>
    </Frame>
  )
}

const DEMO_CATEGORIES = [
  { label: 'Market', share: 0.92, color: 'var(--positive)' },
  { label: 'Yeme & İçme', share: 0.61, color: 'var(--accent)' },
  { label: 'Abonelik', share: 0.34, color: 'var(--warning)' },
]

function SpendingVisual() {
  return (
    <Frame>
      <div className="space-y-3">
        {DEMO_CATEGORIES.map((row) => (
          <div key={row.label}>
            <div className="flex items-baseline justify-between">
              <span className="text-label text-muted">{row.label}</span>
              <span className="num text-label text-faint">%{Math.round(row.share * 34)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full"
                style={{ width: `${row.share * 100}%`, background: row.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  )
}

function FutureVisual() {
  // A rising "required" line and an actual line that falls short of it — the
  // shape the savings-goal chart draws when someone is behind pace.
  return (
    <Frame>
      <svg viewBox="0 0 240 96" className="h-24 w-full" role="img" aria-label="Hedef ilerleme grafiği">
        <line x1="0" y1="95" x2="240" y2="95" stroke="var(--grid)" strokeWidth="1" />
        <polyline
          points="8,84 60,66 112,48 164,30 216,12"
          fill="none"
          stroke="var(--text-faint)"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <polyline
          points="8,84 60,72 112,64 164,52 216,44"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="216" cy="44" r="4" fill="var(--accent)" />
      </svg>
      <div className="mt-2 flex items-center justify-between text-label">
        <span className="text-faint">Gereken tempo</span>
        <span className="num font-semibold text-accent">Gerçekleşen</span>
      </div>
    </Frame>
  )
}

function PrivacyVisual() {
  return (
    <Frame>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
          <Lock size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">Yerel analiz</p>
          <p className="text-label text-muted">Sunucuya gönderilen dosya yok</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {['Ekstre okuma', 'Kategorileme', 'Tahmin ve hedef'].map((row) => (
          <div key={row} className="flex items-center gap-2 rounded-[var(--radius)] bg-sunken px-3 py-2">
            <Check size={14} className="shrink-0 text-positive" />
            <span className="text-label text-muted">{row}</span>
            <span className="ml-auto text-label text-faint">cihazda</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}
