/**
 * wallet service
 *
 * V1.0（payment=OFF）：
 * - get / transactions：可查（仍受 feature gate 守门）
 * - recharge：返回 403「支付功能开通中」
 *
 * V1.1（payment=ON）：
 * - 接 cloudPay.unifiedOrder → 前端 wx.requestPayment → 回调验签 → 余额自增
 *
 * 铁律（02 §6）：
 * 1. balance 字段**绝不**接受前端写入
 * 2. balance 只在「支付回调验签成功」或「订单扣减」时由 service 修改
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { walletRepo } from './wallet.repo.js';
import type { RechargeInput, TransactionsInput } from './wallet.schema.js';

export const walletService = {
  /**
   * 获取当前用户钱包（首次访问自动建空钱包）
   */
  async get(userId: string) {
    const wallet = await walletRepo.ensureWallet(userId);
    return {
      balance: wallet.balance.toString(),
      status: wallet.status,
      updatedAt: wallet.updatedAt.toISOString(),
    };
  },

  /**
   * 流水分页
   */
  async transactions(userId: string, input: TransactionsInput) {
    await walletRepo.ensureWallet(userId);
    const [list, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.walletTransaction.count({ where: { userId } }),
    ]);
    return {
      list: list.map((t) => ({
        ...t,
        amount: t.amount.toString(),
        createdAt: t.createdAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  },

  /**
   * 充值（V1.0 强制 403）
   *
   * V1.1：移除 403 抛错，接 cloudPay.unifiedOrder
   * 现在的实现只是占位，证明逻辑链通
   */
  async recharge(_userId: string, _input: RechargeInput) {
    throw Errors.featureDisabled('payment');
  },

  /**
   * 内部：服务间扣款（订单退款 / 兑换退款时由其他 service 调用）
   *
   * 不通过 HTTP 暴露；只在 service 间用
   * 余额/流水强一致（事务）
   */
  async consumeInTx(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    userId: string,
    amount: number,
    type: 'recharge' | 'consume' | 'refund',
    orderId?: string,
    wxTransactionId?: string,
    opts: {
      /**
       * 允许余额扣成负数（不抛"余额不足"）。
       * 退款场景专用：微信退款已不可逆地发生，本地必须如实记账，
       * 余额为负代表用户欠款（已消费 + 又获退款），绝不能因余额不足回滚导致账实漂移。
       */
      allowNegative?: boolean;
      /** 微信退款商户单号（out_refund_no）：落库用于幂等 + 对账匹配 */
      outRefundNo?: string;
    } = {},
  ) {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw Errors.notFound('wallet not found');
    if (wallet.status !== 'active') throw Errors.forbidden('wallet frozen');

    // 原子增减：用 increment（DB 侧自增）替代「读出余额→算→覆盖写」，避免并发 lost update。
    if (amount < 0 && !opts.allowNegative) {
      // 普通扣减：条件 where(balance >= -amount) 兜底，命中 0 行即余额不足（原子，无 TOCTOU）。
      const res = await tx.wallet.updateMany({
        where: { userId, balance: { gte: -amount } },
        data: { balance: { increment: amount } },
      });
      if (res.count === 0) throw Errors.badRequest('余额不足');
    } else {
      // 充值（amount>0）或允许走负（退款）：无条件原子自增/自减。
      await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
      });
    }
    await tx.walletTransaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type,
        amount,
        orderId,
        wxTransactionId,
        outRefundNo: opts.outRefundNo,
        status: 'success',
      },
    });
  },
};
