# テスト

バックエンド（Java / JaCoCo）とフロントエンド（TypeScript / Vitest）それぞれのテスト戦略・実行コマンドを説明します。

---

## バックエンドテスト

### 実行コマンド

```bash
cd backend

# 全テスト実行 + JaCoCo レポート生成
./gradlew test jacocoTestReport

# カバレッジ検証（90% 未満で BUILD FAILED）
./gradlew jacocoTestCoverageVerification

# 特定クラスのみ実行
./gradlew test --tests "com.example.cache.CacheMetricsTest"

# 統合テストのみ実行（TestContainers が必要）
./gradlew test --tests "com.example.cache.service.*IT"
```

### レポート確認

```
backend/build/reports/jacoco/test/html/index.html
```

ブラウザで開くとパッケージ・クラス・行単位のカバレッジを確認できます。

---

### テスト戦略

#### Controller 層 — `@WebMvcTest`

Spring MVC の薄いスライスだけを起動するため、テストが高速です。
依存サービスはすべて `@MockBean` でモックします。

```java
@WebMvcTest(CacheController.class)
class CacheControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @MockBean ResilientCacheService cacheService;
    @MockBean CircuitBreakerRegistry circuitBreakerRegistry;
    @MockBean RedissonClient redissonClient;

    @Test
    void getCache_found() throws Exception {
        given(cacheService.get("demo:greeting", String.class, null))
            .willReturn(Optional.of("Hello, Redis!"));

        mockMvc.perform(get("/api/cache/get/demo:greeting"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.found").value(true))
               .andExpect(jsonPath("$.value").value("Hello, Redis!"));
    }
}
```

#### Service 層（統合テスト）— `@SpringBootTest` + TestContainers

実際の Redis インスタンス（`redis:alpine`）を Docker コンテナで起動してテストします。
`@DynamicPropertySource` でテスト用 Redis の接続情報を注入します。

```java
@SpringBootTest
@Testcontainers
@ActiveProfiles("test")
class ResilientCacheServiceIT {

    @Container
    static GenericContainer<?> redis =
        new GenericContainer<>("redis:alpine").withExposedPorts(6379);

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry r) {
        r.add("REDIS_HOST", redis::getHost);
        r.add("REDIS_PORT", () -> redis.getMappedPort(6379));
        r.add("REDIS_PASSWORD", () -> "");
    }

    @Autowired
    ResilientCacheService cacheService;

    @Test
    void setAndGet_roundTrip() {
        cacheService.setAsync("test-key", "hello", Duration.ofMinutes(1)).join();
        Optional<String> result = cacheService.get("test-key", String.class, null);
        assertThat(result).contains("hello");
    }
}
```

#### Service 層（ユニットテスト）— Mockito

Spring コンテキストを起動せず、`@ExtendWith(MockitoExtension.class)` で高速に実行します。

```java
@ExtendWith(MockitoExtension.class)
class PubSubServiceTest {

    @Mock RedissonClient redissonClient;
    @Mock RTopic rTopic;
    @InjectMocks PubSubService pubSubService;

    @Test
    void addSubscriber_registersListenerOnlyOnce() {
        given(redissonClient.getTopic("news")).willReturn(rTopic);
        pubSubService.addSubscriber("news");
        pubSubService.addSubscriber("news"); // 2回目
        verify(rTopic, times(1)).addListener(any(), any());
    }
}
```

---

### テストファイル一覧（16 ファイル）

| ファイル | 戦略 | テスト対象の主なケース |
|---------|------|----------------------|
| `CacheControllerTest` | `@WebMvcTest` | GET/SET/DELETE・limit クランプ・TTL・型判定 |
| `HealthControllerTest` | `@WebMvcTest` | UP/DOWN/CB メトリクス |
| `LockControllerTest` | `@WebMvcTest` | ロック状態・各 operation・送金・デモ |
| `PubSubControllerTest` | `@WebMvcTest` | publish（正常・blank）・subscribe（上限超過） |
| `RateLimiterControllerTest` | `@WebMvcTest` | ステータス・フラッド |
| `TransactionControllerTest` | `@WebMvcTest` | Saga 正常・補償 |
| `CliControllerTest` | `@WebMvcTest` | 全 16 コマンド・ホワイトリスト外 |
| `ResilientCacheServiceIT` | `@SpringBootTest` + TC | ラウンドトリップ・バッチ・CB・メトリクス |
| `DistributedLockServiceIT` | `@SpringBootTest` + TC | 各ロック種別・並列直列化・メトリクス |
| `TransactionalLockServiceIT` | `@SpringBootTest` + TC | TX コミット・ロールバック・送金整合性 |
| `LockDemoServiceIT` | `@SpringBootTest` + TC | ロックあり・なし比較 |
| `PubSubServiceTest` | Mockito | 重複登録防止・SSE 上限 |
| `RateLimiterDemoServiceTest` | Mockito | ステータスフィールド・フラッド |
| `DataSeederTest` | Mockito | 8 キー投入・例外無視 |
| `AppLifecycleConfigTest` | Mockito | 3 サービスのシャットダウン呼び出し |
| `CacheMetricsTest` | 純粋 JUnit5 | カウンタ・ヒット率・スレッド安全性 |

