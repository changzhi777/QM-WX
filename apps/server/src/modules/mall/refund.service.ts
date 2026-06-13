/**
 * 退款 service（V1 — 限 paid 订单）
 *
 * 流程（事务外 IO + 事务内写库）：
 * 1. 读 order（事务外）— 校验 status='paid' + 拿 userId / payAmount
 * 2. 调 wxpay.refund（事务外 — 外部 IO 不可在 DB 事务内）
 * 3. 事务内：
 *    - assertTransition('paid', 'refunded')（⑤统一替换时会改为 'refunding' 过渡）
 *    - tx.order.update({ status: 'refunded', refundWxTransactionId, refundedAt })
 *    - walletService.consumeInTx(tx, userId, -refundFen/100, 'refund', orderId, refundId)
 *
 * 业务规则：
 * - 限定 paid 状态 — 已 shipping / done 不退（V1 范围）
 * - amount 缺省 = order.payAmount 全额
 * - 退款入 wallet 余额（不返 wxpay 通道）— V1 简化
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { refund as wxpayRefund } from '../wxpay/wxpay.service.js';
import { walletService } from '../wallet/wallet.service.js';

export const refundService = {
  /**
   * 发起退款（管理员）
   *
   * @param input.orderId 订单 id
   * @param input.amountFen 退款金额（分），缺省 = 订单 payAmount 全额
   * @param input.reason 退款原因
   * @param input.refundedBy 管理员 openid（仅日志用）
   * @returns 退款结果
   */
  async refundOrder(input: {
    orderId: string;
    amountFen?: number;
    reason?: string;
    refundedBy: string;
  }) {
    // 1. 读订单（事务外）— 校验 + 拿 userId / payAmount
    const order = await prisma.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw Errors.notFound('订单不存在');
    if (order.status !== 'paid') {
      throw Errors.badRequest(
        `订单状态 ${order.status} 不可退款（仅 paid 状态可退）`,
      );
    }
    if (!order.wxTransactionId) {
      throw Errors.badRequest('订单无微信交易号（可能是积分支付 / 测试单）');
    }

    const payAmountYuan = Number(order.payAmount);
    const refundYuan =
      input.amountFen !== undefined ? input.amountFen / 100 : payAmountYuan;
    if (refundYuan <= 0 || refundYuan > payAmountYuan) {
      throw Errors.badRequest(
        `refundYuan (${refundYuan}) 必须在 (0, ${payAmountYuan}] 范围内`,
      );
    }
    const refundFen = Math.round(refundYuan * 100);

    // 2. 调微信 refund（事务外 IO）
    const refundResp = await wxpayRefund({
      outTradeNo: order.id,
      outRefundNo: `refund-${order.id}-${Date.now()}`,
      totalFen: Math.round(payAmountYuan * 100),
      refundFen,
      reason: input.reason ?? '管理员发起退款',
    });

    if (refundResp.status !== 'SUCCESS' && refundResp.status !== 'PROCESSING') {
      // 微信侧明确失败 — 抛错，order 状态保持 paid
      throw Errors.internal(
        `微信退款失败: status=${refundResp.status}`,
      );
    }

    // 3. 事务内写库：order → refunded + wallet 扣减
    //    consumeInTx 已支持 type='refund'，单一入口不走重复逻辑
    await prisma.$transaction(async (tx) => {
      // 状态机：⑤统一替换时会接入 assertTransition
      // 当前 paid → refunded 走硬编码（替换时改）
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'refunded',
          paidAt: order.paidAt, // 保持原 paidAt
        },
      });

      // 扣减钱包余额 + 写流水（事务内，余额+流水强一致）
      // amount 必须传负数 — consumeInTx 内做余额校验
      await walletService.consumeInTx(
        tx,
        order.userId,
        -refundYuan,
        'refund',
        order.id,
        refundResp.refundId,
      );
    });

    return {
      orderId: order.id,
      refundId: refundResp.refundId,
      refundYuan,
      status: refundResp.status,
      refundedBy: input.refundedBy,
    };
  },
};
