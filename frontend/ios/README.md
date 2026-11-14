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
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO build
```

For a physical device/archive, select the Apple development team for **App** and
**MizanShare**. Register the bundle IDs `com.faraday.followfinance` and
`com.faraday.followfinance.share` and grant the same App Group to both provisioning
profiles. This requires the owner's Apple developer account. The App Group cannot
be provisioned from this Windows workspace.

The registered Firebase iOS configuration belongs at
`ios/App/App/GoogleService-Info.plist`. `ios:configure` validates its bundle ID,
copies it to the synchronized Firebase resource folder, and configures the Google
reversed client URL scheme. Without that file, Capacitor excludes native Firebase
Authentication so the offline app and PDF import can still launch.

## Behavior

- Android PDF SEND, SEND_MULTIPLE and content-URI VIEW open Mizan, including cold
  starts; the private queue waits for the unlocked import UI.
- iOS **Mizan’a Gönder** copies PDFs into the App Group inbox and confirms they are
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
