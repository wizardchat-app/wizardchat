#!/bin/sh
# Builds the iOS app in apps/ios. With the App Store Connect API key (APPLE_API_KEY, APPLE_API_ISSUER,
# APPLE_API_KEY_P8, Admin role) it archives with automatic signing and, for releases from main that aren't dry runs,
# uploads the archive to TestFlight. Without the key it builds unsigned. Either way it writes the sideloading .ipa.
set -e

VERSION=$(node -p "require('../../package.json').version")
mkdir -p "$CI_PROJECT_DIR/target/ios"

if [ -n "$APPLE_API_KEY_P8" ]; then
  apple="$CI_PROJECT_DIR/.apple"
  mkdir -p "$apple"
  key="$apple/AuthKey.p8"
  printf '%s' "$APPLE_API_KEY_P8" | base64 --decode > "$key"

  keychain="$apple/ios.keychain-db"
  keychain_password=$(openssl rand -hex 16)
  security create-keychain -p "$keychain_password" "$keychain"
  security set-keychain-settings -lut 21600 "$keychain"
  security unlock-keychain -p "$keychain_password" "$keychain"
  security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
  security default-keychain -d user -s "$keychain"

  set -- -allowProvisioningUpdates -authenticationKeyPath "$key" -authenticationKeyID "$APPLE_API_KEY" \
    -authenticationKeyIssuerID "$APPLE_API_ISSUER"
  xcodebuild -project WizardChat.xcodeproj -scheme WizardChat -configuration Release \
    -destination generic/platform=iOS -derivedDataPath build -archivePath build/WizardChat.xcarchive \
    "$@" -quiet archive
  APP=build/WizardChat.xcarchive/Products/Applications/WizardChat.app

  if [ "$DRY_RUN" != "true" ] && [ "$CI_COMMIT_BRANCH" = "$CI_DEFAULT_BRANCH" ]; then
    if xcodebuild -exportArchive -archivePath build/WizardChat.xcarchive \
      -exportOptionsPlist Config/ExportOptions.plist -exportPath build/export "$@" > "$apple/export.log" 2>&1; then
      cat "$apple/export.log"
      echo "Uploaded $VERSION to TestFlight"
    else
      cat "$apple/export.log"
      if grep -qE "Redundant Binary Upload|bundle version must be higher than the previously uploaded" "$apple/export.log"; then
        echo "$VERSION is already on TestFlight, nothing to upload"
      else
        exit 1
      fi
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
