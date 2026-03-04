#!/bin/bash
# Game Library - One-Line Installer Bootstrap
# Usage: curl -sL https://raw.githubusercontent.com/michaelnid/GameLibrary/main/setup.sh | sudo bash
set -euo pipefail

GITHUB_REPO="michaelnid/GameLibrary"
BRANCH="main"
ARCHIVE_URL="https://github.com/${GITHUB_REPO}/archive/refs/heads/${BRANCH}.tar.gz"
WORK_DIR=$(mktemp -d)

echo "================================================"
echo "  Game Library - Download & Install"
echo "================================================"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "FEHLER: Bitte als root ausfuehren:"
  echo "  curl -sL https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}/setup.sh | sudo bash"
  exit 1
fi

echo "Lade Projektdateien von GitHub (Branch: ${BRANCH})..."
curl -fSL "$ARCHIVE_URL" -o "$WORK_DIR/repo.tar.gz" || {
  echo "FEHLER: Download fehlgeschlagen. Repository erreichbar?"
  rm -rf "$WORK_DIR"
  exit 1
}

echo "Entpacke Archiv..."
cd "$WORK_DIR"
tar -xzf repo.tar.gz
EXTRACTED_DIR=$(ls -d */ | head -n 1)

if [ ! -f "${EXTRACTED_DIR}install.sh" ]; then
  echo "FEHLER: install.sh nicht im Archiv gefunden."
  rm -rf "$WORK_DIR"
  exit 1
fi

cd "$EXTRACTED_DIR"

echo ""
# stdin muss von /dev/tty kommen, da curl|bash stdin belegt
exec bash install.sh < /dev/tty
