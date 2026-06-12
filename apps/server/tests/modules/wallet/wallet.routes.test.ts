/**
 * wallet routes 冒烟测试
 *
 * 3 个 action：get / transactions / recharge
 * 全部受 requireFeature: 'wallet' 守卫
 * - wallet=false → 403（feature gate 拦截）
 * - wallet=true → 走 service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockService = vi.hoisted(() => ({
  get: vi.fn(),
  transactions: vi.fn(),
  recharge: vi.fn(),
}));

const mockGetFeatureFlags = vi.fn();
vi.mock('src/modules/wallet/wallet.service.js', () => ({ walletService: mockService }));
vi.mock('src/modules/app-config/app-config.repository.js', () => ({
  configRepo: { getFeatureFlags: () => mockGetFeatureFlags() },
}));
// 用真 featureGatePlugin（带 fp） + mock configRepo；fn.invalidateFeatures 不需 mock

import { walletRoutes } from '../../../src/modules/wallet/wallet.routes.js';
import {
  featureGatePlugin,
  invalidateFeatureFlagsCache,
} from '../../../src/common/middleware/feature-gate.js';
import { BusinessError } from '../../../src/common/errors.js';

async function buildApp(flags: Record<string, boolean>) {
  // 清掉上一次测试留下的 _cache（featureGatePlugin 模块级缓存）
  invalidateFeatureFlagsCache();
  mockGetFeatureFlags.mockResolvedValue(flags);
  const app = Fastify();
  app.decorateRequest('user', undefined);
  app.addHook('onRequest', async (req) => {
    (req as { user?: { id: string } }).user = { id: 'u1' };
  });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BusinessError) {
      return reply.status(err.statusCode).send({ code: err.code, msg: err.message });
    }
    if (err && typeof err === 'object' && 'statusCode' in err) {
      return reply.status((err as { statusCode: number }).statusCode).send({
        code: (err as { code: number }).code,
        msg: (err as Error).message,
      });
    }
    return reply.status(500).send({ code: 500, msg: 'unhandled' });
  });
  // 模拟 app.ts：先注册 featureGatePlugin，再注册业务路由
  await app.register(featureGatePlugin);
  await app.register(walletRoutes, { prefix: '/api/wallet' });
  return app;
}

describe('POST /api/wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('feature gate 守门', () => {
    it('wallet=false → 全部 403', async () => {
      const app = await buildApp({ wallet: false });
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/wallet',
        payload: { action: 'get' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().msg).toMatch(/wallet/);
    });

    it('wallet=true → 走到 service', async () => {
      mockService.get.mockResolvedValue({ balance: '0', status: 'active' });
      const app = await buildApp({ wallet: true });
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/wallet',
        payload: { action: 'get' },
      });
      expect(res.statusCode).toBe(200);
      expect(mockService.get).toHaveBeenCalledWith('u1');
    });
  });

  describe('3 个 action', () => {
    let app: FastifyInstance;
    beforeEach(async () => {
      app = await buildApp({ wallet: true });
      await app.ready();
    });

    it('action=get', async () => {
      mockService.get.mockResolvedValue({ balance: '100' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/wallet',
        payload: { action: 'get' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.balance).toBe('100');
    });

    it('action=transactions', async () => {
      mockService.transactions.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 20 });
      const res = await app.inject({
        method: 'POST',
        url: '/api/wallet',
        payload: { action: 'transactions', payload: { page: 1, pageSize: 20 } },
      });
      expect(res.statusCode).toBe(200);
      expect(mockService.transactions).toHaveBeenCalledWith('u1', expect.objectContaining({ page: 1, pageSize: 20 }));
    });

    it('action=recharge → V1.0 抛 featureDisabled(payment)', async () => {
      mockService.recharge.mockRejectedValue(
        Object.assign(new Error('功能「payment」尚未开通'), { code: 403, statusCode: 403 }),
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/wallet',
        payload: { action: 'recharge', payload: { amount: 100, channel: 'wxpay' } },
      });
      // 走 setErrorHandler → 403
      expect(res.statusCode).toBe(403);
    });

    it('unknown action → 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/wallet',
        payload: { action: 'wat' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
