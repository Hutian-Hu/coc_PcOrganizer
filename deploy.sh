#!/bin/bash
# Build the site and publish dist/ to the gh-pages branch.
# Uses a separate temporary git repo so the main working tree is never touched.
# Usage: bash deploy.sh
set -e
cd "$(dirname "$0")"
npm run build

ORIGIN=$(git remote get-url origin)
BRANCH=gh-pages
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cp -r dist/* "$TMP"/
touch "$TMP/.nojekyll"
printf 'node_modules/\nserver-data/\n' > "$TMP/.gitignore"

cd "$TMP"
git init -q
git checkout -q -b "$BRANCH"
git add -A
git commit -qm "deploy: $(date '+%Y-%m-%d %H:%M:%S')"
git push -f "$ORIGIN" "$BRANCH"

echo "Deployed to gh-pages. Site: https://clairexin1115.github.io/coc_PcOrganizer/"
