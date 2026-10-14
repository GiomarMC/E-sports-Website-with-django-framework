#!/bin/bash
# One-time setup of a fresh Ubuntu server (Azure, Oracle Cloud or any VM).
# Run it as the default user:
#   curl -fsSL https://raw.githubusercontent.com/GiomarMC/E-sports-Website-with-django-framework/main/deploy/setup-server.sh | bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/GiomarMC/E-sports-Website-with-django-framework.git}"
APP_DIR="${APP_DIR:-/opt/esports}"

echo "==> System updates"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git iptables-persistent

echo "==> Swap (small VMs: building the images needs more than 1 GB)"
if [ ! -f /swapfile ] && [ "$(free -m | awk '/Mem:/ {print $2}')" -lt 4000 ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"

echo "==> Firewall: open 80 and 443 (Oracle images only allow SSH)"
# The rules go before the final REJECT of the INPUT chain.
open_port() {
  local proto=$1 port=$2
  sudo iptables -C INPUT -p "$proto" --dport "$port" -j ACCEPT 2>/dev/null && return
  local reject
  reject=$(sudo iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')
  if [ -n "$reject" ]; then
    sudo iptables -I INPUT "$reject" -p "$proto" --dport "$port" -j ACCEPT
  else
    sudo iptables -A INPUT -p "$proto" --dport "$port" -j ACCEPT
  fi
}
open_port tcp 80
open_port tcp 443
open_port udp 443
sudo netfilter-persistent save

echo "==> Code in $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> Daily backup at 03:30"
sudo mkdir -p /var/backups/esports
sudo chown "$USER":"$USER" /var/backups/esports
# (crontab -l fails when there is no crontab yet.)
{ crontab -l 2>/dev/null || true; } | { grep -v 'deploy/backup.sh' || true; } > /tmp/esports-cron
echo "30 3 * * * $APP_DIR/deploy/backup.sh >> /var/backups/esports/backup.log 2>&1" >> /tmp/esports-cron
crontab /tmp/esports-cron
rm /tmp/esports-cron

cat <<EOF

Done. Next steps:
  1. Log out and in again (docker group).
  2. cd $APP_DIR && cp deploy/env.production.example .env && nano .env
  3. ./deploy/deploy.sh
EOF
