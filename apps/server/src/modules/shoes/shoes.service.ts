/**
 * shoes module business logic（V0.1.26，跑者向 — 跑鞋里程管理）
 *
 * Actions：
 * - list：列出我的跑鞋（active 优先 + createdAt desc），含健康度（currentKm/thresholdKm）
 * - add：添加跑鞋
 * - update：更新跑鞋信息（品牌/型号/阈值）
 * - retire：退役跑鞋（status=retired，不再计入 active）
 * - myStats：跑鞋统计（总数/active/总里程/即将退役数）
 * - **V0.1.133** getDetail：单只跑鞋详情（含累计打卡数/最新打卡时间/购买天数）
 * - **V0.1.133** getMileageHistory：按周+月聚合的历史里程曲线（单位分流：garmin cm / 其他 km）
 * - **V0.1.133** updateThreshold：单字段原子更新阈值
 *
 * 里程累计：sport.checkin 事务内调用 incrementShoeKm（导出供 sport 复用，不在此 module 写）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import type {
  AddShoeInput,
  UpdateShoeInput,
  UpdateThresholdInput,
  MileagePoint,
} from './shoes.schema.js';

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

  /**
   * V0.1.133 跑鞋详情
   * 含基础信息 + 累计打卡数 + 最新打卡时间 + 购买天数
   */
  async getDetail(userId: string, id: string) {
    const shoe = await prisma.shoe.findFirst({ where: { id, userId } });
    if (!shoe) throw Errors.notFound('shoe not found');

    const [totalCheckins, latestCheckin] = await Promise.all([
      prisma.checkin.count({ where: { shoeId: id } }),
      prisma.checkin.findFirst({
        where: { shoeId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const daysSincePurchase = shoe.purchasedAt
      ? Math.floor((Date.now() - shoe.purchasedAt.getTime()) / 86400000)
      : null;

    return {
      id: shoe.id,
      brand: shoe.brand,
      model: shoe.model,
      nickname: shoe.nickname,
      currentKm: shoe.currentKm,
      thresholdKm: shoe.thresholdKm,
      status: shoe.status,
      purchasedAt: shoe.purchasedAt?.toISOString() ?? null,
      note: shoe.note,
      healthRatio: shoe.thresholdKm > 0 ? Math.round((shoe.currentKm / shoe.thresholdKm) * 100) : 0,
      createdAt: shoe.createdAt.toISOString(),
      updatedAt: shoe.updatedAt.toISOString(),
      totalCheckins,
      latestCheckinAt: latestCheckin?.createdAt.toISOString() ?? null,
      daysSincePurchase,
    };
  },

  /**
   * V0.1.133 历史里程曲线（周+月双粒度一次性返）
   *
   * 关键坑：Checkin.distance 单位混用
   * - garmin 导入的 Checkin 单位是 cm（V0.1.25 garmin-import.job.ts）
   * - sport.checkin 创建的 Checkin 单位是 km（clean.distance 来自前端）
   * - 单位分流：dataSource==='garmin' → /100000；其他 → 直通
   *
   * 实现选择：findMany + 内存 reduce 而非 Prisma groupBy
   * - 避免 Prisma Float 聚合精度问题
   * - 单位分流逻辑简单清晰
   * - 跑鞋打卡量小（数十到数百条），性能不是瓶颈
   */
  async getMileageHistory(userId: string, id: string) {
    const shoe = await prisma.shoe.findFirst({ where: { id, userId }, select: { id: true } });
    if (!shoe) throw Errors.notFound('shoe not found');

    const checkins = await prisma.checkin.findMany({
      where: { shoeId: id, distance: { gt: 0 } },
      select: { distance: true, createdAt: true, dataSource: true },
    });

    const weekly = bucketByPeriod(checkins, 'weekly');
    const monthly = bucketByPeriod(checkins, 'monthly');
    const totalKm = checkins.reduce(
      (s, c) => s + normalizeDistanceKm(c.distance, c.dataSource),
      0,
    );

    return {
      weekly,
      monthly,
      totalKm: Math.round(totalKm * 10) / 10,
      totalCheckins: checkins.length,
    };
  },

  /**
   * V0.1.133 单字段原子更新阈值
   * 独立 action 语义清晰："我只改阈值不改其他字段"
   */
  async updateThreshold(userId: string, input: UpdateThresholdInput) {
    const existing = await prisma.shoe.findFirst({ where: { id: input.id, userId } });
    if (!existing) throw Errors.notFound('shoe not found');

    await prisma.shoe.update({
      where: { id: input.id },
      data: { thresholdKm: input.thresholdKm },
    });
    return { id: input.id, thresholdKm: input.thresholdKm };
  },

  /**
   * V0.1.137 跑鞋对比（用户选 2 双鞋横向对比）
   *
   * 校验：ids.length === 2 且都属 user
   * 返：两份汇总（基础+健康度+打卡数+持有天数）
   */
  async compareShoes(userId: string, ids: string[]) {
    if (ids.length !== 2) throw Errors.badRequest('请选择 2 双鞋对比');
    const shoes = await prisma.shoe.findMany({
      where: { id: { in: ids }, userId },
    });
    if (shoes.length !== 2) throw Errors.notFound('请选择属于你的 2 双鞋');

    // 批量查 Checkin count（DRY N+1 规避）
    const counts = await prisma.checkin.groupBy({
      by: ['shoeId'],
      where: { shoeId: { in: ids } },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.shoeId, c._count._all]));

    return {
      shoes: shoes.map((s) => ({
        id: s.id,
        brand: s.brand,
        model: s.model,
        nickname: s.nickname,
        status: s.status,
        currentKm: s.currentKm,
        thresholdKm: s.thresholdKm,
        healthRatio: s.thresholdKm > 0 ? Math.round((s.currentKm / s.thresholdKm) * 100) : 0,
        checkinCount: countMap.get(s.id) ?? 0,
        daysSincePurchase: s.purchasedAt
          ? Math.floor((Date.now() - s.purchasedAt.getTime()) / 86400000)
          : null,
        purchasedAt: s.purchasedAt?.toISOString() ?? null,
      })),
    };
  },
};

/**
 * V0.1.133 单位分流（cm vs km）
 * - garmin 导入是 cm（V0.1.25） → /100000 转 km
 * - sport.checkin 是 km → 直通
 * - 其他（manual）默认 km 直通
 */
function normalizeDistanceKm(distance: number, dataSource?: string | null): number {
  if (dataSource === 'garmin') return distance / 100000;
  return distance;
}

/**
 * V0.1.133 按周期分桶聚合
 * - weekly: ISO 周 key "2026-W28"
 * - monthly: "YYYY-MM"
 * 内部调用 normalizeDistanceKm 做单位分流
 */
function bucketByPeriod(
  checkins: { distance: number; createdAt: Date; dataSource?: string | null }[],
  period: 'weekly' | 'monthly',
): MileagePoint[] {
  const map = new Map<string, { distanceKm: number; count: number }>();

  for (const c of checkins) {
    const key = formatPeriodKey(c.createdAt, period);
    const km = normalizeDistanceKm(c.distance, c.dataSource);
    const existing = map.get(key);
    if (existing) {
      existing.distanceKm += km;
      existing.count += 1;
    } else {
      map.set(key, { distanceKm: km, count: 1 });
    }
  }

  return Array.from(map.entries())
    .map(([period, v]) => ({
      period,
      distanceKm: Math.round(v.distanceKm * 10) / 10,
      checkinCount: v.count,
    }))
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
}

/**
 * V0.1.133 周期 key 格式化
 * - weekly: ISO 周 "YYYY-Www"（e.g. "2026-W28"）
 * - monthly: "YYYY-MM"（e.g. "2026-07"）
 */
function formatPeriodKey(date: Date, period: 'weekly' | 'monthly'): string {
  if (period === 'monthly') {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  // weekly: ISO week (UTC, 简化为取 date 的 UTC 周一作为锚)
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

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
