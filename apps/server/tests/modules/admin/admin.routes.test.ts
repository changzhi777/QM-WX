/**
 * admin routes 单元测试
 *
 * 目标：admin.routes.ts 25% → 90%+
 * 覆盖：
 * - 非白名单 → 403
 * - 8 个 action：upsertContent/upsertProduct/setConfig/listAdmins/listOrders/updateOrderStatus
 * - 错误路径：unknown action、order 不存在
 * - feature_flags setConfig 触发缓存失效
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockPrisma = vi.hoisted(() => ({
  appConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  content: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  product: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  order: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
  user: { findMany: vi.fn(), count: vi.fn() },
  checkin: { count: vi.fn() },
}));

const mockInvalidate = vi.fn();
vi.mock('src/infra/prisma.js', () => ({ prisma: mockPrisma }));
// Mock Redis — 避免 ioredis 真实连接 unhandled error（admin 缓存失效走 Cache.delByPattern）
vi.mock('src/infra/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    scan: vi.fn().mockResolvedValue(['0', []]),
  },
}));
vi.mock('src/common/middleware/feature-gate.js', () => ({
  featureGatePlugin: (app: import('fastify').FastifyInstance) => app, // no-op
  invalidateFeatureFlagsCache: () => mockInvalidate(),
}));

import { adminRoutes } from '../../../src/modules/admin/admin.routes.js';
import { invalidateAdminCache } from '../../../src/modules/admin/admin.service.js';
import { BusinessError } from '../../../src/common/errors.js';

async function buildApp(opts: { openid?: string } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  app.addHook('onRequest', async (req) => {
    (req as { user?: { id: string; openid: string } }).user = {
      id: 'admin-1',
      openid: opts.openid ?? 'o-admin-1',
    };
  });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BusinessError) {
      return reply.status(err.statusCode).send({ code: err.code, msg: err.message });
    }
    return reply.status(500).send({ code: 500, msg: 'unhandled' });
  });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  return app;
}

describe('POST /api/admin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateAdminCache(); // 避免测试间复用 admin 白名单缓存
    // 默认白名单包含 o-admin-1
    mockPrisma.appConfig.findUnique.mockResolvedValue({
      value: { openids: ['o-admin-1', 'o-admin-2'] },
    });
  });

  it('非白名单 openid → 403', async () => {
    app = await buildApp({ openid: 'o-user' });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin',
      payload: { action: 'listAdmins' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().msg).toBe('admin only');
  });

  it('白名单空 → 403', async () => {
    mockPrisma.appConfig.findUnique.mockResolvedValue({ value: { openids: [] } });
    app = await buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin',
      payload: { action: 'listAdmins' },
    });
    expect(res.statusCode).toBe(403);
  });

  describe('listAdmins', () => {
    it('返回白名单 openids', async () => {
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: { action: 'listAdmins' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.openids).toEqual(['o-admin-1', 'o-admin-2']);
    });

    it('白名单 value 为空对象（无 openids 字段）→ 403（isAdmin 必拒，逻辑上无法测 listAdmins）', async () => {
      // 注释：value={} 意味着 openids 缺省，isAdmin 返回 false，所以无法进入 listAdmins 分支。
      // 真正"空数组"的情况是 value={openids:[]}，但此时 isAdmin 也返回 false 拒。
      // → listAdmins 的"空"分支事实上永远到不了（要进 listAdmins 必须先过 isAdmin）
      mockPrisma.appConfig.findUnique.mockResolvedValue({ value: {} });
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: { action: 'listAdmins' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('upsertContent', () => {
    it('无 id → create', async () => {
      mockPrisma.content.create.mockResolvedValue({ id: 'c1' });
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: {
          action: 'upsertContent',
          payload: { type: 'marathon', title: '活动' },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.id).toBe('c1');
      expect(mockPrisma.content.create).toHaveBeenCalled();
      expect(mockPrisma.content.update).not.toHaveBeenCalled();
    });

    it('有 id → update', async () => {
      mockPrisma.content.update.mockResolvedValue({ id: 'c1' });
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: {
          action: 'upsertContent',
          payload: { id: 'c1', type: 'marathon', title: '更新' },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.content.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({ title: '更新' }),
      });
    });

    it('参数非法 → 500（ZodError 不被 setErrorHandler 抓住 → 走 500 分支）', async () => {
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: {
          action: 'upsertContent',
          payload: { type: 'invalid-type', title: '' },
        },
      });
      // ZodError 未被 admin 自己处理（不像 sport parseOrBadRequest）→ unhandled
      expect(res.statusCode).toBe(500);
    });
  });

  describe('upsertProduct', () => {
    it('无 id → create', async () => {
      mockPrisma.product.create.mockResolvedValue({ id: 'p1' });
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: {
          action: 'upsertProduct',
          payload: { name: '商品', category: '鞋服', price: 99 },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.product.create).toHaveBeenCalled();
    });

    it('有 id → update', async () => {
      mockPrisma.product.update.mockResolvedValue({ id: 'p1' });
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: {
          action: 'upsertProduct',
          payload: { id: 'p1', name: '商品', category: '鞋服', price: 99 },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.product.update).toHaveBeenCalled();
    });
  });

  describe('setConfig', () => {
    it('feature_flags → upsert + 触发缓存失效', async () => {
      mockPrisma.appConfig.upsert.mockResolvedValue({ id: 'feature_flags' });
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: {
          action: 'setConfig',
          payload: {
            id: 'feature_flags',
            value: { wallet: true, payment: false },
          },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.appConfig.upsert).toHaveBeenCalled();
      expect(mockInvalidate).toHaveBeenCalled();
    });

    it('非 feature_flags → 不触发缓存失效', async () => {
      mockPrisma.appConfig.upsert.mockResolvedValue({ id: 'points_rules' });
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: {
          action: 'setConfig',
          payload: { id: 'points_rules', value: { perKm: 1 } },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(mockInvalidate).not.toHaveBeenCalled();
    });
  });

  describe('listOrders', () => {
    it('分页 + 状态过滤 + 序列化', async () => {
      mockPrisma.order.findMany.mockResolvedValue([
        {
          id: 'o1',
          status: 'paid',
          totalAmount: { toString: () => '299.00' } as unknown as number,
          payAmount: { toString: () => '299.00' } as unknown as number,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
          items: [],
          user: { id: 'u1', nickname: '张三', phone: '138' },
        },
      ]);
      mockPrisma.order.count.mockResolvedValue(1);

      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: {
          action: 'listOrders',
          payload: { status: 'paid', page: 1, pageSize: 20 },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.total).toBe(1);
      expect(res.json().data.list[0].totalAmount).toBe('299.00');
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'paid' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('不传 status → 全部订单', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: { action: 'listOrders' },
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('updateOrderStatus', () => {
    it('订单不存在 → 404', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: {
          action: 'updateOrderStatus',
          payload: { orderId: 'x', status: 'paid' },
        },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().msg).toMatch(/订单不存在/);
    });

    it('正常 → update + 返回新状态', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'pending_pay' });
      mockPrisma.order.update.mockResolvedValue({
        id: 'o1',
        status: 'paid',
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      });

      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin',
        payload: {
          action: 'updateOrderStatus',
          payload: { orderId: 'o1', status: 'paid' },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('paid');
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'paid' },
      });
    });
  });

  describe('listUsers（P1-2 新增）', () => {
    it('分页 + 时间序列化', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', openid: 'o1', nickname: '张三', phone: '138', points: 100, memberLevel: 'free', memberExpireAt: null, createdAt: new Date('2026-01-01T00:00:00Z') },
      ]);
      mockPrisma.user.count.mockResolvedValue(1);
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST', url: '/api/admin',
        payload: { action: 'listUsers', payload: { page: 1, pageSize: 20 } },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.total).toBe(1);
      expect(res.json().data.list[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('keyword → OR 过滤', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
      app = await buildApp();
      await app.ready();
      await app.inject({
        method: 'POST', url: '/api/admin',
        payload: { action: 'listUsers', payload: { keyword: '张' } },
      });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { OR: expect.any(Array) } }),
      );
    });
  });

  describe('listContents（P1-2 新增，admin 视角含 off）', () => {
    it('status 过滤 + Decimal 序列化', async () => {
      mockPrisma.content.findMany.mockResolvedValue([
        {
          id: 'c1', type: 'marathon', title: '赛事', price: { toString: () => '99.00' } as never,
          fee: null, status: 'off', sort: 0, tags: [],
          createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);
      mockPrisma.content.count.mockResolvedValue(1);
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST', url: '/api/admin',
        payload: { action: 'listContents', payload: { status: 'off' } },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.list[0].status).toBe('off');
      expect(res.json().data.list[0].price).toBe('99.00');
      expect(mockPrisma.content.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'off' } }),
      );
    });
  });

  describe('listProducts（P1-2 新增）', () => {
    it('category 过滤', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'p1', name: '跑鞋', category: '鞋服', price: { toString: () => '299.00' } as never,
          originalPrice: null, memberDiscount: null, status: 'on', sort: 0, images: [], stock: 10,
          createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);
      mockPrisma.product.count.mockResolvedValue(1);
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST', url: '/api/admin',
        payload: { action: 'listProducts', payload: { category: '鞋服' } },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.list[0].price).toBe('299.00');
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { category: '鞋服' } }),
      );
    });
  });

  describe('stats（P1-2 新增，概览聚合）', () => {
    it('返回 userCount/orderCount/revenue/checkinCount', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      mockPrisma.order.count.mockResolvedValue(50);
      mockPrisma.order.aggregate.mockResolvedValue({ _sum: { payAmount: { toString: () => '9999.00' } as never } });
      mockPrisma.checkin.count.mockResolvedValue(200);
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST', url: '/api/admin',
        payload: { action: 'stats' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({
        userCount: 100, orderCount: 50, revenue: '9999.00', checkinCount: 200,
      });
      expect(mockPrisma.order.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: { in: ['paid', 'shipped', 'done'] } } }),
      );
    });

    it('无已支付订单 → revenue = "0"', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.aggregate.mockResolvedValue({ _sum: { payAmount: null } });
      mockPrisma.checkin.count.mockResolvedValue(0);
      app = await buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST', url: '/api/admin',
        payload: { action: 'stats' },
      });
      expect(res.json().data.revenue).toBe('0');
    });
  });

  it('unknown action → 400', async () => {
    app = await buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin',
      payload: { action: 'do-something-bad' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().msg).toMatch(/unknown action/);
  });
});
