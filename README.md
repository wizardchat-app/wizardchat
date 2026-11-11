<img src="apps/web/public/assets/images/logo.svg" alt="WizardChat Logo" width="128" />

# WizardChat - Simple, Secure, Magical

[![pipeline status](https://gitlab.com/wizardchat/wizardchat/badges/main/pipeline.svg)](https://gitlab.com/wizardchat/wizardchat/-/pipelines)
[![release](https://img.shields.io/gitlab/v/release/wizardchat/wizardchat?sort=semver&logo=gitlab)](https://gitlab.com/wizardchat/wizardchat/-/releases)
![license](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)
[![chat](https://img.shields.io/matrix/wizardchat-app:matrix.org?logo=matrix)](https://matrix.to/#/#wizardchat-app:matrix.org)

WizardChat is a Matrix client. End-to-end encrypted, open source, and works in your browser, as a desktop app for Windows,
macOS and Linux, and as a native app for iOS and Android. All apps share one Rust core built on matrix-rust-sdk.

<img align="center" src="https://gitlab.com/wizardchat/wizardchat-site/-/raw/main/assets/wizardchat-screenshot.png" height="320">

## Features

- End-to-end encryption, with device verification and key backup
- Direct messages and Spaces
- Voice and video calls (1:1 and group, via MatrixRTC + LiveKit) with screen sharing, push-to-talk and Watch Together
- Threads, replies, reactions, edits and pinned messages
- Advanced message formatting, custom stickers and emojis, GIFs
- File, image and video sharing, voice messages, polls and location sharing
- Link previews and message search
- Typing indicators, read receipts and online status
- Sign in with SSO, OAuth or a QR code
- Multiple accounts
- A range of dark and light themes to choose from
- English and German

## Try out WizardChat

### Web

- **Stable**: [app.wizardchat.org](https://app.wizardchat.org)
- **Next** (pre-release): [next.wizardchat.org](https://next.wizardchat.org)

### Desktop

Windows (installer), macOS (Apple Silicon or Intel, DMG) and Linux (AppImage, `.deb`, `.rpm`, Arch `.pkg.tar.zst` or tarball):
download from [wizardchat.org](https://wizardchat.org) or the
[releases page](https://gitlab.com/wizardchat/wizardchat/-/releases). The app updates itself; the `.deb` and `.rpm` ask
for your password to install an update. The Arch package and the tarball can't, so they open the new release to
download instead.

> **macOS:** the app isn't signed yet, so macOS may block it the first time. Open **System Settings -> Privacy & Security**,
> scroll down to **Security** and click **Allow WizardChat**.

On Arch Linux, install [`wizardchat-bin`](https://aur.archlinux.org/packages/wizardchat-bin) from the AUR with your
AUR helper, which also keeps it up to date:

```sh
yay -S wizardchat-bin
```

<details>
<summary>Build the Arch package yourself (stable or next)</summary>

Stable:

```sh
curl -LO https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop/stable/PKGBUILD
makepkg -si
```

Next (pre-release):

```sh
curl -LO https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop/next/PKGBUILD
makepkg -si
```

Both install as `wizardchat-bin`, so building the other one switches channels. Run it again to update.

</details>

### Android

Not in the stores yet. Every release has an APK (arm64) on the
[releases page](https://gitlab.com/wizardchat/wizardchat/-/releases), in two versions: `WizardChat_<version>_arm64.apk`
gets push notifications through Google's Firebase, `WizardChat_<version>_arm64_foss.apk` has no Google code and no push
notifications yet. Both are signed with the same key, so you can switch between them without losing your data.

With [Obtainium](https://obtainium.imranr.dev) you get updates automatically. Add the app with **Add App** and one of these
URLs:

- **Stable**, with Firebase: `https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop/stable/WizardChat_arm64.apk`
- **Stable**, without Google: `https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop/stable/WizardChat_arm64_foss.apk`
- **Every release, including next** (pre-releases): `https://gitlab.com/wizardchat/wizardchat`, and pick the APK you want
  when Obtainium asks

### iOS

Not in the App Store yet. Every release has an unsigned `.ipa` on the
[releases page](https://gitlab.com/wizardchat/wizardchat/-/releases) for sideloading. With
[SideStore](https://sidestore.io) or [AltStore](https://altstore.io) you can add WizardChat as a source, which also
brings the updates: in **Sources**, tap **+** and add one of these URLs:

- **Stable**: `https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop/stable/sidestore.json`
- **Next** (pre-releases too): `https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop/next/sidestore.json`

Sideloaded with a free Apple account, push notifications, the share sheet and the widgets may not work.

## Local Development

- [Development](docs/DEVELOPMENT.md): setting up, running the apps, checks
- [Building and releasing](docs/BUILDING.md)
- [Working on the codebase](docs/CODEBASE.md): where code goes and the conventions
- [Contributing](CONTRIBUTING.md): reporting bugs, suggesting features and contributing code

### Using Docker

- Just pull the newest docker image from [Gitlab Container Registry](https://gitlab.com/wizardchat/wizardchat/container_registry/)

## License

- **Code:** [AGPL-3.0](LICENSE). Forks and modified versions must stay under the AGPL, and if you host a modified version,
  its users must be able to get the source code.
- **Logo and app icons** (`apps/web/public/assets/images/logo*.svg` and the app icons in `apps/`):
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), © WizardChat. Share and adapt them with attribution,
  under the same license.
- **Name:** the licenses don't cover the WizardChat name. If you publish a fork, please give it its own name and logo so it
  isn't mistaken for the official app.
