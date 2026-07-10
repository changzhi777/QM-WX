/**
 * wxpay notify 路由层单测
 *
 * 覆盖（事务内分支）：
 * ① 成功支付 → walletRepo.ensureWalletInTx + tx.wallet.update(balance+=) + tx.walletTransaction.create + tx.order.update
 * ② 金额分→元 转换正确（resource.amount.total=1000 → 写入 10）
 * ③ 写流水 type='recharge'，status='success'，wxTransactionId/orderId 都对得上
 * ④ 幂等：同 transactionId 第二次回调 → 不调 $transaction
 * ⑤ 非 SUCCESS 状态 → 不调 $transaction
 *
 * 做法：mock 整个 wxpay.service（绕开真验签），mock prisma.$transaction 直接执行 fn，
 *       注入 buildApp 走真路由分支。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createPrismaMock } from '../../helpers/mockPrisma.js';
import type { WxpayNotifyDecrypted } from '../../../src/modules/wxpay/wxpay.schema.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['order', 'wallet', 'walletTransaction', 'enrollment'],
    txModels: ['wallet', 'walletTransaction', 'order', 'enrollment'],
  });
});

// mock wxpay.service：直接返回固定 resource，绕过真验签
const mockResource: WxpayNotifyDecrypted = {
  appid: 'wx-test',
  mchid: 'mch-test',
  out_trade_no: 'order-1',
  transaction_id: 'wx-txn-001',
  trade_state: 'SUCCESS',
  amount: { total: 1000, currency: 'CNY' }, // 1000 分 = 10 元
  payer: { openid: 'ou1' },
  success_time: '2026-06-13T00:00:00+08:00',
};

vi.mock('../../../src/modules/wxpay/wxpay.service.js', () => ({
  verifyAndDecryptNotify: () => ({ resource: mockResource, verified: true }),
  isPaySuccess: (r: WxpayNotifyDecrypted) => r.trade_state === 'SUCCESS',
  generateAuthorization: () => '',
  aesGcmDecrypt: () => '',
}));

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));

// mock walletRepo（关键：验被调用 + 传正确 tx）
const mockWalletRepo = vi.hoisted(() => ({
  ensureWalletInTx: vi.fn(),
  ensureWallet: vi.fn(),
}));
vi.mock('../../../src/modules/wallet/wallet.repo.js', () => ({ walletRepo: mockWalletRepo }));

// mock distribution.service：settleCommission 在分销单（order.sourceUserId）回调时被调
const mockSettleCommission = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../../src/modules/distribution/distribution.service.js', () => ({
  settleCommission: mockSettleCommission,
}));

import { wxpayRoutes } from '../../../src/modules/wxpay/wxpay.routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  app.setErrorHandler((err, _req, reply) => {
    const e = err as Error & { code?: number; statusCode?: number };
    return reply.status(e.statusCode ?? 500).send({ code: e.code ?? 500, msg: err.message });
  });
  await app.register(wxpayRoutes, { prefix: '/api/wxpay' });
  return app;
}

const WX_HEADERS = {
  'Wechatpay-Serial': 'cert-serial-mock',
  'Wechatpay-Timestamp': String(Math.floor(Date.now() / 1000)),
  'Wechatpay-Nonce': 'mock-nonce',
  'Wechatpay-Signature': 'mock-signature',
};

describe('POST /api/wxpay notify — 事务内 WalletTransaction 写入', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    // 重新绑定 $transaction：clearAllMocks 会清掉 mockImplementation
    mocks.prisma.$transaction.mockImplementation((fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
    // 订单 findUnique 返回挂起中的订单
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'u1',
      payAmount: 10,
      payChannel: 'wxpay',
      status: 'pending_pay',
      wxTransactionId: null,
    });
    // walletRepo ensureWalletInTx 返回一个 wallet
    mockWalletRepo.ensureWalletInTx.mockResolvedValue({ id: 'w1', userId: 'u1' });
    // wallet.update 模拟成功（无返回约束）
    mocks.tx.wallet.update.mockResolvedValue({});
    mocks.tx.walletTransaction.create.mockResolvedValue({});
    mocks.tx.order.update.mockResolvedValue({});

    app = await buildApp();
    await app.ready();
  });

  it('成功回调：ensureWalletInTx + wallet.update(increment 10) + walletTransaction.create + order.update', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: WX_HEADERS,
      payload: { action: 'notify' },
    });
    expect(res.statusCode).toBe(200);

    // wallet 拿得到
    expect(mockWalletRepo.ensureWalletInTx).toHaveBeenCalledWith(mocks.tx, 'u1');

    // 余额自增 10 元（1000 分 → 10 元）
    expect(mocks.tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balance: { increment: 10 } },
    });

    // 写钱包流水
    expect(mocks.tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        walletId: 'w1',
        type: 'recharge',
        amount: 10,
        orderId: 'order-1',
        wxTransactionId: 'wx-txn-001',
        status: 'success',
      }),
    });

    // 标 Order paid
    expect(mocks.tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({
        status: 'paid',
        wxTransactionId: 'wx-txn-001',
        paidAt: expect.any(Date) as unknown as Date,
      }),
    });
  });

  it('幂等：同 transactionId 第二次回调 → 不调 $transaction', async () => {
    // 第一次：pending_pay，wxTransactionId=null
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: WX_HEADERS,
      payload: { action: 'notify' },
    });
    expect(res1.statusCode).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);

    // 模拟订单已 paid + 写入 wxTransactionId
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'u1',
      payAmount: 10,
      payChannel: 'wxpay',
      status: 'paid',
      wxTransactionId: 'wx-txn-001', // 跟 mock resource 一致
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: WX_HEADERS,
      payload: { action: 'notify' },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().data).toMatchObject({ dedup: true });
    // 关键：第二次不调 $transaction
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('非 SUCCESS 状态：CLOSED → 不调 $transaction', async () => {
    // 直接修改 mockResource 状态后注入
    (mockResource as { trade_state: string }).trade_state = 'CLOSED';
    const res = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: WX_HEADERS,
      payload: { action: 'notify' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ ignoredState: 'CLOSED' });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    // 还原
    (mockResource as { trade_state: string }).trade_state = 'SUCCESS';
  });

  it('unknown action → 400 unknown action', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: WX_HEADERS,
      payload: { action: 'other' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().msg).toContain('unknown action');
  });

  it('头部缺失 → 400 微信回调头部缺失', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: {},
      payload: { action: 'notify' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().msg).toContain('头部缺失');
  });

  it('order not found → 404 order not found', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: WX_HEADERS,
      payload: { action: 'notify' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().msg).toContain('order not found');
  });

  it('cancelled 订单 → 关单保护不复活', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'u1',
      status: 'cancelled',
      wxTransactionId: null,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: WX_HEADERS,
      payload: { action: 'notify' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ ignoredState: 'order_cancelled' });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('非 pending_pay 非 cancelled 状态 → ignoredState order_status_xxx', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'u1',
      status: 'shipped',
      wxTransactionId: null,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: WX_HEADERS,
      payload: { action: 'notify' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ ignoredState: 'order_status_shipped' });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('分销单 sourceUserId → 事务内调 settleCommission', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'u1',
      status: 'pending_pay',
      wxTransactionId: null,
      sourceUserId: 'u-referrer',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: WX_HEADERS,
      payload: { action: 'notify' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSettleCommission).toHaveBeenCalledWith(mocks.tx, 'order-1');
  });

  it('赛事订单(contentType=enroll) paid → enrollment confirmed，不进钱包（fee 是商家收入）', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order-enroll',
      userId: 'u1',
      status: 'pending_pay',
      wxTransactionId: null,
      contentType: 'enroll',
    } as never);
    mocks.tx.enrollment.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/wxpay',
      headers: WX_HEADERS,
      payload: { action: 'notify' },
    });
    expect(res.statusCode).toBe(200);
    // enrollment → confirmed
    expect(mocks.tx.enrollment.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'order-enroll' },
      data: { status: 'confirmed' },
    });
    // 不进用户钱包（赛事 fee 是商家收入，非充值）
    expect(mocks.tx.wallet.update).not.toHaveBeenCalled();
    expect(mocks.tx.walletTransaction.create).not.toHaveBeenCalled();
  });
});
