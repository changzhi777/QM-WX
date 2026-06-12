/**
 * wxpay routes — POST /api/wxpay/*
 *
 * 路由：
 * - POST /api/wxpay/notify  公开端点（微信回调，无 JWT）
 * - POST /api/wxpay/refund   鉴权端点（管理员，MVP 占位）
 *
 * 设计：
 * - 回调路由必须 `config: { public: true }`（不走 authPlugin）
 * - 回调路由 raw body 不可 JSON parse（验签必走原始字节）
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../infra/prisma.js';
import {
  isPaySuccess,
  verifyAndDecryptNotify,
} from './wxpay.service.js';

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
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
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

      if (!isPaySuccess(resource)) {
        // 非成功状态（REFUND/REVERSED/CLOSED 等）暂不处理，仅记录
        return { code: 0, data: { ok: true, ignoredState: resource.trade_state } };
      }

      // 事务内更新 Order + 写 WalletTransaction
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'paid',
            wxTransactionId: resource.transaction_id,
            paidAt: new Date(),
          },
        });
        // MVP 阶段：钱包交易流水留 TODO（需先 ensureWallet 拿真实 walletId）
        // TODO Phase 4.1: 写 walletTransaction
      });

      return { code: 0, data: { ok: true } };
    },
  );
}

void (null as unknown as FastifyRequest); // 抑制 unused import
