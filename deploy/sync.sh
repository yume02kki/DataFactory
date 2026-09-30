#!/usr/bin/env bash
# Run by datafactory-sync.timer: if the deploy branch moved on GitHub, pull it,
# reinstall dependencies when they changed, and restart the dev server.
# Everything sits in main(), so bash has read the whole file before a pull
# can replace it.
set -euo pipefail
# runuser and friends live in sbin, which a minimal service PATH can miss.
export PATH="$PATH:/usr/local/sbin:/usr/sbin:/sbin"

main() {
  local app_dir="${APP_DIR:?APP_DIR not set}"
  local branch="${BRANCH:-dev}"
  local run_user="${RUN_USER:-ubuntu}"
  as_user() { runuser -u "$run_user" -- "$@"; }

  cd "$app_dir"
  as_user git fetch --quiet origin "$branch"
  local head remote
  head="$(as_user git rev-parse HEAD)"
  remote="$(as_user git rev-parse "origin/$branch")"
  [ "$head" = "$remote" ] && return 0

  echo "Deploying $branch: ${head:0:7} -> ${remote:0:7}"
  local deps_changed=no
  as_user git diff --quiet "$head" "$remote" -- package.json package-lock.json || deps_changed=yes
  as_user git reset --quiet --hard "origin/$branch"
  if [ "$deps_changed" = yes ]; then
    echo "Dependencies changed, running npm ci"
    as_user npm ci --no-audit --no-fund
  fi
  systemctl restart datafactory.service
  echo "Now running: $(as_user git log --oneline -1)"
}

main "$@"
