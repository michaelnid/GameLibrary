#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/game-library}"
APP_USER="${APP_USER:-gamelibrary}"
SERVICE_NAME="${SERVICE_NAME:-game-library}"
GITHUB_REPO="${GITHUB_REPO:-michaelnid/GameLibrary}"
BRANCH="${UPDATE_BRANCH:-main}"
ARCHIVE_URL="https://github.com/${GITHUB_REPO}/archive/refs/heads/${BRANCH}.tar.gz"
STATE_FILE="${UPDATE_STATE_PATH:-/var/lib/game-library/update-state.json}"
LOG_FILE="${UPDATE_LOG_PATH:-/var/log/game-library-updater.log}"
LOCK_FILE="${UPDATE_LOCK_PATH:-/var/lock/game-library-update.lock}"
HEALTHCHECK_URL="${UPDATE_HEALTHCHECK_URL:-http://127.0.0.1:3001/api/health}"
BACKUP_DIR="${UPDATE_BACKUP_DIR:-/opt/game-library-backups}"

if [ "$EUID" -ne 0 ]; then
  echo "This updater must run as root." >&2
  exit 1
fi

mkdir -p "$(dirname "$STATE_FILE")" "$(dirname "$LOG_FILE")" "$(dirname "$LOCK_FILE")" "$BACKUP_DIR"
touch "$LOG_FILE"
chown root:"$APP_USER" "$LOG_FILE"
chmod 640 "$LOG_FILE"

log() {
  local msg="$1"
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$msg" | tee -a "$LOG_FILE"
}

json_escape() {
  node -e "process.stdout.write(JSON.stringify(process.argv[1]))" "$1"
}

write_state() {
  local status="$1"
  local message="$2"
  local version="${3:-}"
  local pid_value="${4:-}"
  local started="${STARTED_AT:-$(date -u '+%Y-%m-%dT%H:%M:%SZ')}"
  local finished="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  local message_json
  message_json="$(json_escape "$message")"

  local version_field="null"
  if [ -n "$version" ]; then
    version_field="$(json_escape "$version")"
  fi

  local pid_field="null"
  if [ -n "$pid_value" ]; then
    pid_field="$pid_value"
  fi

  cat > "$STATE_FILE" <<STATE
{
  "status": "${status}",
  "message": ${message_json},
  "version": ${version_field},
  "pid": ${pid_field},
  "startedAt": "${started}",
  "finishedAt": "${finished}"
}
STATE

  chown root:"$APP_USER" "$STATE_FILE"
  chmod 640 "$STATE_FILE"
}

STARTED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Update skipped: another update process is running."
  write_state "running" "Ein Update laeuft bereits" "" "$$"
  exit 1
fi

cleanup_dir=""
on_failure() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    log "Update failed (exit $code)."
    write_state "failed" "Update fehlgeschlagen (Exit $code)" ""
  fi
  if [ -n "$cleanup_dir" ] && [ -d "$cleanup_dir" ]; then
    rm -rf "$cleanup_dir"
  fi
  exit "$code"
}
trap on_failure EXIT

write_state "running" "Update wird ausgefuehrt" "" "$$"
log "Starting update process."
log "Downloading from: $ARCHIVE_URL"

cleanup_dir="$(mktemp -d)"
archive_path="$cleanup_dir/update.tar.gz"
extract_dir="$cleanup_dir/extracted"

# Download main branch tarball
curl -fsSL "$ARCHIVE_URL" -o "$archive_path"

mkdir -p "$extract_dir"
tar -xzf "$archive_path" -C "$extract_dir"

# Find extracted directory (named like GameLibrary-main)
REPO_DIR=$(find "$extract_dir" -maxdepth 1 -mindepth 1 -type d | head -n 1)
if [ -z "$REPO_DIR" ] || [ ! -d "$REPO_DIR/backend/src" ]; then
  log "Archive does not contain expected backend/src directory."
  exit 1
fi

# Get version from downloaded package.json
LATEST_VERSION="$(node -e "const p=require('${REPO_DIR}/backend/package.json'); process.stdout.write(p.version || '0.0.0')")"
log "Latest version: $LATEST_VERSION"

# Build frontend
log "Building frontend..."
cd "$REPO_DIR/frontend"
npm install --silent 2>/dev/null
npm run build 2>&1 | tail -5

if [ ! -d "$REPO_DIR/frontend/dist" ]; then
  log "Frontend build failed: no dist/ directory created."
  exit 1
fi
log "Frontend build successful."

# Backup current installation
if [ -d "$APP_DIR/src" ] || [ -d "$APP_DIR/public" ]; then
  backup_file="$BACKUP_DIR/game-library-backup-$(date '+%Y%m%d-%H%M%S').tar.gz"
  tar -czf "$backup_file" -C "$APP_DIR" src public package.json package-lock.json 2>/dev/null || true
  log "Backup written to $backup_file"
fi

