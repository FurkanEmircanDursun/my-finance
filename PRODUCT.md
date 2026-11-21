# Mizan

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing React 18 / TypeScript / Vite application, Capacitor Android wrapper, IndexedDB, optional Firebase synchronization.

## Users

Turkish-speaking individuals tracking personal spending across credit cards, rent, cash expenses, and income.

## Product Purpose

Give an understandable monthly spending picture and actionable analysis without requiring a bank connection or account registration.

## Operating Context

The user explicitly selected calendar months as the default for combined card, rent, and cash analysis. Complete bank statements retain independent reconciliation against their printed balances. Effective billed dates are used for installments whose original purchase date precedes the billed cycle.

## Capabilities and Constraints

- Local PDF/TXT/CSV parsing; Akbank Axess and Garanti Bonus adapters.
- Add dated manual income or expenses, with cash, bank/EFT, or other method. Rent and bills have shortcuts.
- Monthly fixed-entry workflow, categories, learned corrections, budgets, findings, future commitments, rewards, backups, and optional synchronization.
- Existing transaction schema is retained; amounts remain integer kuruş. Card repayments do not count as new spending.
- Monthly income shown on the overview is recorded income, not an invented balance or assumed salary.
- Files are parsed locally; optional synchronization sends parsed records only after sign-in. Public deployment and authenticated cloud/device verification are separate from local build checks.

## Evidence on Hand

On 2 November 2026, six user-supplied statements were processed locally. Private results live in the ignored data/statement-audit-2026-11-02.md report. Browser screenshots contain synthetic records only.

## Product Principles

- One entry action for card-external transactions, with a separate file import.
- Keep household spending and bank debt reconciliation legible as distinct calculations.
- Explain incomplete coverage and uncertain classification.
- Preserve data, backups, privacy settings, and optional cloud behavior.


## Historical guided discovery: 2.3

The user requested a premium, engaging experience with concise essentials and optional detailed analysis. The 2.3 experience provides a single-screen introduction, a clearly labelled interactive sample that never becomes stored financial data, and four data-derived completion tasks: an expense, recorded income, a budget, and expense category completion. Each contributes 25 route points. This measures record completeness, not financial success. There are no rewards for spending amounts, artificial streaks, public rankings or invented growth claims. Real-data workflows explicitly leave sample mode before opening.

The overview shows net spend, recorded income and their difference, with the latter labelled as residual rather than bank balance. Three category and transaction previews lead into deeper views. Charts have daily/cumulative modes and an accessible table. Monthly budget pacing is shown only for an unfiltered single month; complete statement reconciliation remains independent.

## Historical Android 2.4 experience

Ana özet artık kaydedilen gelir, toplam gider ve gelirden kalanı gösterir. Kalan tutar banka bakiyesi olarak sunulmaz. Gelir/gider ekleme ve Kartlarım eylemleri ana ekrandan erişilir. Kurulum dört adımdır: karşılama, kart, gelir, hatırlatma. Her adım atlanabilir; kayıtlar mevcut yerel veri modeline yazılır. Kurulumun yeniden açılması mevcut gelir ve kartları gösterir.

Akbank ve Garanti kartları profil altında ayrı kimliklerle tutulur. Ekstre içe aktarılırken kart açıkça seçilir; aynı bankadaki kartların aynı işlem satırları birbirini silmez. Kartı kaldırmak ekstre ve harcamaları silmez; kaldırılan kart aynı kimlikle geri eklenebilir.

Ekstre ve veri giriş bildirimleri Android cihazında planlanır. İzin yalnız kullanıcı açmayı seçtiğinde istenir. Web sürümü destek sınırını açıkça gösterir. Bildirime dokunmak PIN sonrasında Kartlarım bölümünü açar.


## Historical Android 2.5 experience — 7 November 2026

The redesign prioritizes a calm monthly overview, amount-first entry with optional details, persistent Undo, and visible Google account/sync access. Android uses native Google sign-in with Firebase JS IndexedDB persistence. Existing financial models, bank adapters, integer kuruş amounts, local backups, statement reconciliation, and card identity are preserved.

Optional Firebase Analytics measures only named product events and screen visits after explicit device-local consent. Financial fields, filenames, card descriptions, and email are excluded from the event API. FCM enrollment and a shared hourly scheduled function support statement and monthly entry reminders in Europe/Istanbul. The user explicitly authorized Blaze and live FCM setup on 7 November 2026. At that point billing was reported enabled; the reminder function was ACTIVE, the hourly Europe/Istanbul Scheduler was ENABLED, rules were published, and both collection-group indexes were READY. The release deployment gate was enabled. Google Analytics was linked to a separate My Finance property. These provider states were not re-audited during the 14 November visual redesign. Device notification delivery and actual Analytics event receipt remain user acceptance steps; no device tests were performed after the user asked to handle them.

## Identity redesign — Mizan 2.5, 14 November 2026

