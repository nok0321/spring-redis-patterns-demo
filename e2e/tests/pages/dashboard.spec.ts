import { test, expect } from '@playwright/test';

test.describe('Dashboard (/)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // ポーリングによるデータ取得を待つ
    await page.waitForLoadState('networkidle');
  });

  test('ページタイトルが表示される', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('Redis ステータスカードが表示される', async ({ page }) => {
    // "UP" または "DOWN" の文字がどこかに表示されること
    const statusText = page.getByText(/UP|DOWN/);
    await expect(statusText.first()).toBeVisible({ timeout: 10_000 });
  });

  test('エラーバウンダリが発火していない', async ({ page }) => {
    // ErrorBoundary の fallback テキストが表示されていないこと
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
    await expect(page.getByText('エラーが発生しました')).not.toBeVisible();
  });

  test('ナビゲーションリンクが存在する', async ({ page }) => {
    // サイドバーまたはナビゲーションに主要ページへのリンクがあること
    await expect(page.getByRole('link', { name: /cache|キャッシュ/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /lock|ロック/i }).first()).toBeVisible();
  });
});
