import { test, expect } from '@playwright/test';

test.describe('Saga Tracer (/saga)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/saga');
    await page.waitForLoadState('networkidle');
  });

  test('ページが表示される', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('エラーバウンダリが発火していない', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('Saga 正常実行 → SUCCESS が表示される', async ({ page }) => {
    const runButton = page.getByRole('button', { name: /通常実行/ }).first();
    await expect(runButton).toBeVisible({ timeout: 10_000 });
    await runButton.click();

    await expect(page.getByText(/SUCCESS/i)).toBeVisible({ timeout: 15_000 });
  });

  test('Saga 失敗実行 → COMPENSATED が表示される', async ({ page }) => {
    const failButton = page.getByRole('button', { name: /失敗|fail|補償/i }).first();
    await expect(failButton).toBeVisible({ timeout: 10_000 });
    await failButton.click();

    await expect(page.getByText('COMPENSATED')).toBeVisible({ timeout: 15_000 });
  });
});
