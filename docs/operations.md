# 運用・Docker 操作

Docker Compose を使った起動・停止・ログ確認・リビルドなどの操作手順です。

---

## 起動・停止

```bash
# 起動（バックグラウンド）
docker compose up -d

# 起動状態の確認
docker compose ps

# ログ確認（全サービス）
docker compose logs -f

# 停止（データ保持）
docker compose down

# 停止 + ボリューム削除（全データリセット）
docker compose down -v
```

---

## サービス個別操作

### 特定サービスのログ

```bash
# バックエンド（リアルタイム）
docker logs -f redis-app_s-backend-1

# Redis
docker logs -f redis-app_s-redis-1

# Nginx（フロントエンド）
docker logs -f redis-app_s-frontend-1
```

### 特定サービスの再起動

```bash
docker compose restart backend
docker compose restart frontend
docker compose restart redis
```

---

## リビルド

ソースを変更した後はイメージを再ビルドする必要があります。

```bash
# バックエンドのみ再ビルド（Gradle 依存キャッシュは維持）
docker compose build backend && docker compose up -d backend

# フロントエンドのみ再ビルド（npm キャッシュは維持）
docker compose build frontend && docker compose up -d frontend

# 全サービス再ビルド（キャッシュあり）
docker compose build && docker compose up -d

# 全サービス再ビルド（完全クリーン：依存 DL からやり直し）
docker compose build --no-cache && docker compose up -d
```

> **注意:** `--no-cache` を付けると Gradle の依存解決・npm install がすべて再実行されるため時間がかかります。
> 通常は付けないほうが高速です。

---

## Redis 操作

### Redis CLI で直接接続

```bash
# パスワードなし
docker exec -it redis-app_s-redis-1 redis-cli

# パスワードあり
docker exec -it redis-app_s-redis-1 redis-cli -a yourpassword

# よく使うコマンド
KEYS *                   # 全キー一覧（本番では SCAN を使うこと）
SCAN 0 COUNT 100         # 安全なキースキャン
TYPE demo:greeting       # データ型確認
TTL demo:greeting        # TTL 確認（秒）
GET demo:greeting        # 文字列値取得
HGETALL demo:user:alice  # ハッシュ全フィールド
FLUSHDB                  # 現在のDBを全削除（注意）
INFO memory              # メモリ使用量
INFO stats               # 接続・コマンド統計
```

### ホストから直接接続（ローカル開発時）

Redis ポートはループバックのみに公開されています（`127.0.0.1:6379`）。

```bash
# ローカルに redis-cli がある場合
redis-cli -p 6379

# パスワードあり
redis-cli -p 6379 -a yourpassword
```

### デモデータのリセット

バックエンドを再起動するだけで `DataSeeder` が再投入します。

```bash
docker compose restart backend
```

完全なデータリセット（Redis ボリュームごと削除）：

```bash
docker compose down -v
docker compose up -d
```

---

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `REDIS_PASSWORD` | _(空)_ | Redis パスワード（空の場合は認証なし） |

### 設定方法

**`.env` ファイルを使う（推奨）:**

```bash
cp .env.example .env
# .env を編集
echo 'REDIS_PASSWORD=yourpassword' >> .env
docker compose up -d
```

**インライン指定:**

```bash
REDIS_PASSWORD=yourpassword docker compose up -d
```

**`docker compose` 実行中の確認:**

```bash
docker compose exec backend env | grep REDIS
```

---

## Spring Boot Actuator

バックエンドは Micrometer + Prometheus のメトリクスを公開しています。

```bash
# 利用可能なエンドポイント
curl http://localhost:8080/actuator

# Prometheus 形式のメトリクス
curl http://localhost:8080/actuator/prometheus | head -50

# JVM メモリ
curl http://localhost:8080/actuator/metrics/jvm.memory.used

# HTTP リクエスト統計
curl http://localhost:8080/actuator/metrics/http.server.requests
```

---

## OpenTelemetry Collector

OTel Collector は `docker-compose.yml` にデフォルトで組み込まれており、追加設定なしで有効です。
設定ファイルは `docker/otel-collector-config.yaml` です。

```yaml
exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true
  prometheusremotewrite:
    endpoint: http://prometheus:9090/api/v1/write
    tls:
      insecure: true
  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/jaeger]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [loki]
```

---

## モニタリングスタック

| サービス | URL | 説明 |
|---------|-----|------|
| Prometheus | `http://localhost:9090` | メトリクス収集（retention: 7日） |
| Grafana | `http://localhost:3000` | ダッシュボード（admin / `.env` の `GRAFANA_ADMIN_PASSWORD`） |
| Jaeger | `http://localhost:16686` | 分散トレーシング（trace永続化済み） |
| Loki | `http://localhost:3100` | ログ集約 |

Grafana には Prometheus / Loki / Jaeger の3データソースがプロビジョニング済み。

---

## トラブルシューティング

### バックエンドが起動しない（Redis 接続待ち）

```bash
# Redis の起動を確認
docker compose ps redis
# STATUS が healthy になるまで待つ

# ヘルスチェックログを確認
docker inspect redis-app_s-redis-1 | grep -A 10 Health
```

### フロントエンドが起動しない（バックエンド待ち）

フロントエンドは `backend: condition: service_healthy` に依存しています。
バックエンドが healthy になるまで起動しません（最大 90 秒）。

```bash
# バックエンドのヘルスチェック状態を確認
docker inspect redis-app_s-backend-1 --format='{{.State.Health.Status}}'
```

### ポート競合

```bash
# 使用中のポートを確認
netstat -ano | findstr :80
netstat -ano | findstr :8080
netstat -ano | findstr :6379

# 別ポートで起動する場合（docker-compose.yml を編集）
ports:
  - "8081:8080"  # ← ホスト側を変更
```

### Jaeger にトレースが表示されない

Jaeger のトレースデータはボリューム（`jaeger-data`）に永続化されており、コンテナ再起動後も保持されます。
データをリセットしたい場合は `docker compose down -v` を実行してください（全ボリューム削除）。

### Prometheus のデータ保持期間

Prometheus は明示的に `--storage.tsdb.retention.time=7d` を設定しています。
7日を超えた古いメトリクスは自動削除されます。

### ビルドキャッシュの問題

```bash
# Docker ビルドキャッシュを全削除
docker builder prune -af

# 未使用のイメージ・コンテナを一括削除
docker system prune -af
```

### Redisson 接続エラー

バックエンドログで以下が出る場合は Redis 接続設定を確認してください。

```
org.redisson.client.RedisConnectionException: Unable to connect to Redis server
```

```bash
# Redis が起動していることを確認
docker compose ps redis

# 直接 ping
docker exec redis-app_s-redis-1 redis-cli ping
# PONG

# パスワードあり
docker exec redis-app_s-redis-1 redis-cli -a yourpassword ping
```
