#!/usr/bin/env bash
# Builds wizardchat-core for Android: the native libraries (jniLibs) and UniFFI's Kotlin bindings.
# `--debug` builds faster, unoptimised libraries for development; `--all` adds x86_64 (older
# emulators and Chromebooks) to arm64.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CORE="$ROOT/apps/android/core"
PROFILE=release
PROFILE_ARGS=(--release)
ABIS=(-t arm64-v8a)
for arg in "$@"; do
  case "$arg" in
    --debug) PROFILE=debug; PROFILE_ARGS=() ;;
    --all) ABIS=(-t arm64-v8a -t x86_64) ;;
  esac
done

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK" ]]; then
  for candidate in "$HOME/Library/Android/sdk" /opt/homebrew/share/android-commandlinetools "$HOME/Android/Sdk"; do
    [[ -d "$candidate" ]] && SDK="$candidate" && break
  done
fi
if [[ -z "${ANDROID_NDK_HOME:-}" ]]; then
  ANDROID_NDK_HOME="$(ls -d "$SDK"/ndk/* 2>/dev/null | sort -V | tail -1)"
  export ANDROID_NDK_HOME
fi
[[ -d "${ANDROID_NDK_HOME:-}" ]] || { echo "No Android NDK found; see docs/DEVELOPMENT.md" >&2; exit 1; }

cd "$ROOT"
command -v cargo-ndk >/dev/null || cargo install cargo-ndk --locked
rustup target add aarch64-linux-android x86_64-linux-android >/dev/null

rm -rf "$CORE/src/main/jniLibs"
CARGO_PROFILE_DEV_DEBUG=line-tables-only cargo ndk "${ABIS[@]}" -P 26 -o "$CORE/src/main/jniLibs" \
  build -p wizardchat-core-ffi --lib ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"}

# Debug info makes the library hundreds of MB
"$(ls "$ANDROID_NDK_HOME"/toolchains/llvm/prebuilt/*/bin/llvm-strip | head -1)" --strip-unneeded "$CORE"/src/main/jniLibs/*/*.so

# The bindings come from the metadata in the arm64 library (before stripping), so the core isn't
# built a second time for the host
rm -rf "$CORE/build/generated/uniffi"
cargo run -q -p uniffi-bindgen -- \
  generate --library "$ROOT/target/aarch64-linux-android/$PROFILE/libwizardchat_core_ffi.so" --language kotlin \
  --out-dir "$CORE/build/generated/uniffi" --no-format

echo "WizardChat core for Android is ready ($PROFILE)"
