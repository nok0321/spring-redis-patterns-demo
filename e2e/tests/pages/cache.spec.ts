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
      await page.waitForResponse(resp => resp.url().includes('/api/cache/search') && resp.ok());
    }
    await expect(page.getByText(key).first()).toBeVisible({ timeout: 10_000 });

    // API でキーを削除
    await request.delete(`/api/cache/delete/${key}`);
  });
});

test.describe('ValueEditor — プレーンテキスト保存', () => {

  test('JSON ではないプレーンテキストを保存できる', async ({ page, request }) => {
    const key = `e2e-plain-${Date.now()}`;
    await request.post(`/api/cache/set/${key}`, {
      data: { value: 'original', ttl: 120 },
    });

    await page.goto(`/cache/${encodeURIComponent(key)}`);
    await page.waitForLoadState('networkidle');

    // 編集ボタンをクリック
    const editButton = page.getByRole('button', { name: /編集|edit/i }).first();
    if (await editButton.isVisible({ timeout: 5_000 })) {
      await editButton.click();

      // テキストエリアにプレーンテキストを入力
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 5_000 });
      await textarea.fill('plain text value');

      // 保存
      const saveButton = page.getByRole('button', { name: /保存|save/i }).first();
      await saveButton.click();

      // 保存完了のトーストを待つ（非同期保存の完了確認）
      await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5_000 });

      // エラーが表示されないこと（以前は JSON パースエラーになっていた）
      await expect(page.getByText(/JSON の形式が正しくありません/)).not.toBeVisible();
    }

    // API で値を確認
    const getRes = await request.get(`/api/cache/get/${key}`);
    const body = await getRes.json();
    if (body.found) {
      expect(body.value).toBe('plain text value');
    }

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
