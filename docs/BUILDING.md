# Building and releasing

| App     | Command                 | Result                                                                   |
| ------- | ----------------------- | ------------------------------------------------------------------------ |
| Web     | `npm run build`         | `apps/web/dist/` (or `docker build -t wizardchat .`)                     |
| Desktop | `npm run desktop:build` | `target/release/bundle/`, for the platform you build on                  |
| iOS     | `npm run ios:build`     | `apps/ios/build/Build/Products/Release-iphoneos/WizardChat.app`          |
| Android | `npm run android:build` | `apps/android/app/build/outputs/apk/gplay/release/app-gplay-release.apk` |

For TestFlight and the App Store, `npm run ios:release` builds the release core and opens Xcode: choose **Any iOS
Device**, then **Product -> Archive** and **Distribute App**. Raise the version in `package.json` first, since the build
number comes from it and App Store Connect rejects one it already has.

## Releases

Start a release from **Build -> Pipelines -> Run pipeline** on `main` with the variable `VERSION`: `v26.11.0` for
stable, `v26.11.0-next.1` for next (add `DRY_RUN=true` to try it without publishing). The pipeline bumps the version in
`package.json` on a `prepare/<version>` branch, tags it and opens a merge request to merge back. The tag then:

- builds the web app and deploys it, stable to <https://app.wizardchat.org>, next to <https://next.wizardchat.org>
- pushes the Docker image to the container registry
- builds the desktop apps for macOS, Windows and Linux and publishes them with the update feed the installed apps check.
  Linux gets an AppImage, `.deb` and `.rpm`, which install their updates, and a tarball, its `PKGBUILD` (from
  `packaging/aur/wizardchat-bin/`) and the Arch package built from it, which point to the new release instead
  (`apps/desktop/scripts/package-linux.mjs`). Like the web app, stable installs only get stable releases and next
  installs only next ones. The `PKGBUILD` gets `pkgrel=1`; when the package of a release has to change, run the tag's
  pipeline again with `PKGREL=2` (then 3, ...)
- builds two signed Android APKs (arm64) and lists them with the installers, for people who don't use Google Play: the
  `gplay` flavor (`WizardChat_<version>_arm64.apk`) and the `fdroid` flavor without Google code
  (`WizardChat_<version>_arm64_foss.apk`). Both also go to a fixed link per channel
  (`wizardchat-desktop/<channel>/WizardChat_arm64.apk` and `..._foss.apk`), which Obtainium can follow, since it can't
  tell next releases from stable ones on the releases page
- with a stable release, rebuilds our own F-Droid repository (`.gitlab/ci/fdroid.yml`, `.gitlab/scripts/fdroid-repo.sh`)
  and publishes it on the project's GitLab Pages: the Google-free APK of this and the previous two stable releases, the
  metadata from `packaging/fdroid/` and the store screenshots, signed with the repository key
- builds an unsigned iOS `.ipa` for sideloading and lists it with the installers. The SideStore / AltStore source
  (`wizardchat-desktop/<channel>/sidestore.json`, from `.gitlab/scripts/sidestore-source.mjs`) lists it with every
  earlier release's: stable releases go to both channels' sources, next releases only to next
- creates the GitLab release with the notes from the commits and the installers

The "What's new" notes in the apps come from `whatsnew/<version>.md`, with translations in `whatsnew/<version>.<lang>.md`.
Each section starts with a `##` heading. Optional frontmatter sets the release date
shown under the title, which translations inherit from the English file:

```markdown
---
date: 2026-11-01
---

## A section
```

CI needs `GITLAB_RELEASE_TOKEN` (pushes the branch and tag, opens the merge request), `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` (the Pages projects `wizardchat` and `wizardchat-next`) and the updater key. The updates are signed with Tauri's updater key, which CI reads from the `TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and `TAURI_UPDATER_PUBKEY` variables. Create it once with
`npx -w @wizardchat/desktop tauri signer generate -w wizardchat-updater.key` and keep it safe: without it, installed
apps can't verify updates any more.

Android release builds are signed with the key in `apps/android/keystore.properties` (`storeFile`, `storePassword`,
`keyAlias`, `keyPassword`; not committed), and are debug-signed without it. `npm run android:bundle` builds the bundle for
Google Play. In CI, the APK is signed with the same key, from the masked variables `ANDROID_KEYSTORE_BASE64` (the
keystore, `base64 -i wizardchat-release.jks`) and `ANDROID_KEYSTORE_PASSWORD`; the job fails without them.

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

## GIF search

The GIF pickers search Giphy through a small Cloudflare Worker (`packaging/gif-proxy/worker.js`) at
`https://gifs.wizardchat.org`, which adds the API key from its secret `GIPHY_API_KEY`, so the key isn't in any app.
The web and desktop builds take another address from `GIF_API_URL` (e.g. `GIF_API_URL=https://gifs.example.org npm run
build`); the iOS and Android apps have it in their `GifPicker`.
