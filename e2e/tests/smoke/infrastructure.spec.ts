import { test, expect } from '@playwright/test';

/**
 * インフラ監視スタック検証 — Prometheus / Grafana / OTel Collector
 * Docker Compose 環境で監視基盤が正常に動作していることを確認する
 */

test.describe('Prometheus', () => {

  test('アラートルールが 2 グループ読み込まれている', async ({ request }) => {
    const res = await request.fetch('http://localhost:9090/api/v1/rules');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('success');

    const groups = body.data.groups as Array<{ name: string; rules: unknown[] }>;
    const groupNames = groups.map(g => g.name);
    expect(groupNames).toContain('http_alerts');
    expect(groupNames).toContain('circuit_breaker_alerts');

    // 各グループにルールが存在すること
    for (const group of groups) {
      expect(group.rules.length).toBeGreaterThan(0);
    }
  });

  test('spring-boot スクレイプターゲットが UP', async ({ request }) => {
    const res = await request.fetch('http://localhost:9090/api/v1/targets');
    expect(res.status()).toBe(200);
    const body = await res.json();

    const targets = body.data.activeTargets as Array<{ labels: { job: string }; health: string }>;
    const springBoot = targets.find(t => t.labels.job === 'spring-boot');
    expect(springBoot).toBeDefined();
    expect(springBoot!.health).toBe('up');
  });

  test('otel-collector スクレイプターゲットが存在する', async ({ request }) => {
    const res = await request.fetch('http://localhost:9090/api/v1/targets');
    expect(res.status()).toBe(200);
    const body = await res.json();

    const targets = body.data.activeTargets as Array<{ labels: { job: string }; health: string }>;
    const otelCollector = targets.find(t => t.labels.job === 'otel-collector');
    expect(otelCollector).toBeDefined();
  });
});

test.describe('Grafana', () => {

  test('ダッシュボードが存在する', async ({ request }) => {
    const res = await request.fetch('http://localhost:3000/api/search?type=dash-db');
    expect(res.status()).toBe(200);
    const dashboards = await res.json() as Array<{ uid: string; title: string }>;
    expect(dashboards.length).toBeGreaterThan(0);

    const redisDash = dashboards.find(d => d.uid === 'spring-boot-redis');
    expect(redisDash).toBeDefined();
  });

  test('ダッシュボードが editable: false に設定されている', async ({ request }) => {
    const res = await request.fetch('http://localhost:3000/api/dashboards/uid/spring-boot-redis');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.dashboard.editable).toBe(false);
  });

  test('データソース（Prometheus + Loki）がプロビジョニングされている', async ({ request }) => {
    const res = await request.fetch('http://localhost:3000/api/datasources');
    expect(res.status()).toBe(200);
    const datasources = await res.json() as Array<{ type: string; name: string }>;
    const types = datasources.map(d => d.type);
    expect(types).toContain('prometheus');
    expect(types).toContain('loki');
  });
});
