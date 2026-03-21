# API リファレンス

ベース URL: `http://localhost:8080`
フロントエンド経由の場合: `http://localhost`（Nginx が `/api/*` と `/health` をプロキシ）

> **Swagger UI** でインタラクティブに確認・実行することもできます:
> - `http://localhost/swagger-ui.html`（Docker Compose 起動時）
> - `http://localhost:8080/swagger-ui.html`（バックエンド単体起動時）
> - OpenAPI JSON: `http://localhost:8080/v3/api-docs`

---

## 目次

- [キャッシュ API](#キャッシュ-api-apicache)
- [ヘルス API](#ヘルス-api)
- [ロック API](#ロック-api-apilock)
- [Pub/Sub API](#pubsub-api-apipubsub)
- [Rate Limiter API](#rate-limiter-api-apirate-limiter)
- [トランザクション API](#トランザクション-api-apitransaction)
- [Redis CLI API](#redis-cli-api-apicli)

---

## キャッシュ API `/api/cache`

### `GET /api/cache/get/{key}` — キー取得

| パラメータ | 場所 | 型 | 必須 | 説明 |
|-----------|------|------|------|------|
| `key` | path | string | ✓ | Redis キー名 |
| `type` | query | string | — | 型ヒント: `string` / `integer` / `long` / `double` / `boolean` / `map` / `list` |

```bash
curl http://localhost:8080/api/cache/get/demo:greeting
# {"key":"demo:greeting","found":true,"value":"Hello, Redis!"}

curl "http://localhost:8080/api/cache/get/demo:counter?type=integer"
# {"key":"demo:counter","found":true,"value":42}

# 存在しないキー
curl http://localhost:8080/api/cache/get/no-such-key
# {"key":"no-such-key","found":false,"value":null}
```

---

### `GET /api/cache/batch` — 複数キー一括取得

| パラメータ | 場所 | 型 | 必須 | 説明 |
|-----------|------|------|------|------|
| `keys` | query | string | ✓ | カンマ区切りキー一覧 |

```bash
curl "http://localhost:8080/api/cache/batch?keys=demo:greeting,demo:counter,demo:user:alice"
```

```json
{
  "requested": 3,
  "found": 2,
  "results": {
    "demo:greeting": "Hello, Redis!",
    "demo:counter": 42
  }
}
```

> **Note:** HASH / LIST 型など `RBucket` で読めないキーは `results` から除外されます。

---

### `GET /api/cache/search` — キーパターン検索

| パラメータ | 場所 | 型 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `pattern` | query | string | `*` | glob パターン（例: `demo:*`、`user:?` ） |
| `limit` | query | int | `100` | 上限件数（1〜1000 に自動クランプ） |

```bash
curl "http://localhost:8080/api/cache/search?pattern=demo:*&limit=50"
```

```json
{
  "pattern": "demo:*",
  "limit": 50,
  "count": 8,
  "keys": ["demo:greeting", "demo:counter", "..."]
}
```

---

### `POST /api/cache/set/{key}` — キー設定

**リクエストボディ:**

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `value` | any | ✓ | 保存する値（JSON 任意型） |
| `ttl` | number \| string | — | 秒数（数値）または ISO-8601 期間文字列。省略時は 1 時間 |

```bash
# 文字列、TTL 5分
curl -X POST http://localhost:8080/api/cache/set/mykey \
  -H 'Content-Type: application/json' \
  -d '{"value":"hello","ttl":300}'
# {"key":"mykey","success":true,"ttl":"PT5M"}

# オブジェクト、ISO-8601 TTL
curl -X POST http://localhost:8080/api/cache/set/user:1 \
  -H 'Content-Type: application/json' \
  -d '{"value":{"name":"Alice","age":30},"ttl":"PT2H"}'

# 永続化（ttl省略）
curl -X POST http://localhost:8080/api/cache/set/config:global \
  -H 'Content-Type: application/json' \
  -d '{"value":{"maxRetry":3}}'
```

---

### `POST /api/cache/batch` — 複数キー一括設定

```bash
curl -X POST http://localhost:8080/api/cache/batch \
  -H 'Content-Type: application/json' \
  -d '[
    {"key":"k1","value":"v1","ttl":60},
    {"key":"k2","value":{"x":1},"ttl":120},
    {"key":"k3","value":true}
  ]'
# {"total":3,"successful":3,"failed":0}
```

---

### `POST /api/cache/warmup` — キャッシュウォームアップ

指定キーを非同期で先読みします（202 Accepted を即時返却）。

```bash
curl -X POST http://localhost:8080/api/cache/warmup \
  -H 'Content-Type: application/json' \
  -d '["demo:greeting","demo:counter","demo:config"]'
# {"status":"Warmup initiated","keys":3}
```

---

### `DELETE /api/cache/delete/{key}` — キー削除

```bash
curl -X DELETE http://localhost:8080/api/cache/delete/mykey
# {"key":"mykey","deleted":true}

# 存在しないキー
curl -X DELETE http://localhost:8080/api/cache/delete/no-such-key
# {"key":"no-such-key","deleted":false}
```

---

### `GET /api/cache/ttl/{key}` — TTL 取得

```bash
curl http://localhost:8080/api/cache/ttl/demo:greeting
# {"key":"demo:greeting","ttlMs":3540000,"ttlSeconds":3540,"persistent":false}

# 永続キー
curl http://localhost:8080/api/cache/ttl/demo:counter
# {"key":"demo:counter","ttlMs":-1,"ttlSeconds":-1,"persistent":true}

# 存在しないキー → 404
```

---

### `GET /api/cache/ttl-batch` — TTL 一括取得

並列（仮想スレッド）で複数キーの TTL を同時取得します。

```bash
curl "http://localhost:8080/api/cache/ttl-batch?keys=demo:greeting,demo:counter,demo:session:token-abc"
```

```json
{
  "results": {
    "demo:greeting":       {"ttlMs": 3540000, "persistent": false},
    "demo:counter":        {"ttlMs": -1,       "persistent": true},
    "demo:session:token-abc": {"ttlMs": 1200000, "persistent": false}
  }
}
```

---

### `GET /api/cache/type/{key}` — Redis データ型取得

```bash
curl http://localhost:8080/api/cache/type/demo:user:alice
# {"key":"demo:user:alice","type":"OBJECT"}
```

| type 値 | Redis 型 |
|---------|---------|
| `OBJECT` | String / シリアライズオブジェクト |
| `MAP` | Hash |
| `LIST` | List |
| `SET` | Set |
| `ZSET` | Sorted Set |
| `STREAM` | Stream |

> 存在しないキーは **404** を返します。

---

### `GET /api/cache/get-typed/{key}` — 型認識付き値取得

Redis データ型を自動判定し、適切な形式で値を返します。

```bash
curl http://localhost:8080/api/cache/get-typed/demo:user:alice
# {"key":"demo:user:alice","type":"OBJECT","value":{"name":"Alice","role":"admin",...}}

curl http://localhost:8080/api/cache/get-typed/someHash
# {"key":"someHash","type":"MAP","value":{"field1":"val1","field2":"val2"}}

curl http://localhost:8080/api/cache/get-typed/someList
# {"key":"someList","type":"LIST","value":["a","b","c"]}
```

---

### `GET /api/cache/metrics` — キャッシュメトリクス

```bash
curl http://localhost:8080/api/cache/metrics
```

```json
{
  "operations": 1234,
  "redisHits": 987,
  "fallbacks": 5,
  "errors": 2,
  "hitRate": 80
}
```

---

### `POST /api/cache/simulate-error` — エラーシミュレーション

Circuit Breaker のデモ用。`enabled:true` にすると `get` が常に例外を送出します。

```bash
# エラー注入開始
curl -X POST http://localhost:8080/api/cache/simulate-error \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true}'
# {"simulationEnabled":true,"timestamp":...}

# エラー注入停止
curl -X POST http://localhost:8080/api/cache/simulate-error \
  -H 'Content-Type: application/json' \
  -d '{"enabled":false}'
```

---

### `POST /api/cache/reset-circuit-breaker` — Circuit Breaker リセット

CB を CLOSED に強制リセットし、エラーシミュレーションも停止します。

```bash
curl -X POST http://localhost:8080/api/cache/reset-circuit-breaker
# {"reset":true,"state":"CLOSED","timestamp":...}
```

---

## ヘルス API

### `GET /health` — システムヘルスチェック

```bash
curl http://localhost:8080/health
```

```json
{
  "status": "UP",
  "service": "Cache Service",
  "timestamp": "2025-01-01T00:00:00Z",
  "redis": {
    "status": "UP",
    "initialized": true
  },
  "circuitBreakers": {
    "cache-operations": {
      "state": "CLOSED",
      "failureRate": 0.0,
      "slowCallRate": 0.0,
      "numberOfSuccessfulCalls": 150,
      "numberOfFailedCalls": 0,
      "numberOfSlowCalls": 2
    }
  }
}
```

| `redis.status` | HTTP ステータス |
|---------------|--------------|
| `UP` | 200 |
| `DOWN` | 503 |

| CB `state` | 意味 |
|-----------|------|
| `CLOSED` | 正常動作 |
| `OPEN` | 障害遮断中（リクエストを拒否） |
| `HALF_OPEN` | 回復試行中 |

---

## ロック API `/api/lock`

### `GET /api/lock/status` — ロック状態確認

```bash
curl "http://localhost:8080/api/lock/status?lockKey=my-lock"
# {"lockKey":"my-lock","locked":false,"timestamp":...}
```

---

### `POST /api/lock/execute` — ロック付き操作実行

| `operation` | ロック種別 | 説明 |
|-------------|----------|------|
| `cache_update` | 書き込みロック | 指定キーを一括更新 |
| `cache_read` | 読み取りロック | 単一キーを取得 |
| `batch_read` | 読み取りロック | 複数キーを一括取得 |
| `atomic_increment` | 書き込みロック | カウンタをアトミックに加算 |

```bash
# アトミックなカウンタ加算
curl -X POST http://localhost:8080/api/lock/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "lockKey": "counter-lock",
    "operation": "atomic_increment",
    "data": {"counterKey": "demo:counter", "increment": 5}
  }'
# {"key":"demo:counter","value":47}

# 読み取りロック（並列読み取り可能）
curl -X POST http://localhost:8080/api/lock/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "lockKey": "rw-lock",
    "operation": "cache_read",
    "data": {"key": "demo:greeting", "type": "string"}
  }'
# {"key":"demo:greeting","found":true,"value":"Hello, Redis!","type":"string"}
```

---

### `POST /api/lock/acquire-fenced` — フェンストロック付き操作

フェンシングトークン（単調増加 long 値）を使って古いロック保持者の書き込みを排除します。

| `operation` | 説明 |
|-------------|------|
| _(省略)_ | トークン取得のみ |
| `fenced_cache_read` | フェンストで単一キー読み取り |
| `fenced_cache_update` | フェンストで複数キー更新 |
| `fenced_atomic_increment` | フェンストでカウンタ加算 |
| `fenced_conditional_update` | フェンスト＋期待値一致時のみ更新 |
| `fenced_critical_section` | フェンストでクリティカルセクション実行 |

```bash
# トークン取得のみ
curl -X POST http://localhost:8080/api/lock/acquire-fenced \
  -H 'Content-Type: application/json' \
  -d '{"lockKey":"fenced-lock"}'
# {"lockKey":"fenced-lock","acquired":true,"fencingToken":1,"timestamp":...}

# フェンスト条件付き更新
curl -X POST http://localhost:8080/api/lock/acquire-fenced \
  -H 'Content-Type: application/json' \
  -d '{
    "lockKey": "fenced-lock",
    "operation": "fenced_conditional_update",
    "data": {
      "key": "demo:counter",
      "expectedValue": 42,
      "newValue": 100,
      "type": "integer"
    }
  }'
```

---

### `POST /api/lock/release` — ロック強制解除

```bash
curl -X POST http://localhost:8080/api/lock/release \
  -H 'Content-Type: application/json' \
  -d '{"lockKey":"my-lock","force":true}'
# {"lockKey":"my-lock","released":true,"forced":true,"timestamp":...}
```

---

### `POST /api/lock/execute-transaction` — トランザクション付き一括更新

`lockKey` を指定するとロック＋トランザクション、省略するとトランザクションのみで実行します。

```bash
curl -X POST http://localhost:8080/api/lock/execute-transaction \
  -H 'Content-Type: application/json' \
  -d '{
    "lockKey": "tx-lock",
    "updates": {
      "account:alice": 950,
      "account:bob":  1050
    }
  }'
# {"success":true,"updates":2,"lockKey":"tx-lock","timestamp":...}
```

---

### `POST /api/lock/transfer` — 送金トランザクション

分散ロック＋ Redis MULTI/EXEC で残高移動をアトミックに実行します。

```bash
curl -X POST http://localhost:8080/api/lock/transfer \
  -H 'Content-Type: application/json' \
  -d '{"fromKey":"demo:account:alice","toKey":"demo:account:bob","amount":100}'
# {"transferId":"transfer_xxx","success":true,"fromKey":"demo:account:alice","toKey":"demo:account:bob","amount":100.0,...}
```

---

### `POST /api/lock/demo/run` — ロック有無比較デモ

`workers` 台のワーカーが同時にカウンタを更新したときの結果を比較します。

```bash
curl -X POST http://localhost:8080/api/lock/demo/run \
  -H 'Content-Type: application/json' \
  -d '{"workers":4,"initialValue":10}'
```

```json
{
  "withoutLock": {
    "initialValue": 10, "expectedFinal": 14, "actualFinal": 11,
    "lostUpdates": 3,   "correct": false,
    "events": [...]
  },
  "withLock": {
    "initialValue": 10, "expectedFinal": 14, "actualFinal": 14,
    "lostUpdates": 0,   "correct": true,
    "events": [...]
  }
}
```

---

### `GET /api/lock/metrics` — ロックメトリクス

```bash
curl http://localhost:8080/api/lock/metrics
# {"locks":{...},"timestamp":...}
```

---

## Pub/Sub API `/api/pubsub`

### `POST /api/pubsub/publish` — メッセージ発行

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `topic` | string | — | トピック名（省略時: `default`） |
| `message` | string | ✓ | 送信メッセージ |

```bash
curl -X POST http://localhost:8080/api/pubsub/publish \
  -H 'Content-Type: application/json' \
  -d '{"topic":"news","message":"速報: Redis 8.0 リリース"}'
# {"topic":"news","message":"速報: Redis 8.0 リリース","subscribers":1,"timestamp":...}
```

---

### `GET /api/pubsub/subscribe` — SSE ストリーム接続

```bash
# SSE ストリームを受信しながら待機
curl -N http://localhost:8080/api/pubsub/subscribe
# data: {"topic":"news","message":"速報: Redis 8.0 リリース","timestamp":...}
```

- 同時接続上限: **100 接続**（超過時は 503 を返す）
- タイムアウト: **5 分**（接続後メッセージがなければ切断）
- Nginx の `proxy_buffering off` 設定により即時配信

---

## Rate Limiter API `/api/rate-limiter`

### `GET /api/rate-limiter/status` — ステータス取得

```bash
curl http://localhost:8080/api/rate-limiter/status
```

```json
{
  "name": "default",
  "availablePermissions": 98,
  "limitForPeriod": 100,
  "limitRefreshPeriodMs": 1000,
  "timeoutDurationMs": 100
}
```

---

### `POST /api/rate-limiter/flood` — フラッドシミュレーション

`workers` 台が `burstCount` リクエストを同時送信します（`workers` × `burstCount` 件）。

```bash
curl -X POST http://localhost:8080/api/rate-limiter/flood \
  -H 'Content-Type: application/json' \
  -d '{"workers":5,"burstCount":30}'
# {"requested":150,"permitted":100,"rejected":50,"events":[...],"timestamp":...}
```

---

## トランザクション API `/api/transaction`

### `POST /api/transaction/saga` — Saga パターン実行（正常系）

各ステップが順に実行される正常シナリオです。

```bash
curl -X POST http://localhost:8080/api/transaction/saga
```

```json
{
  "steps": [
    {"name":"在庫確認", "status":"SUCCESS", "durationMs":12, "detail":"在庫あり"},
    {"name":"決済",     "status":"SUCCESS", "durationMs":18, "detail":"決済完了"},
    {"name":"配送登録", "status":"SUCCESS", "durationMs": 8, "detail":"伝票発行"}
  ],
  "overallStatus": "SUCCESS",
  "timestamp": ...
}
```

---

### `POST /api/transaction/saga-fail` — 補償トランザクション実行

途中ステップが失敗し、補償関数が逆順に実行されるシナリオです。

```bash
curl -X POST http://localhost:8080/api/transaction/saga-fail
```

```json
{
  "steps": [
    {"name":"在庫確認", "status":"SUCCESS",      "durationMs":10},
    {"name":"決済",     "status":"FAILED",       "durationMs": 5, "detail":"残高不足"},
    {"name":"補償:在庫戻し", "status":"COMPENSATED", "durationMs": 8}
  ],
  "overallStatus": "COMPENSATED",
  "timestamp": ...
}
```

---

## Redis CLI API `/api/cli`

### `POST /api/cli/execute` — コマンド実行

**許可コマンド（ホワイトリスト）:**

| コマンド | 構文例 | 説明 |
|---------|--------|------|
| `GET` | `GET demo:greeting` | 文字列値取得 |
| `SET` | `SET mykey myvalue` | 文字列値設定 |
| `KEYS` | `KEYS demo:*` | パターンマッチング（上限100件） |
| `SCAN` | `SCAN 0` | イテレーティブスキャン（上限100件） |
| `TTL` | `TTL demo:greeting` | TTL 取得（秒） |
| `PTTL` | `PTTL demo:greeting` | TTL 取得（ミリ秒） |
| `TYPE` | `TYPE demo:greeting` | データ型取得 |
| `STRLEN` | `STRLEN demo:greeting` | 文字列長 |
| `LLEN` | `LLEN myList` | リスト長 |
| `HGETALL` | `HGETALL myHash` | ハッシュ全フィールド取得 |
| `SMEMBERS` | `SMEMBERS mySet` | セット全メンバー取得 |
| `ZRANGE` | `ZRANGE myZSet 0 -1` | ソート済みセット取得 |
| `ZCARD` | `ZCARD myZSet` | ソート済みセット件数 |
| `INFO` | `INFO` | サービス情報（簡易） |
| `MEMORY` | `MEMORY` | メモリ情報（簡易） |
| `SLOWLOG` | `SLOWLOG` | スローログ（簡易） |

```bash
# 単一キー取得
curl -X POST http://localhost:8080/api/cli/execute \
  -H 'Content-Type: application/json' \
  -d '{"command":"GET demo:greeting"}'
# {"command":"GET demo:greeting","result":"Hello, Redis!","executionMs":2,...}

# ホワイトリスト外 → 400
curl -X POST http://localhost:8080/api/cli/execute \
  -H 'Content-Type: application/json' \
  -d '{"command":"FLUSHALL"}'
# {"error":"Command not allowed: FLUSHALL",...}
```

---

## エラーレスポンス共通形式

```json
{
  "error": "エラーメッセージ",
  "timestamp": 1700000000000
}
```

| HTTP ステータス | 発生条件 |
|--------------|---------|
| 400 | 必須パラメータ不足、ホワイトリスト外コマンド |
| 404 | キーが存在しない（`/ttl/{key}`、`/type/{key}`） |
| 503 | Redis 接続不可、SSE 接続上限超過 |
| 408 | Redis タイムアウト |
| 500 | その他サーバー内部エラー |
