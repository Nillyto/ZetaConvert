#!/usr/bin/env bash
set -euo pipefail
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Please install Docker Desktop."
  exit 1
fi
cp -n .env.sample .env 2>/dev/null || true
docker compose -f docker-compose.yml up --build