#!/usr/bin/env bash
# One-time setup of the deploy server (Ubuntu). Run it as the user that should
# own the app (it uses sudo for system bits):
#
#   curl -fsSL https://raw.githubusercontent.com/yume02kki/DataFactory/dev/deploy/install.sh | bash
#
# Afterwards the server follows the `dev` branch on its own: every INTERVAL
# seconds it checks GitHub, and when dev has moved it pulls and restarts
# `npm run dev`. No GitHub Actions or webhooks involved.
#
# Settings (environment variables, all optional):
#   BRANCH=dev  APP_DIR=~/DataFactory  PORT=5173  INTERVAL=30
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/yume02kki/DataFactory.git}"
BRANCH="${BRANCH:-dev}"
APP_DIR="${APP_DIR:-$HOME/DataFactory}"
PORT="${PORT:-5173}"
INTERVAL="${INTERVAL:-30}"
RUN_USER="$(id -un)"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

say "Checking git and Node.js"
if ! command -v git >/dev/null; then
  sudo apt-get update -qq && sudo apt-get install -y -qq git
fi
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 20 ]; then
  say "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "node $(node -v), npm $(npm -v)"

say "Getting $BRANCH into $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
  git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
npm ci --no-audit --no-fund
chmod +x deploy/sync.sh
NPM="$(command -v npm)"

say "Installing systemd services"
sudo tee /etc/systemd/system/datafactory.service >/dev/null <<UNIT
[Unit]
Description=DataFactory dev server (npm run dev)
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$APP_DIR
Environment=PATH=$(dirname "$NPM"):/usr/local/bin:/usr/bin:/bin
ExecStart=$NPM run dev -- --host 0.0.0.0 --port $PORT --strictPort
# Lets the app use a port below 1024 (e.g. PORT=80) without running as root.
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/systemd/system/datafactory-sync.service >/dev/null <<UNIT
[Unit]
Description=Pull $BRANCH and restart DataFactory when it changed
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=APP_DIR=$APP_DIR BRANCH=$BRANCH RUN_USER=$RUN_USER
Environment=PATH=$(dirname "$NPM"):/usr/local/bin:/usr/bin:/bin
ExecStart=$APP_DIR/deploy/sync.sh
UNIT

sudo tee /etc/systemd/system/datafactory-sync.timer >/dev/null <<UNIT
[Unit]
Description=Check GitHub for new $BRANCH commits every ${INTERVAL}s

[Timer]
OnBootSec=30s
OnUnitActiveSec=${INTERVAL}s
AccuracySec=1s

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now datafactory.service datafactory-sync.timer
sudo systemctl restart datafactory.service

if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  say "Opening port $PORT in the firewall"
  sudo ufw allow "$PORT/tcp"
fi

IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
say "Done"
echo "App:       http://$IP:$PORT"
echo "Following: $BRANCH (checked every ${INTERVAL}s)"
echo "Logs:      journalctl -u datafactory -f      (dev server)"
echo "           journalctl -u datafactory-sync -f (deploys)"
