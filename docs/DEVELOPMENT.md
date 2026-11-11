# Development

Every command is an `npm run ...` script, run from the repo root; `npm run` lists them all.

## How it fits together

```
                 packages/  design tokens, translations, emoji, icons, sounds
                     |
                     v
crates/core  -->  transport  -->  app
(Rust: all       crates/wasm          apps/web       browser (wasm)
Matrix logic)    Tauri IPC (rpc.rs)   apps/desktop   macOS/Windows/Linux
                 crates/ffi (UniFFI)  apps/ios       iPhone
                                      apps/android   Android
```

`crates/core` does everything that isn't UI: sign-in, sync, encryption, rooms, timelines, calls and settings. The apps
only render what the core pushes to them and call it for actions. `apps/desktop` reuses the web UI, `apps/ios` (SwiftUI)
and `apps/android` (Jetpack Compose) are native. The apps' typed API is generated from the declarations in
`crates/core/src/rpc/`. How the code is organised and what goes where is in [CODEBASE.md](CODEBASE.md).

## Setup

You need Rust via [rustup](https://rustup.rs) (`rust-toolchain.toml` installs the right version and targets),
[wasm-pack](https://rustwasm.github.io/wasm-pack/) and Node 22+. On macOS:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
brew install node wasm-pack
```

Then:

```sh
npm install
npm run core:web:dev
```

For the other apps:

- **Desktop** on Windows and Linux needs [Tauri's system dependencies](https://tauri.app/start/prerequisites/).
- **iOS** needs Xcode (signed in with your Apple ID) and `brew install xcodegen`. The team, bundle IDs and app group come
  from `apps/ios/Config/Signing.xcconfig`. To sign with your own Apple account, copy `Local.example.xcconfig` to
  `Local.xcconfig` next to it and set `WZ_TEAM` and `WZ_BUNDLE_PREFIX`.
- **Android** needs a JDK 17+ and the Android SDK with an NDK, from Android Studio or the command line tools
  (`brew install openjdk@21 && brew install --cask android-commandlinetools`). Point the build at the SDK with
  `sdk.dir=...` in `apps/android/local.properties` and set `JAVA_HOME`.

## Running the apps

| App     | Command           |                                                                         |
| ------- | ----------------- | ----------------------------------------------------------------------- |
| Web     | `npm run dev`     | <http://127.0.0.1:5180>, hot reload                                     |
| Desktop | `npm run desktop` | rebuilds the Rust side when the core changes                            |
| iOS     | `npm run ios`     | builds the core and opens the Xcode project; run it from there          |
| Android | `npm run android` | builds the core and installs the app on the running emulator or a phone |

## After a change

| You changed                            | Web                            | iOS                        | Android                    |
| -------------------------------------- | ------------------------------ | -------------------------- | -------------------------- |
| App code                               | nothing                        | run again in Xcode         | `npm run android:install`  |
| The core (`crates/core`)               | `npm run core:web:dev`, reload | `npm run ios:core`         | `npm run android`          |
| The core's API (`crates/core/src/rpc`) | `npm run core:types` first     | `npm run core:types` first | `npm run core:types` first |
| Translations, tokens, icons, emoji     | nothing                        | `npm run ios`              | `npm run android`          |

Desktop picks up every change by itself. Commit the regenerated API files with the change that caused them.

## Trying the core on its own

The examples in `crates/core/examples` drive the core end to end against a homeserver and create their own throwaway
accounts. They need a server with open registration and sliding sync (Synapse 1.114+), such as a local one:

```sh
WZ_SERVER=http://localhost:8008 cargo run -p wizardchat-core --example smoke
```

`smoke` covers the basics; `account`, `admin`, `calls`, `extras`, `rooms`, `rpc`, `security`, `session` and `timeline`
each cover their area.

## Before you push

```sh
npm run check
```

This runs ESLint, Prettier, the translation check, rustfmt and clippy (native and wasm). A pre-commit hook formats the
files you commit.

The Rust build cache in `target/` grows quickly (tens of GB once you build for several platforms). It's safe to delete
at any time with `cargo clean`.
