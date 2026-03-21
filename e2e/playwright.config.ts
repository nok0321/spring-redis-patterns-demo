import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Docker 環境への負荷を抑えるためシーケンシャル実行
  retries: 1,           // 一時的なタイミング問題に対するリトライ
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // API レスポンス待ちを含む操作に対するデフォルトタイムアウト
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // グローバルタイムアウト（SSE 等の長時間テストを考慮）
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
});
