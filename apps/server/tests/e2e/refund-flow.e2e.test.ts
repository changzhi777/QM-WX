/**
 * 退款 happy path e2e（真 PG/Redis + mock 微信 refund）
 *
 * 链路：
 * ① 准备：1 用户 / 1 product / admin 白名单 / admin 登录
 * ② 用户下单（payAmount=10, payChannel=wxpay）→ order=pending_pay
 * ③ mock 微信 notify → order=paid + wallet.balance=10 + 流水 type=recharge
 * ④ admin 调 refundOrder（mock wxpay.service.refund 返 SUCCESS）→ order=refunded + wallet.balance=0 + 流水 type=refund
 *
 * 跑法：RUN_E2E=1 pnpm test
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../src/infra/prisma.js';
import * as wxpayService from '../../src/modules/wxpay/wxpay.service.js';
import type { WxpayNotifyDecrypted } from '../../src/modules/wxpay/wxpay.schema.js';

const E2E_USER_CODE = 'e2e-refund-user';
const E2E_OPENID = `e2e-refund-${E2E_USER_CODE}`;
const E2E_ADMIN_CODE = 'e2e-refund-admin';
// mock code2Session 输出：`e2e-refund-${code}`，所以 admin 登录后 openid = `e2e-refund-e2e-refund-admin`
const E2E_ADMIN_OPENID = `e2e-refund-${E2E_ADMIN_CODE}`;
const E2E_PRODUCT_ID = 'e2e-refund-product-1';
const E2E_TXN_ID = 'e2e-refund-wx-txn-001';
const E2E_REFUND_ID = 'e2e-refund-wx-refund-001';

// ===== mock code2Session（login 走它） =====
vi.mock('../../src/common/integrations/wx/code2session.js', () => ({
  code2Session: vi.fn(async (code: string) => ({
    openid: `e2e-refund-${code}`,
    session_key: 'sk',
  })),
}));
// ===== mock Redis（admin / wallet 路径用） =====
vi.mock('../../src/infra/redis.js', () => ({
  redis: { setex: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue(null) },
}));

// ===== mock 微信 notify（验签） — 用之前 e2e 模式：直接返 mock resource =====
const mockResource: WxpayNotifyDecrypted = {
  appid: 'wx-test',
  mchid: 'mch-test',
  out_trade_no: '', // 动态设置
  transaction_id: E2E_TXN_ID,
  trade_state: 'SUCCESS',
  amount: { total: 1000, currency: 'CNY' },
  payer: { openid: E2E_OPENID },
  success_time: '2026-06-13T00:00:00+08:00',
};
vi.mock('../../src/modules/wxpay/wxpay.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof wxpayService>();
  return {
    ...actual,
    verifyAndDecryptNotify: () => ({ resource: { ...mockResource }, verified: true }),
    isPaySuccess: (r: WxpayNotifyDecrypted) => r.trade_state === 'SUCCESS',
    // refund mock：返 SUCCESS 响应
    refund: vi.fn(async () => ({
      refundId: E2E_REFUND_ID,
      outRefundNo: `refund-${Date.now()}`,
      outTradeNo: '',
      transactionId: E2E_TXN_ID,
      status: 'SUCCESS',
      amount: { refund: 1000, total: 1000 },
    })),
  };
});

const { buildApp } = await import('../../src/app.js');

const skip = !process.env.RUN_E2E;
const itE2E = skip ? it.skip : it;

describe.skipIf(skip)('退款 happy path e2e（管理员全额退款）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userId: string;
  let orderId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. 准备 admin 白名单（真实 DB 写入）
    await prisma.appConfig.upsert({
      where: { id: 'admin_whitelist' },
      create: {
        id: 'admin_whitelist',
        value: { openids: [E2E_ADMIN_OPENID] },
      },
      update: { value: { openids: [E2E_ADMIN_OPENID] } },
    });
    // 清缓存（admin.isAdmin 有内存缓存）
    const { invalidateAdminCache } = await import('../../src/modules/admin/admin.service.js');
    invalidateAdminCache();

    // 2. 用户登录
    const userLogin = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: E2E_USER_CODE } },
    });
    expect(userLogin.statusCode).toBe(200);
    userId = userLogin.json().data.user.id;

    // 3. 创建 product
    await prisma.product.upsert({
      where: { id: E2E_PRODUCT_ID },
      create: {
        id: E2E_PRODUCT_ID,
        name: 'e2e refund 商品',
        category: 'cat-e2e',
        price: 10 as never,
        images: [],
        stock: 100,
        status: 'on',
        sort: 0,
      },
      update: { status: 'on' },
    });

    // 4. 创建订单
    const order = await prisma.order.create({
      data: {
        userId,
        items: {
          create: [
            { productId: E2E_PRODUCT_ID, name: 'e2e refund 商品', price: 10 as never, qty: 1 },
          ],
        },
        totalAmount: 10 as never,
        payAmount: 10 as never,
        pointsUsed: 0,
        status: 'pending_pay',
        payChannel: 'wxpay',
        prepayId: 'prepay-e2e-refund-001',
      },
    });
    orderId = order.id;
    mockResource.out_trade_no = orderId;

    // 5. 触发微信支付 notify（走 wxpay.routes 注入，order 变 paid + 钱包 +10）
    const notifyRes = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: {
        'Wechatpay-Serial': 'cert-serial-mock',
        'Wechatpay-Timestamp': String(Math.floor(Date.now() / 1000)),
        'Wechatpay-Nonce': 'mock-nonce-' + Date.now(),
        'Wechatpay-Signature': 'mock-signature',
      },
      payload: { action: 'notify' },
    });
    expect(notifyRes.statusCode).toBe(200);
  });

  afterAll(async () => {
    // 强清理
    await prisma.walletTransaction.deleteMany({ where: { orderId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
    await prisma.product.delete({ where: { id: E2E_PRODUCT_ID } }).catch(() => {});
    await prisma.user.delete({ where: { openid: E2E_OPENID } }).catch(() => {});
    await prisma.user.delete({ where: { openid: E2E_ADMIN_OPENID } }).catch(() => {});
    await app.close();
  });

  itE2E('step 1: notify 后 order=paid + wallet.balance=10 + 流水 type=recharge', async () => {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('paid');
    expect(order?.wxTransactionId).toBe(E2E_TXN_ID);
    expect(order?.paidAt).toBeTruthy();
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(wallet?.balance)).toBe(10);
    const rechargeTxns = await prisma.walletTransaction.findMany({
      where: { orderId, type: 'recharge' },
    });
    expect(rechargeTxns).toHaveLength(1);
    expect(String(rechargeTxns[0].amount)).toBe('10');
  });

  itE2E('step 2: admin 调 refundOrder → order=refunded + wallet.balance=0 + 流水 type=refund', async () => {
    // admin 登录
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: E2E_ADMIN_CODE } },
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminToken = adminLogin.json().data.accessToken;

    // 调 refundOrder（mock wxpay.service.refund 返 SUCCESS）
    const refundRes = await app.inject({
      method: 'POST',
      url: '/api/admin',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        action: 'refundOrder',
        payload: { orderId, reason: 'e2e 测试退款' },
      },
    });
    if (refundRes.statusCode !== 200) {
      console.log('FAIL refund 响应:', refundRes.statusCode, refundRes.body);
    }
    expect(refundRes.statusCode).toBe(200);
    expect(refundRes.json().data).toMatchObject({
      orderId,
      refundId: E2E_REFUND_ID,
      refundYuan: 10,
      status: 'SUCCESS',
    });

    // 验 Order
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('refunded');

    // 验 Wallet balance = 0
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(wallet?.balance)).toBe(0);

    // 验 WalletTransaction type=refund, amount=-10
    const refundTxns = await prisma.walletTransaction.findMany({
      where: { orderId, type: 'refund' },
    });
    expect(refundTxns).toHaveLength(1);
    expect(String(refundTxns[0].amount)).toBe('-10');
    expect(refundTxns[0].wxTransactionId).toBe(E2E_REFUND_ID);
  });

  itE2E('step 3: 重复退款 → 状态机拒绝（paid → refunded 不可再 refunded）', async () => {
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: E2E_ADMIN_CODE } },
    });
    const adminToken = adminLogin.json().data.accessToken;

    // 尝试对 refunded 订单再退 — order.status !== 'paid' → badRequest
    const refundRes = await app.inject({
      method: 'POST',
      url: '/api/admin',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { action: 'refundOrder', payload: { orderId } },
    });
    if (refundRes.statusCode < 400) {
      console.log('step 3 unexpected 2xx:', refundRes.statusCode, refundRes.body);
    }
    expect(refundRes.statusCode).toBeGreaterThanOrEqual(400);
    const body = refundRes.json() as { message?: string; msg?: string; code?: number };
    // fastify 默认错误格式或 BusinessError 格式都兼容
    const errMsg = body.message ?? body.msg;
    expect(errMsg).toMatch(/refunded 不可退款/);
  });
});
