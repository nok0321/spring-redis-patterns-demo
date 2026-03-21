import { test, expect } from '@playwright/test';

test.describe('PubSub (/pubsub)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/pubsub');
    await page.waitForLoadState('domcontentloaded');
  });

  test('ページが表示される', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('エラーバウンダリが発火していない', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('メッセージを発行すると受信欄に表示される', async ({ page }) => {
    const message = `e2e-msg-${Date.now()}`;

    // メッセージ入力欄を探す
    const msgInput = page.locator('input[placeholder*="メッセージ"], input[placeholder*="message"], textarea').first();
    await expect(msgInput).toBeVisible({ timeout: 10_000 });
    await msgInput.fill(message);

    // 送信ボタンをクリック
    const sendButton = page.getByRole('button', { name: /パブリッシュ|送信|publish|send/i }).first();
    await sendButton.click();

    // 送信したメッセージが画面に表示される（SSE で受信）
    // Bug2 修正後: IllegalStateException が出ないことを前提とする
    await expect(page.getByText(message)).toBeVisible({ timeout: 10_000 });
  });
});
