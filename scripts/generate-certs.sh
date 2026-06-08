#!/usr/bin/env bash
# Optional: create locally-trusted HTTPS certs with mkcert for smoother Office sideloading.
# Requires: brew install mkcert && mkcert -install
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/.certs"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is not installed. Install with: brew install mkcert"
  echo "For Stage 0, the default Vite basic-ssl plugin is enough (self-signed)."
  exit 1
fi

mkdir -p "$CERT_DIR"
mkcert -key-file "$CERT_DIR/localhost-key.pem" -cert-file "$CERT_DIR/localhost.pem" localhost 127.0.0.1 ::1

echo ""
echo "Certs written to $CERT_DIR"
echo ""
echo "If you have not already, trust the mkcert CA (required for Outlook on Mac):"
echo "  mkcert -install"
echo ""
echo "Then restart the dev server: npm run dev"
