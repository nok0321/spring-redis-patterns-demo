# 開発環境セットアップ

Docker を使わずにバックエンドとフロントエンドをローカルで起動する手順です。

---

## 前提条件

| ツール | バージョン | 用途 |
|--------|-----------|------|
| Java | 21 | バックエンドランタイム |
| Gradle | 9.4.1 | ビルドツール |
| Node.js | 22.x | フロントエンドビルド・開発サーバー |
| Docker | 24.x | Redis のみ Docker で起動 |

---

## 1. Redis を Docker で起動

バックエンドをローカルで動かす場合も Redis だけは Docker を使うのが最も簡単です。

```bash
# Redis のみ起動（ポート 6379 をホストに公開）
docker compose up redis -d

# 接続確認
redis-cli ping
# PONG
```

パスワードあり（`REDIS_PASSWORD` を設定している場合）：

```bash
REDIS_PASSWORD=secret docker compose up redis -d
redis-cli -a secret ping
```

---

## 2. バックエンドをローカルで起動

```bash
cd backend

# ビルド（テスト除外）
./gradlew build -x test

# 起動（REDIS_HOST / REDIS_PORT は環境変数で上書き可能）
REDIS_HOST=localhost REDIS_PORT=6379 ./gradlew bootRun

# パスワードあり
REDIS_HOST=localhost REDIS_PORT=6379 REDIS_PASSWORD=secret ./gradlew bootRun
```

起動確認：

```bash
curl http://localhost:8080/health
# {"status":"UP",...}
```

### application.yml のローカル上書き

`src/main/resources/application-local.yml` を作成してローカル設定を上書きできます（Git 管理外）。

```yaml
# backend/src/main/resources/application-local.yml
logging:
  level:
    com.example.cache: DEBUG
    org.redisson: DEBUG
```

```bash
SPRING_PROFILES_ACTIVE=local ./gradlew bootRun
```

---

## 3. フロントエンドをローカルで起動

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173 でアクセス
```

Vite の開発サーバーは `/api` と `/health` へのリクエストを自動的に `http://localhost:8080` にプロキシします（`vite.config.ts` の `server.proxy` 設定）。

### バックエンド URL を変更する

デフォルトでは同一オリジン（`/api/...`）を使います。
フロントエンドの「設定」ボタン（歯車アイコン）から GUI でも変更できます。

`localStorage` の `redis_dashboard_base_url` に値を設定すると、
その値をベース URL として API リクエストを送ります。

```javascript
// ブラウザの DevTools コンソールで設定
localStorage.setItem('redis_dashboard_base_url', 'http://localhost:8080')
location.reload()
```

---

## 4. IDE 設定（IntelliJ IDEA）

```
1. File → Open → backend/ を選択（Gradle プロジェクトとして開く）
2. Build → Build Project で初回ビルド
3. CacheServiceApplication を右クリック → Run
   - VM options: （不要）
   - Environment variables: REDIS_HOST=localhost;REDIS_PORT=6379
```

**推奨プラグイン:**
- Spring Boot
- Lombok（使用している場合）
- SonarLint

---

## 5. ホットリロード

**バックエンド:** `spring-boot-devtools` は依存に含まれていません。
クラスを変更した場合は `./gradlew bootRun` を再起動してください。
IntelliJ では「Build → Recompile」でクラスを再コンパイルすると
Spring の再起動がトリガーされることがあります。

**フロントエンド:** Vite の HMR（Hot Module Replacement）が有効なので、
`src/` 内のファイル変更はブラウザに即時反映されます。

---

## 6. よくあるトラブル

### `REDIS_HOST` が `redis` になっている

`application.yml` のデフォルトが Docker 用の `redis`（サービス名）になっています。
ローカルで起動する場合は環境変数 `REDIS_HOST=localhost` を明示的に指定してください。

```bash
# 誤: そのまま起動
./gradlew bootRun
# → Connection refused (redis は解決できない)

# 正: 環境変数を指定
REDIS_HOST=localhost REDIS_PORT=6379 ./gradlew bootRun
```

### ポート 8080 が使用中

```bash
# 使用中のプロセスを確認
lsof -i :8080

# 別ポートで起動
SERVER_PORT=8081 REDIS_HOST=localhost REDIS_PORT=6379 ./gradlew bootRun
```

### npm install が遅い

初回は msw などの大きなパッケージを含むため時間がかかります。
`--prefer-offline` オプションでキャッシュを優先できます。

```bash
npm install --prefer-offline
```

### Redisson 接続エラー（`ClassNotFoundException: com.fasterxml.jackson...`）

Redisson 4.x は Jackson 3.x（`tools.jackson.*` パッケージ）を使います。
`JsonJacksonCodec` など Jackson 2.x を参照するコーデックは使用しないでください。
詳細は [`MEMORY.md`](.claude/projects/.../memory/MEMORY.md) の「Critical」セクションを参照。
