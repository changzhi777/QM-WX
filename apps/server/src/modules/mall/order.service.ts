/**
 * 订单 service（mall module 内部）
 *
 * 关键双态（02 §5.4）：
 * 1. payment=OFF：积分足额 → 0 元兑换 + 服务端扣积分 → paid
 *              积分不足 → 提示「支付功能开通中」+ 生成 pending_pay 意向单
 * 2. payment=ON： 走 cloudPay（Phase 4 实现）
 *
 * ⚠️ 余额/积分/订单状态一律服务端权威
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { configRepo } from '../app-config/app-config.repository.js';
import { userRepo } from '../user/user.repository.js';
import { unifiedOrder } from '../wxpay/wxpay.service.js';
import { assertTransition, type OrderStatus } from '../../domain/order-state.js';
import type { UnifiedOrderResp } from '../wxpay/wxpay.schema.js';
import type { CreateOrderInput, MyOrdersInput } from './mall.schema.js';

/** 1 积分 = 0.01 元（仅用于积分全额兑换场景） */
const POINTS_TO_YUAN = 0.01;

export const orderService = {
  async create(userId: string, input: CreateOrderInput) {
    // 1. 校验所有 product 存在 + 计算金额
    const products = await prisma.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) }, status: 'on' },
    });
    if (products.length !== input.items.length) {
      throw Errors.badRequest('部分商品已下架');
    }

    const items = input.items.map((i) => {
      const p = products.find((x) => x.id === i.productId)!;
      return {
        productId: p.id,
        name: p.name,
        price: p.price,
        qty: i.qty,
      };
    });
    const totalAmount = items.reduce((s, i) => s + Number(i.price) * i.qty, 0);

    // 2. 读 feature flag：payment 关闭时只能积分兑换 / 意向单
    const { featureFlags } = await configRepo.getLoginConfig();
    const paymentOn = !!featureFlags.payment;

    // 3. 计算积分抵扣
    const user = await userRepo.findById(userId);
    if (!user) throw Errors.unauthorized();

    let pointsUsed = 0;
    let payAmount = totalAmount;
    let status: 'paid' | 'pending_pay' = 'pending_pay';
    let payChannel: 'wxpay' | 'points' | null = null;

    if (input.pointsUsed > 0) {
      // 用户主动用积分
      if (input.pointsUsed > user.points) {
        throw Errors.badRequest('积分不足');
      }
      const pointsValue = input.pointsUsed * POINTS_TO_YUAN;
      if (pointsValue >= totalAmount) {
        // 全额积分兑换
        pointsUsed = Math.ceil(totalAmount / POINTS_TO_YUAN); // 实际需要的积分
        payAmount = 0;
        status = 'paid';
        payChannel = 'points';
      } else {
        // 部分积分抵扣
        pointsUsed = input.pointsUsed;
        payAmount = round2(totalAmount - pointsValue);
        // 部分抵扣：还要付钱 → 走微信支付（payment=ON 时）
        if (paymentOn) payChannel = 'wxpay';
        // 部分抵扣且 payment=OFF：仍生成 pending_pay 意向单（payChannel=null）
      }
    } else if (!paymentOn) {
      // payment=OFF 且无积分抵扣：直接生成 pending_pay 意向单
      status = 'pending_pay';
    } else {
      // payment=ON 且无积分抵扣：走微信支付
      payChannel = 'wxpay';
    }

    // 4. 事务：写 order + 扣积分（如有）
    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          userId,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              name: i.name,
              price: i.price,
              qty: i.qty,
            })),
          },
          totalAmount: totalAmount as never,
          pointsUsed,
          payAmount: payAmount as never,
          status,
          payChannel,
          address: input.address as never,
        },
        include: { items: true },
      });

      // 扣积分（仅积分全额兑换场景）
      if (pointsUsed > 0) {
        await userRepo.addPoints(tx, userId, -pointsUsed, 'order_deduct', o.id);
      }

      return o;
    });

    // 5. 微信统一下单（在事务外，外部 IO 不可在 DB 事务内）
    let wxpayParams: UnifiedOrderResp | null = null;
    if (payChannel === 'wxpay' && payAmount > 0) {
      // description 取商品名拼接（最长 127 字节）
      const desc = items.map((i) => i.name).join('、').slice(0, 127);
      wxpayParams = await unifiedOrder({
        outTradeNo: order.id,
        description: `青沐-${desc}`,
        totalFen: Math.round(payAmount * 100),
        openid: user.openid,
      });
      // 把 prepayId 落库（回调验签 / admin 查订单时用）
      await prisma.order.update({
        where: { id: order.id },
        data: { prepayId: wxpayParams.prepayId },
      });
    }

    // 6. 入队超时关单（30 分钟未支付自动 cancel）
    //    仅在 pending_pay 时才有意义（积分单直接 paid，不入队）
    if (status === 'pending_pay') {
      const { enqueueCloseOrder } = await import('../../jobs/queue.js');
      await enqueueCloseOrder(order.id);
    }

    return {
      orderId: order.id,
      totalAmount: totalAmount.toFixed(2),
      pointsUsed,
      payAmount: payAmount.toFixed(2),
      status,
      payChannel,
      // 前端 wx.requestPayment 用的 payParams
      payParams: wxpayParams
        ? {
            timeStamp: wxpayParams.timestamp,
            nonceStr: wxpayParams.nonceStr,
            package: wxpayParams.packageStr,
            signType: 'RSA' as const,
            paySign: wxpayParams.sign,
          }
        : null,
      message:
        status === 'paid'
          ? '兑换成功，客服会安排发货'
          : payChannel === 'wxpay'
            ? '订单已创建，请完成支付'
            : '订单已创建，支付功能开通中，客服会联系您',
    };
  },

  async myOrders(userId: string, input: MyOrdersInput) {
    const [list, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId, ...(input.status ? { status: input.status } : {}) },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { items: true },
      }),
      prisma.order.count({ where: { userId } }),
    ]);
    return {
      list: list.map((o) => ({
        ...o,
        totalAmount: o.totalAmount.toString(),
        payAmount: o.payAmount.toString(),
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  },

  async cancel(userId: string, orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw Errors.notFound('订单不存在');
    if (order.userId !== userId) throw Errors.forbidden('不是你的订单');
    // 状态机：仅 pending_pay 可取消（paid 必须走 refund 流程）
    assertTransition(order.status as OrderStatus, 'cancelled');

    // 取消时退积分（如已扣）
    await prisma.$transaction(async (tx) => {
      if (order.pointsUsed > 0) {
        await userRepo.addPoints(tx, userId, order.pointsUsed, 'order_deduct', orderId);
      }
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'cancelled' },
      });
    });

    return { ok: true };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
