import { test, expect } from '@playwright/test';

test.describe('Rate Limiter (/rate-limiter)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/rate-limiter');
    await page.waitForLoadState('networkidle');
  });

  test('ページが表示される', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('エラーバウンダリが発火していない', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('フラッドデモを実行して結果が表示される', async ({ page }) => {
    const floodButton = page.getByRole('button', { name: /flood|フラッド|実行|run/i }).first();
    await expect(floodButton).toBeVisible({ timeout: 10_000 });
    await floodButton.click();

    // requested / permitted / rejected の結果表示を待つ
    await expect(
      page.getByText(/permitted|許可|rejected|拒否/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });
});
