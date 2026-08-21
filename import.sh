#!/usr/bin/env bash
# NEXUS v1 import.
#
# Merges the implementation from nexus-v1.bundle into the current repository
# WITHOUT deleting anything. Existing history is preserved; existing files are
# preserved. Where a filename collides, the old version is moved to legacy/
# rather than discarded, and the change is reported.
#
# Usage:  bash import.sh

set -euo pipefail

BUNDLE="nexus-v1.bundle"
TMP_BRANCH="nexus-v1-import"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# --- checks -----------------------------------------------------------------

if [ ! -d .git ]; then
  echo "ERROR: run this from the repository root (no .git here)."; exit 1
fi
if [ ! -f "$BUNDLE" ]; then
  echo "ERROR: $BUNDLE not found in this directory."
  echo "Upload it to the repository root first."; exit 1
fi

say "1/6  Verifying the bundle"
git bundle verify "$BUNDLE"

say "2/6  Recording current state (nothing changed yet)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BEFORE="$(git rev-parse HEAD)"
echo "branch: $CURRENT_BRANCH"
echo "commit: $BEFORE"
echo "A rollback tag is being created in case you want to undo this."
git tag -f pre-nexus-import "$BEFORE" >/dev/null
echo "rollback tag: pre-nexus-import"

say "3/6  Fetching the implementation from the bundle"
git fetch --no-tags "$BUNDLE" "main:$TMP_BRANCH" --force
echo "imported commit: $(git rev-parse --short "$TMP_BRANCH")"

say "4/6  What will be added"
git diff --stat "$CURRENT_BRANCH" "$TMP_BRANCH" | tail -5
echo
echo "top-level entries arriving:"
git ls-tree --name-only "$TMP_BRANCH" | sed 's/^/  /'

say "5/6  Merging (existing history preserved)"
# --allow-unrelated-histories: the implementation was built as a fresh tree.
# --no-commit: pause so collisions can be handled explicitly below.
if git merge --allow-unrelated-histories --no-commit --no-ff "$TMP_BRANCH" 2>/dev/null; then
  echo "Merged cleanly. No filename collisions."
else
  echo "Filename collisions found. Preserving BOTH versions:"
  # Only files that actually conflict are touched.
  CONFLICTS="$(git diff --name-only --diff-filter=U || true)"
  if [ -z "$CONFLICTS" ]; then
    echo "ERROR: merge stopped but no conflicts listed. Stopping so nothing is guessed."
    echo "Run:  git merge --abort"
    exit 1
  fi
  mkdir -p legacy
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    # :2 is the pre-existing version. Saved, never deleted.
    if git show ":2:$file" > /dev/null 2>&1; then
      mkdir -p "legacy/$(dirname "$file")"
      git show ":2:$file" > "legacy/$file"
      echo "  kept old  -> legacy/$file"
    fi
    # :3 is the incoming implementation version, which takes the real path.
    git checkout --theirs -- "$file" 2>/dev/null || git show ":3:$file" > "$file"
    git add "$file"
    echo "  new       -> $file"
  done <<< "$CONFLICTS"
  git add legacy 2>/dev/null || true
fi

git commit -q -m "Import NEXUS v1 implementation

Adds apps/, packages/, docs/ and tools/ from nexus-v1.bundle.
Existing history preserved. Any pre-existing file whose name collided was
moved to legacy/ rather than deleted."

say "6/6  Result"
echo "top-level entries now on $CURRENT_BRANCH:"
git ls-tree --name-only HEAD | sed 's/^/  /'
echo
for d in apps/mobile apps/api packages/core packages/contracts packages/design apps/api/migrations; do
  if [ -d "$d" ]; then echo "  OK       $d"; else echo "  MISSING  $d"; fi
done
echo
echo "commit: $(git rev-parse HEAD)"

# Tidy: the bundle itself should not live in the repository.
git rm -q --cached "$BUNDLE" 2>/dev/null || true
rm -f "$BUNDLE"
git rm -q --cached import.sh 2>/dev/null || true
git commit -q -m "Remove import artifacts" 2>/dev/null || true
git branch -D "$TMP_BRANCH" >/dev/null 2>&1 || true

say "DONE — nothing has been pushed yet"
echo "Review above, then run this to publish:"
echo
echo "    git push"
echo
echo "To undo instead:   git reset --hard pre-nexus-import"
