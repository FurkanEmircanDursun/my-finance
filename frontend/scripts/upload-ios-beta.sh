#!/usr/bin/env bash
set -euo pipefail

: "${MIZAN_FIREBASE_WEB_ENV:?Set the Firebase web configuration secret}"
: "${MIZAN_FIREBASE_IOS_PLIST:?Set the Firebase iOS plist secret}"
: "${MIZAN_ASC_KEY:?Set the App Store Connect team API private key secret}"
: "${MIZAN_ASC_KEY_ID:?Set the App Store Connect key ID secret}"
: "${MIZAN_ASC_ISSUER_ID:?Set the App Store Connect issuer ID secret}"
: "${MIZAN_APPLE_TEAM_ID:?Set the Apple Developer team ID variable}"
[[ "$MIZAN_APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]
[[ ! -e .env.production.local && ! -e ios/App/App/GoogleService-Info.plist ]] || {
  echo 'The signing job requires a clean checkout.' >&2
  exit 1
}

workdir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/mizan-beta.XXXXXXXX")"
trap 'rm -f "$workdir/key.p8" .env.production.local ios/App/App/GoogleService-Info.plist' EXIT
umask 077
printf '%s\n' "$MIZAN_FIREBASE_WEB_ENV" > .env.production.local
printf '%s\n' "$MIZAN_FIREBASE_IOS_PLIST" > ios/App/App/GoogleService-Info.plist
printf '%s\n' "$MIZAN_ASC_KEY" > "$workdir/key.p8"
unset MIZAN_FIREBASE_WEB_ENV MIZAN_FIREBASE_IOS_PLIST MIZAN_ASC_KEY

npm run build
npm run ios:sync
npm run ios:validate

auth=(-allowProvisioningUpdates -authenticationKeyPath "$workdir/key.p8"
  -authenticationKeyID "$MIZAN_ASC_KEY_ID" -authenticationKeyIssuerID "$MIZAN_ASC_ISSUER_ID")

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$workdir/Mizan.xcarchive" \
  "DEVELOPMENT_TEAM=$MIZAN_APPLE_TEAM_ID" "${auth[@]}" archive

cat > "$workdir/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>destination</key><string>upload</string>
  <key>method</key><string>app-store-connect</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>$MIZAN_APPLE_TEAM_ID</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
EOF

xcodebuild -exportArchive -archivePath "$workdir/Mizan.xcarchive" \
  -exportPath "$workdir/export" -exportOptionsPlist "$workdir/ExportOptions.plist" "${auth[@]}"
