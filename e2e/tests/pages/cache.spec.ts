import { test, expect } from '@playwright/test';

test.describe('Cache Explorer (/cache)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/cache');
    await page.waitForLoadState('networkidle');
  });

  test('ページが表示される', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('エラーバウンダリが発火していない', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('キー追加 → 一覧表示 → 削除 フロー', async ({ page, request }) => {
    const key = `e2e-cache-${Date.now()}`;
    const value = 'playwright-test';

    // API でキーを事前に作成
    await request.post(`/api/cache/set/${key}`, {
      data: { value, ttl: 120 },
    });

    // ページをリロードしてキー一覧を更新
    await page.reload();
    await page.waitForLoadState('networkidle');

    // キーが一覧に表示されるか確認（検索で絞り込む）
    const searchInput = page.locator('input[placeholder*="検索"], input[placeholder*="search"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill(key);
      await page.waitForTimeout(500);
    }
    await expect(page.getByText(key).first()).toBeVisible({ timeout: 10_000 });

    // API でキーを削除
    await request.delete(`/api/cache/delete/${key}`);
  });
});

test.describe('Cache Detail (/cache/:key)', () => {

  test('存在するキーの詳細ページが表示される', async ({ page, request }) => {
    const key = `e2e-detail-${Date.now()}`;
    await request.post(`/api/cache/set/${key}`, {
      data: { value: 'detail-test', ttl: 120 },
    });

    await page.goto(`/cache/${encodeURIComponent(key)}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(key).first()).toBeVisible({ timeout: 10_000 });

    await request.delete(`/api/cache/delete/${key}`);
  });
});
