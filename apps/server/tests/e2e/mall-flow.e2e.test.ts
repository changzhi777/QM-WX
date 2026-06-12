/**
 * mall 全链路 e2e（in-process fastify + inject）
 *
 * 完整 Happy Path：
 *   ① 登录（mock code2Session → 拿 JWT + 初始积分 50）
 *   ② 给 user 加足够积分 + 建 1 个 product（beforeAll 准备）
 *   ③ listProducts → 拿商品
 *   ④ createOrder（全额积分抵扣）→ 拿 orderId
 *   ⑤ myOrders → 验证订单存在、status=paid（全额抵扣）
 *   ⑥ cancelOrder → 取消
 *   ⑦ 验证：积分回退 + PointsRecord 有 refund 记录
 *
 * 数据隔离：所有测试数据 prefix `e2e-mall-` + afterAll 强删
 *
 * 跑法：RUN_E2E=1 pnpm test mall-flow
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../src/infra/prisma.js';

const E2E_USER_CODE = 'e2e-mall-user-code';
const E2E_OPENID = `e2e-mall-${E2E_USER_CODE}`;
const E2E_PRODUCT_ID = 'e2e-mall-product-1';
const E2E_PRODUCT_PRICE = 1; // 1 元（POINTS_TO_YUAN=0.01，100 积分 = 1 元 = 全额抵扣）

// ===== mock 微信 code2Session =====
vi.mock('../../src/common/integrations/wx/code2session.js', () => ({
  code2Session: vi.fn(async (code: string) => {
    return { openid: `e2e-mall-${code}`, session_key: 'sk-mall' };
  }),
}));

const { buildApp } = await import('../../src/app.js');

const skip = !process.env.RUN_E2E;
const itE2E = skip ? it.skip : it;

describe.skipIf(skip)('mall 全链路 e2e', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. 登录拿 JWT
    const login = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: E2E_USER_CODE } },
    });
    expect(login.statusCode).toBe(200);
    const body = login.json();
    expect(body.code).toBe(0);
    token = body.data.accessToken;
    userId = body.data.user.id;

    // 2. 给 user 加足够积分（500 分 = 50 元，够买 10 元商品）
    await prisma.user.update({
      where: { id: userId },
      data: { points: 500 },
    });

    // 3. 建测试商品
    await prisma.product.upsert({
      where: { id: E2E_PRODUCT_ID },
      create: {
        id: E2E_PRODUCT_ID,
        name: 'e2e 测试商品',
        category: 'cat-e2e',
        price: E2E_PRODUCT_PRICE as never,
        images: [],
        stock: 100,
        status: 'on',
        sort: 0,
      },
      update: { status: 'on', price: E2E_PRODUCT_PRICE as never, stock: 100 },
    });
  });

  afterAll(async () => {
    // 强清：order items → orders → points → product → user
    await prisma.orderItem.deleteMany({ where: { order: { userId } } });
    await prisma.order.deleteMany({ where: { userId } });
    await prisma.pointsRecord.deleteMany({ where: { userId } });
    await prisma.product.delete({ where: { id: E2E_PRODUCT_ID } }).catch(() => {});
    await prisma.user.delete({ where: { openid: E2E_OPENID } }).catch(() => {});
    await app.close();
  });

  itE2E('完整链路：浏览 → 下单（全额积分） → 查订单 → 取消 → 积分回退', async () => {
    // === ③ 浏览商品 ===
    const listRes = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: { action: 'listProducts', payload: { page: 1, pageSize: 20 } },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(listBody.code).toBe(0);
    const found = listBody.data.list.find((p: { id: string }) => p.id === E2E_PRODUCT_ID);
    expect(found, 'e2e 测试商品应出现在列表').toBeDefined();

    // === ④ 下单（pointsUsed 100 → 10 元，全额抵扣） ===
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/mall',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        action: 'createOrder',
        payload: {
          items: [{ productId: E2E_PRODUCT_ID, qty: 1 }],
          pointsUsed: 100,
          address: { name: 'e2e', phone: '13800000000', detail: '测试地址' },
        },
      },
    });
    expect(createRes.statusCode).toBe(200);
    const createBody = createRes.json();
    expect(createBody.code).toBe(0);
    const orderId = createBody.data.orderId;
    expect(orderId).toBeTruthy();

    // 验证：order 状态 = paid（全额抵扣）
    expect(createBody.data.status).toBe('paid');

    // 验证积分扣减
    const userAfterOrder = await prisma.user.findUnique({ where: { id: userId } });
    expect(userAfterOrder?.points).toBe(400); // 500 - 100

    // === ⑤ myOrders → 验证订单存在 ===
    const myOrdersRes = await app.inject({
      method: 'POST',
      url: '/api/mall',
      headers: { authorization: `Bearer ${token}` },
      payload: { action: 'myOrders', payload: { page: 1, pageSize: 20 } },
    });
    expect(myOrdersRes.statusCode).toBe(200);
    const myOrdersBody = myOrdersRes.json();
    expect(myOrdersBody.code).toBe(0);
    const myOrder = myOrdersBody.data.list.find((o: { id: string }) => o.id === orderId);
    expect(myOrder).toBeDefined();
    expect(myOrder.status).toBe('paid');

    // === ⑥ cancelOrder ===
    const cancelRes = await app.inject({
      method: 'POST',
      url: '/api/mall',
      headers: { authorization: `Bearer ${token}` },
      payload: { action: 'cancelOrder', payload: { orderId } },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().code).toBe(0);

    // === ⑦ 验证：积分回退 + PointsRecord 有 refund 记录 ===
    const userAfterCancel = await prisma.user.findUnique({ where: { id: userId } });
    expect(userAfterCancel?.points, '积分应回退').toBe(500);

    // refund 用的是 type='order_deduct' source + 正 change（区别于下单时的负 change）
    const records = await prisma.pointsRecord.findMany({
      where: { userId, refId: orderId },
      orderBy: { createdAt: 'asc' },
    });
    expect(records.length, '应有 2 条 PointsRecord：下单扣 + 取消退').toBeGreaterThanOrEqual(2);
    const deduct = records.find((r) => r.change < 0);
    const refund = records.find((r) => r.change > 0);
    expect(deduct?.change, '下单扣 100 分').toBe(-100);
    expect(refund?.change, '取消退 100 分').toBe(100);
  });

  itE2E('安全：未登录访问 myOrders → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: { action: 'myOrders', payload: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  itE2E('安全：游客可访问公开端点（listCategories）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: { action: 'listCategories' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().code).toBe(0);
  });
});
