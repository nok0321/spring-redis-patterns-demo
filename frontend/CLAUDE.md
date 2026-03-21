# Frontend — React 19 / TypeScript 5.9 / Vite 8.0

## Commands（このディレクトリで実行）
- Dev: `npm run dev`（Vite dev server、バックエンドは別途起動）
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Coverage: `npm run test:coverage`

## TypeScript Rules
- `strict` モード必須、`any` 型禁止（`unknown` + 型ガードを使用）
- named export 使用（`App.tsx` / `main.tsx` 以外で default export 禁止）
- 型定義は使用箇所に近い場所に置く（過度な集約禁止）

## React Patterns
- コンポーネントは `src/components/` に機能別サブディレクトリで管理
- API 通信は `src/api/` のクライアント関数経由（コンポーネント内で fetch 禁止）
- サーバー状態ポーリングは `usePolling` フック使用
- SSE（Pub/Sub）は `EventSource` を直接使用可

## Testing
- テストファイル: `src/test/` 配下（`*.test.ts` / `*.test.tsx`）
- API モック: MSW（`src/test/mocks/` の handlers.ts）
- コンポーネントテスト: `@testing-library/react` + `@testing-library/user-event`
- カバレッジ閾値: lines/statements/functions 90%、branches 85%

## Styling
- Tailwind CSS のみ使用（インライン style 禁止）
- カラー・スペーシングは Tailwind クラスで統一
