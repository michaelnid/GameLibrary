#!/bin/bash
# Game Library - Automated Installer for Debian 12
# Usage: sudo bash install.sh
set -euo pipefail
umask 077

APP_NAME="game-library"
APP_DIR="/opt/$APP_NAME"
APP_USER="gamelibrary"
DOMAIN=""
LETSENCRYPT_EMAIL=""
ENABLE_SSL=false
SSL_READY=false
PHPMYADMIN_USER="dbadmin"

read_env_value() {
  local key="$1"
  grep "^${key}=" "$APP_DIR/.env" | tail -n 1 | cut -d= -f2- || true
}

upsert_env() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$APP_DIR/.env"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$APP_DIR/.env"
  else
    echo "${key}=${value}" >> "$APP_DIR/.env"
  fi
}

echo "================================================"
echo "  Game Library - Installation"
echo "================================================"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
  echo "FEHLER: Bitte als root ausfuehren (sudo bash install.sh)"
  exit 1
fi

# Interactive: IP or Domain
echo "Wie soll die Anwendung erreichbar sein?"
echo ""
echo "  [1] Ueber IP-Adresse (kein DNS noetig, ohne SSL)"
echo "  [2] Ueber Domain (mit Let's Encrypt SSL)"
echo ""
read -r -p "Auswahl (1 oder 2): " ACCESS_MODE

