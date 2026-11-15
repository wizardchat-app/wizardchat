#!/bin/sh
# Creates the GitLab release, and with it the tag, with the notes and the installers. Safe to retry: an
# existing release is left as it is.
set -e

if [ "$DRY_RUN" = "true" ]; then
  echo "DRY RUN: GitLab release creation skipped"
  cat release-notes.md
elif release-cli get --tag-name "$RELEASE_TAG" > /dev/null 2>&1; then
  echo "The release $RELEASE_TAG already exists, nothing to do"
else
  ASSETS=$(cat desktop-assets.json)
  if [ "$ASSETS" != "[]" ]; then set -- --assets-link "$ASSETS"; fi
  release-cli create --name "$RELEASE_NAME $RELEASE_TAG" --tag-name "$RELEASE_TAG" --description "$(cat release-notes.md)" --ref "$CI_COMMIT_SHA" "$@"
fi
