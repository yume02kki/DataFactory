#!/usr/bin/env bash
# Run by datafactory-sync.timer. For each channel (a branch: main -> /, dev -> /dev/),
# if its branch moved on GitHub: pull, reinstall dependencies when they changed,
# build, and swap the new build in. A failing build leaves the site as it was and
# isn't retried until the branch moves again.
#
#   sync.sh              check every channel in $CHANNELS
#   sync.sh --one dev    deploy one channel (used internally)
set -euo pipefail
# git, npm and friends may live in sbin, which a minimal service PATH can miss.
export PATH="$PATH:/usr/local/sbin:/usr/sbin:/sbin"

BASE="${BASE:?BASE not set}"
WWW="${WWW:?WWW not set}"
STATE="$BASE/.state"

deploy_one() {
  local ch="$1" src="$BASE/$1" out="$WWW/$1"
  mkdir -p "$STATE"
  cd "$src"
  git fetch --quiet origin "$ch"
  local remote
  remote="$(git rev-parse "origin/$ch")"
  if [ "$(cat "$STATE/$ch.deployed" 2>/dev/null)" = "$remote" ] && [ -f "$out/index.html" ]; then return 0; fi
  if [ "$(cat "$STATE/$ch.failed" 2>/dev/null)" = "$remote" ]; then return 0; fi

  echo "[$ch] building ${remote:0:7} — $(git log -1 --format=%s "$remote")"
  local before
  before="$(git rev-parse HEAD)"
  git reset --quiet --hard "origin/$ch"
  if [ ! -d node_modules ] || ! git diff --quiet "$before" "$remote" -- package.json package-lock.json; then
    npm ci --no-audit --no-fund --loglevel=error
  fi
  rm -rf dist
  if ! VITE_CHANNEL="$ch" npm run build --silent; then
    echo "$remote" > "$STATE/$ch.failed"
    echo "[$ch] build FAILED for ${remote:0:7}; the site keeps its previous version"
    return 0
  fi
  # Swap the new build in with renames, so visitors never see a half-copied site.
  rm -rf "$out.new" "$out.old"
  cp -r dist "$out.new"
  if [ -d "$out" ]; then mv "$out" "$out.old"; fi
  mv "$out.new" "$out"
  rm -rf "$out.old"
  echo "$remote" > "$STATE/$ch.deployed"
  rm -f "$STATE/$ch.failed"
  echo "[$ch] live: ${remote:0:7}"
}

main() {
  if [ "${1:-}" = "--one" ]; then
    deploy_one "$2"
    return
  fi
  local self status=0
  self="$(readlink -f "$0")"
  for ch in ${CHANNELS:-main dev}; do
    # Each channel runs in its own process so one failing can't stop the others.
    "$self" --one "$ch" || { echo "[$ch] deploy error (exit $?)"; status=1; }
  done
  return $status
}

main "$@"
