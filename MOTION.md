# Mizan 2026 Motion Constitution (`MOTION.md`)

Motion in Mizan is **physical, purposeful, and 60fps-disciplined**. Every transition explains spatial relationships, confirms touch intent, or gives weight to live financial numbers — never delaying user input.

---

## 1. Timing & Spring Physics Tokens

All curves are defined once in `frontend/src/styles/tokens.css` and animate strictly GPU-composited properties (`transform`, `opacity`, `clip-path`, SVG `stroke-dashoffset`).

| Token | Value | Use Case |
|---|---|---|
| `--ease-spring` | `cubic-bezier(0.22, 1.22, 0.36, 1)` | Tactile micro-bounces: active nav pills, chip press recovery, exploding donut slices, save checkmark pop |
| `--ease-smooth` | `cubic-bezier(0.16, 1, 0.3, 1)` | Primary layout motion: Bento card entrances, modal/sheet slides, accordion reveals, page transitions |
| `--ease-ios` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheet drag settle, drawer dismissal, scrub readout snapping |
| `--dur-press` | `120ms` | Button/card tactile press (`scale(0.975)`) |
| `--dur-micro` | `200ms` | Hover rims, focus rings, toggle switches, tooltip fades |
| `--dur-reveal` | `360ms` | View entrance, staggered Bento reveals, period switch settle |
| `--dur-sheet` | `320ms` | Bottom sheet rise & desktop modal zoom-fade |
| `--dur-gauge` | `680ms` | Budget progress ribbons, radial rings, category share bars |
| `--dur-counter` | `540ms` | Rolling odometer number count-up / value interpolation |

---

## 2. Core Motion Choreography

### A. Cinematic Splash Entrance (`SplashScreen.tsx`)
- Runs once per cold session while the app shell renders silently beneath (never blocking data hydration or Firebase auth).
- **Timeline (920ms total):**
  1. `0ms – 380ms`: Outer obsidian emblem scales cleanly (`0.88 → 1.0`) while the Mizan architectural **M** vector strokes draw smoothly via `stroke-dashoffset`.
  2. `240ms – 560ms`: Central Jade Equilibrium fulcrum ignites with a spring scale pop (`0 → 1.08 → 1`) and subtle ambient radial glow ring.
  3. `340ms – 640ms`: `Mizan` wordmark & tagline glide upward (`10px → 0`) from slight optical blur to crisp focus.
  4. `700ms – 920ms`: Full-screen veil fades and scales out (`1 → 1.04`, opacity `1 → 0`), handing seamlessly into the live workspace.
- Under `prefers-reduced-motion: reduce`: bypassed immediately (`0ms`).

### B. Rolling / Odometer Numbers (`MoneyValue.tsx`)
- Smooth quartic ease-out interpolation of integer kuruş values over `540ms` whenever totals mount, period filters switch, or onboarding playground sliders move.
- Renders integer and decimal kuruş parts distinctly (`₺42.920` + `,50`), preventing horizontal layout jitter via strict `tabular-nums`.
- Provides subtle micro-settle animation on value changes while preserving the exact formatted string in `aria-label` for assistive technologies.

### C. Staggered Bento & List Reveals (`motion.tsx`)
- Dashboard cards, Analysis modules, Card Wallet grids, and initial list rows enter sequentially using CSS custom property `--stagger: calc(var(--i, 0) * 45ms)` (capped at `280ms` total stagger so deep lists remain snappy).
- Each card rises `12px` with opacity `0 → 1` on `--ease-smooth`.

### D. Tactile Physical Card Sheen (`PhysicalCard.tsx`)
- Credit cards respond to hover/focus with subtle elevation lift (`translateY(-2px)`), heightened metallic border rim, and a diagonal specular light glint sweeping smoothly across the brushed obsidian foil.

### E. Interactive Chart Motion
- **Donut Slices:** Smooth SVG active-shape outer radius expansion (`+7px`) with translucent outer halo arc on click/hover; center figure swaps with a `180ms` micro-fade-up.
- **Area & Bar Charts:** Clean initial draw animation (`480ms ease-out`, disabled under reduced motion), crisp vertical scrub hairline, and glowing active point ring.
- **Progress Ribbons & Radial Rings:** Spring-eased width / `stroke-dashoffset` fill on mount and data update, plus semantic color transition when crossing 75% (caution) and 95% (critical).

### F. Sheets, Modals & Floating Feedback
- **Mobile (< 640px):** Sheets rise from bottom with spring deceleration; interactive vertical pointer-drag gesture follows the thumb 1:1 with rubber-band upward resistance (`distance / 6`) and velocity-aware dismissal.
- **Desktop (≥ 640px):** Centered glassmorphic modal enters with crisp scale (`0.96 → 1`) and `10px` vertical glide.
- **Feedback Toast:** Floats above mobile bottom dock / desktop viewport bottom with spring bounce-in, animated SVG checkmark path draw, and instant Undo action.

---

## 3. Haptic Feedback Mapping (Native Android & iOS)

| Gesture / Action | Haptic Helper | Feel |
|---|---|---|
| Tab change, period pick, category chip, donut slice tap, onboarding slider step | `hapticTap()` | Crisp 8ms tick |
| Transaction saved, card saved, sheet dragged closed, onboarding completed | `hapticImpact()` | Grounded 14ms thud |
| Destructive confirmation (delete statement, wipe cloud data, wrong PIN) | `hapticWarn()` | Double-pulse `[12, 40, 12]` |

---

## 4. Accessibility & Reduced Motion Contract

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
- `MoneyValue`, `SplashScreen`, Recharts animations, and `useSheetDrag` all explicitly inspect `window.matchMedia('(prefers-reduced-motion: reduce)')` so state updates remain instant and completely comfortable for motion-sensitive users.
