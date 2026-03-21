import { test, expect } from '@playwright/test';

/**
 * Smoke テスト — API 疎通確認
 * Docker 起動直後に主要エンドポイントが正常応答することを確認する
 */

test.describe('API smoke tests', () => {

  test('GET /health → status=UP', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('UP');
    expect(body.redis).toBeDefined();
  });

  test('GET /v3/api-docs → OpenAPI スキーマ', async ({ request }) => {
    const res = await request.get('/v3/api-docs');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.info.title).toBe('Redis Cache Service API');
    expect(body.info.version).toBe('1.0.0');
    // タグが全 7 グループ揃っていること
    const tagNames = (body.tags as Array<{ name: string }>).map(t => t.name);
    expect(tagNames).toContain('Cache');
    expect(tagNames).toContain('Lock');
    expect(tagNames).toContain('PubSub');
    expect(tagNames).toContain('RateLimiter');
    expect(tagNames).toContain('CLI');
    expect(tagNames).toContain('Transaction');
    expect(tagNames).toContain('Health');
  });

  test('GET /api/cache/metrics → 200', async ({ request }) => {
    const res = await request.get('/api/cache/metrics');
    expect(res.status()).toBe(200);
    const body = await res.json();
    // 実際のレスポンス: { errors, hitRate, fallbacks, redisHits, operations }
    expect(typeof body.operations).toBe('number');
    expect(typeof body.errors).toBe('number');
    expect(typeof body.hitRate).toBe('number');
  });

  test('GET /api/cache/search → 200', async ({ request }) => {
    const res = await request.get('/api/cache/search?pattern=*&limit=10');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('keys');
    expect(body).toHaveProperty('count');
    // redisson_ 内部キーが含まれていないこと（Bug1 修正確認）
    const keys = body.keys as string[];
    const internalKeys = keys.filter((k: string) => k.startsWith('redisson_'));
    expect(internalKeys).toHaveLength(0);
  });

  test('GET /api/lock/metrics → 200', async ({ request }) => {
    const res = await request.get('/api/lock/metrics');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('locks');
  });

  test('GET /api/rate-limiter/status → 200', async ({ request }) => {
    const res = await request.get('/api/rate-limiter/status');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.availablePermissions).toBe('number');
    expect(typeof body.limitForPeriod).toBe('number');
  });

  test('POST /api/cache/set/:key → set → GET → delete 往復', async ({ request }) => {
    const key = `e2e-smoke-${Date.now()}`;
    const value = 'smoke-test-value';

    // SET
    const setRes = await request.post(`/api/cache/set/${key}`, {
      data: { value, ttl: 60 },
    });
    expect(setRes.status()).toBe(200);
    expect((await setRes.json()).success).toBe(true);

    // GET
    const getRes = await request.get(`/api/cache/get/${key}`);
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.found).toBe(true);
    expect(getBody.value).toBe(value);

    // DELETE
    const delRes = await request.delete(`/api/cache/delete/${key}`);
    expect(delRes.status()).toBe(200);
    expect((await delRes.json()).deleted).toBe(true);
  });
});
