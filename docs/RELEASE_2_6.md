# Mizan 2.6.0

14 November 2026. Android version code 26. This release extends the established Mizan identity and preserves the existing application ID, IndexedDB name, integer-kuruş ledger, and backup compatibility.

## Delivered product changes

- Selected-month date binding, visible explicit dates, year/month selection, and Turkish monetary setting parsing.
- Independent trailing transaction delete controls and persistent Undo, hosted inside the current dialog when one is open.
- Full page Settings, Cards, and Card Detail; physical-card isolation, registration after import, and direct missing-statement recovery.
- Safe recognition of explicitly inactive, reconciled bank statements; no fabricated zero-value transaction.
- End-of-day reminder defaults with existing user-selected times preserved.
- Validated Remote Config hard/soft update policy and future Android/iOS distribution links.
- Asset quantity CRUD, allocation, dated real quotes, fallbacks/cache, persistence, backup, and profile synchronization.

## Browser acceptance

Only synthetic data was used on isolated development origins; no account was signed in.

- In October 2025, the income form started on October 14 and stored a 50,000 TL synthetic income.
- An expense defaulted to that month; changing its date to September 30 selected September and stored 125.50 TL there. Delete and Undo restored its exact date and amount.
- Settings remained at `#/settings`, without a dialog. `15.000,50` retained its 15,000.50 TL meaning.
- A missing registered card offered direct preselected import. A synthetic Garanti statement offered registration with cutoff day 28; the September 2026 detail showed only that card, 1,280 TL net, categories, and statement link.
- USD 100 and gold quantities were valued using real Truncgil prices. Quantity edits, delete, and Undo worked. No horizontal overflow at 390 px.
- Transaction deletion inside the open list showed an accessible 40 px Undo button within the dialog; Undo restored the row.
- A cached hard policy rendered only the required-update screen and survived Escape. A soft policy dismissed with Later and retained the dismissal after reload. Test policy and network overrides were removed.
- Settings was inspected at 1440 px with no horizontal overflow. Screenshots are under ignored `output/qa/mizan-2.6/`.

## Acceptance boundaries

Local tests and browser flows do not establish real Android/iOS notification delivery, native back behavior, signed upgrade/data retention, actual Analytics/Performance dashboard receipt, or authenticated multi-device conflict acceptance. No store listing or native package distribution is claimed for this release. Native Crashlytics and App Check remain future provider integrations rather than completed features.

## Final gates and live receipt

- Frontend: **572 tests in 51 files passed**. TypeScript and the final production build passed. One nonblocking Vite warning notes that Capacitor App has both static and dynamic imports.
- Backend: **11 reminder tests passed**, including 20:00 delivery preference, short months, deduplication, generic lock-screen content, and invalid-token handling. The existing `monthlyStatementReminders` function was independently listed as **ACTIVE**, Node.js 22, europe-west1. No function or rules deployment was needed for this release.
- Firebase Hosting: **59 files deployed** to `https://my-finance-webapp-fd.web.app`. Live HTML returns HTTP 200 and references the exact verified `/assets/app-BDA9E8UL.js` bundle. `/diagnostics.html` returns HTTP 200, `no-cache`, and `Referrer-Policy: no-referrer`.
- Remote Config: user-approved **version 1**, published **2026-11-14T11:01:33.569155Z**. Six parameter defaults were fetched back and compared with the local template. Minimum 0.0.0, latest 2.6.0; Android/iOS destinations remain empty, so native prompts cannot lock users onto an unavailable download.
- Production browser: the Firebase Hosting alias rendered version 2.6.0, Assets, a real dated quote response, and an active fixed-URL diagnostics frame. Revoking consent removed the frame. Browser console had no errors during this smoke test. No financial records or account login were created in production.
- Privacy: actual installed Firebase Performance serializer regression verifies the fixed frame address contains no parent card ID. Web Analytics event metadata overrides URL/referrer with a canonical nonfinancial context. All five named duration operations have real call sites; no financial fields cross the bridge.
- PDF: the final report was generated from `docs/scripts/build_mizan_report.py`. All **five A4 pages** were rendered and visually inspected; text, footers, Turkish glyphs, and seven source links were verified. Final file: `output/pdf/mizan-mimari-ve-urun-raporu.pdf` (92,369 bytes).
