/**
 * shoes module business logic（V0.1.26，跑者向 — 跑鞋里程管理）
 *
 * Actions：
 * - list：列出我的跑鞋（active 优先 + createdAt desc），含健康度（currentKm/thresholdKm）
 * - add：添加跑鞋
 * - update：更新跑鞋信息（品牌/型号/阈值）
 * - retire：退役跑鞋（status=retired，不再计入 active）
 * - myStats：跑鞋统计（总数/active/总里程/即将退役数）
 *
 * 里程累计：sport.checkin 事务内调用 incrementShoeKm（导出供 sport 复用，不在此 module 写）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import type { AddShoeInput, UpdateShoeInput } from './shoes.schema.js';

export const shoesService = {
  /**
   * 列出我的跑鞋（active 在前，retired 在后；含健康度百分比）
   */
  async list(userId: string) {
    const shoes = await prisma.shoe.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // 'active' < 'retired' 字典序
    });
    return {
      shoes: shoes.map((s) => ({
        id: s.id,
        brand: s.brand,
        model: s.model,
        nickname: s.nickname,
        currentKm: s.currentKm,
        thresholdKm: s.thresholdKm,
        status: s.status,
        purchasedAt: s.purchasedAt?.toISOString() ?? null,
        note: s.note,
        // 健康度：currentKm / thresholdKm * 100（前端按 <70 绿 / 70-100 黄 / >100 红）
        healthRatio: s.thresholdKm > 0 ? Math.round((s.currentKm / s.thresholdKm) * 100) : 0,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  },

  /** 添加跑鞋 */
  async add(userId: string, input: AddShoeInput) {
    const shoe = await prisma.shoe.create({
      data: {
        userId,
        brand: input.brand,
        model: input.model,
        nickname: input.nickname,
        thresholdKm: input.thresholdKm,
        purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : null,
        note: input.note,
      },
    });
    return { id: shoe.id, brand: shoe.brand, model: shoe.model };
  },

  /** 更新跑鞋信息 */
  async update(userId: string, input: UpdateShoeInput) {
    const existing = await prisma.shoe.findFirst({ where: { id: input.id, userId } });
    if (!existing) throw Errors.notFound('shoe not found');

    await prisma.shoe.update({
      where: { id: input.id },
      data: {
        brand: input.brand,
        model: input.model,
        nickname: input.nickname,
        thresholdKm: input.thresholdKm,
        purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : null,
        note: input.note,
      },
    });
    return { id: input.id };
  },

  /** 退役跑鞋（status=retired） */
  async retire(userId: string, id: string) {
    const existing = await prisma.shoe.findFirst({ where: { id, userId } });
    if (!existing) throw Errors.notFound('shoe not found');
    if (existing.status === 'retired') throw Errors.badRequest('跑鞋已退役');

    await prisma.shoe.update({ where: { id }, data: { status: 'retired' } });
    return { ok: true };
  },

  /** 跑鞋统计（mine 入口红点用 retiringSoonCount） */
  async myStats(userId: string) {
    const shoes = await prisma.shoe.findMany({
      where: { userId },
      select: { currentKm: true, thresholdKm: true, status: true },
    });
    const active = shoes.filter((s) => s.status === 'active');
    // 即将退役：active 且 healthRatio ≥ 70%
    const retiringSoon = active.filter((s) => s.thresholdKm > 0 && s.currentKm / s.thresholdKm >= 0.7).length;
    return {
      total: shoes.length,
      activeCount: active.length,
      retiredCount: shoes.length - active.length,
      totalKm: Math.round(shoes.reduce((s, x) => s + x.currentKm, 0) * 10) / 10,
      retiringSoonCount: retiringSoon,
    };
  },
};

/**
 * 跑鞋里程累计（sport.checkin 事务内调用，V0.1.26）
 *
 * 导出纯 DB 操作函数，sport.service 在 checkin 事务里复用：
 *   await incrementShoeKm(tx, shoeId, distance)
 *
 * @param tx prisma 事务客户端
 * @param shoeId 跑鞋 id（null 则跳过）
 * @param distanceKm 本次打卡距离
 */
export async function incrementShoeKm(
  tx: Parameters<Parameters<typeof prisma['$transaction']>[0]>[0],
  shoeId: string | null,
  distanceKm: number,
): Promise<void> {
  if (!shoeId) return;
  await tx.shoe.update({
    where: { id: shoeId },
    data: { currentKm: { increment: distanceKm } },
  });
}
