/**
 * wxpay 支付回调 e2e（mock 微信回调）
 *
 * 场景：
 * ① 准备：1 个用户 + 1 个订单（payChannel='wxpay', payAmount=10, status=pending_pay, prepayId 存在）
 * ② 构造一个"成功"的回调 resource，密文走自签 RSA 平台证书路径不便，**走 mock**：直接伪造
 *    resource（service 验签需真私钥，沙箱测试跳过验签直接 mock service 内部成功）
 * ③ 注入回调 → 验：Order.status=paid + Order.wxTransactionId 写入 + WalletTransaction 落库
 * ④ 再发一次同 transactionId 回调 → 验幂等（Order.paidAt 不变，data.dedup=true）
 *
 * 注：本测试 mock 验签（因测试环境无真实 wx 平台证书）
 * 真生产：service.verifyAndDecryptNotify 必须真验签
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../src/infra/prisma.js';
import * as wxpayService from '../../src/modules/wxpay/wxpay.service.js';
import type { WxpayNotifyDecrypted } from '../../src/modules/wxpay/wxpay.schema.js';

const E2E_USER_CODE = 'e2e-wxpay-user';
const E2E_OPENID = `e2e-wxpay-${E2E_USER_CODE}`;
const E2E_PRODUCT_ID = 'e2e-wxpay-product-1';
const E2E_TXN_ID = 'e2e-wx-txn-001';

// ===== mock code2Session（login 走它） =====
vi.mock('../../src/common/integrations/wx/code2session.js', () => ({
  code2Session: vi.fn(async (code: string) => ({
    openid: `e2e-wxpay-${code}`,
    session_key: 'sk',
  })),
}));
// ===== mock Redis（避免 wxpay require 走真实 Redis） =====
vi.mock('../../src/infra/redis.js', () => ({
  redis: { setex: vi.fn().mockResolvedValue('OK') },
}));

let orderId: string;

// ===== mock verifyAndDecryptNotify 直接返回固定 resource（跳过真实验签） =====
const mockResource: WxpayNotifyDecrypted = {
  appid: 'wx-test',
  mchid: 'mch-test',
  out_trade_no: '', // 动态设置
  transaction_id: E2E_TXN_ID,
  trade_state: 'SUCCESS',
  amount: { total: 1000, currency: 'CNY' },
  payer: { openid: E2E_OPENID },
  success_time: '2026-06-12T00:00:00+08:00',
};

// mock 整个 wxpay service module 的 verifyAndDecryptNotify（ESM 友好）
vi.mock('../../src/modules/wxpay/wxpay.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof wxpayService>();
  return {
    ...actual,
    verifyAndDecryptNotify: () => ({ resource: { ...mockResource }, verified: true }),
    isPaySuccess: (r: WxpayNotifyDecrypted) => r.trade_state === 'SUCCESS',
  };
});

const { buildApp } = await import('../../src/app.js');

const skip = !process.env.RUN_E2E;
const itE2E = skip ? it.skip : it;

describe.skipIf(skip)('wxpay 支付回调 e2e（mock 微信回调）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 创建用户 + product + order
    const login = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: E2E_USER_CODE } },
    });
    expect(login.statusCode).toBe(200);
    const userId = login.json().data.user.id;

    await prisma.product.upsert({
      where: { id: E2E_PRODUCT_ID },
      create: {
        id: E2E_PRODUCT_ID,
        name: 'e2e wxpay 商品',
        category: 'cat-e2e',
        price: 10 as never,
        images: [],
        stock: 100,
        status: 'on',
        sort: 0,
      },
      update: { status: 'on' },
    });

    const order = await prisma.order.create({
      data: {
        userId,
        items: {
          create: [
            { productId: E2E_PRODUCT_ID, name: 'e2e wxpay 商品', price: 10 as never, qty: 1 },
          ],
        },
        totalAmount: 10 as never,
        payAmount: 10 as never,
        pointsUsed: 0,
        status: 'pending_pay',
        payChannel: 'wxpay',
        prepayId: 'prepay-e2e-001',
      },
    });
    orderId = order.id;
    // 同步 mock resource.out_trade_no
    mockResource.out_trade_no = orderId;
  });

  afterAll(async () => {
    // 强清
    await prisma.walletTransaction.deleteMany({ where: { orderId } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
    await prisma.product.delete({ where: { id: E2E_PRODUCT_ID } }).catch(() => {});
    await prisma.user.delete({ where: { openid: E2E_OPENID } }).catch(() => {});
    await app.close();
  });

  itE2E('首次回调：Order.status=paid + wxTransactionId 落库', async () => {
    const res = await app.inject({
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
    if (res.statusCode !== 200) {
      console.log('FAIL 响应:', res.statusCode, res.body);
    }
    expect(res.statusCode).toBe(200);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('paid');
    expect(order?.wxTransactionId).toBe(E2E_TXN_ID);
    expect(order?.paidAt).toBeTruthy();
    // MVP 阶段 WalletTransaction 写入留 TODO Phase 4.1
  });

  itE2E('幂等：同 transactionId 第二次回调 → data.dedup=true，paidAt 不变', async () => {
    const before = await prisma.order.findUnique({ where: { id: orderId } });
    const paidAtBefore = before?.paidAt;

    const res = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: {
        'Wechatpay-Serial': 'cert-serial-mock',
        'Wechatpay-Timestamp': String(Math.floor(Date.now() / 1000)),
        'Wechatpay-Nonce': 'mock-nonce-' + Date.now() + 'b',
        'Wechatpay-Signature': 'mock-signature',
      },
      payload: { action: 'notify' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.dedup).toBe(true);

    const after = await prisma.order.findUnique({ where: { id: orderId } });
    expect(after?.paidAt?.getTime()).toBe(paidAtBefore?.getTime());
  });
});
