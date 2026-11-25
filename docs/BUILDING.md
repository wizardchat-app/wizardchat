# Building and releasing

| App     | Command                 | Result                                                                   |
| ------- | ----------------------- | ------------------------------------------------------------------------ |
| Web     | `npm run build`         | `apps/web/dist/` (or `docker build -t wizardchat .`)                     |
| Desktop | `npm run desktop:build` | `target/release/bundle/`, for the platform you build on                  |
| iOS     | `npm run ios:build`     | `apps/ios/build/Build/Products/Release-iphoneos/WizardChat.app`          |
| Android | `npm run android:build` | `apps/android/app/build/outputs/apk/gplay/release/app-gplay-release.apk` |

Releases upload to TestFlight from CI. To upload by hand, `npm run ios:release` builds the release core and opens
Xcode: choose **Any iOS Device**, then **Product -> Archive** and **Distribute App**. Raise the version in `package.json` first, since the build
number comes from it and App Store Connect rejects one it already has.

## Releases

`package.json` holds the version being worked on, and releases are made from it:

1. At the start of a version, bump `package.json` to it (`npm version <version> --no-git-tag-version`) and commit it
   as `chore(release): prepare v<version>`.
2. Start a release from **Build -> Pipelines -> Run pipeline** on `main` and pick the **CHANNEL**: `next` releases
   `26.12.4-next.1`, then `-next.2` and so on, counting up from the existing tags; `stable` releases `26.12.4`. It's
   `none` by default, which only runs the checks. Add `DRY_RUN=true` to try a release without publishing.
3. After the stable release, bump `package.json` to the next version.

The pipeline first checks that the commit is the latest on `main` and that the version isn't released yet, then builds
everything. Only when all builds pass does it publish, and the tag is created last, with the GitLab release. The release:

- builds the web app and deploys it, stable to <https://app.wizardchat.org>, next to <https://next.wizardchat.org>
- pushes the Docker image to the container registry
- builds the desktop apps for macOS, Windows and Linux and publishes them with the update feed the installed apps check.
  Linux gets an AppImage, `.deb` and `.rpm`, which install their updates, and a tarball, its `PKGBUILD` (from
  `packaging/aur/wizardchat-bin/`) and the Arch package built from it, which point to the new release instead
  (`apps/desktop/scripts/package-linux.mjs`). Like the web app, stable installs only get stable releases and next
  installs only next ones. The `PKGBUILD` gets `pkgrel=1`; when the package of a release has to change, run the
  pipeline on the release's tag with `PKGREL=2` (then 3, ...), which rebuilds and republishes that release
- repackages the Linux tarball as a Flatpak bundle on the GNOME runtime (`packaging/flatpak/`, x86_64 only), which
  installs the runtime from Flathub and, like the tarball, points to the new release.
- builds two signed Android APKs (arm64) and lists them with the installers, for people who don't use Google Play: the
  `gplay` flavor (`WizardChat_<version>_arm64.apk`) and the `fdroid` flavor without Google code
  (`WizardChat_<version>_arm64_foss.apk`). Both also go to a fixed link per channel
  (`wizardchat-desktop/<channel>/WizardChat_arm64.apk` and `..._foss.apk`), which Obtainium can follow, since it can't
  tell next releases from stable ones on the releases page
- uploads the `gplay` bundle to Google Play (`publish-play` in `.gitlab/ci/mobile.yml`, `.gitlab/scripts/play-upload.py`),
  to the track in `PLAY_TRACK` for the channel (both on `alpha`, closed testing, for now), with fixed release notes
- with a stable release, rebuilds our own F-Droid repository (`.gitlab/ci/fdroid.yml`, `.gitlab/scripts/fdroid-repo.sh`)
  and publishes it on the project's GitLab Pages: the Google-free APK of this and the previous two stable releases, the
  metadata from `packaging/fdroid/` and the store screenshots, signed with the repository key
- archives the iOS app and uploads it to TestFlight (`.gitlab/scripts/build-ios.sh`, `apps/ios/Config/ExportOptions.plist`);
  testers get it once it's added to their TestFlight group
