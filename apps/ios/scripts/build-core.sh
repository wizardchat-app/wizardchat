#!/usr/bin/env bash
# Builds wizardchat-core for iOS: the XCFramework, UniFFI's Swift bindings and the generated
# API (Api.gen.swift). `--debug` builds faster, unoptimised libraries for development; `--device-only` skips the
# simulator (CI only ships the device build).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PKG="$ROOT/apps/ios/WizardChatCore"
OUT="$PKG/build"
PROFILE=release
PROFILE_DIR=release
TARGETS=(aarch64-apple-ios aarch64-apple-ios-sim)
for arg in "$@"; do
  case "$arg" in
    --debug)
      PROFILE=dev
      PROFILE_DIR=debug
      ;;
    --device-only) TARGETS=(aarch64-apple-ios) ;;
  esac
done

cd "$ROOT"
for target in "${TARGETS[@]}"; do
  rustup target add "$target" >/dev/null
  IPHONEOS_DEPLOYMENT_TARGET=18.0 cargo build -p wizardchat-core-ffi --lib --profile "$PROFILE" --target "$target"
done

# The bindings come from the library's metadata, read from a host build
cargo build -p wizardchat-core-ffi --lib
rm -rf "$OUT" && mkdir -p "$OUT/bindings" "$OUT/headers"
cargo run -q -p wizardchat-core-ffi --features bindgen --bin uniffi-bindgen -- \
  generate --library "$ROOT/target/debug/libwizardchat_core_ffi.dylib" --language swift --out-dir "$OUT/bindings"
cp "$OUT/bindings/"*.h "$OUT/headers/"
cp "$OUT/bindings/wizardchat_core_ffiFFI.modulemap" "$OUT/headers/module.modulemap"
cp "$OUT/bindings/wizardchat_core_ffi.swift" "$PKG/Sources/WizardChatCore/Bridge.gen.swift"

rm -rf "$PKG/WizardChatCoreFFI.xcframework"
LIBRARIES=()
for target in "${TARGETS[@]}"; do
  LIBRARIES+=(-library "$ROOT/target/$target/$PROFILE_DIR/libwizardchat_core_ffi.a" -headers "$OUT/headers")
done
xcodebuild -create-xcframework "${LIBRARIES[@]}" -output "$PKG/WizardChatCoreFFI.xcframework" >/dev/null

echo "WizardChatCore is ready ($PROFILE_DIR)"