Mizan is the renamed product, with the promise “Ayın dengesi, senin elinde.” The user authorized a replacement visual identity and architecture refinement. The folded M, ink navigation rail, iris actions and budget area, and cool reading surfaces form the current system. The application package version remains 2.5.0 until a separate release is prepared.

The first-run interactive sample changes income, rent inclusion, and a spending limit in component state. It is explicitly illustrative and never writes financial records. The real setup remains skippable, recognizes existing cards and this month's recorded income, and asks for notification permission only through the optional reminder choice. Shared sheet entry leaves sample mode before opening a real workflow.

The overview makes the monthly financial picture and spending chart visible together. Income means actual income records in the selected scope, expenses use the existing net-spend rules, and the remainder is never presented as a bank balance. The budget ribbon is active only for one month with all accounts and no active category or search filter. Four practical setup checks show whether card, income, expense, and monthly limit records exist; they do not grade wealth or reward spending.

`WorkspaceChrome` separates navigation presentation from the application lifecycle. `useOverviewModel` centralizes the monthly presentation data and independent sample analysis. `BudgetRibbon` and `MoneyValue` express state changes without changing the underlying stored values. The domain model, bank adapters, statement reconciliation, reducer, integer kuruş calculations, schema, IndexedDB name, app ID, synchronization identity, and legacy backup format remain compatible. Export names and user-facing labels use Mizan.

Light/dark themes, amount privacy, accessible chart tables, focus restoration, safe areas, and reduced-motion remain product requirements. Authentication, synchronization conflicts, reminder enrollment, and Analytics consent keep their existing operational boundaries. This design task does not establish a new cloud deployment, APK, real-device acceptance, FCM delivery, or Analytics receipt.

## Mizan 2.6, 14 November 2026

Version 2.6.0 (Android code 26) adds full page Settings, Cards, individual Card Detail, and Assets destinations. Year-then-month selection includes empty past months. Manual entries start in the selected month, while an explicit date always wins and selects its actual month after saving. Every transaction row exposes deletion and persistent Undo; dialogs host feedback inside their layout and keyboard boundary.

Cards retain physical identities across statements. Unknown imported cards can be registered with the extracted cutoff day; declining registration keeps their import identity available. New or different cards do not silently merge with archived cards by name or last four digits. A strictly validated, explicitly inactive bank statement can clear the missing-statement state without inventing a purchase. After cutoff, a missing document provides direct import and recoverable card removal. Newly configured reminders suggest 20:00 Europe/Istanbul; existing explicit reminder times are preserved.

Assets hold gram gold, quarter gold, gram silver, USD, and EUR quantities independently of the transaction ledger. Truncgil intraday quotes have Frankfurter and open ExchangeRate-API fallbacks, bounded retries, and dated local cache. Quotes are estimates, and quarter-gold valuation covers metal content rather than retail premiums. Holdings participate in local persistence, backups, and optional profile synchronization. Legacy profiles without the new field preserve existing holdings; explicit empty lists clear them. Whole-profile conflict resolution remains a known limit for concurrent device edits.

Remote Config controls minimum and latest versions, message, web fallback, and separate future Android/iOS update destinations. Invalid policies fail open. Native prompts stay disabled until a valid platform distribution link exists. Optional Analytics and Performance have independent device consent and bounded event APIs; their SDK metadata must not expose financial routes or card IDs. Native Crashlytics, App Check enforcement, store distribution, real-device notification delivery, and signed-in concurrent-device acceptance remain separately documented release work.

## Current product — Mizan 2.7, 14 November 2026

Logout offers an explicit option to remove only this device's copy. Cloud and account deletion are separate named workflows. A central session boundary pauses synchronization before logout or local clearing, preserves local data on failure, atomically clears financial state and account baselines, and rejects stale browser-realm writes through a durable generation. Nonfinancial cross-tab notifications clear peer memory and drafts; focus/reload checks recover missed notifications. Unknown future storage schemas are preserved rather than overwritten with an empty state. Explicit account erasure verifies the acting account identity at each consequential boundary.

Analysis is a primary destination at `#/analysis`; detailed spending remains at `#/spending`. It combines monthly income/spending trends, category distribution and changes, merchant and weekday habits, exact tables, current holdings, and genuinely observed monthly portfolio values. Its historical range is independent of the overview filter. Missing months and incomplete statement coverage remain visible. Debt repayments are excluded from spending, refunds remain signed, and no salary or historical asset price is assumed.

Portfolio history stores a bounded monthly observation with quantities, prices, source dates, and provenance. A user can enter a known prior month-end total as a manual observation. Value changes include quantity movements and are not presented as investment returns. Historical observations participate in backup, migration, and optional profile synchronization; they are never backfilled from today's exchange rates. Verification and remaining acceptance boundaries are documented in `docs/MIZAN_SESSION_ANALYSIS.md`.
