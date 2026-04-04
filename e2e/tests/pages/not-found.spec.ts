import { test, expect } from '@playwright/test';

test.describe('404 ページ (/nonexistent)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await page.waitForLoadState('networkidle');
  });

  test('404 テキストが表示される', async ({ page }) => {
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText('ページが見つかりません')).toBeVisible();
  });

  test('「ホームに戻る」リンクが表示される', async ({ page }) => {
    const homeLink = page.getByRole('link', { name: /ホームに戻る/ });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute('href', '/');
  });

  test('「ホームに戻る」クリックでダッシュボードに遷移する', async ({ page }) => {
    const homeLink = page.getByRole('link', { name: /ホームに戻る/ });
    await homeLink.click();
    await page.waitForLoadState('networkidle');

    // ダッシュボードが表示されること
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /ダッシュボード/ })).toBeVisible({ timeout: 10_000 });
  });
});
