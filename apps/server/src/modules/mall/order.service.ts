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
import { assertNotBanned } from '../admin/admin.service.js';
import { levelRate } from '../distribution/distribution.service.js';
import type { UnifiedOrderResp } from '../wxpay/wxpay.schema.js';
import type { CreateOrderInput, MyOrdersInput } from './mall.schema.js';

/** 1 积分 = 0.01 元（仅用于积分全额兑换场景） */
const POINTS_TO_YUAN = 0.01;

export const orderService = {
  async create(userId: string, input: CreateOrderInput) {
    // V0.1.37 团购校验（groupBuyId 存在 → reached + 已参与 + 单一团购商品）
    let groupBuyId: string | null = null;
    let groupBuyPrice: number | null = null;
    let groupBuyProductId: string | null = null;
    if (input.groupBuyId) {
      const gb = await prisma.groupBuy.findUnique({ where: { id: input.groupBuyId } });
      if (!gb) throw Errors.notFound('团购不存在');
      if (gb.status !== 'reached') throw Errors.badRequest('团购未成团，无法下单');
      const member = await prisma.groupBuyMember.findUnique({
        where: { groupBuyId_userId: { groupBuyId: gb.id, userId } },
      });
      if (!member) throw Errors.forbidden('未参与该团购，无法下单');
      if (input.items.length !== 1 || input.items[0].productId !== gb.productId) {
        throw Errors.badRequest('团购订单仅含团购商品 1 件');
      }
      groupBuyId = gb.id;
      groupBuyPrice = Number(gb.groupPrice);
      groupBuyProductId = gb.productId;
    }

    // 1. 校验所有 product 存在 + 计算金额
    const products = await prisma.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) }, status: 'on' },
    });
    if (products.length !== input.items.length) {
      throw Errors.badRequest('部分商品已下架');
    }

    const items = input.items.map((i) => {
      const p = products.find((x) => x.id === i.productId)!;
      // V0.1.37 团购：团购商品用团购价（groupPrice），否则原价
      const useGroupPrice = groupBuyId !== null && p.id === groupBuyProductId;
      return {
        productId: p.id,
        name: p.name,
        price: useGroupPrice ? (groupBuyPrice as never) : p.price,
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
    // V0.1.18：黑名单拦截
    assertNotBanned(user);

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

    // V0.1.24 分销：解析 inviteCode → 推广来源 + 佣金率 + 上线
    let sourceUserId: string | null = null;
    let commissionRate = 0;
    let grandfatherId: string | null = null;
    if (input.inviteCode) {
      const inviter = await prisma.user.findFirst({
        where: { inviteCode: input.inviteCode },
        select: { id: true, distributorLevel: true },
      });
      if (inviter && inviter.id !== userId) {
        // 防自邀：inviter 存在且非自己才建分销关系
        sourceUserId = inviter.id;
        commissionRate = levelRate(inviter.distributorLevel);
        // 查 inviter 的直推上线（建 level=2 间推关系；间推佣金 MVP 暂不发）
        const inviterUp = await prisma.team.findFirst({
          where: { inviteeId: inviter.id, level: 1 },
          select: { inviterId: true },
        });
        grandfatherId = inviterUp?.inviterId ?? null;
      }
    }

    // 4. 事务：写 order + 扣积分（如有）+ 分销落单
    const sourceUserIdFinal = sourceUserId;
    const commissionRateFinal = commissionRate;
    const grandfatherIdFinal = grandfatherId;
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
          sourceUserId: sourceUserIdFinal, // V0.1.24 分销来源（可 null）
          groupBuyId, // V0.1.37 团购订单关联（可 null）
        },
        include: { items: true },
      });

      // 扣积分（仅积分全额兑换场景）
      if (pointsUsed > 0) {
        await userRepo.addPoints(tx, userId, -pointsUsed, 'order_deduct', o.id);
      }

      // V0.1.24 分销：落推广订单 + 邀请关系（仅 sourceUserId 有效时）
      if (sourceUserIdFinal) {
        const commissionAmount = Math.round(payAmount * commissionRateFinal * 100) / 100;
        if (commissionAmount > 0) {
          await tx.distributionOrder.create({
            data: {
              userId: sourceUserIdFinal,
              orderId: o.id,
              orderAmount: payAmount as never,
              commissionRate: commissionRateFinal as never,
              commissionAmount: commissionAmount as never,
              status: 'pending',
            },
          });
        }
        // 邀请关系（一人一上线，已存在则跳过）
        const existTeam = await tx.team.findUnique({ where: { inviteeId: userId } });
        if (!existTeam) {
          await tx.team.create({
            data: { inviterId: sourceUserIdFinal, inviteeId: userId, level: 1 },
          });
          if (grandfatherIdFinal && grandfatherIdFinal !== userId) {
            await tx.team.create({
              data: { inviterId: grandfatherIdFinal, inviteeId: userId, level: 2 },
            });
          }
        }
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
    // N+1 修：count where 缺 status 过滤（旧代码 total 永远 = 全表，与 list 不一致 — UI 分页错乱）
    // Prisma select 收紧：去 address / payment / userId 等敏感 / 冗余字段
    const where = { userId, ...(input.status ? { status: input.status } : {}) };
    const [list, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          userId: true,
          status: true,
          totalAmount: true,
          payAmount: true,
          pointsUsed: true,
          payChannel: true,
          wxTransactionId: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: { id: true, productId: true, name: true, price: true, qty: true },
          },
        },
      }),
      prisma.order.count({ where }),
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
