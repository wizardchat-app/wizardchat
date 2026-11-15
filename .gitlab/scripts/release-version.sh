#!/bin/sh
# Works out the release from package.json and CHANNEL, checks that it can be released and hands
# RELEASE_TAG and RELEASE_VERSION to the other release jobs. Run on a tag with PKGREL=2 (then 3, ...)
# to rebuild an existing release, for a new Arch package.
set -e

if [ -n "$CI_COMMIT_TAG" ]; then
  if [ "$PKGREL" = "1" ]; then
    echo "ERROR: $CI_COMMIT_TAG is already released. To rebuild its Arch package, run this pipeline with PKGREL=2 (then 3, ...)."
    exit 1
  fi
  VERSION="${CI_COMMIT_TAG#v}"
else
  if [ "$CI_COMMIT_BRANCH" != "$CI_DEFAULT_BRANCH" ]; then
    echo "ERROR: releases are made from $CI_DEFAULT_BRANCH, not $CI_COMMIT_BRANCH."
    exit 1
  fi
  HEAD=$(git ls-remote origin "refs/heads/$CI_DEFAULT_BRANCH" | cut -f1)
  if [ "$HEAD" != "$CI_COMMIT_SHA" ]; then
    echo "ERROR: $CI_COMMIT_SHORT_SHA isn't the latest commit on $CI_DEFAULT_BRANCH. Run the pipeline again on $CI_DEFAULT_BRANCH."
    exit 1
  fi

  BASE=$(node -p "require('./package.json').version")
  if ! echo "$BASE" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "ERROR: the version in package.json must look like 26.12.4, without a suffix. Got: $BASE"
    exit 1
  fi
  TAGS=$(git ls-remote --tags --refs origin | sed 's|.*refs/tags/||')
  if echo "$TAGS" | grep -qFx "v$BASE"; then
    echo "ERROR: v$BASE is already released. Bump the version in package.json to the one you're working on first."
    exit 1
  fi

  case "$CHANNEL" in
    stable) VERSION="$BASE" ;;
    next)
      PATTERN=$(echo "$BASE" | sed 's/\./\\./g')
      LAST=$(echo "$TAGS" | sed -n "s/^v${PATTERN}-next\.\([0-9][0-9]*\)$/\1/p" | sort -n | tail -n 1)
      VERSION="$BASE-next.$((${LAST:-0} + 1))"
      ;;
    *)
      echo "ERROR: CHANNEL must be next or stable. Got: $CHANNEL"
      exit 1
      ;;
  esac
fi

printf 'RELEASE_TAG=v%s\nRELEASE_VERSION=%s\n' "$VERSION" "$VERSION" > release.env
echo "=== Releasing v$VERSION ==="