# Deploy backend
rm -rf "$APP_DIR/src"
mkdir -p "$APP_DIR/src"
cp -a "$REPO_DIR/backend/src/." "$APP_DIR/src/"

cp -f "$REPO_DIR/backend/package.json" "$APP_DIR/package.json"
if [ -f "$REPO_DIR/backend/package-lock.json" ]; then
  cp -f "$REPO_DIR/backend/package-lock.json" "$APP_DIR/package-lock.json"
fi

# Deploy frontend
rm -rf "$APP_DIR/public"
mkdir -p "$APP_DIR/public"
cp -a "$REPO_DIR/frontend/dist/." "$APP_DIR/public/"

if [ -f "$REPO_DIR/backend/.env.example" ]; then
  cp -f "$REPO_DIR/backend/.env.example" "$APP_DIR/.env.example"
fi

# Update updater script itself
if [ -f "$REPO_DIR/scripts/game-library-updater.sh" ]; then
  install -m 750 -o root -g root "$REPO_DIR/scripts/game-library-updater.sh" /usr/local/bin/game-library-updater
  log "Updater script updated."
fi

# Deploy phpMyAdmin signon script and configure auto-login
if [ -f "$REPO_DIR/scripts/pma-signon.php" ] && [ -d /usr/share/phpmyadmin ]; then
  cp -f "$REPO_DIR/scripts/pma-signon.php" /usr/share/phpmyadmin/signon.php
  chown root:www-data /usr/share/phpmyadmin/signon.php
  chmod 644 /usr/share/phpmyadmin/signon.php

  # Ensure token directory exists
  mkdir -p /var/lib/game-library/pma-tokens
  chown "$APP_USER":www-data /var/lib/game-library/pma-tokens
  chmod 2770 /var/lib/game-library/pma-tokens

  # Configure phpMyAdmin signon auth (idempotent)
  mkdir -p /etc/phpmyadmin/conf.d
  if [ ! -f /etc/phpmyadmin/conf.d/signon.inc.php ]; then
    cat > /etc/phpmyadmin/conf.d/signon.inc.php << 'PMASIGNON'
<?php
$cfg['Servers'][1]['auth_type'] = 'signon';
$cfg['Servers'][1]['SignonSession'] = 'SignonSession';
$cfg['Servers'][1]['SignonURL'] = '/phpmyadmin/signon.php';
PMASIGNON
    log "phpMyAdmin signon config created."
  fi

  # Add Nginx signon location if not present
  NGINX_CONF=$(find /etc/nginx/sites-enabled -type l -o -type f 2>/dev/null | head -n 1)
  if [ -n "$NGINX_CONF" ] && ! grep -q "signon.php" "$NGINX_CONF" 2>/dev/null; then
    PHP_FPM_SOCK_PATH=$(grep -oP 'fastcgi_pass unix:\K[^;]+' "$NGINX_CONF" 2>/dev/null | head -n 1)
    if [ -n "$PHP_FPM_SOCK_PATH" ]; then
      sed -i "/location = \/phpmyadmin {/i\\
    # phpMyAdmin signon - no Basic Auth (token-protected)\\
    location = /phpmyadmin/signon.php {\\
        root /usr/share/;\\
        include snippets/fastcgi-php.conf;\\
        fastcgi_pass unix:${PHP_FPM_SOCK_PATH};\\
        fastcgi_param SCRIPT_FILENAME \\\$document_root\\\$fastcgi_script_name;\\
    }\\
" "$NGINX_CONF"
      nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null
      log "Nginx signon location added."
    fi
  fi

  log "phpMyAdmin signon updated."
fi

log "Installing production dependencies."
cd "$APP_DIR"
npm install --omit=dev --silent

chown -R "$APP_USER:$APP_USER" "$APP_DIR/src" "$APP_DIR/public"
chown "$APP_USER:$APP_USER" "$APP_DIR/package.json"
if [ -f "$APP_DIR/package-lock.json" ]; then
  chown "$APP_USER:$APP_USER" "$APP_DIR/package-lock.json"
fi
find "$APP_DIR/public" -type d -exec chmod 755 {} \;
find "$APP_DIR/public" -type f -exec chmod 644 {} \;

log "Restarting service $SERVICE_NAME."
systemctl restart "$SERVICE_NAME"

health_ok=0
for attempt in $(seq 1 20); do
  if curl -fsSL "$HEALTHCHECK_URL" >/dev/null 2>&1; then
    health_ok=1
    break
  fi
  sleep 1
done

if [ "$health_ok" -ne 1 ]; then
  log "Healthcheck failed: $HEALTHCHECK_URL"
  exit 1
fi

log "Update finished successfully to version $LATEST_VERSION."
write_state "success" "Update erfolgreich abgeschlossen" "$LATEST_VERSION" ""

trap - EXIT
if [ -n "$cleanup_dir" ] && [ -d "$cleanup_dir" ]; then
  rm -rf "$cleanup_dir"
fi
exit 0
