# Firebase Security Rules verification — 2026-11-14

The proposed rules restrict client access to the authenticated UID's exact Firestore paths. Unknown collections, deeper subcollections, parent user documents and notification receipts have no client grant. Storage is deny-all because the current application parses statement PDFs locally and has no Storage SDK upload/download flow. The existing `storageBucket` configuration alone does not establish that a bucket has been provisioned.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for private account data through authenticated UID ownership, explicit document paths, strict top-level schemas, matching create/update validators and default denial. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

## Scope and compatibility

Reviewed the active client models and transport, including `frontend/src/domain/types.ts`, `domain/assets.ts`, `domain/assetsHistory.ts`, `sync/model.ts`, `sync/firestoreTransport.ts`, `sync/cloudAdmin.ts`, `platform/push.ts`, and the scheduled reminder code in `functions/src`.

| Client path | Allowed operations for its UID owner |
| --- | --- |
| `users/{uid}/transactions/{id}` | Read/list, validated create/update, tombstone, delete |
| `users/{uid}/statements/{id}` | Read/list, validated create/update, tombstone, delete |
| `users/{uid}/rules/{id}` | Read/list, validated create/update, tombstone, delete |
| `users/{uid}/meta/profile` | Read/list, validated create/update, tombstone, delete |
| `users/{uid}/meta/prefs` | Read/list, validated create/update, tombstone, delete |
| Other `users/{uid}/meta/{id}` | Read/list and delete for legacy migration; no new writes |
| `users/{uid}/pushDevices/{installationId}` | Read/list/delete; validated non-anonymous create/update |
| `users/{uid}/notificationDeliveries/{id}` | No client access |
| Every Storage object | No client access, including authenticated owners |

The client listens to complete owner collections rather than filtered queries. The rules preserve these collection queries, account deletion, full-sync batches and legacy data purge. They do not require a parent user document, which this transport does not create. Admin SDK collection-group queries in the scheduler use IAM and bypass client rules.

Transaction/statement document IDs must match their payload IDs. Category-rule IDs and `createdAt` may change when a merchant category is learned again: that is existing reducer behavior, not an ownership change. Sync versions are bounded millisecond integers but remain device-supplied for offline compatibility. The push registration timestamp must equal the server request time. New `meta/settings` writes, PIN fields and role/ownership fields outside the defined schema are rejected.

## Executed verification

**18 tests passed, 0 failed, 0 skipped; command exited 0.** Both rule files compiled and executed against the local Firestore and Storage emulators. Tests use only synthetic fixtures under a demo project; they do not read real account records or send notifications.

```powershell
# The directory already exists in this checkout. This local override avoids the
# host's Java/MSIX Unix-domain-socket temporary-directory failure.
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=C:\antigravity-project\my-finance\tmp'
firebase emulators:exec --project demo-my-finance-rules --only 'firestore,storage' 'npm --prefix functions run test:rules'
```

The CLI/runtime emitted shutdown warnings after the successful test run. The process exit code and all 18 test outcomes were successful. The Java override applied only to the command process; no system environment or JDK settings were modified.

Positive fixtures cover the actual full-sync batch and all four collection listeners; all transaction kinds and sources; optional installment/foreign/reward data; a statement with complete non-null summary, loyalty and reconciliation; reimport; merchant rule re-learning; optional-field-free legacy profiles; tombstone/resurrection; PIN-document purge; push enrollment/refresh/removal; and a profile holding **240 observations with five quote rows each**. The restored profile also produces the expected single reminder in the scheduler's pure planning function. These are emulator/model checks, not evidence of a live device receiving a notification.

## Attack outcomes

