# Working on the codebase

## Where code goes

**Features live in the Rust core. Apps only render state and call the core.**

- Anything that talks to Matrix, stores data, encrypts, syncs, decides what a room list or timeline contains, or would
  be the same on every platform goes in `crates/core`.
- An app (`apps/web`, `apps/desktop`, `apps/ios`, `apps/android`) contains only what is platform-specific: UI,
  navigation, OS integration (notifications, keychain, share sheets, CallKit, push) and media capture and playback.
- If an app needs data or an action the core doesn't offer, add it to the core. Never re-implement Matrix logic in an
  app or call a homeserver from app code.

The same goes for everything else that is shared:

| Need                                                  | Use                                                                           | Never                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| Matrix data or actions                                | the core's API (generated bindings)                                           | an SDK in the app, raw HTTP to the homeserver |
| Colours, spacing, radii, sizes, type, motion, shadows | `packages/design-tokens`                                                      | hard-coded values                             |
| User-facing text                                      | `packages/i18n`                                                               | string literals in UI code                    |
| Emoji data                                            | `emojibase-data` on the web, `packages/emoji` on iOS and Android              | a second emoji list                           |
| Icons                                                 | Phosphor: `@phosphor-icons/react` on the web, `packages/icons` on iOS/Android | other icon sets, copied SVGs                  |
| Sounds                                                | `packages/sounds`                                                             | sound files inside an app                     |
| The app version                                       | the root `package.json`                                                       | a version number anywhere else                |

`apps/web` is the reference for which features exist and how they behave. `apps/ios` and `apps/android` are the same
app twice, each with its platform's controls: when you change a screen in one, make the same change in the other.

## Layout

```
crates/
|- core/        matrix-rust-sdk + every feature, no UI
|  |- src/rpc/  the app-facing API, one declaration per method
|  `- examples/ end-to-end runs against a homeserver
|- wasm/        transport: core <-> web app
|- ffi/         transport: core <-> iOS and Android (UniFFI)
`- denoise/     call noise filter (RNNoise): wasm AudioWorklet on web, C ABI in ffi for mobile
packages/       design-tokens, i18n, emoji, icons, sounds
whatsnew/       release notes per version
apps/
|- web/         React web app
|- desktop/     Tauri: the web UI with the core running natively
|- ios/         SwiftUI app
`- android/     Jetpack Compose app
```

## Adding to the core

Apps talk to the core through one entry point, `Rpc::call("Class.method", handle, args, blobs)`, and get pushed state
through `watch...` methods as diffs. Objects (clients, timelines, calls) live in the core and apps hold handles. Errors
carry a stable `code` so the UI can show translated messages.

1. Implement the feature in `crates/core/src/<area>.rs` and return plain serialisable view models, never SDK types.
2. Declare the method in the matching `crates/core/src/rpc/*.rs` file:
   ```rust
   rpc_methods! {
       WizardClient(this: WizardClient) {
           /// Docs end up in every generated API
           call fn sendMessage(room_id: String, body: String) -> () { this.send_message(&room_id, &body).await }
       }
   }
   ```
3. Run `npm run core:types`. It generates the TypeScript, Swift and Kotlin APIs.
4. Use it from the apps. If you change an existing signature, update every app that calls it.

The core has to compile for native targets and for `wasm32-unknown-unknown`; `npm run check` builds both.

## Shared packages

- **Design tokens** (`packages/design-tokens/src`): `base.json` for everything theme-independent, `themes/*.json` for
  each theme's colours. A new colour must go into every theme.
- **Translations** (`packages/i18n/locales/<lang>.json`, i18next format, English is the source): every language has
  the same keys and placeholders. Write a real translation for each language, and reuse existing keys where you can.
- **Icons** (`packages/icons/src/icons.json`): the Phosphor icons and weights the native apps use. Add the one a screen
  needs, with the same icon and weight as the web.
- **Sounds** (`packages/sounds/raw`): lowercase names with digits and underscores only, so Android can use them as
  resources.

## Checking a change

There are no test suites. Build, run `npm run check`, and use the app: the web app in a browser, `npm run desktop`,
`npm run android` on an emulator (it reaches a server on your machine at `http://10.0.2.2:8008`), `npm run ios` in the
simulator. For core changes, also run the example for the area you changed (see [DEVELOPMENT.md](DEVELOPMENT.md)).

## Conventions

- Commit messages follow Conventional Commits, with a scope when the change belongs to one part of the repo:
  `feat(ios):`, `fix(core):`, `chore(ci):`. The release notes are built from them. No AI attribution in commits.
- Comment only where the code can't speak for itself: a non-obvious decision, a constraint, a workaround for an SDK or
  platform quirk. Say why, not what. No commented-out code or leftover TODOs.
- Don't edit generated files (`api.gen.ts`, `Api.gen.swift`, `Api.gen.kt`, `dist/`, `crates/wasm/pkg`); change the
  source and regenerate.
- Never hard-code the iOS team, bundle IDs or app group; they come from `apps/ios/Config/Signing.xcconfig`.
