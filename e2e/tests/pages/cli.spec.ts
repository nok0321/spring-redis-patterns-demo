import { test, expect } from '@playwright/test';

test.describe('Redis CLI (/cli)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/cli');
    await page.waitForLoadState('networkidle');
  });

  test('ページが表示される', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('エラーバウンダリが発火していない', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('GET コマンドを実行して結果が表示される', async ({ page, request }) => {
    // 確認用キーを事前に作成
    const key = `e2e-cli-${Date.now()}`;
    await request.post(`/api/cache/set/${key}`, {
      data: { value: 'cli-test-value', ttl: 60 },
    });

    // CLI 入力欄に GET コマンドを入力
    const input = page.locator('input[placeholder*="コマンド"], input[placeholder*="command"], input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill(`GET ${key}`);

    // 実行ボタンをクリック or Enter
    const execButton = page.getByRole('button', { name: /実行|run|exec/i }).first();
    if (await execButton.isVisible()) {
      await execButton.click();
    } else {
      await input.press('Enter');
    }

    // 結果が表示されること
    await expect(page.getByText('cli-test-value')).toBeVisible({ timeout: 10_000 });

    await request.delete(`/api/cache/delete/${key}`);
  });

  test('ホワイトリスト外コマンドは拒否される', async ({ page }) => {
    const input = page.locator('input[placeholder*="コマンド"], input[placeholder*="command"], input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('FLUSHALL');

    const execButton = page.getByRole('button', { name: /実行|run|exec/i }).first();
    if (await execButton.isVisible()) {
      await execButton.click();
    } else {
      await input.press('Enter');
    }

    await expect(page.getByText(/not allowed|許可されていません|エラー/i)).toBeVisible({ timeout: 10_000 });
  });
});
