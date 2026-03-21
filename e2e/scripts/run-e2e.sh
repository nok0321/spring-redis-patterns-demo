#!/usr/bin/env bash
# run-e2e.sh — E2E テスト全体オーケストレーション
#
# 使い方:
#   ./e2e/scripts/run-e2e.sh           # build + up + test + down
#   SKIP_BUILD=1 ./e2e/scripts/run-e2e.sh  # 起動済み環境でテストのみ
#   SKIP_DOWN=1  ./e2e/scripts/run-e2e.sh  # テスト後に down しない
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${E2E_DIR}/.." && pwd)"

BASE_URL="${BASE_URL:-http://localhost}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_DOWN="${SKIP_DOWN:-0}"
EXIT_CODE=0

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
pass() { echo "[$(date '+%H:%M:%S')] ✓ $*"; }
fail() { echo "[$(date '+%H:%M:%S')] ✗ $*" >&2; }

# ── 1. Docker 起動 ────────────────────────────────────────────────
if [ "${SKIP_BUILD}" = "0" ]; then
  log "=== Phase 1: Docker 起動 ==="
  bash "${SCRIPT_DIR}/docker-up.sh"
else
  log "=== Phase 1: スキップ (SKIP_BUILD=1) ==="
fi

# ── 2. smoke テスト（curl） ────────────────────────────────────────
log "=== Phase 2: Smoke テスト ==="

smoke_check() {
  local label="$1"
  local url="$2"
  local grep_pattern="${3:-}"
  local curl_opts="${4:-}"

  if [ -n "${grep_pattern}" ]; then
    if curl -sf ${curl_opts} "${url}" | grep -q "${grep_pattern}"; then
      pass "${label}"
    else
      fail "${label} — レスポンスに '${grep_pattern}' が含まれません"
      EXIT_CODE=1
    fi
  else
    if curl -sf ${curl_opts} "${url}" > /dev/null; then
      pass "${label}"
    else
      fail "${label} — HTTP エラー"
      EXIT_CODE=1
    fi
  fi
}

smoke_check "GET /health → status=UP"          "${BASE_URL}/health"               '"status":"UP"'
smoke_check "GET /v3/api-docs → OpenAPI JSON"  "${BASE_URL}/v3/api-docs"          "Redis Cache Service API"
smoke_check "GET /swagger-ui.html → 200"       "${BASE_URL}/swagger-ui.html"      "swagger-ui"  "-L"
smoke_check "GET /api/cache/metrics → 200"     "${BASE_URL}/api/cache/metrics"    ""
smoke_check "GET /api/lock/metrics → 200"      "${BASE_URL}/api/lock/metrics"     ""
smoke_check "GET /api/rate-limiter/status → 200" "${BASE_URL}/api/rate-limiter/status" ""

if [ "${EXIT_CODE}" -ne 0 ]; then
  fail "Smoke テスト失敗 — 後続テストをスキップします"
  if [ "${SKIP_DOWN}" = "0" ]; then
    bash "${SCRIPT_DIR}/docker-down.sh"
  fi
  exit "${EXIT_CODE}"
fi

pass "Smoke テスト全件通過"

# ── 3. Playwright E2E ─────────────────────────────────────────────
log "=== Phase 3: Playwright E2E テスト ==="

cd "${E2E_DIR}"

# WSL 環境では Linux 向け Chromium が Ubuntu 26.04 非対応のため、
# cmd.exe 経由で Windows 側の Node.js/Playwright を使用する
run_playwright() {
  if grep -qi microsoft /proc/version 2>/dev/null && command -v cmd.exe &>/dev/null; then
    log "=== WSL 検出: Windows 側 Playwright で実行 ==="
    local win_path tmp_bat win_bat ret
    win_path="$(wslpath -w "${E2E_DIR}")"
    # cmd.exe のクォート問題を回避するため一時バッチファイル経由で実行
    tmp_bat="${E2E_DIR}/.run_playwright_tmp.bat"
    win_bat="$(wslpath -w "${tmp_bat}")"
    printf '@echo off\r\ncd /d %s\r\nnpx playwright test\r\nexit /b %%ERRORLEVEL%%\r\n' \
      "${win_path}" > "${tmp_bat}"
    cmd.exe /c "${win_bat}"
    ret=$?
    rm -f "${tmp_bat}"
    return ${ret}
  else
    log "=== Playwright ブラウザ確認・インストール ==="
    npx playwright install chromium
    npx playwright test
  fi
}

if ! run_playwright; then
  fail "Playwright テスト失敗"
  EXIT_CODE=1
fi

# ── 4. クリーンアップ ──────────────────────────────────────────────
if [ "${SKIP_DOWN}" = "0" ]; then
  log "=== Phase 4: クリーンアップ ==="
  bash "${SCRIPT_DIR}/docker-down.sh"
fi

# ── 5. 結果サマリー ────────────────────────────────────────────────
echo ""
if [ "${EXIT_CODE}" -eq 0 ]; then
  log "=== ✓ 全テスト通過 ==="
else
  log "=== ✗ テスト失敗あり（playwright-report/ を確認してください）==="
fi

exit "${EXIT_CODE}"
