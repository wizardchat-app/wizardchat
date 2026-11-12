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

## Get WizardChat

| Platform              | Get it                                                                |
| --------------------- | --------------------------------------------------------------------- |
| Web                   | [![Open in your browser][b-web]][web]                                 |
| Windows, macOS, Linux | [![Download][b-desktop]][desktop]                                     |
| Android               | [![F-Droid][b-fdroid]][fdroid] [![Obtainium][b-obtainium]][obtainium] |
| iOS                   | [![SideStore or AltStore][b-ios]](#ios)                               |

### Desktop

Download the installer for your system from [wizardchat.org][desktop]: Windows, macOS (Apple Silicon or Intel) and Linux
(AppImage, `.deb` or `.rpm`). On Arch Linux, install [`wizardchat-bin`](https://aur.archlinux.org/packages/wizardchat-bin)
from the AUR:

```sh
yay -S wizardchat-bin
```

> **macOS:** the app isn't signed yet, so macOS may block it the first time. Open **System Settings -> Privacy & Security**,
> scroll down to **Security** and click **Allow WizardChat**.

### Android

Not in the Play Store yet. Install it with one of these, and it stays up to date:

- **F-Droid** (or Droid-ify, Neo Store): open <https://fdroid.wizardchat.org/repo> on your phone, tap the link to add
  our repository, then install WizardChat.
- **[Obtainium](https://obtainium.imranr.dev)**: install Obtainium, then tap [Add to Obtainium][obtainium] on your phone.

This is the version without any Google code. For push notifications it needs a [UnifiedPush](https://unifiedpush.org)
app like [ntfy](https://f-droid.org/packages/io.heckel.ntfy/); WizardChat's notification settings walk you through it.

<details>
<summary>Prefer push through Google's Firebase?</summary>

Install [this version with Obtainium][obtainium-firebase], or download `WizardChat_<version>_arm64.apk` from the
[releases page][releases]. It gets push notifications without an extra app. Both versions are signed with the same key,
so you can switch between them without losing your data.

</details>

### iOS

Not in the App Store yet, but you can sideload it with [SideStore](https://sidestore.io) or
[AltStore](https://altstore.io), which also bring the updates:

1. Install SideStore or AltStore and set it up, following its guide.
2. In **Sources**, tap **+** and add
   `https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop/stable/sidestore.json`
3. Open the WizardChat source and install it.

With a free Apple account, push notifications, the share sheet and widgets may not work. The `.ipa` is also on the
[releases page][releases] if you'd rather install it by hand.

### Pre-releases

<details>
<summary>Try new features early with the <b>next</b> channel</summary>

- **Web**: [next.wizardchat.org](https://next.wizardchat.org)
- **Desktop**: download a release marked as pre-release from the [releases page][releases]. On Arch:

  ```sh
  curl -LO https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop/next/PKGBUILD
  makepkg -si
  ```

- **Android**: [next with Obtainium][obtainium-next] (or [with Firebase][obtainium-next-firebase])
- **iOS**: add `https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop/next/sidestore.json` as a source instead

</details>

[web]: https://app.wizardchat.org
[desktop]: https://wizardchat.org
[fdroid]: https://fdroid.wizardchat.org/repo
[releases]: https://gitlab.com/wizardchat/wizardchat/-/releases
[obtainium]: https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22org.wizardchat.android%22%2C%22url%22%3A%22https%3A%2F%2Fgitlab.com%2Fwizardchat%2Fwizardchat%22%2C%22author%22%3A%22WizardChat%22%2C%22name%22%3A%22WizardChat%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22about%5C%22%3A%5C%22A%20Matrix%20chat%20app%20for%20communities%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22_arm64_foss%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%7D%22%2C%22overrideSource%22%3A%22GitLab%22%7D
[obtainium-firebase]: https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22org.wizardchat.android%22%2C%22url%22%3A%22https%3A%2F%2Fgitlab.com%2Fwizardchat%2Fwizardchat%22%2C%22author%22%3A%22WizardChat%22%2C%22name%22%3A%22WizardChat%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22about%5C%22%3A%5C%22A%20Matrix%20chat%20app%20for%20communities%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22_arm64%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%7D%22%2C%22overrideSource%22%3A%22GitLab%22%7D
[obtainium-next]: https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22org.wizardchat.android%22%2C%22url%22%3A%22https%3A%2F%2Fgitlab.com%2Fwizardchat%2Fwizardchat%22%2C%22author%22%3A%22WizardChat%22%2C%22name%22%3A%22WizardChat%20Next%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22about%5C%22%3A%5C%22A%20Matrix%20chat%20app%20for%20communities%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22_arm64_foss%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%2C%5C%22includePrereleases%5C%22%3Atrue%7D%22%2C%22overrideSource%22%3A%22GitLab%22%7D
[obtainium-next-firebase]: https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22org.wizardchat.android%22%2C%22url%22%3A%22https%3A%2F%2Fgitlab.com%2Fwizardchat%2Fwizardchat%22%2C%22author%22%3A%22WizardChat%22%2C%22name%22%3A%22WizardChat%20Next%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22about%5C%22%3A%5C%22A%20Matrix%20chat%20app%20for%20communities%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22_arm64%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%2C%5C%22includePrereleases%5C%22%3Atrue%7D%22%2C%22overrideSource%22%3A%22GitLab%22%7D
[b-web]: https://img.shields.io/badge/Web-5865F2?style=for-the-badge&logo=firefoxbrowser&logoColor=white
[b-desktop]: https://img.shields.io/badge/Desktop-0078D6?style=for-the-badge&logo=tauri&logoColor=white
[b-fdroid]: https://img.shields.io/badge/F--Droid-1976D2?style=for-the-badge&logo=fdroid&logoColor=white
[b-obtainium]: https://img.shields.io/badge/Obtainium-6750A3?style=for-the-badge
[b-ios]: https://img.shields.io/badge/iOS-000000?style=for-the-badge&logo=apple&logoColor=white

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
