#!/bin/sh
# Creates the GitLab release with the notes and the installers.
set -e

if [ "$DRY_RUN" = "true" ]; then
  echo "DRY RUN: GitLab release creation skipped"
  cat release-notes.md
else
  ASSETS=$(cat desktop-assets.json)
  if [ "$ASSETS" != "[]" ]; then set -- --assets-link "$ASSETS"; fi
  release-cli create --name "$RELEASE_NAME $CI_COMMIT_TAG" --tag-name "$CI_COMMIT_TAG" --description "$(cat release-notes.md)" --ref "$CI_COMMIT_SHA" "$@"
fi
