#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

export COMPOSE_PROJECT_NAME="ad-meta-verify-${PPID}"
export AD_META_FRONTEND_PORT="${AD_META_FRONTEND_PORT:-18080}"

cleanup() {
  docker compose down -v
}
trap cleanup EXIT

docker compose config --quiet
docker compose build
docker compose up -d --wait --wait-timeout 1200 mysql stats-worker
docker compose run --rm --no-deps backend python -m app.cli.smoke_statistics_worker
docker compose up -d --wait --wait-timeout 1200 --scale backend=2
curl --fail --silent "http://127.0.0.1:${AD_META_FRONTEND_PORT}/" > /dev/null
