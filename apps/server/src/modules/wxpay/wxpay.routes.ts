/**
 * wxpay routes — POST /api/wxpay/*
 *
 * 路由：
 * - POST /api/wxpay  公开端点（action=notify：微信支付异步回调，无 JWT）
 *
 * 注：退款不走本路由 — 走 /api/admin 的 refundOrder action（管理员鉴权，
 *     调 wxpay.service.refund，Phase 4.1 已完整实现）。
 *     对账查询（queryBill/downloadBill）走 scripts/reconcile.ts CLI，无 HTTP 路由。
 *
 * 设计：
 * - 回调路由必须 `config: { public: true }`（不走 authPlugin）
 * - 回调路由 raw body 不可 JSON parse（验签必走原始字节）
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infra/prisma.js';
import { walletRepo } from '../wallet/wallet.repo.js';
import { assertTransition, type OrderStatus } from '../../domain/order-state.js';
import {
  isPaySuccess,
  verifyAndDecryptNotify,
} from './wxpay.service.js';
import { settleCommission } from '../distribution/distribution.service.js';

export async function wxpayRoutes(app: FastifyInstance) {
  /**
   * 微信支付异步通知
   *
   * 重要：必须保留 raw body 字节，验签不依赖 JSON parse。
   * 头部：Wechatpay-Serial / Wechatpay-Timestamp / Wechatpay-Nonce / Wechatpay-Signature
   */
  app.post(
    '/',
    {
      config: { public: true }, // 公开 — 微信回调无 JWT
    },
    async (req, reply) => {
      // 验签必走原始字节：优先用 app.ts content-type parser 挂的 req.rawBody，
      // 退路（如测试直接注入字符串）才回退到 body 重序列化。
      const rawBody =
        (req as unknown as { rawBody?: string }).rawBody ??
        (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      // 业务字段解析
      const parsed = JSON.parse(rawBody) as { action?: string };
      const action = parsed.action;
      if (action !== 'notify') {
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
      const serial =
        (req.headers['wechatpay-serial'] as string | undefined) ??
        (req.headers['Wechatpay-Serial'] as string | undefined) ??
        '';
      const timestamp =
        (req.headers['wechatpay-timestamp'] as string | undefined) ??
        (req.headers['Wechatpay-Timestamp'] as string | undefined) ??
        '';
      const nonce =
        (req.headers['wechatpay-nonce'] as string | undefined) ??
        (req.headers['Wechatpay-Nonce'] as string | undefined) ??
        '';
      const signature =
        (req.headers['wechatpay-signature'] as string | undefined) ??
        (req.headers['Wechatpay-Signature'] as string | undefined) ??
        '';

      if (!serial || !timestamp || !nonce || !signature) {
        return reply.status(400).send({ code: 400, msg: '微信回调头部缺失' });
      }

      let result: ReturnType<typeof verifyAndDecryptNotify>;
      try {
        result = verifyAndDecryptNotify({
          rawBody,
          headers: { serial, timestamp, nonce, signature },
        });
      } catch (e) {
        // 验签 / 解密失败必须返回非 200，让微信重试
        return reply.status(400).send({
          code: 400,
          msg: (e as Error).message ?? 'verify/decrypt failed',
        });
      }

      const { resource } = result;

      // 幂等：检查 Order.wxTransactionId 是否已写过
      const order = await prisma.order.findUnique({ where: { id: resource.out_trade_no } });
      if (!order) {
        // 回调找不到订单 — 业务上异常，让微信重试（让运维排查）
        return reply.status(404).send({ code: 404, msg: 'order not found' });
      }
      if (order.wxTransactionId === resource.transaction_id) {
        // 同 transactionId 已处理，直接返回 200 让微信停止重试
        return { code: 0, data: { ok: true, dedup: true } };
      }
      // 关单保护：若订单已 cancelled（被超时关单）→ 不复活、记录、返回成功（让微信停止重试）
      if (order.status === 'cancelled') {
        return {
          code: 0,
          data: { ok: true, ignoredState: 'order_cancelled' },
        };
      }
      // 兜底：只接受 pending_pay 状态的订单进入支付成功路径
      if (order.status !== 'pending_pay') {
        return {
          code: 0,
          data: { ok: true, ignoredState: `order_status_${order.status}` },
        };
      }

      if (!isPaySuccess(resource)) {
        // 非成功状态（REFUND/REVERSED/CLOSED 等）暂不处理，仅记录
        return { code: 0, data: { ok: true, ignoredState: resource.trade_state } };
      }

      // 事务内：写 Order.paid + 增加钱包余额 + 记 WalletTransaction
      // 业务模型（"先充值后消费"模式）：
      // 1. 微信收款入账到钱包（balance += 实际支付金额）
      // 2. Order 标 paid
      // 3. 用户后续可用余额支付（走 walletService.consumeInTx 扣减）
      await prisma.$transaction(async (tx) => {
        // 状态机：pending_pay → paid（已在上面 if 校验过，此处再过 assertTransition 双保险）
        assertTransition(order.status as OrderStatus, 'paid');
        const wallet = await walletRepo.ensureWalletInTx(tx, order.userId);

        // 微信回调 amount.total 是分，转元
        const amountYuan = resource.amount.total / 100;

        // 余额自增（Prisma 原生 increment 原子操作）
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: amountYuan } },
        });

        // 写钱包流水（type=recharge 标识"来自微信充值"）
        await tx.walletTransaction.create({
          data: {
            userId: order.userId,
            walletId: wallet.id,
            type: 'recharge',
            amount: amountYuan,
            orderId: order.id,
            wxTransactionId: resource.transaction_id,
            status: 'success',
          },
        });

        // 标 Order 已支付
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'paid',
            wxTransactionId: resource.transaction_id,
            paidAt: new Date(),
          },
        });

        // V0.1.24 分销：订单变 paid → 结算推广佣金（sourceUserId 存在时）
        if (order.sourceUserId) {
          await settleCommission(tx, order.id);
        }
      });

      return { code: 0, data: { ok: true } };
    },
  );
}
