---
name: Mizan 2026 — Obsidian Equilibrium
version: "3.0"
description: "2026 flagship personal finance design system: Obsidian Studio (Dark-First) and Alabaster Vault (Light Mode)."
brand:
  monogram: "Architectural Balanced M + Precision Fulcrum Diamond"
  wordmark: "Mizan"
  tagline: "Ayın dengesi, senin elinde."
palette:
  dark:
    bg-base: "#07090C"
    bg-raised: "#0E131A"
    bg-elevated: "#151C26"
    bg-sunken: "#0A0E14"
    bg-hover: "#1A222E"
    bg-active: "#212B3A"
    bg-glass: "rgba(14, 19, 26, 0.78)"
    line: "rgba(255, 255, 255, 0.08)"
    line-strong: "rgba(255, 255, 255, 0.16)"
    line-specular: "rgba(255, 255, 255, 0.13)"
    text: "#F3F6FA"
    text-muted: "#95A2B4"
    text-faint: "#6A778A"
    text-inverse: "#06100C"
    accent: "#2BD49B"
    accent-hover: "#43E3AE"
    accent-soft: "rgba(43, 212, 155, 0.12)"
    accent-border: "rgba(43, 212, 155, 0.28)"
    accent-text: "#5CE6B6"
    gold: "#E2C27D"
    gold-soft: "rgba(226, 194, 125, 0.13)"
    positive: "#34D399"
    positive-soft: "rgba(52, 211, 153, 0.12)"
    negative: "#FB7185"
    negative-soft: "rgba(251, 113, 133, 0.13)"
    warning: "#FBBF24"
    warning-soft: "rgba(251, 191, 36, 0.12)"
    grid: "rgba(255, 255, 255, 0.06)"
  light:
    bg-base: "#F3F5F8"
    bg-raised: "#FFFFFF"
    bg-elevated: "#F8FAFC"
    bg-sunken: "#E9EDF3"
    bg-hover: "#EEF2F7"
    bg-active: "#E1E7F0"
    bg-glass: "rgba(255, 255, 255, 0.82)"
    line: "rgba(15, 23, 42, 0.08)"
    line-strong: "rgba(15, 23, 42, 0.16)"
    line-specular: "rgba(255, 255, 255, 0.9)"
    text: "#0B1117"
    text-muted: "#4B5768"
    text-faint: "#687486"
    text-inverse: "#FFFFFF"
    accent: "#0B7A5C"
    accent-hover: "#086149"
    accent-soft: "rgba(11, 122, 92, 0.09)"
    accent-border: "rgba(11, 122, 92, 0.24)"
    accent-text: "#09684E"
    gold: "#9E7628"
    gold-soft: "rgba(158, 118, 40, 0.10)"
    positive: "#0D8A5A"
    positive-soft: "rgba(13, 138, 90, 0.10)"
    negative: "#D93848"
    negative-soft: "rgba(217, 56, 72, 0.09)"
    warning: "#B86E08"
    warning-soft: "rgba(184, 110, 8, 0.10)"
    grid: "rgba(15, 23, 42, 0.07)"
typography:
  fontFamily: "'DM Sans Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  monoFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  scale:
    display: { size: "clamp(2.25rem, 4.2vw, 3.25rem)", weight: 680, tracking: "-0.04em", lineHeight: 1.05 }
    page-title: { size: "clamp(1.75rem, 2.4vw, 2.25rem)", weight: 680, tracking: "-0.036em", lineHeight: 1.12 }
    figure: { size: "clamp(1.375rem, 2vw, 1.75rem)", weight: 660, tracking: "-0.028em", lineHeight: 1.14 }
    section: { size: "1.0625rem", weight: 640, tracking: "-0.018em", lineHeight: 1.3 }
    body: { size: "0.9375rem", weight: 430, tracking: "0", lineHeight: 1.55 }
    label: { size: "0.75rem", weight: 580, tracking: "0.005em", lineHeight: 1.35 }
    micro: { size: "0.6875rem", weight: 620, tracking: "0.06em", lineHeight: 1.2 }
radii:
  xs: "8px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "26px"
  pill: "9999px"
---

# Mizan 2026 Design Constitution

## 1. Philosophy — Anti-Template High-Craft Fintech

Mizan is rebuilt around **Obsidian Equilibrium**: a precision personal-finance cockpit modeled after the tactile discipline of Apple Wallet/Card, Copilot Money, Revolut Metal, and Linear.

### Core Mandates
1. **Zero Template Aesthetics:** No generic Material cards, flat gray boxes, loud neon gradients, or mismatched accent hues across screens. Every surface shares one unified design token contract (`frontend/src/styles/tokens.css`).
2. **Dark-First Luxury + Flawless Light Mode:**
   - **Obsidian Studio (Dark):** Layered dark graphite surfaces (`#07090C` → `#0E131A` → `#151C26`) separated by crisp 1px translucent borders (`rgba(255,255,255,0.08)`), subtle top-edge specular rims, and whispered ambient emerald/indigo mesh illumination.
   - **Alabaster Vault (Light):** Cool architectural porcelain (`#F3F5F8`) with crisp white elevated bento panels (`#FFFFFF`), 1px obsidian-tinted hairlines, and soft diffused elevation shadows.
3. **Truthful Financial Clarity:** Every visual flourish serves comprehension. Net spending excludes card debt repayments; remaining income never masquerades as a bank balance; statement reconciliation errors surface immediately with actionable recovery controls.
4. **Precision Numeric Craft:**
   - Every currency figure, percentage, date index, and table column enforces `font-variant-numeric: tabular-nums lining-nums`.
   - Hero and primary KPI currency figures render fractional kuruş (`,50`) at reduced scale/opacity while preserving exact screen-reader copy.
   - Privacy mode (`data-private="on"`) veils all `.num` figures and charts with a clean optical frost blur.

