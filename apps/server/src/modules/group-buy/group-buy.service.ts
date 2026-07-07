/**
 * group-buy module business logic（V0.1.37，2764 电商团购 — 简化 MVP）
 *
 * Actions：
 * - list：active 团购列表（含商品 + 当前用户是否参与 isJoined）
 * - detail：单个团购详情
 * - join：参与团购（unique 防重 + currentCount+1；达目标 → reached + notify 所有参与者）
 * - myJoined：我参与的团购
 *
 * 设计：
 * - 参与 = 记录意向（无支付/退款）；达目标 → status=reached + notify 引导下单
 * - Decimal 序列化 toString（price/groupPrice）
 * - 成团 notify 循环（人数有限，可接受）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { notify } from '../notification/notification.service.js';
import type { GroupBuyIdInput, GroupBuyPageInput } from './group-buy.schema.js';

export const groupBuyService = {
  /** active 团购列表（含商品 + isJoined）*/
  async list(userId: string, input: GroupBuyPageInput) {
    const [rows, total] = await Promise.all([
      prisma.groupBuy.findMany({
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          product: { select: { id: true, name: true, price: true, images: true, status: true } },
          members: { where: { userId }, select: { id: true } },
        },
      }),
      prisma.groupBuy.count({ where: { status: 'active' } }),
    ]);
    return {
      list: rows.map((g) => ({
        id: g.id,
        groupPrice: g.groupPrice.toString(),
        targetCount: g.targetCount,
        currentCount: g.currentCount,
        status: g.status,
        endDate: g.endDate?.toISOString() ?? null,
        product: { ...g.product, price: g.product.price.toString() },
        isJoined: g.members.length > 0,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      hasMore: input.page * input.pageSize < total,
    };
  },

  /** 团购详情 */
  async detail(userId: string, input: GroupBuyIdInput) {
    const g = await prisma.groupBuy.findUnique({
      where: { id: input.id },
      include: {
        product: {
          select: { id: true, name: true, price: true, images: true, description: true, status: true },
        },
        members: { where: { userId }, select: { id: true } },
      },
    });
    if (!g) throw Errors.notFound('团购不存在');
    return {
      id: g.id,
      groupPrice: g.groupPrice.toString(),
      targetCount: g.targetCount,
      currentCount: g.currentCount,
      status: g.status,
      endDate: g.endDate?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
      product: { ...g.product, price: g.product.price.toString() },
      isJoined: g.members.length > 0,
    };
  },

  /**
   * 参与团购（unique 防重 + currentCount+1；达目标 → reached + notify 所有参与者）
   */
  async join(userId: string, input: GroupBuyIdInput) {
    const g = await prisma.groupBuy.findUnique({ where: { id: input.id } });
    if (!g) throw Errors.notFound('团购不存在');
    if (g.status === 'reached') throw Errors.badRequest('团购已成团');

    const existing = await prisma.groupBuyMember.findUnique({
      where: { groupBuyId_userId: { groupBuyId: input.id, userId } },
    });
    if (existing) throw Errors.conflict('已参与该团购');

    // 参与 + currentCount+1（事务内达目标则 status=reached）
    await prisma.$transaction(async (tx) => {
      await tx.groupBuyMember.create({ data: { groupBuyId: input.id, userId } });
      const updated = await tx.groupBuy.update({
        where: { id: input.id },
        data: { currentCount: { increment: 1 } },
      });
      if (updated.currentCount >= updated.targetCount && updated.status === 'active') {
        await tx.groupBuy.update({ where: { id: input.id }, data: { status: 'reached' } });
      }
    });

    // 成团后 notify 所有参与者（事务外，循环 notify，失败不阻塞）
    const fresh = await prisma.groupBuy.findUnique({
      where: { id: input.id },
      select: { status: true, product: { select: { name: true } } },
    });
    if (fresh?.status === 'reached') {
      const members = await prisma.groupBuyMember.findMany({
        where: { groupBuyId: input.id },
        select: { userId: true },
      });
      const productName = fresh.product?.name ?? '商品';
      for (const m of members) {
        try {
          await notify({
            userId: m.userId,
            actorId: userId, // 触发成团者
            type: 'system',
            targetType: 'groupBuy',
            targetId: input.id,
            content: `「${productName}」团购已成团，去下单吧！`,
          });
        } catch {
          /* notify 失败不阻塞 */
        }
      }
    }

    return { ok: true, joined: true };
  },

  /** 我参与的团购 */
  async myJoined(userId: string, input: GroupBuyPageInput) {
    const [rows, total] = await Promise.all([
      prisma.groupBuyMember.findMany({
        where: { userId },
        orderBy: { joinedAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          groupBuy: {
            include: {
              product: { select: { id: true, name: true, price: true, images: true, status: true } },
            },
          },
        },
      }),
      prisma.groupBuyMember.count({ where: { userId } }),
    ]);
    return {
      list: rows.map((m) => ({
        id: m.groupBuy.id,
        groupPrice: m.groupBuy.groupPrice.toString(),
        targetCount: m.groupBuy.targetCount,
        currentCount: m.groupBuy.currentCount,
        status: m.groupBuy.status,
        endDate: m.groupBuy.endDate?.toISOString() ?? null,
        joinedAt: m.joinedAt.toISOString(),
        product: { ...m.groupBuy.product, price: m.groupBuy.product.price.toString() },
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      hasMore: input.page * input.pageSize < total,
    };
  },
};
