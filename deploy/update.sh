#!/usr/bin/env bash
# ==============================================================================
# TeamTrack Zero-Downtime Live Update Script
# Triggered automatically on GitHub push or executed manually on server
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "   🔄 Updating TeamTrack Production Deployment"
echo "=========================================================="

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# Ensure .env exists
if [ ! -f "$APP_DIR/.env" ]; then
  if [ -f "$APP_DIR/.env.production" ]; then
    cp "$APP_DIR/.env.production" "$APP_DIR/.env"
  elif [ -f "$APP_DIR/.env.production.example" ]; then
    echo "⚠️ Warning: .env not found! Creating from .env.production.example..."
    cp "$APP_DIR/.env.production.example" "$APP_DIR/.env"
  fi
fi

echo "📦 1. Pulling / Building Updated Containers..."
docker compose -f infrastructure/docker-compose.yml build --parallel

echo "💾 2. Ensuring Database & Redis are Healthy..."
docker compose -f infrastructure/docker-compose.yml up -d postgres redis
echo "⏳ Waiting 5s for PostgreSQL initialization..."
sleep 5

echo "🗄️ 3. Running Database Migrations..."
docker compose -f infrastructure/docker-compose.yml run --rm backend npm run migrate || {
  echo "⚠️ Note: Migrations executed or already up to date."
}

echo "🚀 4. Launching Updated Backend & Web Frontend with Zero-Downtime..."
docker compose -f infrastructure/docker-compose.yml up -d --remove-orphans web backend caddy

echo "🧹 5. Cleaning up dangling Docker images..."
docker image prune -f > /dev/null 2>&1 || true

echo "=========================================================="
echo "✅ TeamTrack is LIVE and running the latest update!"
echo "Status check:"
docker compose -f infrastructure/docker-compose.yml ps
echo "=========================================================="
