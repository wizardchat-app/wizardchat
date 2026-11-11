#!/bin/sh
# Bumps the version on a prepare/<version> branch, tags it and opens the merge request back to main.
set -e

if ! echo "$VERSION" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+(-next\.[0-9]+)?$'; then
  echo "ERROR: VERSION must match vYY.MM.PATCH or vYY.MM.PATCH-next.N (e.g. v26.5.0, v26.5.0-next.1). Got: $VERSION"
  exit 1
fi

git config --global user.email "ci-bot@gitlab.com"
git config --global user.name "GitLab CI Bot"
git remote set-url origin "https://gitlab-ci-token:${GITLAB_RELEASE_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"

BRANCH="prepare/${VERSION}"
VERSION_BARE="${VERSION#v}"
case "$VERSION" in
  *-next.*) LABELS="release,pre-release" ;;
  *) LABELS="release" ;;
esac
echo "=== Preparing ${VERSION} ==="
git checkout -b "$BRANCH"
npm version "$VERSION_BARE" --no-git-tag-version
if [ "$DRY_RUN" = "true" ]; then
  echo "=== DRY RUN: showing diff, skipping commit + MR ==="
  git diff
  exit 0
fi
git add package.json package-lock.json
git commit -m "chore(release): prepare ${VERSION}"
git push origin "$BRANCH" --force
echo "=== Creating tag ${VERSION} ==="
git tag -f "$VERSION" HEAD
git push origin "$VERSION" --force
curl --silent --fail \
  --request POST \
  --header "PRIVATE-TOKEN: ${GITLAB_RELEASE_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "{
    \"source_branch\": \"${BRANCH}\",
    \"target_branch\": \"main\",
    \"title\": \"chore(release): prepare ${VERSION}\",
    \"description\": \"Bumps \`package.json\` to \`${VERSION_BARE}\`.\",
    \"labels\": \"${LABELS}\",
    \"assignee_id\": ${GITLAB_USER_ID},
    \"remove_source_branch\": true,
    \"squash\": true
  }" \
  "https://${CI_SERVER_HOST}/api/v4/projects/${CI_PROJECT_ID}/merge_requests"
echo "=== MR created for ${VERSION} ==="
