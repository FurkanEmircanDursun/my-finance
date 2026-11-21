---
name: Mizan
description: Ayın dengesi, senin elinde.
colors:
  bg: "#f5f5fa"
  bg-raised: "#ffffff"
  bg-sunken: "#eeeef6"
  bg-hover: "#ecebf7"
  bg-active: "#e4e4ef"
  line: "#e4e4ef"
  line-strong: "#c5c5d6"
  text: "#202335"
  text-muted: "#62657b"
  text-faint: "#6c6f83"
  text-inverse: "#ffffff"
  accent: "#7161d8"
  accent-hover: "#5d4dc3"
  accent-soft: "#eeebfc"
  accent-text: "#5b49b5"
  positive: "#1f7a4d"
  positive-soft: "#e6f4ec"
  negative: "#b23b3b"
  negative-soft: "#fbeced"
  warning: "#8f5f0d"
  warning-soft: "#fdf3e2"
  grid: "#e9e9f3"
  dark-bg: "#171925"
  dark-bg-raised: "#202333"
  dark-bg-sunken: "#1b1e2c"
  dark-bg-hover: "#2a2d40"
  dark-bg-active: "#34374b"
  dark-line: "#36394e"
  dark-line-strong: "#535770"
  dark-text: "#f3f3fb"
  dark-text-muted: "#c0c1d6"
  dark-text-faint: "#a6a8c3"
  dark-text-inverse: "#171925"
  dark-accent: "#b5a8ff"
  dark-accent-hover: "#c5bbff"
  dark-accent-soft: "#302b4e"
  dark-accent-text: "#c9beff"
  dark-positive: "#4bbd85"
  dark-positive-soft: "#12291e"
  dark-negative: "#e2716f"
  dark-negative-soft: "#2c1717"
  dark-warning: "#d9a441"
  dark-warning-soft: "#2b2010"
  dark-grid: "#2a2d40"
  rail: "#202335"
  rail-muted: "#b7b9d2"
  iris-panel: "#ece9fb"
  iris-ink: "#40337d"
  dark-iris-panel: "#302b4e"
  dark-iris-ink: "#dfd8ff"
  onboarding-iris: "#6754c8"
  onboarding-iris-soft: "#eeebfb"
  onboarding-mint: "#bce7d7"
  dark-onboarding-iris: "#ad9cf9"
  dark-onboarding-iris-soft: "#30284c"
  dark-onboarding-mint: "#497f70"
typography:
  onboarding-display:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(36px, 4.2vw, 59px)"
    fontWeight: 570
    lineHeight: 1.12
    letterSpacing: "-0.038em"
  page-title:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "31px"
    fontWeight: 550
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  amount:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(34px, 3.2vw, 49px)"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  body:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    lineHeight: 1.35
rounded:
  control: "12px"
  panel: "16px"
  compact-control: "8px"
  navigation: "9px"
  ribbon: "4px"
spacing:
  tight: "8px"
  control-gap: "10px"
  mobile-panel: "20px"
  workspace-gap: "22px"
  desktop-panel: "25px"
  desktop-gutter: "42px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.bg-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.bg-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  panel:
    backgroundColor: "{colors.bg-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "22px 25px"
  budget-ribbon:
    backgroundColor: "{colors.iris-panel}"
    textColor: "{colors.iris-ink}"
    rounded: "{rounded.panel}"
    padding: "25px 26px"
  navigation-active:
    backgroundColor: "#39354f"
    textColor: "#eee8ff"
    rounded: "{rounded.navigation}"
    height: "45px"
  sample-chip:
    backgroundColor: "{colors.onboarding-iris-soft}"
    textColor: "{colors.onboarding-iris}"
    padding: "5px 9px"
---

# Design System: Mizan

## Overview

**Creative North Star: "Ayın dengesi"**

Mizan makes a person's recorded month readable through a composed workspace: a steady ink navigation rail, cool reading surfaces, and an iris budget area. The identity is precise and approachable. The folded M joins two sides of a balance; it remains a crisp vector rather than an illustration.

This is an Operate product. Familiar navigation, explicit financial labels, short entry flows, and visible account states carry the experience. The interactive introduction lets someone change a sample income, include rent, and move a spending limit before creating a real record. Its sample state never becomes financial history.

**Key Characteristics:**

- Ink navigation and iris selection give the shell a recognizable identity.
- Locally bundled DM Sans Variable supports Turkish text and tabular money.
- Tonal panels group work; spacing and rows keep detailed analysis legible.
- Budget allocation changes in response to records and sample controls.
- Light and dark themes, amount privacy, and reduced-motion preferences remain first-class states.

The implementation sources are `frontend/src/styles/index.css` for semantic colors, `frontend/src/styles/premium.css` for shared controls and sheets, `frontend/src/styles/mizan.css` for workspace composition, and `frontend/src/app/onboarding.css` for the introduction. Frontmatter records the built values; CSS remains the runtime source.