- builds an iOS `.ipa` for sideloading and lists it with the installers. The SideStore / AltStore source
  (`wizardchat-desktop/<channel>/sidestore.json`, from `.gitlab/scripts/sidestore-source.mjs`) lists it with every
  earlier release's: stable releases go to both channels' sources, next releases only to next
- creates the tag and the GitLab release with the notes from the commits and the installers

The "What's new" notes in the apps come from `whatsnew/<version>.md`, with translations in `whatsnew/<version>.<lang>.md`.
Each section starts with a `##` heading. Optional frontmatter sets the release date
shown under the title, which translations inherit from the English file:

```markdown
---
date: 2026-11-01
---

## A section
```

CI needs `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` (the Pages projects `wizardchat` and `wizardchat-next`) and the updater key. The updates are signed with Tauri's updater key, which CI reads from the `TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and `TAURI_UPDATER_PUBKEY` variables. Create it once with
`npx -w @wizardchat/desktop tauri signer generate -w wizardchat-updater.key` and keep it safe: without it, installed
apps can't verify updates any more.

The macOS app is signed with a Developer ID certificate and notarized by Apple, so Gatekeeper opens it without asking.
CI reads the certificate from `APPLE_CERTIFICATE` (the `.p12`, base64) and `APPLE_CERTIFICATE_PASSWORD`, its name from
`APPLE_SIGNING_IDENTITY` (`Developer ID Application: <name> (<team ID>)`, not masked since it can't contain spaces), and
an App Store Connect API key for notarization from `APPLE_API_KEY` (key ID), `APPLE_API_ISSUER` and `APPLE_API_KEY_P8`
(the `.p8`, base64). They're protected variables, so only pipelines of protected branches like `main` and protected tags get them. Without them, the app
is signed ad hoc and macOS asks people to allow it in **System Settings -> Privacy & Security**.

The iOS build signs with the same API key: Xcode's automatic signing with Apple's cloud-managed distribution
certificate, which needs a key with the **Admin** role. It may add an Apple Development certificate to the team now and
then, which can be revoked. Without the key, the iOS build is unsigned and nothing goes to TestFlight.

Android release builds are signed with the key in `apps/android/keystore.properties` (`storeFile`, `storePassword`,
`keyAlias`, `keyPassword`; not committed), and are debug-signed without it. `npm run android:bundle` builds the bundle for
Google Play. In CI, the APK is signed with the same key, from the masked variables `ANDROID_KEYSTORE_BASE64` (the
keystore, `base64 -i wizardchat-release.jks`) and `ANDROID_KEYSTORE_PASSWORD`; the job fails without them.

Google Play re-signs the bundle with its app signing key; ours is the upload key. The Play upload uses a Google Cloud
service account with the Google Play Android Developer API enabled, invited in Play Console under **Users and
permissions** with **Release apps to testing tracks** for WizardChat only. Its JSON key goes base64-encoded into the
masked, protected variable `PLAY_SERVICE_ACCOUNT_JSON_BASE64` (`base64 -i key.json | tr -d '\n'`); without it, the
upload is skipped. Releasing to production needs **Release to production, exclude devices, and use Play App Signing**
and `PLAY_TRACK: production`. To upload without rolling out, run the pipeline with `PLAY_RELEASE_STATUS=draft`.

Both build the `gplay` flavor, which gets push notifications through Firebase. Its config in
`apps/android/app/src/gplay/res/values/firebase.xml` comes from the Firebase project's `google-services.json`. The
`fdroid` flavor has no Google code.

## F-Droid repository

The repository is signed with its own key, separate from the APK's. Create it once and keep it safe: F-Droid remembers
its fingerprint, and a new key means everyone has to add the repository again.

```sh
keytool -genkeypair -keystore wizardchat-fdroid.p12 -storetype PKCS12 -alias wizardchat-fdroid -keyalg RSA \
  -keysize 4096 -validity 10000 -dname "CN=WizardChat F-Droid repository"
```

CI reads it from the masked variables `FDROID_KEYSTORE_BASE64` (`base64 -i wizardchat-fdroid.p12`) and
`FDROID_KEYSTORE_PASSWORD`. It's published on the project's GitLab Pages, at `fdroid.wizardchat.org` once that domain
is added in **Deploy -> Pages**; set `FDROID_REPO_URL` to `https://fdroid.wizardchat.org/repo` then, since the
address is part of the signed index.