---

### カバレッジ設定

**`build.gradle.kts` より抜粋:**

```kotlin
tasks.named<JacocoCoverageVerification>("jacocoTestCoverageVerification") {
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value   = "COVEREDRATIO"
                minimum = "0.90".toBigDecimal()   // ← 90% 未満で失敗
            }
        }
    }
}
```

**カバレッジ計測から除外するクラス:**

| クラス | 除外理由 |
|--------|---------|
| `CacheServiceApplication` | `main()` のみ、ロジックなし |
| `config/RedissonConfig` | インフラ設定 Bean のみ |
| `config/ResilienceRetryConfig` | インフラ設定 Bean のみ |

---

## フロントエンドテスト

### 実行コマンド

```bash
cd frontend
npm install           # 初回のみ

npm test              # 全テストを1回実行（CI 向け）
npm run test:watch    # ウォッチモード（開発中）
npm run test:coverage # カバレッジレポート生成
```

### カバレッジレポート確認

```
frontend/coverage/index.html
```

---

### テスト戦略

#### API クライアント — `fetch` モック

MSW（Mock Service Worker）を使ってネットワーク層をモックします。
テスト環境では `msw/node` を使い、`beforeAll`/`afterEach`/`afterAll` でサーバーを管理します。

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom'
import { server } from './mocks/server'

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

```typescript
// src/test/mocks/handlers.ts（抜粋）
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/cache/get/:key', ({ params }) =>
    HttpResponse.json({ key: params.key, found: true, value: 'test-value' })
  ),
  http.post('/api/cache/set/:key', () =>
    HttpResponse.json({ key: 'mykey', success: true, ttl: 'PT1H' })
  ),
  // ... 全エンドポイント分
]
```

#### Hooks — `vi.useFakeTimers()`

`usePolling` のインターバル動作を仮想タイマーで制御します。

```typescript
it('polls at interval', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn().mockResolvedValue({ data: 'ok' })
  renderHook(() => usePolling({ fetcher, interval: 5000 }))

  expect(fetcher).toHaveBeenCalledTimes(1)  // 初回即時

  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(fetcher).toHaveBeenCalledTimes(2)  // 2回目

  vi.useRealTimers()
})
```

#### Components — `@testing-library/react`

```typescript
it('shows red bar for low TTL ratio', () => {
  const { container } = render(
    <TtlProgressBar ttlMs={180000} persistent={false} />
  )
  expect(container.querySelector('.bg-red-500')).toBeInTheDocument()
})
```

#### Pages — `MemoryRouter`

ページコンポーネントは `react-router-dom` の `MemoryRouter` でラップします。

```typescript
function renderDetailPage(key = 'demo%3Agreeting') {
  return render(
    <MemoryRouter initialEntries={[`/cache/${key}`]}>
      <Routes>
        <Route path="/cache/:key" element={<CacheDetailPage />} />
        <Route path="/cache" element={<div>cache-list</div>} />
      </Routes>
    </MemoryRouter>
  )
}
```

---

### テストファイル一覧（15 ファイル・132 テスト）

