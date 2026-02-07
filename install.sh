#!/usr/bin/env bash
set -euo pipefail

# Roka -- One-liner VPS installer
# curl -sSL https://raw.githubusercontent.com/arthur-b-renaud/roka/main/install.sh | bash
# curl -sSL https://raw.githubusercontent.com/arthur-b-renaud/roka/main/install.sh | bash -s -- --domain roka.example.com

ROKA_REPO="https://github.com/arthur-b-renaud/roka.git"
INSTALL_DIR="/opt/roka"
DOMAIN=""

# ── Parse flags ──────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      if [[ -z "${2:-}" ]]; then echo "Error: --domain requires a value"; exit 1; fi
      DOMAIN="$2"; shift 2 ;;
    --dir)
      if [[ -z "${2:-}" ]]; then echo "Error: --dir requires a value"; exit 1; fi
      INSTALL_DIR="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: install.sh [--domain <domain>] [--dir <path>]"
      echo "  --domain   Domain name (enables auto-HTTPS) or IP"
      echo "  --dir      Install directory (default: /opt/roka)"
      exit 0 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────
info()  { echo -e "\033[1;34m[roka]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[roka]\033[0m $*"; }
err()   { echo -e "\033[1;31m[roka]\033[0m $*" >&2; }
need()  { command -v "$1" &>/dev/null; }

# ── Banner ───────────────────────────────────────────────────
echo ""
echo "  ┌──────────────────────────────────┐"
echo "  │  Roka -- Sovereign AI Workspace  │"
echo "  │  VPS Installer                   │"
echo "  └──────────────────────────────────┘"
echo ""

# ── Root check ───────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  err "This script must be run as root (or with sudo)."
  exit 1
fi

# ── OS detection ─────────────────────────────────────────────
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="${ID:-unknown}"
else
  OS_ID="unknown"
fi

case "$OS_ID" in
  ubuntu|debian) info "Detected OS: $PRETTY_NAME" ;;
  *)
    err "Detected OS: ${PRETTY_NAME:-$OS_ID}. This script is tested on Ubuntu/Debian."
    err "Continuing anyway -- you may need to install Docker manually."
    ;;
esac

# ── Install Docker if missing ────────────────────────────────
if ! need docker; then
  info "Installing Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg >/dev/null

  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${OS_ID} $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
  systemctl enable --now docker
  ok "Docker installed."
else
  ok "Docker already installed."
fi

# Verify compose plugin
if ! docker compose version &>/dev/null; then
  err "docker compose plugin not found. Install it: https://docs.docker.com/compose/install/"
  exit 1
fi

# ── Install python3 + openssl + git if missing ───────────────
APT_UPDATED=false
for pkg in python3 openssl git; do
  if ! need "$pkg"; then
    if [ "$APT_UPDATED" = false ]; then
      apt-get update -qq
      APT_UPDATED=true
    fi
    info "Installing $pkg..."
    apt-get install -y -qq "$pkg" >/dev/null
  fi
done

# ── Detect domain / IP ───────────────────────────────────────
if [ -z "$DOMAIN" ]; then
  info "No --domain provided. Auto-detecting public IP..."
  DOMAIN=$(curl -4 -sf --max-time 5 ifconfig.me || curl -4 -sf --max-time 5 icanhazip.com || true)
  if [ -z "$DOMAIN" ]; then
    err "Could not detect public IP. Pass --domain <your-domain-or-ip>."
    exit 1
  fi
  info "Detected public IP: $DOMAIN"
fi

# Determine protocol
if echo "$DOMAIN" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  PROTO="http"
  CADDY_HOST=":80"
else
  PROTO="https"
  CADDY_HOST="$DOMAIN"
fi
PUBLIC_URL="${PROTO}://${DOMAIN}"

info "Public URL: $PUBLIC_URL"

# ── Clone repo ───────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Repo exists at $INSTALL_DIR, pulling latest..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning Roka to $INSTALL_DIR..."
  git clone "$ROKA_REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── Generate secrets via setup.sh ────────────────────────────
if [ ! -f infra/.env ]; then
  info "Running setup.sh to generate secrets..."
  export ROKA_DOMAIN="$DOMAIN"
  (cd infra && bash setup.sh)
else
  info "infra/.env already exists, skipping secret generation."
fi

# ── Generate Caddyfile ───────────────────────────────────────
info "Writing infra/Caddyfile..."
cat > infra/Caddyfile <<CADDYEOF
${CADDY_HOST} {
    handle /auth/v1/* {
        reverse_proxy kong:8000
    }
    handle /rest/v1/* {
        reverse_proxy kong:8000
    }
    handle /realtime/v1/* {
        reverse_proxy kong:8000
    }
    handle /storage/v1/* {
        reverse_proxy kong:8000
    }
    handle /pg/* {
        reverse_proxy kong:8000
    }
    handle {
        reverse_proxy frontend:3000
    }
}
CADDYEOF

ok "Caddyfile written for ${CADDY_HOST}"

# ── Firewall (UFW) ───────────────────────────────────────────
if need ufw; then
  info "Configuring firewall (UFW)..."
  ufw allow 22/tcp   >/dev/null 2>&1
  ufw allow 80/tcp   >/dev/null 2>&1
  ufw allow 443/tcp  >/dev/null 2>&1
  ufw --force enable >/dev/null 2>&1
  ok "Firewall enabled: ports 22, 80, 443 open. All others blocked."
else
  info "UFW not found. Installing..."
  apt-get install -y -qq ufw >/dev/null
  ufw allow 22/tcp   >/dev/null 2>&1
  ufw allow 80/tcp   >/dev/null 2>&1
  ufw allow 443/tcp  >/dev/null 2>&1
  ufw --force enable >/dev/null 2>&1
  ok "Firewall installed and enabled: ports 22, 80, 443 open."
fi

# ── Start production stack ───────────────────────────────────
info "Building and starting Roka (this may take a few minutes)..."
(cd infra && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build)

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "  ┌────────────────────────────────────────────────────┐"
echo "  │  Roka is running!                                  │"
echo "  │                                                    │"
echo "  │  Open: $PUBLIC_URL"
echo "  │                                                    │"
echo "  │  The setup wizard will guide you through           │"
echo "  │  creating an account and configuring your LLM.     │"
echo "  └────────────────────────────────────────────────────┘"
echo ""
if [ "$PROTO" = "https" ]; then
  ok "HTTPS enabled via Caddy + Let's Encrypt."
  echo "  Make sure DNS for $DOMAIN points to this server."
else
  info "Running in HTTP mode (IP-based)."
  echo "  For HTTPS, re-run with --domain <your-domain>."
fi
echo ""
ok "Logs:    cd $INSTALL_DIR/infra && docker compose logs -f"
ok "Stop:    cd $INSTALL_DIR/infra && docker compose down"
ok "Backups: POSTGRES_PASSWORD=<see infra/.env> $INSTALL_DIR/infra/backup/backup.sh"
echo ""
