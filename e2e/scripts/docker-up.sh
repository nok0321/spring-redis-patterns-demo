#!/usr/bin/env bash
# docker-up.sh — docker compose build + up -d + ヘルスチェックポーリング
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

BASE_URL="${BASE_URL:-http://localhost}"
HEALTH_URL="${BASE_URL}/health"
TIMEOUT=${HEALTH_TIMEOUT:-120}
INTERVAL=5

log() { echo "[$(date '+%H:%M:%S')] $*"; }

cd "${PROJECT_ROOT}"

log "=== docker compose build ==="
docker compose build

log "=== docker compose up -d ==="
docker compose up -d

log "=== ヘルスチェック待機 (最大 ${TIMEOUT}s) ==="
elapsed=0
until curl -sf "${HEALTH_URL}" | grep -q '"status":"UP"' 2>/dev/null; do
  if [ "${elapsed}" -ge "${TIMEOUT}" ]; then
    log "ERROR: ${TIMEOUT}s 以内にヘルスチェックが通りませんでした"
    docker compose logs --tail=50
    exit 1
  fi
  log "  待機中... (${elapsed}s / ${TIMEOUT}s)"
  sleep "${INTERVAL}"
  elapsed=$((elapsed + INTERVAL))
done

log "=== サービス起動完了 (${elapsed}s) ==="
docker compose ps
