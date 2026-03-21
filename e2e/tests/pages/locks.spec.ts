import { test, expect } from '@playwright/test';

test.describe('Lock Monitor (/locks)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/locks');
    await page.waitForLoadState('networkidle');
  });

  test('ページが表示される', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('エラーバウンダリが発火していない', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

test.describe('Lock Demo (/locks/demo)', () => {

  test('デモ実行ボタンが存在し、クリック後に結果が表示される', async ({ page }) => {
    await page.goto('/locks/demo');
    await page.waitForLoadState('networkidle');

    const runButton = page.getByRole('button', { name: /実行|run|demo/i }).first();
    await expect(runButton).toBeVisible({ timeout: 10_000 });
    await runButton.click();

    // 結果（withLock / withoutLock）が表示されるまで待つ
    await expect(
      page.getByText(/withLock|ロックあり|correct|正確/i).first()
    ).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('Transfer (/locks/transfer)', () => {

  test('ページが表示される', async ({ page }) => {
    await page.goto('/locks/transfer');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });
});
