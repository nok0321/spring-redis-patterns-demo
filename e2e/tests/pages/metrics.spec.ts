import { test, expect } from '@playwright/test';

test.describe('Metrics (/metrics)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/metrics');
    await page.waitForLoadState('networkidle');
  });

  test('ページが表示される', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('エラーバウンダリが発火していない', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('数値メトリクスが表示される', async ({ page }) => {
    // hits または misses の数値が表示されていること
    const metricValue = page.getByText(/\d+/).first();
    await expect(metricValue).toBeVisible({ timeout: 10_000 });
  });
});
