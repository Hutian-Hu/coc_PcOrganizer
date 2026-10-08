#!/bin/bash
# Build the site and publish dist/ to the gh-pages branch.
# Usage: bash deploy.sh
set -e
cd "$(dirname "$0")"
npm run build
TMP=$(mktemp -d)
cp -r dist/* "$TMP"/
touch "$TMP/.nojekyll"
BRANCH=gh-pages
if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  git checkout "$BRANCH"
else
  git checkout --orphan "$BRANCH"
  git rm -rf . >/dev/null 2>&1 || true
fi
cp -r "$TMP"/. .
git add -A
git commit -qm "deploy: $(date '+%Y-%m-%d %H:%M:%S')" || true
git push origin "$BRANCH"
git checkout main
rm -rf "$TMP"
echo "Deployed to gh-pages. Site: https://clairexin1115.github.io/coc_PcOrganizer/"
