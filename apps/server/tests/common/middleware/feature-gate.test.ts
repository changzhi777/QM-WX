/**
 * 功能开关中间件测试
 *
 * 关键路径：
 * - 无 requireFeature → 直接放行
 * - requireFeature 命中且 flag=true → 放行
 * - requireFeature 命中且 flag=false → 抛 featureDisabled
 * - 缓存：第一次查 DB，后续用缓存
 * - invalidateFeatureFlagsCache 强制失效
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockGetFeatureFlags = vi.fn();

vi.mock('src/modules/app-config/app-config.repository.js', () => ({
  configRepo: {
    getFeatureFlags: () => mockGetFeatureFlags(),
  },
}));

vi.mock('src/common/errors.js', () => ({
  Errors: {
    featureDisabled: (feature: string) => {
      const e = new Error(`功能「${feature}」尚未开通`) as Error & {
        code: number;
        statusCode: number;
      };
      e.code = 403;
      e.statusCode = 403;
      return e;
    },
  },
}));

import {
  featureGatePlugin,
  invalidateFeatureFlagsCache,
} from '../../../src/common/middleware/feature-gate.js';

async function buildTestApp() {
  const app = Fastify();
  await app.register(featureGatePlugin);
  app.get('/no-gate', async () => ({ ok: true }));
  app.get(
    '/wallet-route',
    { config: { requireFeature: 'wallet' } },
    async () => ({ ok: true }),
  );
  return app;
}

describe('featureGatePlugin', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    mockGetFeatureFlags.mockReset();
    invalidateFeatureFlagsCache();
  });

  it('无 requireFeature：放行（onReady 预热 1 次 DB，onRequest 不再查）', async () => {
    mockGetFeatureFlags.mockResolvedValue({ wallet: true, payment: false });
    app = await buildTestApp();
    await app.ready();
    // onReady 已调 1 次预热
    expect(mockGetFeatureFlags).toHaveBeenCalledTimes(1);
    const res = await app.inject({ method: 'GET', url: '/no-gate' });
    expect(res.statusCode).toBe(200);
    // 请求本身不再查（onRequest 里 requireFeature 缺失直接 return）
    expect(mockGetFeatureFlags).toHaveBeenCalledTimes(1);
  });

  it('requireFeature=wallet，flag=true → 200（用 onReady 缓存，不查 DB）', async () => {
    mockGetFeatureFlags.mockResolvedValue({ wallet: true, payment: false });
    app = await buildTestApp();
    await app.ready();
    expect(mockGetFeatureFlags).toHaveBeenCalledTimes(1); // onReady
    const res = await app.inject({ method: 'GET', url: '/wallet-route' });
    expect(res.statusCode).toBe(200);
    expect(mockGetFeatureFlags).toHaveBeenCalledTimes(1); // 命中缓存
  });

  it('requireFeature=wallet，flag=false → 403（命中缓存但 flag=false）', async () => {
    mockGetFeatureFlags.mockResolvedValue({ wallet: false, payment: false });
    app = await buildTestApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/wallet-route' });
    expect(res.statusCode).toBe(403);
  });

  it('缓存命中：N 次 requireFeature 请求只查 1 次 DB（onReady 预热）', async () => {
    mockGetFeatureFlags.mockResolvedValue({ wallet: true, payment: false });
    app = await buildTestApp();
    await app.ready();
    await app.inject({ method: 'GET', url: '/wallet-route' });
    await app.inject({ method: 'GET', url: '/wallet-route' });
    await app.inject({ method: 'GET', url: '/wallet-route' });
    expect(mockGetFeatureFlags).toHaveBeenCalledTimes(1);
  });

  it('invalidateFeatureFlagsCache 后下次请求重查 DB', async () => {
    mockGetFeatureFlags.mockResolvedValue({ wallet: true, payment: false });
    app = await buildTestApp();
    await app.ready();
    expect(mockGetFeatureFlags).toHaveBeenCalledTimes(1); // onReady

    invalidateFeatureFlagsCache();
    await app.inject({ method: 'GET', url: '/wallet-route' });
    expect(mockGetFeatureFlags).toHaveBeenCalledTimes(2);
  });
});