| Attempt | Result |
| --- | --- |
| Public collection queries | Unauthenticated reads/lists denied |
| Other account get/create/update/delete | Denied across transaction, statement, category rule, profile, preferences and push paths |
| Cross-account collection and collection-group queries | Denied |
| Create valid record, then bypass validation with update | Rejected for invalid scalar types, enums, long scalar strings, unexpected fields and removed required fields |
| Inject/change `uid`, `ownerId`, `role`, `isAdmin` | New payload fields rejected; authority derives only from Auth UID and path |
| Change transaction/statement ID | Rejected when it differs from the path |
| Add arbitrary top-level schema fields | Rejected on create and update |
| Omit required fields or remove `_u` | Rejected |
| Invalid/negative/fractional sync version | Rejected; historical bounded offline versions remain valid |
| Malformed tombstone or hidden tombstone payload | Rejected; exact `_u` + `_d:true` accepted |
| Negative transaction amount, fractional money, unsafe numeric range | Rejected; legitimate signed profile/statement balances remain valid |
| Malformed nested installment, foreign amount, summary or reconciliation | Rejected |
| Oversized scalar description, merchant, raw text, label/bank/card reference | Rejected by explicit scalar limits |
| Oversized profile/history or ignored-row lists | Rejected above their documented count bounds |
| Malicious member inside an otherwise bounded profile/history/ignored list | **Residual owner-data integrity limitation:** not all nested members are validated by Rules; this never grants access to a different UID |
| Forged old/future push update timestamp | Rejected unless it equals request time |
| Modify category-rule `createdAt` | Intentionally allowed within bounded integer type because re-learning replaces that record |
| Inject new device PIN/settings data into cloud | Rejected; legacy documents remain owner-readable/deletable for purge |
| Read another account's mixed private/public profile fields | Denied; no public profile grant exists |
| Access unknown/deeper subcollections or forge/delete server receipts | Denied, including to the apparent path owner |
| Known sync path without parent user document | Intentionally allowed only to its UID owner; required by the current transport |
| Invalid status transition or counter replay | No client-owned status/counter workflow exists; delivery state is server-only |
| Reference another user's cloud storage path | No cloud object path field exists; all Storage client operations denied |
| Storage read/getMetadata/getDownloadURL/list/create/overwrite/updateMetadata/delete | Denied for owner, second account and guest, tested against existing bypass-seeded objects and new objects |

## Explicit limits

Large nested arrays in the current single profile document cannot all be exhaustively type-checked without changing the storage model. Rules have no loops or generic list-member type validation and enforce a 1,000-expression budget. Profile/history/ignored arrays therefore receive container/count bounds, while their complete member normalization remains in client/domain code. A malicious account owner could still corrupt their own nested data or write a large nested value up to Firestore's document limit. These rules do **not** claim complete nested-payload validation or write-rate/cost protection. Moving array members into individually validated documents would be separate migration work.

Scalar string limits are 256 for IDs/bank/card labels, 1,024 for statement labels/filenames, 4,096 for transaction descriptions/merchant keys, 16,384 for raw extracted transaction text and 4,096 for push tokens. List count ceilings are 100 budgets, 1,000 active/archived cards, 10,000 holdings, 240 valuation snapshots and 5,000 ignored statement rows. Existing short normal records and the 240-month profile fixture pass. Records outside these limits remain owner-readable and deletable, but their next rewrite must meet the new schema.

Local compilation/testing does not prove which rules are active in the live project. This work did not provision a Storage bucket, modify IAM, inspect existing object download tokens, or deploy rules. Storage deny-all controls SDK/rules-evaluated access; privileged IAM and previously issued bearer download URLs require separate live configuration review if a bucket exists. The parent release/configuration check records any subsequent live inspection and deployment independently.

Auditor-format assessment of the proposed client rules:

```json
{
  "score": 4,
  "summary": "Synthetic emulator attacks found no cross-account or public client grant. Explicit ownership, path scope, top-level schemas and matching create/update validators pass. Nested legacy lists retain an owner-only data-integrity limitation.",
  "findings": [
    {
      "check": "Storage abuse and type safety inside nested lists",
      "severity": "minor",
      "issue": "Bounded profile/history/ignored lists do not exhaustively validate each nested member, so an owner can still corrupt their own payload within Firestore document limits.",
      "recommendation": "For exhaustive server-side member validation, plan a separately reviewed migration to individually validated documents while preserving sync compatibility."
    }
  ]
}
```

Official references: [Rules field/list type limitations](https://firebase.google.com/docs/firestore/security/rules-fields), [Rules expression and recursion limits](https://firebase.google.com/docs/rules/rules-behavior), [Emulator unit-testing APIs](https://firebase.google.com/docs/rules/unit-tests), [Java socket temporary-directory selection](https://docs.oracle.com/en/java/javase/22/core/java-networking.html).
