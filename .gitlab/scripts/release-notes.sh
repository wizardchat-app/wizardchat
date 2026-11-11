#!/bin/sh
# Writes release-notes.md from the conventional commits since the previous release of the same channel.
set -e

git fetch --tags
git fetch --unshallow || true

case "$CI_COMMIT_TAG" in
  *-next.*) NEXT=true ;;
  *) NEXT=false ;;
esac

if [ "$NEXT" = true ]; then
  PREV_TAG=$(git tag --sort=-version:refname | grep -v "^${CI_COMMIT_TAG}$" | head -n 1 || true)
else
  PREV_TAG=$(git tag --sort=-version:refname | grep -v "^${CI_COMMIT_TAG}$" | grep -v '\-next\.' | head -n 1 || true)
fi
if [ -z "$PREV_TAG" ]; then
  RANGE="${CI_COMMIT_SHA}"
  PREV_LABEL="the beginning of the project"
else
  RANGE="${PREV_TAG}..${CI_COMMIT_TAG}"
  PREV_LABEL="${PREV_TAG}"
fi
COMMITS=$(git log "$RANGE" --pretty=format:"%h %s" --no-merges | grep -viE '^[a-f0-9]+ chore\(release\)' || true)

entry() {
  while IFS= read -r line; do
    SHA=$(echo "$line" | cut -d' ' -f1)
    MSG=$(echo "$line" | cut -d' ' -f2-)
    printf -- "- %s ([%s](https://gitlab.com/%s/-/commit/%s))\n" "$MSG" "$SHA" "$CI_PROJECT_PATH" "$SHA"
  done
}

section() {
  LABEL="$1"
  shift
  LINES=""
  for PREFIX in "$@"; do
    MATCHES=$(echo "$COMMITS" | grep -iE "^[a-f0-9]+ ${PREFIX}" || true)
    if [ -n "$MATCHES" ]; then
      LINES=$(printf '%s\n%s' "$LINES" "$MATCHES")
    fi
  done
  LINES=$(echo "$LINES" | grep -v '^[[:space:]]*$' || true)
  if [ -n "$LINES" ]; then
    printf "\n### %s\n" "$LABEL"
    echo "$LINES" | entry
  fi
}

OTHER=$(echo "$COMMITS" | grep -ivE "^[a-f0-9]+ (feat|fix|perf|refactor|docs|chore|ci|test|build|style|revert)" || true)
{
  if [ "$NEXT" = true ]; then
    printf "## Pre-release %s\n" "$CI_COMMIT_TAG"
    printf "\n> **This is a pre-release.** It may be unstable and is intended for testing purposes.\n"
  else
    printf "## What's Changed\n"
  fi
  printf "\nComparing [%s...%s](https://gitlab.com/%s/-/compare/%s...%s)\n" \
    "$PREV_LABEL" "$CI_COMMIT_TAG" "$CI_PROJECT_PATH" "${PREV_TAG:-}" "$CI_COMMIT_TAG"
  section "New Features" "feat(\([^)]*\))?!?:"
  section "Bug Fixes" "fix(\([^)]*\))?!?:"
  section "Performance" "perf(\([^)]*\))?!?:"
  section "Refactoring" "refactor(\([^)]*\))?!?:"
  section "Documentation" "docs(\([^)]*\))?!?:"
  section "Chores & Internals" "chore(\([^)]*\))?!?:" "ci(\([^)]*\))?!?:" "build(\([^)]*\))?!?:" "test(\([^)]*\))?!?:" "style(\([^)]*\))?!?:"
  section "Reverts" "revert(\([^)]*\))?!?:"
  if [ -n "$OTHER" ]; then
    printf "\n### Other\n"
    echo "$OTHER" | entry
  fi
  printf "\n---\n"
  if [ "$NEXT" = true ]; then
    printf "_Pre-release date: %s_\n" "$(date -u '+%Y-%m-%d')"
  else
    printf "_Released: %s_\n" "$(date -u '+%Y-%m-%d')"
  fi
} > release-notes.md