## Colors

Iris establishes action and selection; ink anchors navigation; green, red, and amber communicate financial and operational state. Category colors belong to their data series.

### Primary

- **Iris:** primary actions, selection, graph series, and the filled budget ribbon.
- **Iris wash / Iris ink:** the monthly budget area and readable content within it.
- **Onboarding iris:** the introductory controls use their own slightly deeper iris role; its mint companion separates spending from the remaining portion of sample income.

### Neutral

- **Ink rail:** the desktop shell remains dark in both themes; its muted labels use the dedicated rail role.
- **Ice ground:** the page background separates white reading surfaces without framing every item.
- **Text, muted, and faint:** explicit hierarchy for primary content, explanations, and secondary labels.
- **Lines and strong lines:** separators and actionable boundaries; avoid using them as ornamental framing.

### State colors

Positive, negative, and warning roles have paired soft backgrounds and explicit dark-theme variants. A budget overrun switches its ribbon to the negative role. Dark theme also changes the main surfaces, text, iris budget panel, and onboarding roles; it is not a filter applied to the light palette.

**The Semantic Color Rule.** Extend the existing semantic roles and their dark counterparts; do not use a category color as the default text color of an unrelated control.

## Typography

**Display and body:** DM Sans Variable, bundled through Fontsource with Latin Extended glyphs. Fallbacks are UI/system sans faces; there is no Google Fonts runtime request.

The hierarchy uses size and weight with restrained tracking. The introduction has a broader display scale; the workspace returns to compact readable labels and numbers. Body copy starts at 15px, while most dashboard labels and explanatory rows use 12–13px. Section headings are 14–17px. The desktop page title is 31px and becomes 28px on phones. The main amount uses the frontmatter clamp; very wide screens lift it to 53px, and phones use `clamp(32px, 9vw, 43px)`.

Financial figures use tabular numerals and Turkish currency formatting. Keep the privacy-aware `num` treatment on financial values. `MoneyValue` interpolates displayed integer kuruş; its accessible label always exposes the final formatted amount rather than each frame. The stored amount and calculations never interpolate.

**The Number Rule.** A displayed remainder means recorded income minus recorded net spending; its label must never imply a verified bank balance.

## Layout

The desktop shell has a fixed 232px rail. The workspace reading area has a maximum width of 1400px and 42px horizontal gutters. Summary and work areas use an asymmetric `1.55fr / 1fr` grid with a 280px minimum secondary column and 22px gaps. At 640–1100px, the rail becomes 204px, gutters become 26px, and the work grids become one column.

Below 640px the rail yields to a safe-area-aware bottom bar, the workspace has 20px gutters, panels use 20px padding, and grid gaps become 17px. At 360px and below, horizontal gutters reduce to 14px. The toolbar stays available, and content reserves the bottom-navigation and safe-area height.

The introduction has its own content-driven breakpoint: two columns become a vertical story and interactive sample below 681px; its forms keep a visible four-step sequence. Below 901px its inter-column gap and panel padding tighten. Do not apply its display density to transaction tables or settings.

## Elevation & Depth

Depth comes mainly from the ink shell, cool ground, raised reading surfaces, and tinted budget area. Panels at rest use tone rather than decorative border-plus-shadow combinations. A wide soft shadow belongs to the introductory preview; overlays, save feedback, and the mobile action use smaller functional elevation. Toolbar/backdrop behavior follows the shared shell and sheet implementation.

- **Overlay, light:** `0 16px 40px -12px rgb(0 0 0 / 0.22), 0 2px 8px -2px rgb(0 0 0 / 0.08)`.
- **Overlay, dark:** `0 16px 40px -12px rgb(0 0 0 / 0.6), 0 2px 8px -2px rgb(0 0 0 / 0.4)`.
- **Introductory preview:** `0 22px 70px -36px rgb(37 29 81 / .3)`.
- **Bottom navigation:** `0 -6px 24px rgb(32 35 53 / .05)`.

**The Reading Surface Rule.** Use one surface boundary for a reading panel; save visible elevation for a layer or action that needs it.

## Shapes

Shared fields and buttons use 12px corners; main panels use 16px corners. Compact actions use 8px corners, rail items use 9px corners, and allocation ribbons use 4px corners. Status chips stay small. The mark is a white folded M inside a rounded iris square; use the supplied SVG or `BrandMark`, not a currency glyph in its place.

## Components

### Actions and fields

Primary actions use iris and inverse text, with an iris hover state. Secondary actions use a raised surface and line; ghost actions stay transparent until hover. Shared controls are 44px high, with compact dashboard/disclosure actions using their measured smaller variants. Amount entry is intentionally larger: amount and category lead; description, date, and payment method are available without making a short record feel like a form wizard.

