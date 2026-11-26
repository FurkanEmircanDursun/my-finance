# Mizan iOS PDF sharing

The Capacitor 8 app and embedded `MizanShare.appex` are real Xcode targets. Both use
`group.com.faraday.followfinance`; the shared inbox implementation is compiled into
both targets through synchronized folders. Node.js 22+, macOS and Xcode 26+ are
required. Dependencies use Swift Package Manager.

From `frontend`:

```sh
npm ci --ignore-scripts
npm run build
npm run ios:sync
npm run ios:validate
swiftc ios/App/Shared/SharedPdfGeneration.swift scripts/test-shared-pdf-generation.swift \
  -o /tmp/mizan-share-generation-tests
/tmp/mizan-share-generation-tests
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO build
```

For a physical device/archive, select the Apple development team for **App** and
**MizanShare**. Register the bundle IDs `com.faraday.followfinance` and
`com.faraday.followfinance.share`, grant the same App Group to both provisioning
profiles, and enable the **Sign in with Apple** capability on `com.faraday.followfinance`
(and enable the Apple provider in Firebase Console → Authentication → Sign-in method,
configuring the Service ID + private key for web Sign in with Apple). This requires the
owner's Apple Developer account and cannot be provisioned from this Windows workspace.
The App Store privacy manifest is bundled at `ios/App/App/Native/PrivacyInfo.xcprivacy`
and `ITSAppUsesNonExemptEncryption` is declared `false` in `Info.plist`.

The registered Firebase iOS configuration belongs at
`ios/App/App/GoogleService-Info.plist`. `ios:configure` validates its bundle ID,
copies it to the synchronized Firebase resource folder, and configures the Google
reversed client URL scheme. Native Google sign-in requires this file. The app
can still receive a PDF before sign-in and offer e-mail authentication.

## Behavior

- Android PDF SEND, SEND_MULTIPLE and content-URI VIEW open Mizan, including cold
  starts. The private queue waits for Firebase sign-in and the unlocked import UI.
- iOS lists the share activity as **Mizan**, using the containing app's display
  name; the extension itself is titled **Mizan’a Gönder**. This is the system's
  naming behavior since iOS 13 ([Apple sharing guidance](https://developer.apple.com/videos/play/tech-talks/210/?time=348)).
  The extension copies PDFs into the App Group inbox and confirms they are
  ready. Open Mizan to import them on foreground. Apple does not provide a supported
  Share Extension API to force-launch its containing app. The registered **Open in
  Mizan** PDF document route does open the app directly.
- Each delivery holds at most five PDFs, 25 MiB per file, with a 50 MiB inbox bound.
  Data is streamed, checked for the PDF version header within its first 1024 bytes,
  deduplicated while pending, and excluded from cloud/device backup. Native queue
  files expire on the next inbox access after 24 hours.
- A successful UI acknowledgement deletes its private copies. Cancellation or
  disposal during a session change retains the delivery; deliberate account/device
  clearing calls `SharedPdf.clear` and must succeed before that boundary completes.
  The App Group generation changes atomically with clearing. A Share Extension
  that was already staging for the previous account cannot publish its files
  afterward. Provider copying happens outside the lock; generation checking and
  publishing use the same short cross-process file lock as clearing.

Validate on iPhone/iPad: share one and several synthetic PDFs from Files and a bank
app, cancel during preparation, open Mizan cold/warm/locked, repeat the same share,
try a spoofed PDF and oversized file, dismiss/import, and confirm the inbox is
empty after acknowledgement and account/device clearing. Real bank documents are
never required in source control or CI.

References: [Android receiving shared content](https://developer.android.com/training/sharing/receive),
[Apple shared containers and activation rules](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html),
[Apple extension lifecycle constraints](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionOverview.html),
[Capacitor native plugin registration](https://capacitorjs.com/docs/ios/custom-code),
[Capacitor toolchain requirements](https://capacitorjs.com/docs/getting-started/environment-setup).
