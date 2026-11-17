#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../../.." && pwd)"
desktop="$root/apps/desktop"
bundle="$root/target${1:+/$1}/release/bundle"
app=$(ls -d "$bundle"/macos/*.app | head -1)
dmg=$(ls "$bundle"/dmg/*.dmg 2>/dev/null | head -1 || true)
if [ -z "$dmg" ]; then
  version=$(node -p "require('$root/package.json').version")
  case "${1:-$(uname -m)}" in
    *x86_64*) arch=x64 ;;
    *) arch=aarch64 ;;
  esac
  mkdir -p "$bundle/dmg"
  dmg="$bundle/dmg/WizardChat_${version}_${arch}.dmg"
fi

rm -f "$dmg"
"${DMGBUILD:-dmgbuild}" -s "$desktop/scripts/dmg-settings.py" \
  -D app="$app" \
  -D background="$desktop/src-tauri/dmg/background.png" \
  -D volume_icon="$desktop/src-tauri/icons/icon.icns" \
  "WizardChat" "$dmg"
echo "$dmg"
