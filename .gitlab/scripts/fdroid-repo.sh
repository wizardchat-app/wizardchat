#!/bin/sh
# Builds WizardChat's own F-Droid repository in public/repo for GitLab Pages: this release's Google-free
# APK, the previous stable releases' ones from the package registry, the metadata in packaging/fdroid
# and the store screenshots, signed with the repository key from FDROID_KEYSTORE_BASE64.
set -e

test -n "$FDROID_KEYSTORE_BASE64" && test -n "$FDROID_KEYSTORE_PASSWORD"
REPO_URL="${FDROID_REPO_URL:-$CI_PAGES_URL/repo}"
APP=org.wizardchat.android
KEEP="${FDROID_KEEP:-3}"

rm -rf fdroid
mkdir -p fdroid/repo "fdroid/metadata/$APP/en-US/phoneScreenshots"
sed "s|REPO_URL|$REPO_URL|" packaging/fdroid/config.yml > fdroid/config.yml
chmod 600 fdroid/config.yml
cp packaging/fdroid/$APP.yml fdroid/metadata/
cp apps/android/fastlane/metadata/android/en-US/images/phoneScreenshots/*.png "fdroid/metadata/$APP/en-US/phoneScreenshots/"
cp apps/desktop/src-tauri/icons/icon.png "fdroid/metadata/$APP/en-US/icon.png"
mkdir -p fdroid/repo/icons
cp apps/desktop/src-tauri/icons/icon.png fdroid/repo/icons/icon.png
echo "$FDROID_KEYSTORE_BASE64" | base64 -d > fdroid/keystore.p12
cp target/android/*_arm64_foss.apk fdroid/repo/

# The previous stable releases' APKs, so people can still go back a version
python3 - "$KEEP" <<'PY'
import json, os, sys, urllib.request
keep = int(sys.argv[1]) - 1
api, project, tag = os.environ['CI_API_V4_URL'], os.environ['CI_PROJECT_ID'], os.environ['CI_COMMIT_TAG']
registry = f"{api}/projects/{project}/packages/generic/wizardchat-desktop"
with urllib.request.urlopen(f"{api}/projects/{project}/releases?per_page=50") as response:
    tags = [r['tag_name'] for r in json.load(response)]
older = [t for t in tags if t != tag and '-' not in t]
for old in older:
    if keep <= 0:
        break
    name = f"WizardChat_{old.lstrip('v')}_arm64_foss.apk"
    try:
        urllib.request.urlretrieve(f"{registry}/{old}/{name}", f"fdroid/repo/{name}")
        print(f"added {name}")
        keep -= 1
    except Exception as error:
        print(f"skipped {old}: {error}")
PY

(cd fdroid && . /etc/profile.d/bsenv.sh && "$fdroidserver/fdroid" update --use-date-from-apk)
rm fdroid/keystore.p12

rm -rf public
mkdir -p public
mv fdroid/repo public/repo
