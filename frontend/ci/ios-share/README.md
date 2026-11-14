# Disposable iOS Share Sheet proof

These CI-only files generate an independent UIKit probe and XCUITest project in
the Mac runner's temporary directory. They do not modify the production Xcode
project, production Swift, installed user devices, or signing accounts.

The probe has no App Group capability. It creates an invented, balanced credit
card statement in its own Documents directory and shares its file URL through
UIKit's real `UIActivityViewController`.

The proof installs an ad-hoc-signed copy of the actual Mizan app and extension,
checks the actual App Group container, selects the real OS activity, verifies
extension success and the resulting receipt/PDF hash, then foregrounds Mizan
and verifies automatic import and acknowledgement through the actual app UI.
It never calls the native receiver directly or seeds the shared inbox.

UI execution has a total five-minute budget. The surrounding workflow has a
20-minute limit. Only screenshots, accessibility attachments, xcresults and a
small summary are retained; generated PDFs and app products stay on the runner.

Windows can verify the generated project AST:

```sh
node ci/ios-share/generate-probe-project.mjs /path/to/disposable/output
```

Actual execution requires Xcode and Simulator on the disposable Mac runner:

```sh
node ci/ios-share/run-share-proof.mjs
```

A simulator signing/App Group failure, absent OS share target, delivery failure,
and foreground import failure remain distinct proof boundaries. A successful
simulator run does not establish physical-device provisioning or every bank
app's provider behavior.
