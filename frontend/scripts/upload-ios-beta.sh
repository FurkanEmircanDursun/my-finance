#!/usr/bin/env bash
set -euo pipefail

: "${MIZAN_FIREBASE_WEB_ENV:?Set the Firebase web configuration secret}"
: "${MIZAN_FIREBASE_IOS_PLIST:?Set the Firebase iOS plist secret}"
: "${MIZAN_ASC_KEY:?Set the App Store Connect team API private key secret}"
: "${MIZAN_ASC_KEY_ID:?Set the App Store Connect key ID secret}"
: "${MIZAN_ASC_ISSUER_ID:?Set the App Store Connect issuer ID secret}"
: "${MIZAN_APPLE_TEAM_ID:?Set the Apple Developer team ID variable}"
: "${MIZAN_IOS_DISTRIBUTION_P12:?Set the base64-encoded Apple Distribution identity}"
: "${MIZAN_IOS_DISTRIBUTION_PASSWORD:?Set the Apple Distribution identity password}"
: "${MIZAN_IOS_APP_PROFILE:?Set the base64-encoded App Store profile for Mizan}"
: "${MIZAN_IOS_SHARE_PROFILE:?Set the base64-encoded App Store profile for the share extension}"
[[ "$MIZAN_APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]
[[ ! -e .env.production.local && ! -e ios/App/App/GoogleService-Info.plist ]] || {
  echo 'The signing job requires a clean checkout.' >&2
  exit 1
}

workdir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/mizan-beta.XXXXXXXX")"
keychain="$workdir/distribution.keychain-db"
profiles_dir="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
installed_profiles=()
cleanup() {
  security delete-keychain "$keychain" 2>/dev/null || true
  if ((${#installed_profiles[@]})); then rm -f -- "${installed_profiles[@]}"; fi
  rm -f "$workdir/key.p8" "$workdir/distribution.p12" \
    .env.production.local ios/App/App/GoogleService-Info.plist
}
trap cleanup EXIT
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

keychain_password="$(openssl rand -hex 24)"
security create-keychain -p "$keychain_password" "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security list-keychains -d user -s "$keychain" "$HOME/Library/Keychains/login.keychain-db"
printf '%s' "$MIZAN_IOS_DISTRIBUTION_P12" | base64 -D > "$workdir/distribution.p12"
security import "$workdir/distribution.p12" -k "$keychain" \
  -P "$MIZAN_IOS_DISTRIBUTION_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null
unset MIZAN_IOS_DISTRIBUTION_P12 MIZAN_IOS_DISTRIBUTION_PASSWORD keychain_password
mkdir -p "$profiles_dir"

install_profile() {
  local file="$workdir/$1.mobileprovision" bundle_id="$2" uuid profile_id
  base64 -D > "$file"
  security cms -D -i "$file" > "$workdir/$1.plist"
  uuid="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$workdir/$1.plist")"
  profile_id="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$workdir/$1.plist")"
  [[ "$uuid" =~ ^[[:xdigit:]-]{36}$ && "$profile_id" == "$MIZAN_APPLE_TEAM_ID.$bundle_id" ]]
  cp "$file" "$profiles_dir/$uuid.mobileprovision"
  installed_profiles+=("$profiles_dir/$uuid.mobileprovision")
}

install_profile app com.faraday.followfinance <<< "$MIZAN_IOS_APP_PROFILE"
install_profile share com.faraday.followfinance.share <<< "$MIZAN_IOS_SHARE_PROFILE"
app_uuid="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$workdir/app.plist")"
share_uuid="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$workdir/share.plist")"
unset MIZAN_IOS_APP_PROFILE MIZAN_IOS_SHARE_PROFILE

cat > "$workdir/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>destination</key><string>upload</string>
  <key>method</key><string>app-store-connect</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key><dict>
    <key>com.faraday.followfinance</key><string>$app_uuid</string>
    <key>com.faraday.followfinance.share</key><string>$share_uuid</string>
  </dict>
  <key>teamID</key><string>$MIZAN_APPLE_TEAM_ID</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
EOF

xcodebuild -exportArchive -archivePath "$workdir/Mizan.xcarchive" \
  -exportPath "$workdir/export" -exportOptionsPlist "$workdir/ExportOptions.plist" "${auth[@]}"
