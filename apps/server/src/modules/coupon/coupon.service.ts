/**
 * coupon module service — 优惠券（V0.1.23 MVP：领取 + 查看，使用下期）
 *
 * 模板用常量定义（不建模板表，简化）；用户领取 → 创建 Coupon 实例
 * 防重：同 title 仅能领一次；过期：myCoupons 查询前自动标 expired
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';

/** 券模板（领券中心展示 + 领取创建实例） */
const COUPON_TEMPLATES = [
  { templateId: 'newuser-10', title: '新人 10 元券', type: 'fixed', amount: 10, minSpend: 0, validDays: 15 },
  { templateId: 'full100-20', title: '满 100 减 20', type: 'fixed', amount: 20, minSpend: 100, validDays: 30 },
  { templateId: 'full200-50', title: '满 200 减 50', type: 'fixed', amount: 50, minSpend: 200, validDays: 30 },
  { templateId: 'run-9zhe', title: '跑者 9 折券', type: 'percent', amount: 0.9, minSpend: 50, validDays: 30 },
];

/** 把 unused 且已过期的券标为 expired */
async function markExpired(userId: string) {
  await prisma.coupon.updateMany({
    where: { userId, status: 'unused', expireAt: { lt: new Date() } },
    data: { status: 'expired' },
  });
}

export const couponService = {
  /** 领券中心（模板列表 + 是否已领） */
  async templates(userId: string) {
    const received = await prisma.coupon.findMany({
      where: { userId },
      select: { title: true },
    });
    const receivedTitles = new Set(received.map((r) => r.title));
    return {
      templates: COUPON_TEMPLATES.map((t) => ({ ...t, received: receivedTitles.has(t.title) })),
    };
  },

  /** 我的券（按 status，自动标过期） */
  async myCoupons(userId: string, status?: string) {
    await markExpired(userId);
    const where = { userId, ...(status && status !== 'all' ? { status } : {}) };
    const list = await prisma.coupon.findMany({ where, orderBy: { receivedAt: 'desc' } });
    return {
      list: list.map((c) => ({
        ...c,
        expireAt: c.expireAt.toISOString(),
        usedAt: c.usedAt?.toISOString() ?? null,
        receivedAt: c.receivedAt.toISOString(),
      })),
      count: list.length,
    };
  },

  /** 可用券数（mine 角标） */
  async availableCount(userId: string) {
    await markExpired(userId);
    return prisma.coupon.count({ where: { userId, status: 'unused' } });
  },

  /** 领取（模板 → 创建实例，同 title 防重） */
  async receive(userId: string, templateId: string) {
    const tpl = COUPON_TEMPLATES.find((t) => t.templateId === templateId);
    if (!tpl) throw Errors.notFound('券模板不存在');

    const exists = await prisma.coupon.findFirst({ where: { userId, title: tpl.title } });
    if (exists) throw Errors.badRequest('已领取过此券');

    const expireAt = new Date(Date.now() + tpl.validDays * 24 * 3600 * 1000);
    const coupon = await prisma.coupon.create({
      data: {
        userId,
        title: tpl.title,
        type: tpl.type,
        amount: tpl.amount,
        minSpend: tpl.minSpend,
        expireAt,
        status: 'unused',
      },
    });
    return { id: coupon.id, expireAt: coupon.expireAt.toISOString() };
  },
};
