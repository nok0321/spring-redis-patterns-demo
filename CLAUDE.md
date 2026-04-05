# redis-app_s
Spring Boot 4.x / Java 21 / Gradle 9.4 / Redisson 4.2 / Resilience4j 2.4 | React 19 / TypeScript 5.9 / Vite 8.0 / Vitest 4.1 | Docker Compose

## Commands

### バックエンド（`cd backend` して実行）
- Build: `./gradlew build -x test`
- Test（全体）: `./gradlew test`
- Test（単一クラス）: `./gradlew test --tests "com.example.cache.controller.CacheControllerTest"`
- Test + カバレッジ: `./gradlew test jacocoTestReport`
- Run（ローカル）: `REDIS_HOST=localhost REDIS_PORT=6379 ./gradlew bootRun`

### フロントエンド（`cd frontend` して実行）
- Build: `npm run build`（`tsc -b && vite build`）
- Test: `npm test`
- Test（watch）: `npm run test:watch`
- Lint: `npm run lint`
- Dev: `npm run dev`

### Docker（プロジェクトルートで実行）
- 起動: `docker compose up -d`
- 停止: `docker compose down`
- ログ: `docker compose logs -f <service>`
- リビルド: `docker compose up -d --build <service>`
- 状態確認: `docker compose ps`

## Architecture

```
Browser → Nginx(:80) → Spring Boot(:8080) → Redis(:6379)
                    ↑
              OTel Collector → Jaeger(:16686)  トレース
                            → Prometheus(:9090) メトリクス → Grafana(:3000)
                            → Loki(:3100)       ログ     ↗
```

- `backend/src/main/java/com/example/cache/`
  - `config/`      — Redis / Resilience4j / Security / Web 設定
  - `controller/`  — REST エンドポイント（Cache / Lock / PubSub / RateLimiter / Cli / Health）
  - `service/`     — ビジネスロジック（ResilientCache / DistributedLock / PubSub 等）
  - `util/`        — TypeResolver
- `frontend/src/`
  - `api/`         — API クライアント（cache / locks / pubsub / rateLimiter 等）
  - `components/`  — React コンポーネント
  - `pages/`       — ページコンポーネント
  - `hooks/`       — カスタムフック（usePolling / useToast）
  - `test/`        — テスト + MSW モック

## Code Conventions

### バックエンド
- Java 21 機能を積極活用（Record, Pattern Matching, Virtual Threads）
- Redisson API を通じた Redis 操作（直接 Lettuce / Jedis 禁止）
- Redis 接続設定は `application.yml` + 環境変数経由（`redisson.yml` は廃止済み）
- Resilience4j Decorators パターンをサービス層に適用（実行順: Retry → CB → Bulkhead → Redis）
- `SecurityConfig`: `.anyRequest().denyAll()` — 未定義パスはデフォルト拒否
- `@WebMvcTest` でコントローラ、TestContainers で統合テスト（`*IT.java`）

### フロントエンド
- `strict` TypeScript、`any` 禁止
- named export 使用（default export は `App.tsx` / `main.tsx` のみ）
- MSW でAPIモック、Vitest + Testing Library でコンポーネントテスト

## Testing Rules
- バックエンドカバレッジ閾値：ライン 90% / ファンクション 90% / ブランチ 85%
- フロントエンドカバレッジ閾値：同上（vitest.config.ts 参照）、`tsconfig.test.json` で src/test も strict 型チェック対象
- 修正前に既存テストを実行してベースライン確認
- 修正後は関連テスト + 隣接テストを実行
- TestContainers 統合テストは Redis が起動していなくても実行可能

## Regression Prevention Protocol
- Javaファイル修正後は即座に `./gradlew compileJava` 実行
- 複数ファイル変更時は中間コミット推奨
- リグレッションが3回連続で起きたら根本的にアプローチを見直す

## Parallel Agent Rules
- 同時サブエージェント数: 最大4
- サブエージェントモデル: sonnet（メインのみ opus 使用）
- 各サブエージェントに maxTurns: 20 を設定
- 起動は優先度順（全部同時起動禁止）

## Session Management
- 長期タスクでは `CHECKPOINT.md` を作成してから `/clear`
- セッション開始時に `CHECKPOINT.md` の存在を確認
- コンテキスト使用率 50% で `/compact` 検討、70% で `/checkpoint save` + `/clear`

## Important
- NEVER: Redis 接続文字列・パスワードをコードに直書き（`.env` 経由）
- NEVER: `.env` ファイルをコミット
- NEVER: `--no-verify` でコミット
- NEVER: `docker compose down -v` を確認なしに実行（データ削除）
- ALWAYS: 修正前に git ブランチ作成または stash
- ALWAYS: Dockerfile 変更後はヘルスチェックの動作確認
- ALWAYS: SecurityConfig のパスマッチャー変更後は E2E Swagger テストを確認（denyAll のため未定義パスは 403）