---

## 2. Brand Identity — The Equilibrium Monogram

Mizan's new emblem fuses the architectural letter **M** with a **precision balance scale (terazi/mizan)**:

- **Geometry (64×64 grid):**
  - Squircle vault backdrop (`rx="18"`), obsidian graphite gradient (`#0D1219` → `#07090C`) with a subtle champagne-platinum rim.
  - Two vertical architectural pillars (`x=17`, `x=47`) representing inflows and outflows, united by a taut V-beam converging at center (`32, 35`).
  - A luminous **Jade Equilibrium Fulcrum** diamond (`#2EE6A6` → `#10B981`) suspended symmetrically beneath the vertex (`32, 46`), anchoring visual balance.
- **Usage:** Identical vector geometry across Web favicon (`public/favicon.svg`), PWA manifest icons (`192/512/maskable`), Apple Touch Icon, Android Adaptive Icon (`ic_launcher_foreground.xml` + `ic_launcher_background.xml`), Android Launch Splash (`mizan_splash_mark.xml`), iOS AppIcon/Splash, and in-app animated `<BrandMark />`.

---

## 3. Surface & Depth Hierarchy

| Layer | Role | Dark Surface | Light Surface | Border / Rim |
|---|---|---|---|---|
| **L0 Canvas** | Page backdrop + ambient mesh glow | `#07090C` | `#F3F5F8` | None |
| **L1 Bento Surface** | Primary modular cards & panels | `#0E131A` + 3% top sheen | `#FFFFFF` | `1px solid var(--line)` + subtle inset top specular |
| **L2 Elevated Well** | Interactive cards, active tiles, dropdowns | `#151C26` | `#F8FAFC` | `1px solid var(--line-strong)` |
| **L3 Frosted Glass** | Sticky toolbar, floating mobile dock, tooltips, modals | `rgba(14,19,26,0.78)` + `blur(20px)` | `rgba(255,255,255,0.82)` + `blur(20px)` | `1px solid var(--line-strong)` |
| **Hero Vault Card** | Balance Hero, Assets Hero, Card Detail Hero | Obsidian + radial jade/gold aura | Deep slate/alabaster hero accent | `1px solid var(--accent-border)` |

---

## 4. Layout & Bento-Grid Architecture

- **Desktop (≥ 1024px):** Fixed 240px frosted sidebar rail (`WorkspaceRail`), centered `max-width: 1240px` workspace canvas with `32px–40px` breathing gutters, 12-column Bento grid on Dashboard (`7/5` asymmetric visual rhythm), sticky frosted top toolbar.
- **Tablet (800px–1023px):** Compact 204px sidebar rail, fluid 2-column Bento stacking.
- **Mobile (< 800px):** Full-bleed edge-to-edge canvas respecting `env(safe-area-inset-*)`, sticky translucent header bar, floating frosted glass **Bottom Dock** with 4 daily destinations (`Ay Özeti`, `İşlemler`, `Kartlar`, `Analiz`) and an elevated central jade **Quick Add (+)** jewel button.
- **Touch Targets:** Minimum `44×44px` hit areas on every interactive element across web, Android, and iOS.

---

## 5. Signature Components & Data Visualization

1. **Interactive Exploding Donut (`InteractiveDonutChart`):** Smooth arc entry; tapping or hovering a slice scales/explodes its outer radius with an ambient ring halo, dims sibling slices, triggers subtle haptic feedback, and dynamically updates the center readout with slice name, exact TL amount, and percentage share.
2. **Touch-to-Scrub Flow & Trend Charts:** Multi-stop gradient spline areas and rounded-cap bar series. Hovering or scrubbing across points updates the live tabular header readout in real time.
3. **Smart Semantic Gauges (`RadialGauge` & `BudgetRibbon`):** Smoothly animated linear and circular progress gauges transitioning seamlessly across thresholds:
   - `< 75%` → Jade Safe (`var(--positive)`)
   - `75% – 95%` → Amber Caution (`var(--warning)`)
   - `> 95%` → Crimson Critical (`var(--negative)`)
4. **Physical Metallic Card Tiles (`PhysicalCard`):** Tactile brushed-obsidian credit cards per Turkish bank (Akbank, Garanti BBVA, İş Bankası, Yapı Kredi, Ziraat, Enpara, QNB, VakıfBank, Halkbank, TEB, DenizBank, Kuveyt Türk, Dünya Katılım) with EMV metallic chip, contactless emblem, masked `•••• 1234` tabular digits, specular sheen sweep, and statement reconciliation status.
5. **Custom Shimmer Skeletons & Empty States:** Bespoke directional sheen skeletons tailored to each screen's layout, plus purposeful empty states with clear focal iconography and primary actions.

---

## 6. Accessibility & Preservation Guarantees

- Strict WCAG AA contrast (≥ 4.5:1 body text, ≥ 3:1 UI controls and chart elements) verified in both **Obsidian Studio (Dark)** and **Alabaster Vault (Light)**.
- Native `<dialog>` `showModal()` with full keyboard focus trapping, `Escape` dismissal, visual-viewport keyboard offset tracking, and legacy WKWebView fallback.
- Every chart retains an accessible collapsible numerical data table (`<details>`) and ARIA labels.
- Zero changes to business logic, financial calculation formulas, Firebase/Firestore sync, IndexedDB migration, or bank statement parsers.
