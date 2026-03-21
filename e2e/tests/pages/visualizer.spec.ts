import { test, expect } from '@playwright/test';

test.describe('Redis Visualizer (/visualizer)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/visualizer');
    await page.waitForLoadState('networkidle');
  });

  test('ページが表示される', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('エラーバウンダリが発火していない', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('redisson_ 内部キーが一覧に表示されない（Bug1 修正確認）', async ({ page, request }) => {
    // Saga を実行して redisson_unlock_latch キーを生成
    await request.post('/api/transaction/saga');

    await page.reload();
    await page.waitForLoadState('networkidle');

    // 画面に redisson_ で始まるキーが表示されていないこと
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toMatch(/redisson_/);
  });
});
