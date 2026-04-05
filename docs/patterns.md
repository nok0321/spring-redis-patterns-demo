# 実装パターン解説

各パターンの内部動作・設定値・デモ手順を説明します。

---

## 目次

1. [マルチレイヤキャッシュ](#1-マルチレイヤキャッシュ)
2. [Circuit Breaker](#2-circuit-breaker)
3. [Retry（指数バックオフ）](#3-retry指数バックオフ)
4. [Rate Limiter](#4-rate-limiter)
5. [分散ロック](#5-分散ロック)
6. [トランザクション](#6-トランザクション)
7. [Saga / 補償トランザクション](#7-saga--補償トランザクション)
8. [Pub/Sub + SSE](#8-pubsub--sse)

---

## 1. マルチレイヤキャッシュ

**実装クラス:** `ResilientCacheService`

### 動作フロー

```
GET リクエスト
     │
  ┌──▼──────────────────┐
  │  Circuit Breaker     │  OPEN → ④ Fallback へ直行
  └──┬──────────────────┘
     │ CLOSED / HALF-OPEN
  ┌──▼──────────────────┐
  │  Retry (最大3回)     │  例外発生 → 指数バックオフ後にリトライ
  └──┬──────────────────┘
     │
  ┌──▼──────────────────┐
  │  Redis (Primary)     │  ヒット → ② 返却
  └──┬──────────────────┘  ミス  → ③ Fallback 関数を呼び出して返却
     │
① キャッシュミスまたは障害
     │
  ④ Fallback（Optional.empty() または呼び出し元指定の関数）
```

### 非同期書き込み

`setAsync()` は Java 21 仮想スレッドで実行されるため、呼び出し元をブロックしません。
バッチ書き込みでは `CompletableFuture.allOf()` で全件を並列実行します。

```java
// 内部実装イメージ
CompletableFuture<Boolean> future = CompletableFuture.supplyAsync(() -> {
    bucket.set(value, ttl.toMillis(), TimeUnit.MILLISECONDS);
    return true;
}, virtualThreadExecutor);
```

### メトリクス

| フィールド | 説明 |
|-----------|------|
| `operations` | `get()` の総呼び出し数 |
| `redisHits` | Redis キャッシュヒット数 |
| `fallbacks` | Fallback が実行された回数 |
| `errors` | 例外が発生した回数 |
| `hitRate` | `redisHits / operations × 100`（%） |

---

## 2. Circuit Breaker

**実装:** Resilience4j `CircuitBreaker`
**対象サービス名:** `cache-operations`

### 状態遷移

```
               失敗率 ≥ 60%（直近60秒、最低20呼び出し）
  ┌──────────┐ ─────────────────────────────────────► ┌──────────┐
  │  CLOSED  │                                         │   OPEN   │
  │（正常動作）│ ◄─────────────────────────────────────  │（リクエスト│
  └──────────┘   成功（試験10件がすべて成功）             │  を拒否） │
                                                       └────┬─────┘
                                                            │ 30秒後
                                                       ┌────▼─────┐
                                                       │HALF-OPEN │
                                                       │（10件だけ  │
                                                       │  許可）   │
                                                       └──────────┘
```

### 設定値（`application.yml`）

```yaml
resilience4j:
  circuitbreaker:
    instances:
      cache-operations:
        sliding-window-type: TIME_BASED
        sliding-window-size: 60               # 60秒のスライドウィンドウ
        failure-rate-threshold: 60            # 60% の失敗率で OPEN
        slow-call-rate-threshold: 80          # 500ms超の呼び出しが 80% で OPEN
        slow-call-duration-threshold: 500ms
        wait-duration-in-open-state: 30s      # OPEN 継続時間
        permitted-number-of-calls-in-half-open-state: 10
        minimum-number-of-calls: 20           # 最低評価件数
        automatic-transition-from-open-to-half-open-enabled: true
```

### デモ手順

```bash
# 1. 正常状態を確認
curl http://localhost:8080/health
# → "state": "CLOSED"

# 2. エラー注入開始
curl -X POST http://localhost:8080/api/cache/simulate-error \
  -H 'Content-Type: application/json' -d '{"enabled":true}'

# 3. 20回以上リクエストを送って失敗率を閾値超えさせる
for i in $(seq 1 30); do
  curl -s http://localhost:8080/api/cache/get/demo:greeting > /dev/null
done

# 4. OPEN に遷移したことを確認
curl http://localhost:8080/health
# → "state": "OPEN"

# 5. フロントエンドの /circuit-breaker で状態遷移図を確認

# 6. リセット
curl -X POST http://localhost:8080/api/cache/reset-circuit-breaker
```

---

## 3. Retry（指数バックオフ）

**実装:** Resilience4j `Retry`

### 設定値

```yaml
resilience4j:
  retry:
    instances:
      default:
        max-attempts: 3                          # 最大3回試行
        wait-duration: 500ms                     # 初回リトライ待機
        enable-exponential-backoff: true
        exponential-backoff-multiplier: 2.0      # 500ms → 1s → 2s
        exponential-max-wait-duration: 10s
        retry-exceptions:
          - java.lang.RuntimeException
          - java.io.IOException
```

### カスタマイザー

`ResilienceRetryConfig` で「`Optional` が空または null」の場合にもリトライするよう拡張しています。
これにより、Redis がデータを返さない（キャッシュミス）場合にも再試行できます。

---

## 4. Rate Limiter

**実装:** Resilience4j `RateLimiter`（トークンバケット方式）

### 設定値

```yaml
resilience4j:
  ratelimiter:
    instances:
      default:
        limit-for-period: 100      # 1秒に100トークン補充
        limit-refresh-period: 1s   # 補充間隔
        timeout-duration: 100ms    # トークン待機タイムアウト
```

### フラッドシミュレーション

`/api/rate-limiter/flood` は `workers × burstCount` リクエストを仮想スレッドで同時送信します。
`limitForPeriod=100` を超えたリクエストは `rejected` としてカウントされます。

```
送信: 5 workers × 30 requests = 150 requests
         │
   ┌─────▼─────┐
   │   100 件  │ → permitted（トークンあり）
   │    50 件  │ → rejected（タイムアウト）
   └───────────┘
```

フロントエンントの `/rate-limiter` ページで、アニメーションと共に結果を確認できます。

---

## 5. 分散ロック

**実装クラス:** `DistributedLockService`
**Redisson API:** `RLock`、`RFencedLock`、`RReadWriteLock`、`RFairLock` など

### ロック種別一覧

| 種別 | Redisson API | 特徴 | 用途例 |
|------|------------|------|--------|
| **Reentrant Lock** | `RLock` | 同スレッドから再入可。ウォッチドッグが TTL を自動延長 | 一般的な排他制御 |
| **Fenced Lock** | `RFencedLock` | 取得のたびに単調増加するトークンを発行。古いロック保持者の操作を検出・排除できる | 分散ストレージへの書き込み保護 |
| **Read-Write Lock** | `RReadWriteLock` | 読み取りは並列可、書き込みは排他 | 読み取り多い・書き込み少ないリソース |
| **Fair Lock** | `RFairLock` | FIFO 順でロックを付与（スタベーション防止） | 公平性が重要なキュー処理 |
| **Sharded Lock** | `RSemaphore` | 同時取得可能な許可数を制限 | 同時接続数・並列処理数の制御 |
| **Spin Lock** | `RSpinLock` | ビジーウェイト。ロック競合が極めて少ない場合に低レイテンシ | クリティカルセクションが超短命な場合 |

### Fenced Lock のしくみ

```
Thread A が FencedLock 取得  → token=1
Thread B が FencedLock 取得  → token=2（A より大きい）

A が token=1 で書き込み要求
B が token=2 で書き込み要求

データストア側で token を比較:
  token=1 < 最後に受け付けた token=2 → A の書き込みを拒否
  → A はすでに「古い」ロック保持者と判断される
```

### ウォッチドッグ（自動 TTL 延長）

Redisson の `RLock` は取得後、デフォルトで **30 秒**の TTL を設定し、
ロックを保持している間は **10 秒ごとに TTL を延長**します（ウォッチドッグスレッド）。
ロック保持者のプロセスがクラッシュすると、ウォッチドッグも停止し 30 秒後に TTL が切れて自動解放されます。

### デモ手順

```bash
# ロックあり・なしの比較（4ワーカーが同時に書き込む）
curl -X POST http://localhost:8080/api/lock/demo/run \
  -H 'Content-Type: application/json' \
  -d '{"workers":4,"initialValue":10}'

# withoutLock.correct=false（更新消失が発生）
# withLock.correct=true（すべての更新が反映）
```

---

## 6. トランザクション

**実装クラス:** `TransactionalLockService`
**Redisson API:** `RTransaction`（Redis MULTI/EXEC ラッパー）

### Redis トランザクションの仕組み

```
MULTI         ← トランザクション開始
  SET k1 v1  ← キューに積む
  SET k2 v2  ← キューに積む
EXEC          ← アトミックに全コマンドを実行
              （途中で別クライアントの書き込みが入らない）
```

### 楽観的ロック（WATCH）

`TransactionalLockService` は内部で `WATCH` を使った楽観的ロックも実装しています。
監視中のキーが別クライアントに変更された場合、`EXEC` が失敗して `null` を返します。

### 送金トランザクション

```
┌────────────────────────────────────────────────────┐
│  分散ロック取得（alice-lock + bob-lock を一括）        │
│                                                    │
│  WATCH account:alice account:bob                   │
│  GET  account:alice → 1000                         │
│  GET  account:bob   → 1000                         │
│                                                    │
│  amount=100 を検証（alice >= 100 ？）                │
│                                                    │
│  MULTI                                             │
│    SET account:alice 900  （1000-100）               │
│    SET account:bob   1100  （1000+100）               │
│  EXEC                                              │
│                                                    │
│  分散ロック解放                                      │
└────────────────────────────────────────────────────┘
```

---

## 7. Saga / 補償トランザクション

**実装クラス:** `TransactionalLockService.executeWithCompensation()`
**フロントエンド:** `/saga`

### 正常系フロー

```
ステップ1（在庫確認）→ ステップ2（決済）→ ステップ3（配送登録）
      成功                  成功                  成功
                                                    │
                                            overallStatus: SUCCESS
```

### 障害時フロー（補償トランザクション）

```
ステップ1（在庫確認）→ ステップ2（決済）→ 失敗
      成功                  失敗
                              │
                    補償処理を逆順に実行
                              │
                    補償ステップ1（在庫を元に戻す）
                              │
                    overallStatus: COMPENSATED
```

Saga パターンは各ステップが独立した局所トランザクションで、
失敗時は「元に戻す操作（補償）」を定義することで整合性を担保します。
2フェーズコミットと異なり、ロックを長時間保持しない点が特徴です。

---

## 8. Pub/Sub + SSE

**実装クラス:** `PubSubService`
**Redisson API:** `RTopic`
**フロントエンド:** `/pubsub`

### アーキテクチャ

```
 ┌────────────────────────┐
 │  ブラウザ (EventSource) │  GET /api/pubsub/subscribe
 └────────────┬───────────┘
              │ SSE (text/event-stream)
 ┌────────────▼───────────┐
 │    Nginx               │  proxy_buffering off（即時配信）
 └────────────┬───────────┘
              │
 ┌────────────▼───────────────────────────────────┐
 │   PubSubService                                │
 │                                                │
 │   CopyOnWriteArrayList<SseEmitter>             │  ← 最大100接続
 │   ConcurrentHashMap<topic, listener>           │  ← 重複登録防止
 │                                                │
 │   broadcastToEmitters() で全SSEクライアントへ配信 │
 └─────────────────┬──────────────────────────────┘
                   │ RTopic.addListener()
 ┌─────────────────▼──────────────────────────────┐
 │   Redis RTopic（トピック: "news" など）           │
 └─────────────────▲──────────────────────────────┘
                   │ RTopic.publish()
          POST /api/pubsub/publish
```

### 接続管理

| 項目 | 値 |
|------|-----|
| 最大同時接続数 | 100 |
| タイムアウト | 5 分 |
| 超過時のレスポンス | 503 Service Unavailable |
| 切断時のクリーンアップ | `onCompletion` / `onTimeout` / `onError` で自動削除 |

### Redis リスナー登録

`addSubscriber(topic)` は同一トピックへの重複登録を `ConcurrentHashMap` で防いでいます。
`RTopic.addListener()` は同期呼び出しのため、メソッド戻り時点でリスナーが確実に有効です。

### デモ手順

```bash
# ターミナル A: SSE ストリームに接続
curl -N http://localhost:8080/api/pubsub/subscribe

# ターミナル B: メッセージを発行
curl -X POST http://localhost:8080/api/pubsub/publish \
  -H 'Content-Type: application/json' \
  -d '{"topic":"news","message":"Hello from terminal!"}'

# ターミナル A に即時表示される
# data: {"topic":"news","message":"Hello from terminal!","timestamp":...}
```