Focus is visible as a 2px accent outline with 4px offset. Selected categories use a tinted fill and inset accent boundary. Inputs keep visible labels, Turkish amount hints, and inline error recovery. Double submission protection remains in the entry path. A successful save exposes persistent Undo until dismissed or replaced by another feedback state.

### Workspace navigation and account

`WorkspaceChrome` owns the rail and toolbar presentation. Rail selection uses a tinted active row, stronger text, an active dot, and `aria-current`. The toolbar keeps period, privacy, and account controls available. Google sign-in and synchronization state remain accessible; loading, offline, pending decision, error, and synchronized states must retain their actual meanings.

The four primary destinations are Overview, Analysis, Assets, and Future. The mobile bar keeps a central record action. Spending remains an independent detail route, available from Analysis and the desktop rail. Cards and Settings have full page routes, with a direct Cards action on the overview and a persistent Settings action in the toolbar. A card detail is a separate page scoped to its physical card identity and selected calendar month. Changing pages scrolls to the top and focuses the main content.

The period control selects a year and then one of twelve months, including months with no records. The selected period supplies a new entry's initial date; an explicit edited date takes priority. Settings and Assets hide the irrelevant monthly filter. Monetary settings accept Turkish grouping and decimal separators without changing the field during typing.

### Records, cards, and recovery

Each transaction has an independent trailing delete button, outside the row's detail action. Persistent feedback renders inside the topmost dialog's layout and keyboard focus boundary when a dialog is open; otherwise it sits above navigation. It must never cover the submit button. Undo restores the original transaction identity, dates, card, and statement linkage.

Missing statements use a warning role and explicit wording, with immediate Add and Remove Card actions. Removing a card retains financial history and can be undone. New physical cards never inherit an archived card identity based on a matching name or last four digits. The importer offers saved and unsaved card identities plus an explicit new-card choice.

### Assets and update policy

Analysis uses one continuous page with an independent historical range, an open metric ledger, paired trend and category panels, current holdings, observed asset history, habits, and numerical tables. Missing months remain graph gaps. Every chart has an adjacent list or table; horizontal table scroll does not trigger tab swipes. Portfolio observations and manually entered past totals stay visibly distinct from investment return. Destructive session operations hide financial interaction while pending, and old drafts and Undo state are discarded after device or identity replacement.

Assets use the same raised reading surfaces and iris actions. Quantity, price source, quote time, and estimated TL value have separate hierarchy. Allocation is a labelled proportional ribbon. A missing quote remains unknown rather than becoming zero; cached or daily reference prices state their limits. Holdings never create income or spending records.

Required updates replace the application surface and offer no dismissal. Suggested updates preserve the workspace and offer a 24-hour Later action. Native update prompts require a validated platform destination from Remote Config; unset future store links cannot lock out installed users.

### Budget allocation and charts

`BudgetRibbon` displays usable headroom or overspend, the actual limit, percentage used, and an accessible progressbar. It is scoped only to one month with all accounts and no active category or search filter. With no limit it gives a clear setup action; with filtered or all-period data it explains the required scope. The overview's spending chart is visible in the work area, with daily/cumulative modes, a tooltip, and an accessible data table. Privacy hides money and blurs the graph.

### Interactive introduction

The labelled sample lets someone change income, include rent, and adjust a limit. Allocation widths respond to sample state. Real setup then offers card, income, and optional reminders; every step can be skipped. Existing cards and this month's income are recognized when setup is reopened. Step headings receive focus, Android back moves to the preceding step, and samples remain outside the store.

### Motion and feedback

Press acknowledgement uses 160ms. Shared view and sheet entrances use the 200ms semantic duration. Dashboard amount changes use a 480ms ease-out interpolation. Allocation ribbons and the introductory income split use 650ms `cubic-bezier(.16, 1, .3, 1)` transitions. Category allocation uses 500ms. Save feedback enters in 240ms; its check settles in 320ms. Motion follows a changed state rather than adding a perpetual ambient loop.

With `prefers-reduced-motion: reduce`, authored CSS animation and transition are disabled, scroll behavior becomes immediate, and `MoneyValue` settles directly to its final amount. Keep the initial content visible and cancel abandoned animation frames.

## Do's and Don'ts

### Do:

- **Do** reuse semantic colors, supplied brand assets, and the locally bundled typeface.
- **Do** give each financial number its real meaning and preserve amount privacy.
- **Do** label sample data and keep it outside saved records.
- **Do** retain keyboard focus, visible errors, safe areas, and reduced-motion behavior.
- **Do** keep account state and empty-state next actions understandable.

### Don't:

- **Don't** turn a recorded-income remainder into a bank balance claim.
- **Don't** animate stored values, reward spending, or add artificial streak pressure.
- **Don't** replace task hierarchy with decorative cards nested inside cards.
- **Don't** rename database keys, package identity, or cloud resources as part of a visual rebrand.
- **Don't** infer device delivery, authenticated cloud success, or publication from a local build.
