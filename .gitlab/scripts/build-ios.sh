#!/bin/sh
# Builds the iOS app in apps/ios. With IOS_DISTRIBUTION_P12 set, it signs for the App Store with that Apple
# Distribution certificate (.p12, base64; password in IOS_DISTRIBUTION_P12_PASSWORD) and App Store profiles it finds
# or creates through the App Store Connect API key (APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_P8), then uploads
# to TestFlight, or only validates the build on dry runs. Without it, it builds unsigned. Either way it writes the sideloading .ipa.
set -e

VERSION=$(node -p "require('../../package.json').version")
mkdir -p "$CI_PROJECT_DIR/target/ios"

if [ -n "$IOS_DISTRIBUTION_P12" ]; then
  apple="$CI_PROJECT_DIR/.apple"
  mkdir -p "$apple"
  key="$apple/AuthKey_$APPLE_API_KEY.p8"
  printf '%s' "$APPLE_API_KEY_P8" | base64 --decode > "$key"

  keychain="$apple/ios.keychain-db"
  keychain_password=$(openssl rand -hex 16)
  security create-keychain -p "$keychain_password" "$keychain"
  security set-keychain-settings -lut 21600 "$keychain"
  security unlock-keychain -p "$keychain_password" "$keychain"
  curl -fsSL -o "$apple/AppleWWDRCAG3.cer" https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
  security import "$apple/AppleWWDRCAG3.cer" -k "$keychain"
  printf '%s' "$IOS_DISTRIBUTION_P12" | base64 --decode > "$apple/distribution.p12"
  security import "$apple/distribution.p12" -k "$keychain" -P "$IOS_DISTRIBUTION_P12_PASSWORD" -T /usr/bin/codesign
  rm "$apple/distribution.p12"
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" > /dev/null
  security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
  serial=$(security find-certificate -c "Apple Distribution" -p "$keychain" | openssl x509 -noout -serial | cut -d= -f2)
  if [ -z "$serial" ]; then
    echo "ERROR: no Apple Distribution certificate in IOS_DISTRIBUTION_P12 (or a wrong IOS_DISTRIBUTION_P12_PASSWORD)"
    exit 1
  fi
  echo "Signing with the Apple Distribution certificate $serial"

  settings=$(xcodebuild -project WizardChat.xcodeproj -target WizardChat -configuration Release -showBuildSettings)
  APP_GROUP=$(echo "$settings" | sed -n 's/^ *WZ_APP_GROUP = //p')
  PREFIX=$(echo "$settings" | sed -n 's/^ *WZ_BUNDLE_PREFIX = //p')
  node "$CI_PROJECT_DIR/.gitlab/scripts/ios-profiles.mjs" "$key" "$serial" "$apple/profiles" \
    "$PREFIX.ios" "$PREFIX.ios.widgets" "$PREFIX.ios.notifications" "$PREFIX.ios.share"

  options="$apple/ExportOptions.plist"
  cp Config/ExportOptions.plist "$options"
  /usr/libexec/PlistBuddy -c "Add :provisioningProfiles dict" "$options"
  for dir in "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"; do
    mkdir -p "$dir"
  done
  for profile in "$apple"/profiles/*.mobileprovision; do
    security cms -D -i "$profile" > "$apple/profile.plist"
    uuid=$(/usr/libexec/PlistBuddy -c "Print :UUID" "$apple/profile.plist")
    name=$(/usr/libexec/PlistBuddy -c "Print :Name" "$apple/profile.plist")
    cp "$profile" "$HOME/Library/MobileDevice/Provisioning Profiles/$uuid.mobileprovision"
    cp "$profile" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles/$uuid.mobileprovision"
    /usr/libexec/PlistBuddy -c "Add :provisioningProfiles:$(basename "$profile" .mobileprovision) string $name" "$options"
  done

  # Archive unsigned and sign ad hoc with the entitlements; the export signs for the App Store with the profiles
  xcodebuild -project WizardChat.xcodeproj -scheme WizardChat -configuration Release \
    -destination generic/platform=iOS -derivedDataPath build -archivePath build/WizardChat.xcarchive \
    CODE_SIGNING_ALLOWED=NO -quiet archive
  APP=build/WizardChat.xcarchive/Products/Applications/WizardChat.app
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

  xcodebuild -exportArchive -archivePath build/WizardChat.xcarchive -exportOptionsPlist "$options" \
    -exportPath build/export
  IPA=build/export/WizardChat.ipa

  export API_PRIVATE_KEYS_DIR="$apple"
  if [ "$DRY_RUN" = "true" ] || [ "$CI_COMMIT_BRANCH" != "$CI_DEFAULT_BRANCH" ]; then
    xcrun altool --validate-app "$IPA" --api-key "$APPLE_API_KEY" --api-issuer "$APPLE_API_ISSUER"
  elif xcrun altool --upload-package "$IPA" --api-key "$APPLE_API_KEY" --api-issuer "$APPLE_API_ISSUER" \
    > "$apple/upload.log" 2>&1; then
    cat "$apple/upload.log"
    echo "Uploaded $VERSION to TestFlight"
  else
    cat "$apple/upload.log"
    if grep -qE "Redundant Binary Upload|bundle version must be higher than the previously uploaded" "$apple/upload.log"; then
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
