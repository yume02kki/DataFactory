#!/usr/bin/env bash
# One-time setup of the deploy server (Ubuntu). Run it as the user that should
# own the app (it uses sudo for system bits):
#
#   curl -fsSL https://raw.githubusercontent.com/yume02kki/DataFactory/dev/deploy/install.sh | bash
#
# Serves two sites with nginx, each a production build of its branch:
#   /      the main branch
#   /dev/  the dev branch (with a corner pill naming the commit)
# Every INTERVAL seconds the server checks GitHub and rebuilds whichever branch
# moved. No GitHub Actions or webhooks involved. Safe to run again.
#
# Settings (environment variables, all optional):
#   BASE=~/datafactory  WWW=/var/www/datafactory  PORT=80  INTERVAL=30
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/yume02kki/DataFactory.git}"
BASE="${BASE:-$HOME/datafactory}"
WWW="${WWW:-/var/www/datafactory}"
PORT="${PORT:-80}"
INTERVAL="${INTERVAL:-30}"
CHANNELS="main dev"
RUN_USER="$(id -un)"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

say "Checking git, Node.js and nginx"
missing=()
command -v git >/dev/null || missing+=(git)
command -v nginx >/dev/null || missing+=(nginx)
if [ ${#missing[@]} -gt 0 ]; then
  sudo apt-get update -qq && sudo apt-get install -y -qq "${missing[@]}"
fi
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "node $(node -v), npm $(npm -v), $(nginx -v 2>&1)"

say "Retiring the old single-site setup (npm run dev on :$PORT), if present"
if systemctl list-unit-files datafactory.service >/dev/null 2>&1 && [ -f /etc/systemd/system/datafactory.service ]; then
  sudo systemctl disable --now datafactory.service || true
  sudo rm -f /etc/systemd/system/datafactory.service
fi

say "Getting the branches into $BASE"
mkdir -p "$BASE"
for ch in $CHANNELS; do
  if [ -d "$BASE/$ch/.git" ]; then
    git -C "$BASE/$ch" fetch --quiet origin "$ch"
  else
    git clone --quiet --branch "$ch" "$REPO_URL" "$BASE/$ch"
  fi
done
sudo mkdir -p "$WWW"
sudo chown "$RUN_USER": "$WWW"

say "Configuring nginx: / -> main, /dev/ -> dev"
sudo tee /etc/nginx/sites-available/datafactory >/dev/null <<NGINX
server {
    listen $PORT default_server;
    listen [::]:$PORT default_server;
    server_name _;
    root $WWW/main;
    index index.html;

    # Browsers revalidate each file (cheap: ETags), so a new build shows up on reload.
    add_header Cache-Control "no-cache";

    location = /dev { return 301 /dev/; }
    location /dev/ {
        alias $WWW/dev/;
        index index.html;
    }
    location / {
        try_files \$uri \$uri/ =404;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/datafactory /etc/nginx/sites-enabled/datafactory
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

say "Installing the sync timer"
NPM="$(command -v npm)"
sudo tee /etc/systemd/system/datafactory-sync.service >/dev/null <<UNIT
[Unit]
Description=Rebuild DataFactory sites whose branch changed (main -> /, dev -> /dev/)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$RUN_USER
Environment=BASE=$BASE WWW=$WWW CHANNELS="$CHANNELS"
Environment=PATH=$(dirname "$NPM"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$BASE/dev/deploy/sync.sh
UNIT
sudo tee /etc/systemd/system/datafactory-sync.timer >/dev/null <<UNIT
[Unit]
Description=Check GitHub for new DataFactory commits every ${INTERVAL}s

[Timer]
OnBootSec=30s
OnUnitActiveSec=${INTERVAL}s
AccuracySec=1s

[Install]
WantedBy=timers.target
UNIT
sudo systemctl daemon-reload

say "Building both sites for the first time (a minute or two)"
git -C "$BASE/dev" reset --quiet --hard origin/dev
chmod +x "$BASE/dev/deploy/sync.sh"
sudo systemctl start datafactory-sync.service || true
journalctl -u datafactory-sync -n 30 --no-pager -o cat || true
sudo systemctl enable --now datafactory-sync.timer

if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow "$PORT/tcp"
fi

IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
HOST="http://$IP$([ "$PORT" = 80 ] || echo ":$PORT")"
say "Done"
echo "main:  $HOST/"
echo "dev:   $HOST/dev/"
echo "Deploy log: journalctl -u datafactory-sync -f"
