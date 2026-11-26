#!/bin/sh
# Builds the iOS app in apps/ios. With the App Store Connect API key (APPLE_API_KEY, APPLE_API_ISSUER,
# APPLE_API_KEY_P8, Admin role) it signs for the App Store with Apple's cloud-managed certificate and, for releases
# from main that aren't dry runs, uploads to TestFlight. Without the key it builds unsigned. Either way it writes the
# sideloading .ipa.
set -e

VERSION=$(node -p "require('../../package.json').version")
mkdir -p "$CI_PROJECT_DIR/target/ios"

if [ -n "$APPLE_API_KEY_P8" ]; then
  apple="$CI_PROJECT_DIR/.apple"
  mkdir -p "$apple"
  key="$apple/AuthKey_$APPLE_API_KEY.p8"
  printf '%s' "$APPLE_API_KEY_P8" | base64 --decode > "$key"

  token=$(xcrun altool --generate-jwt --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER" --p8-file-path "$key" \
    2>&1 | tail -n 1)
  echo "Clock here: $(date -u '+%a, %d %b %Y %H:%M:%S GMT'), at Apple: $(curl -sI https://api.appstoreconnect.apple.com \
    | sed -n 's/^[Dd]ate: //p')"
  for path in 'apps?limit=1' 'bundleIds?filter[identifier]=org.wizardchat.ios' 'certificates?limit=1' 'profiles?limit=1'; do
    code=$(curl -gs -o "$apple/asc.json" -w '%{http_code}' -H "Authorization: Bearer $token" \
      "https://api.appstoreconnect.apple.com/v1/$path")
    echo "App Store Connect API /v1/$path -> $code"
    if [ "$code" != 200 ]; then head -c 500 "$apple/asc.json"; echo; fi
  done

  # Like the Tauri CLI: archive unsigned, sign ad hoc with the entitlements, and let the export sign for the App Store
  xcodebuild -project WizardChat.xcodeproj -scheme WizardChat -configuration Release \
    -destination generic/platform=iOS -derivedDataPath build -archivePath build/WizardChat.xcarchive \
    CODE_SIGNING_ALLOWED=NO -quiet archive
  APP=build/WizardChat.xcarchive/Products/Applications/WizardChat.app
  APP_GROUP=$(xcodebuild -project WizardChat.xcodeproj -target WizardChat -configuration Release -showBuildSettings \
    | sed -n 's/^ *WZ_APP_GROUP = //p')
  sign() {
    if [ -n "$2" ]; then
      sed "s/\$(WZ_APP_GROUP)/$APP_GROUP/" "$2" > "$apple/signing.entitlements"
      codesign --force --sign - --entitlements "$apple/signing.entitlements" "$1"
    else
      codesign --force --sign - "$1"
    fi
  }
  for framework in "$APP"/Frameworks/*.framework "$APP"/PlugIns/*.appex/Frameworks/*.framework; do
    if [ -e "$framework" ]; then sign "$framework"; fi
  done
  sign "$APP/PlugIns/WizardChatWidgets.appex"
  sign "$APP/PlugIns/WizardChatNotifications.appex" WizardChatNotifications/WizardChatNotifications.entitlements
  sign "$APP/PlugIns/WizardChatShare.appex" WizardChatShare/WizardChatShare.entitlements
  sign "$APP" WizardChat/WizardChat.entitlements
  codesign -d --entitlements - "$APP" | grep -q "$APP_GROUP"

  options=Config/ExportOptions.plist
  if [ "$DRY_RUN" = "true" ] || [ "$CI_COMMIT_BRANCH" != "$CI_DEFAULT_BRANCH" ]; then
    options="$apple/ExportOptions.plist"
    plutil -replace destination -string export -o "$options" Config/ExportOptions.plist
  fi
  if xcodebuild -exportArchive -archivePath build/WizardChat.xcarchive -exportOptionsPlist "$options" \
    -exportPath build/export -allowProvisioningUpdates -authenticationKeyPath "$key" \
    -authenticationKeyID "$APPLE_API_KEY" -authenticationKeyIssuerID "$APPLE_API_ISSUER" > "$apple/export.log" 2>&1; then
    cat "$apple/export.log"
  else
    cat "$apple/export.log"
    for log in $(sed -n 's/.*Created bundle at path "\(.*\.xcdistributionlogs\)".*/\1/p' "$apple/export.log"); do
      echo "=== Errors from $log"
      grep -rhiE "error|status code|statusCode|401|403|forbidden|unauthori" "$log" | grep -viE "bearer|authorization:" \
        | tail -n 80 || true
    done
    if grep -qE "Redundant Binary Upload|bundle version must be higher than the previously uploaded" "$apple/export.log"; then
      echo "$VERSION is already on TestFlight, nothing to upload"
    else
      exit 1
    fi
  fi
  rm -f "$key"
else
  xcodebuild -project WizardChat.xcodeproj -scheme WizardChat -configuration Release \
    -destination generic/platform=iOS -derivedDataPath build \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= -quiet build
  APP=build/Build/Products/Release-iphoneos/WizardChat.app
fi

mkdir -p Payload
cp -R "$APP" Payload/
zip -qry "$CI_PROJECT_DIR/target/ios/WizardChat_$VERSION.ipa" Payload
