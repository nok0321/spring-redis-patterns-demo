#!/usr/bin/env bash
# docker-down.sh — テスト後のクリーンアップ（ボリューム削除なし）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

cd "${PROJECT_ROOT}"

log "=== docker compose down ==="
# --volumes は付けない（redis-data ボリュームを保持）
docker compose down

log "=== クリーンアップ完了 ==="
