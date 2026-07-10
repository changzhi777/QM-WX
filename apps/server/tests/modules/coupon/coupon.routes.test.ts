/**
 * coupon routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 4 action + 鉴权 + 未知 action 400
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockCouponService = vi.hoisted(() => ({
  templates: vi.fn(),
  myCoupons: vi.fn(),
  availableCount: vi.fn(),
  receive: vi.fn(),
}));

vi.mock('src/modules/coupon/coupon.service.js', () => ({ couponService: mockCouponService }));
vi.mock('src/common/errors.js', () => ({
  Errors: {
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
  },
}));

import { couponRoutes } from '../../../src/modules/coupon/coupon.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(couponRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('coupon routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'templates' } });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('unknown action → 400', async () => {
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'unknown' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().msg).toContain('unknown action');
    await app.close();
  });

  it('templates → 返 {templates}', async () => {
    mockCouponService.templates.mockResolvedValue({ templates: [] });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'templates' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toEqual({ templates: [] });
    expect(mockCouponService.templates).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('myCoupons → 返 {list, count}', async () => {
    mockCouponService.myCoupons.mockResolvedValue({ list: [], count: 0 });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'myCoupons', payload: { status: 'unused' } } });
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toEqual({ list: [], count: 0 });
    await app.close();
  });

  it('availableCount → 返 {count}', async () => {
    mockCouponService.availableCount.mockResolvedValue(3);
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'availableCount' } });
    expect(r.json().data).toEqual({ count: 3 });
    await app.close();
  });

  it('receive → 返 {id, expireAt}', async () => {
    mockCouponService.receive.mockResolvedValue({ id: 'c1', expireAt: '2026-08-01' });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'receive', payload: { templateId: 't1' } } });
    expect(r.json().data).toEqual({ id: 'c1', expireAt: '2026-08-01' });
    expect(mockCouponService.receive).toHaveBeenCalledWith('u1', 't1');
    await app.close();
  });
});