if [ "$ACCESS_MODE" = "2" ]; then
  read -r -p "Domain eingeben (z.B. gamelibrary.example.com): " DOMAIN
  if [ -z "$DOMAIN" ]; then
    echo "FEHLER: Keine Domain eingegeben."
    exit 1
  fi
  if ! [[ "$DOMAIN" =~ ^([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$ ]]; then
    echo "FEHLER: Ungueltige Domain."
    exit 1
  fi

  read -r -p "E-Mail fuer Let's Encrypt (Pflicht): " LETSENCRYPT_EMAIL
  if [ -z "$LETSENCRYPT_EMAIL" ]; then
    echo "FEHLER: Keine E-Mail eingegeben."
    exit 1
  fi
  if ! [[ "$LETSENCRYPT_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
    echo "FEHLER: Ungueltige E-Mail."
    exit 1
  fi

  ENABLE_SSL=true
  echo ""
  echo "  Modus: Domain ($DOMAIN) mit SSL"
else
  DOMAIN=""
  ENABLE_SSL=false
  echo ""
  echo "  Modus: IP-Adresse (ohne SSL)"
fi

echo "  Installationsverzeichnis: $APP_DIR"
echo ""

SERVER_IP=$(hostname -I | awk '{print $1}')
if [ "$ENABLE_SSL" = true ]; then
  DEFAULT_CORS_ORIGIN="https://$DOMAIN"
  DEFAULT_COOKIE_SECURE="true"
else
  DEFAULT_CORS_ORIGIN="http://$SERVER_IP"
  DEFAULT_COOKIE_SECURE="false"
fi

# ---- System Packages ----
echo "[1/11] System-Pakete installieren..."
apt-get update -qq
export DEBIAN_FRONTEND=noninteractive
echo "phpmyadmin phpmyadmin/dbconfig-install boolean false" | debconf-set-selections
echo "phpmyadmin phpmyadmin/reconfigure-webserver multiselect" | debconf-set-selections
apt-get install -y -qq \
  curl gnupg2 nginx mariadb-server \
  php-fpm php-mysql php-mbstring php-zip php-gd php-curl phpmyadmin apache2-utils \
  certbot python3-certbot-nginx \
  > /dev/null 2>&1

# ---- Node.js 20 LTS ----
echo "[2/11] Node.js 20 LTS installieren..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
fi
echo "  Node.js $(node -v) installiert"

# ---- System User ----
echo "[3/11] System-Benutzer erstellen..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -r -s /bin/false "$APP_USER"
fi

# ---- Application Directory ----
echo "[4/11] Anwendung installieren..."
mkdir -p "$APP_DIR"
cp -r backend/* "$APP_DIR/" 2>/dev/null || cp -r ./backend/* "$APP_DIR/"
# Check for pre-built frontend or build from source
FRONTEND_SRC=""
if [ -d "frontend" ]; then
  FRONTEND_SRC="frontend"
elif [ -d "./frontend" ]; then
  FRONTEND_SRC="./frontend"
fi

if [ -d "${FRONTEND_SRC}/dist" ]; then
  # Pre-built dist exists (e.g. from release tar.gz)
  mkdir -p "$APP_DIR/public"
  cp -r "${FRONTEND_SRC}/dist/"* "$APP_DIR/public/"
  echo "  Frontend (vorgefertigt) kopiert"
elif [ -f "${FRONTEND_SRC}/package.json" ]; then
  # Build from source
  echo "  Frontend wird aus Quellcode gebaut..."
  cd "$FRONTEND_SRC"
  npm install --silent 2>/dev/null
  npm run build 2>/dev/null
  if [ -d "dist" ]; then
    mkdir -p "$APP_DIR/public"
    cp -r dist/* "$APP_DIR/public/"
    echo "  Frontend erfolgreich gebaut"
  else
    echo "  WARNUNG: Frontend-Build hat kein dist/ erzeugt"
  fi
  cd - > /dev/null
else
  echo "  WARNUNG: Kein Frontend gefunden. Nur Backend wird installiert."
fi
mkdir -p "$APP_DIR/uploads"

UPDATER_SOURCE="scripts/game-library-updater.sh"
if [ ! -f "$UPDATER_SOURCE" ] && [ -f "./scripts/game-library-updater.sh" ]; then
  UPDATER_SOURCE="./scripts/game-library-updater.sh"
fi
if [ -f "$UPDATER_SOURCE" ]; then
  install -m 750 -o root -g root "$UPDATER_SOURCE" /usr/local/bin/game-library-updater
  echo "  Updater-Skript installiert: /usr/local/bin/game-library-updater"
else
  echo "WARNUNG: Updater-Skript nicht gefunden. Auto-Updates sind deaktiviert."
fi

# ---- Generate Secrets / Env ----
echo "[5/11] Konfiguration generieren..."
DB_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
REFRESH_TOKEN_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ADMIN_PASS=$(openssl rand -base64 18 | tr -d '=/+' | head -c 16)
PHPMYADMIN_PASS=$(openssl rand -base64 20 | tr -d '=/+' | head -c 18)

if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" << EOF
DB_HOST=localhost
DB_PORT=3306
DB_NAME=game_library_db
DB_USER=game_library_user
DB_PASS=$DB_PASS
JWT_SECRET=$JWT_SECRET
REFRESH_TOKEN_SECRET=$REFRESH_TOKEN_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
PORT=3001
NODE_ENV=production
ADMIN_DEFAULT_PASSWORD=$ADMIN_PASS
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=7
ACCESS_COOKIE_NAME=gl_access_token
REFRESH_COOKIE_NAME=gl_refresh_token
COOKIE_SAMESITE=strict
COOKIE_SECURE=$DEFAULT_COOKIE_SECURE
PHPMYADMIN_USER=$PHPMYADMIN_USER
PHPMYADMIN_PASS=$PHPMYADMIN_PASS
TRUST_PROXY=1
CORS_ORIGIN=$DEFAULT_CORS_ORIGIN
UPDATE_VERSION_URL=https://raw.githubusercontent.com/michaelnid/GameLibrary/main/backend/package.json
UPDATE_ALLOWED_HOSTS=api.github.com,github.com,objects.githubusercontent.com,raw.githubusercontent.com
UPDATE_RUNNER_PATH=/usr/local/bin/game-library-updater
UPDATE_USE_SUDO=true
UPDATE_STATE_PATH=/var/lib/game-library/update-state.json
UPDATE_LOG_PATH=/var/log/game-library-updater.log
SERVER_REBOOT_ENABLED=false
SERVER_REBOOT_COMMAND=sudo
SERVER_REBOOT_ARGS=/sbin/reboot
EOF
  echo "  .env erstellt mit generierten Secrets"
else
  echo "  .env existiert bereits, wird weiterverwendet"
fi

# Ensure required values exist
if [ -z "$(read_env_value DB_PASS)" ]; then
  upsert_env "DB_PASS" "$DB_PASS"
fi
if [ -z "$(read_env_value JWT_SECRET)" ]; then
  upsert_env "JWT_SECRET" "$JWT_SECRET"
fi
if [ -z "$(read_env_value REFRESH_TOKEN_SECRET)" ]; then
  upsert_env "REFRESH_TOKEN_SECRET" "$REFRESH_TOKEN_SECRET"
fi
if [ -z "$(read_env_value ENCRYPTION_KEY)" ]; then
  upsert_env "ENCRYPTION_KEY" "$ENCRYPTION_KEY"
fi
if [ -z "$(read_env_value ADMIN_DEFAULT_PASSWORD)" ]; then
  upsert_env "ADMIN_DEFAULT_PASSWORD" "$ADMIN_PASS"
fi
if [ -z "$(read_env_value PHPMYADMIN_USER)" ]; then
  upsert_env "PHPMYADMIN_USER" "$PHPMYADMIN_USER"
fi
if [ -z "$(read_env_value PHPMYADMIN_PASS)" ]; then
  upsert_env "PHPMYADMIN_PASS" "$PHPMYADMIN_PASS"
fi
if [ -z "$(read_env_value TRUST_PROXY)" ]; then
  upsert_env "TRUST_PROXY" "1"
fi
if [ -z "$(read_env_value ACCESS_TOKEN_TTL_MINUTES)" ]; then
  upsert_env "ACCESS_TOKEN_TTL_MINUTES" "15"
fi
if [ -z "$(read_env_value REFRESH_TOKEN_TTL_DAYS)" ]; then
  upsert_env "REFRESH_TOKEN_TTL_DAYS" "7"
fi
if [ -z "$(read_env_value ACCESS_COOKIE_NAME)" ]; then
  upsert_env "ACCESS_COOKIE_NAME" "gl_access_token"
fi
if [ -z "$(read_env_value REFRESH_COOKIE_NAME)" ]; then
  upsert_env "REFRESH_COOKIE_NAME" "gl_refresh_token"
fi
if [ -z "$(read_env_value COOKIE_SAMESITE)" ]; then
  upsert_env "COOKIE_SAMESITE" "strict"
fi
if [ -z "$(read_env_value UPDATE_VERSION_URL)" ]; then
  upsert_env "UPDATE_VERSION_URL" "https://raw.githubusercontent.com/michaelnid/GameLibrary/main/backend/package.json"
fi
if [ -z "$(read_env_value UPDATE_ALLOWED_HOSTS)" ]; then
  upsert_env "UPDATE_ALLOWED_HOSTS" "api.github.com,github.com,objects.githubusercontent.com,raw.githubusercontent.com"
fi
if [ -z "$(read_env_value UPDATE_RUNNER_PATH)" ]; then
  upsert_env "UPDATE_RUNNER_PATH" "/usr/local/bin/game-library-updater"
fi
if [ -z "$(read_env_value UPDATE_USE_SUDO)" ]; then
  upsert_env "UPDATE_USE_SUDO" "true"
fi
if [ -z "$(read_env_value UPDATE_STATE_PATH)" ]; then
  upsert_env "UPDATE_STATE_PATH" "/var/lib/game-library/update-state.json"
fi
if [ -z "$(read_env_value UPDATE_LOG_PATH)" ]; then
  upsert_env "UPDATE_LOG_PATH" "/var/log/game-library-updater.log"
fi
if [ -z "$(read_env_value SERVER_REBOOT_ENABLED)" ]; then
  upsert_env "SERVER_REBOOT_ENABLED" "false"
fi
if [ -z "$(read_env_value SERVER_REBOOT_COMMAND)" ]; then
  upsert_env "SERVER_REBOOT_COMMAND" "sudo"
fi
if [ -z "$(read_env_value SERVER_REBOOT_ARGS)" ]; then
  upsert_env "SERVER_REBOOT_ARGS" "/sbin/reboot"
fi
# Keep mode-sensitive values in sync on every installer run
upsert_env "COOKIE_SECURE" "$DEFAULT_COOKIE_SECURE"
upsert_env "CORS_ORIGIN" "$DEFAULT_CORS_ORIGIN"

DB_NAME=$(read_env_value DB_NAME)
DB_USER_NAME=$(read_env_value DB_USER)
DB_PASS_VALUE=$(read_env_value DB_PASS)
PHPMYADMIN_USER_NAME=$(read_env_value PHPMYADMIN_USER)
PHPMYADMIN_PASS_VALUE=$(read_env_value PHPMYADMIN_PASS)

if ! [[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "FEHLER: DB_NAME enthaelt ungueltige Zeichen (erlaubt: A-Z, a-z, 0-9, _)."
  exit 1
fi
if ! [[ "$DB_USER_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "FEHLER: DB_USER enthaelt ungueltige Zeichen (erlaubt: A-Z, a-z, 0-9, _)."
  exit 1
fi
if ! [[ "$PHPMYADMIN_USER_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "FEHLER: PHPMYADMIN_USER enthaelt ungueltige Zeichen (erlaubt: A-Z, a-z, 0-9, _)."
  exit 1
fi

# ---- MariaDB Setup ----
echo "[6/11] Datenbank einrichten..."
systemctl start mariadb
systemctl enable mariadb > /dev/null 2>&1

mysql -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
mysql -e "CREATE USER IF NOT EXISTS '$DB_USER_NAME'@'localhost' IDENTIFIED BY '$DB_PASS_VALUE';" 2>/dev/null
mysql -e "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER_NAME'@'localhost';" 2>/dev/null
mysql -e "FLUSH PRIVILEGES;" 2>/dev/null
echo "  Datenbank '$DB_NAME' und Benutzer '$DB_USER_NAME' eingerichtet"

# ---- phpMyAdmin Setup ----
echo "[7/11] phpMyAdmin einrichten..."
PHP_FPM_SERVICE=$(systemctl list-unit-files --type=service 2>/dev/null | awk '/^php[0-9]+\.[0-9]+-fpm\.service/{f=$1} END{if(f) print f}') || true
if [ -z "$PHP_FPM_SERVICE" ]; then
  PHP_FPM_SERVICE="php8.2-fpm.service"
fi
systemctl start "$PHP_FPM_SERVICE" > /dev/null 2>&1 || true
systemctl enable "$PHP_FPM_SERVICE" > /dev/null 2>&1 || true

PHP_FPM_SOCK=$(find /run/php -maxdepth 1 -type s -name 'php*-fpm.sock' 2>/dev/null | head -n 1 || true)
if [ -z "$PHP_FPM_SOCK" ]; then
  # Try starting php-fpm first, then look again
  systemctl restart "$PHP_FPM_SERVICE" > /dev/null 2>&1 || true
  sleep 1
  PHP_FPM_SOCK=$(find /run/php -maxdepth 1 -type s -name 'php*-fpm.sock' 2>/dev/null | head -n 1 || true)
fi
if [ -z "$PHP_FPM_SOCK" ]; then
  PHP_FPM_SOCK="/run/php/php8.2-fpm.sock"
fi

mkdir -p /etc/nginx
htpasswd -bc /etc/nginx/.htpasswd-phpmyadmin "$PHPMYADMIN_USER_NAME" "$PHPMYADMIN_PASS_VALUE" > /dev/null 2>&1 || true
chmod 640 /etc/nginx/.htpasswd-phpmyadmin 2>/dev/null || true
chown root:www-data /etc/nginx/.htpasswd-phpmyadmin 2>/dev/null || true

mysql -e "CREATE USER IF NOT EXISTS '$PHPMYADMIN_USER_NAME'@'localhost' IDENTIFIED BY '$PHPMYADMIN_PASS_VALUE';" 2>/dev/null || true
mysql -e "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$PHPMYADMIN_USER_NAME'@'localhost';" 2>/dev/null || true
mysql -e "CREATE DATABASE IF NOT EXISTS phpmyadmin DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || true
if [ -f /usr/share/phpmyadmin/sql/create_tables.sql ]; then
  mysql phpmyadmin < /usr/share/phpmyadmin/sql/create_tables.sql 2>/dev/null || true
fi
mysql -e "GRANT ALL PRIVILEGES ON phpmyadmin.* TO '$PHPMYADMIN_USER_NAME'@'localhost';" 2>/dev/null || true
mysql -e "FLUSH PRIVILEGES;" 2>/dev/null || true

mkdir -p /etc/phpmyadmin
cat > /etc/phpmyadmin/config-db.php << PMACONF
<?php
\$dbuser='$PHPMYADMIN_USER_NAME';
\$dbpass='$PHPMYADMIN_PASS_VALUE';
\$basepath='';
\$dbname='phpmyadmin';
\$dbserver='localhost';
\$dbport='3306';
\$dbtype='mysql';
PMACONF
echo "  phpMyAdmin installiert und mit Basic-Auth gesichert"

# Deploy phpMyAdmin signon script for auto-login from Admin panel
if [ -f "$EXTRACT_DIR/scripts/pma-signon.php" ]; then
  cp "$EXTRACT_DIR/scripts/pma-signon.php" /usr/share/phpmyadmin/signon.php
  chown root:www-data /usr/share/phpmyadmin/signon.php
  chmod 644 /usr/share/phpmyadmin/signon.php
fi

# Create token directory for phpMyAdmin signon
mkdir -p /var/lib/game-library/pma-tokens
chown "$APP_USER":www-data /var/lib/game-library/pma-tokens
chmod 2770 /var/lib/game-library/pma-tokens

# Configure phpMyAdmin for signon auth (auto-login from Admin panel)
cat > /etc/phpmyadmin/conf.d/signon.inc.php << 'PMASIGNON'
<?php
$cfg['Servers'][1]['auth_type'] = 'signon';
$cfg['Servers'][1]['SignonSession'] = 'SignonSession';
$cfg['Servers'][1]['SignonURL'] = '/phpmyadmin/signon.php';
PMASIGNON
echo "  phpMyAdmin Signon-Auth konfiguriert"

# ---- Updater Permissions ----
echo "[8/11] Auto-Update Rechte einrichten..."
mkdir -p /var/lib/game-library
touch /var/log/game-library-updater.log
chown root:"$APP_USER" /var/lib/game-library /var/log/game-library-updater.log
chmod 750 /var/lib/game-library
chmod 640 /var/log/game-library-updater.log

if [ -x /usr/local/bin/game-library-updater ]; then
  cat > /etc/sudoers.d/game-library-updater << EOF
$APP_USER ALL=(root) NOPASSWD: /usr/local/bin/game-library-updater
EOF
  chmod 440 /etc/sudoers.d/game-library-updater
fi

# ---- Install Dependencies ----
echo "[9/11] Node.js Dependencies installieren..."
cd "$APP_DIR"
npm install --omit=dev --silent 2>/dev/null

# Base ownership (backend runtime user owns app files)
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# App root must be traversable so nginx can reach /public assets
chmod 711 "$APP_DIR"

# Keep secrets locked down
chmod 600 "$APP_DIR/.env"

# Static frontend assets must always be readable by nginx
if [ -d "$APP_DIR/public" ]; then
  chown -R "$APP_USER:$APP_USER" "$APP_DIR/public"
  find "$APP_DIR/public" -type d -exec chmod 755 {} \;
  find "$APP_DIR/public" -type f -exec chmod 644 {} \;
fi

# Uploaded avatars are served by backend proxy and stay restricted
if [ -d "$APP_DIR/uploads" ]; then
  chown -R "$APP_USER:$APP_USER" "$APP_DIR/uploads"
  find "$APP_DIR/uploads" -type d -exec chmod 750 {} \;
  find "$APP_DIR/uploads" -type f -exec chmod 640 {} \;
fi

# ---- Systemd Service ----
cat > /etc/systemd/system/$APP_NAME.service << EOF
[Unit]
Description=Game Library Backend
After=network.target mariadb.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=$APP_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_NAME" > /dev/null 2>&1
systemctl restart "$APP_NAME"

# ---- Nginx Configuration ----
echo "[10/11] Nginx konfigurieren..."

SERVER_NAME="_"
if [ -n "$DOMAIN" ]; then
  SERVER_NAME="$DOMAIN"
fi

cat > /etc/nginx/sites-available/$APP_NAME << EOF
server {
    listen 80;
    server_name $SERVER_NAME;

    root $APP_DIR/public;
    index index.html;
    client_max_body_size 55m;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location = /phpmyadmin {
        return 301 /phpmyadmin/;
    }

    # phpMyAdmin signon endpoint - no Basic Auth needed (protected by one-time tokens)
    location = /phpmyadmin/signon.php {
        root /usr/share/;
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:$PHP_FPM_SOCK;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
    }

    location /phpmyadmin/ {
        root /usr/share/;
        index index.php;
        try_files \$uri \$uri/ /phpmyadmin/index.php?\$query_string;
    }

    location ~ ^/phpmyadmin/(.+\\.php)$ {
        root /usr/share/;
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:$PHP_FPM_SOCK;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
}
EOF

ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/$APP_NAME
rm -f /etc/nginx/sites-enabled/default

nginx -t > /dev/null 2>&1
systemctl restart nginx
systemctl enable nginx > /dev/null 2>&1

# ---- SSL (Domain mode) ----
echo "[11/11] SSL-Konfiguration..."
if [ "$ENABLE_SSL" = true ]; then
  if certbot --nginx --non-interactive --agree-tos --redirect -m "$LETSENCRYPT_EMAIL" -d "$DOMAIN"; then
    SSL_READY=true
    echo "  SSL-Zertifikat erfolgreich eingerichtet."
  else
    SSL_READY=false
    echo "  WARNUNG: SSL-Zertifikat konnte nicht eingerichtet werden. HTTPS bleibt deaktiviert."
    echo "  Ursache oft: DNS zeigt noch nicht auf diesen Server oder Port 80 ist blockiert."
  fi
else
  echo "  SSL uebersprungen (IP-Modus)."
fi

echo ""
echo "================================================"
echo "  Installation abgeschlossen!"
echo "================================================"
echo ""
echo "  App URL (IP): http://$(hostname -I | awk '{print $1}')"
if [ -n "$DOMAIN" ]; then
  if [ "$SSL_READY" = true ]; then
    echo "  App URL (Domain): https://$DOMAIN"
    echo "  phpMyAdmin: https://$DOMAIN/phpmyadmin/"
  else
    echo "  App URL (Domain): http://$DOMAIN"
    echo "  phpMyAdmin: http://$DOMAIN/phpmyadmin/"
  fi
else
  echo "  phpMyAdmin: http://$(hostname -I | awk '{print $1}')/phpmyadmin/"
fi
echo ""
echo "  Zugangsdaten werden NICHT im Installer-Output ausgegeben."
echo "  Sie liegen in: $APP_DIR/.env (chmod 600)"
echo ""
echo "  Hilfsbefehle:"
echo "    Admin-Passwort anzeigen: grep '^ADMIN_DEFAULT_PASSWORD=' $APP_DIR/.env"
echo "    phpMyAdmin-Zugang anzeigen: grep '^PHPMYADMIN_' $APP_DIR/.env"
echo "    Service-Status: systemctl status $APP_NAME"
echo "    Service-Neustart: systemctl restart $APP_NAME"
echo "    Logs: journalctl -u $APP_NAME -f"
echo ""
