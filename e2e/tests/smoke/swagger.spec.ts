import { test, expect } from '@playwright/test';

/**
 * Swagger UI smoke テスト
 * springdoc-openapi が正しく動作し、UI が表示されることを確認する
 */

test.describe('Swagger UI', () => {

  test('GET /swagger-ui.html → リダイレクト後に UI が表示される', async ({ page }) => {
    await page.goto('/swagger-ui.html');
    // Swagger UI の初期化を待つ（.swagger-ui は複数要素に付くため .first() で特定）
    await expect(page.locator('.swagger-ui').first()).toBeVisible({ timeout: 15_000 });
  });

  test('OpenAPI タイトルが表示される', async ({ page }) => {
    await page.goto('/swagger-ui.html');
    await expect(page.locator('.title')).toContainText('Redis Cache Service API', { timeout: 15_000 });
  });

  test('全 7 タグが展開可能な状態で表示される', async ({ page }) => {
    await page.goto('/swagger-ui.html');
    await page.waitForSelector('.opblock-tag', { timeout: 15_000 });

    const tags = page.locator('.opblock-tag');
    const tagTexts = await tags.allTextContents();
    const tagNames = tagTexts.map(t => t.trim().replace(/\s+\d+$/, ''));

    for (const expected of ['Cache', 'Lock', 'PubSub', 'RateLimiter', 'CLI', 'Transaction', 'Health']) {
      const found = tagNames.some(t => t.includes(expected));
      expect(found, `タグ "${expected}" が見つかりません。実際: ${tagNames.join(', ')}`).toBe(true);
    }
  });

  test('Cache タグを展開するとエンドポイント一覧が表示される', async ({ page }) => {
    await page.goto('/swagger-ui.html');
    await page.waitForSelector('.opblock-tag', { timeout: 15_000 });

    // Cache タグをクリックして展開
    const cacheTag = page.locator('.opblock-tag').filter({ hasText: 'Cache' }).first();
    await cacheTag.click();

    // エンドポイントが1件以上表示されること
    const ops = page.locator('.opblock');
    await expect(ops.first()).toBeVisible({ timeout: 5_000 });
    const count = await ops.count();
    expect(count).toBeGreaterThan(0);
  });

  test('GET /v3/api-docs.yaml → YAML 形式でスキーマ取得', async ({ request }) => {
    const res = await request.get('/v3/api-docs.yaml');
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('Redis Cache Service API');
    expect(text).toContain('openapi:');
  });
});
