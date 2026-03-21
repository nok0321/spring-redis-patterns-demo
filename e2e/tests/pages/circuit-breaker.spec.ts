import { test, expect } from '@playwright/test';

test.describe('Circuit Breaker (/circuit-breaker)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/circuit-breaker');
    await page.waitForLoadState('networkidle');
  });

  test('ページが表示される', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('エラーバウンダリが発火していない', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('サーキットブレーカー状態（CLOSED/OPEN/HALF_OPEN）が表示される', async ({ page }) => {
    const stateText = page.getByText(/CLOSED|OPEN|HALF_OPEN/);
    await expect(stateText.first()).toBeVisible({ timeout: 10_000 });
  });
});