| ファイル | テスト数 | 主なテストケース |
|---------|---------|----------------|
| `api/client.test.ts` | 7 | apiFetch・getBaseUrl・setBaseUrl・4xx/5xx エラー |
| `api/cache.test.ts` | 6 | 全 API メソッドの呼び出し確認（MSW） |
| `api/health.test.ts` | 1 | healthApi.get() |
| `hooks/usePolling.test.ts` | 7 | 初回取得・インターバル・エラー・refetch・アンマウント |
| `hooks/useToast.test.ts` | 5 | 追加・3秒自動削除・複数共存 |
| `components/common/ToastContainer.test.tsx` | 5 | success/error/info バリアント |
| `components/common/ResultViewer.test.tsx` | 5 | ローディング・エラー・null・オブジェクト |
| `components/common/DeleteConfirmDialog.test.tsx` | 5 | 開閉・確認・キャンセル・削除中無効化 |
| `components/cache/TtlProgressBar.test.tsx` | 10 | 永続・時間書式・カラーバー・カスタム最大値 |
| `components/cache/ValueViewer.test.tsx` | 13 | 全 Redis 型・ローディング・エラーフォールバック |
| `components/layout/AppShell.test.tsx` | 7 | ナビリンク・設定モーダル・接続バッジ |
| `pages/DashboardPage.test.tsx` | 15 | StatusCard・自動更新・UP/DOWN・更新ボタン |
| `pages/CacheExplorerPage.test.tsx` | 10 | 自動読み込み・検索・削除確認・追加モーダル |
| `pages/CacheDetailPage.test.tsx` | 16 | 読み込み・編集・削除・URL デコード |
| `pages/PubSubPage.test.tsx` | 20 | SSE 受信・発行・50件上限・Enter キー・エラー |

---

### カバレッジ設定

**`vitest.config.ts` より抜粋:**

```typescript
coverage: {
  provider: 'v8',
  include: ['src/**/*.{ts,tsx}'],
  exclude: [
    'src/test/**',    // テストコード自体
    'src/types/**',   // 型定義のみ、実行コードなし
    'src/main.tsx',   // エントリポイント
    'src/App.tsx',    // ルーター定義のみ
  ],
  thresholds: {
    lines:      90,
    statements: 90,
    branches:   85,
    functions:  90,
  }
}
```

---

## E2E テスト（Playwright）

### 概要

`e2e/` ディレクトリに Playwright による E2E テストを実装しています。
Docker Compose でアプリ全体を起動した状態で実行し、実際のブラウザ操作でエンドツーエンドの動作を検証します。

### 前提

- Docker Compose でアプリが起動済みであること
- Node.js がインストール済みであること（`e2e/` ディレクトリで `npm install` 実行）

### 実行コマンド

```bash
# アプリ起動（ヘルスチェック通過まで自動待機）
bash e2e/scripts/docker-up.sh

# e2e ディレクトリに移動
cd e2e

# 依存パッケージと Playwright ブラウザのインストール（初回のみ）
npm install
npx playwright install chromium

# 全テスト実行
npm test

# スモークテストのみ（API 疎通 + Swagger UI 確認）
npm run test:smoke

# ページテストのみ（全画面の表示・操作確認）
npm run test:pages

# HTML レポートを開く
npm run report

# 終了後クリーンアップ（ボリューム保持）
bash ../e2e/scripts/docker-down.sh
```

> 環境変数 `BASE_URL` でアクセス先を変更できます（デフォルト: `http://localhost`）

### テスト構成

```
e2e/
├── playwright.config.ts     # Playwright 設定
├── scripts/
│   ├── docker-up.sh         # Docker 起動 + ヘルスチェック待機
│   └── docker-down.sh       # Docker 停止（ボリューム保持）
└── tests/
    ├── smoke/               # スモークテスト
    │   ├── api.spec.ts      # API エンドポイント疎通確認
    │   └── swagger.spec.ts  # Swagger UI 表示確認
    └── pages/               # 画面テスト
        ├── dashboard.spec.ts
        ├── visualizer.spec.ts
        ├── cache.spec.ts
        ├── locks.spec.ts
        ├── circuit-breaker.spec.ts
        ├── rate-limiter.spec.ts
        ├── metrics.spec.ts
        ├── pubsub.spec.ts
        ├── saga.spec.ts
        └── cli.spec.ts
```

### Playwright 設定概要

| 設定 | 値 | 理由 |
|------|-----|------|
| `workers` | 1（シーケンシャル） | Docker 環境への負荷抑制 |
| `retries` | 1 | タイミング問題への対応 |
| `actionTimeout` | 15 秒 | API レスポンス待ちを含む操作 |
| `navigationTimeout` | 30 秒 | ページ遷移の余裕 |
| `timeout` | 60 秒 | SSE 等の長時間テスト考慮 |
| ブラウザ | Chromium | Desktop Chrome プロファイル |

失敗時はスクリーンショットとビデオが `playwright-report/` に保存されます。
