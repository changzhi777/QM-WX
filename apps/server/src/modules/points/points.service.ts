/**
 * points module service — 积分中心（余额/签到/任务，V0.1.22 B-核心）
 *
 * 数据来源：user.points（余额）+ PointsRecord（流水）+ SigninRecord（签到）
 * 签到规则：基础 +10/天，连续 7 天额外 +50 奖励（促活）
 * 参考：pic/2763 积分详情
 */
import { prisma } from '../../infra/prisma.js';
import { redis } from '../../infra/redis.js';
import { userRepo } from '../user/user.repository.js';
import { Errors } from '../../common/errors.js';

const BASE_SIGNIN_POINTS = 10;
const CONTINUOUS_7D_BONUS = 50;
/** V0.2.6 分享得积分：每次 +5，日限 3 次（=15 分，防刷）*/
const SHARE_POINTS = 5;
const SHARE_DAILY_LIMIT = 3;

/** 东八区今日 YYYY-MM-DD */
function todayCN(): string {
  const cn = new Date(Date.now() + 8 * 3600 * 1000);
  return cn.toISOString().slice(0, 10);
}

/** 东八区昨日 YYYY-MM-DD */
function yesterdayCN(): string {
  const cn = new Date(Date.now() - 24 * 3600 * 1000 + 8 * 3600 * 1000);
  return cn.toISOString().slice(0, 10);
}

/** 任务定义（静态 + 动态完成状态） */
const TASKS = [
  { key: 'signin', title: '每日签到', points: BASE_SIGNIN_POINTS, route: '/pages/points/index' },
  { key: 'purchase', title: '购买商品', points: 50, route: '/pages/mall/index' },
  { key: 'order', title: '完成订单', points: 30, route: '/pages/order-list/index' },
  { key: 'evaluate', title: '评价商品', points: 20, route: '/pages/order-list/index' },
];

export const pointsService = {
  /** 我的积分余额 + 今日签到状态 + 连续天数 + 近期流水 */
  async myBalance(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { points: true } });
    const records = await prisma.pointsRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const todaySignin = await prisma.signinRecord.findUnique({
      where: { userId_date: { userId, date: todayCN() } },
    });
    let continuousDays = 0;
    if (todaySignin) {
      continuousDays = todaySignin.continuousDays;
    } else {
      const yesterday = await prisma.signinRecord.findUnique({
        where: { userId_date: { userId, date: yesterdayCN() } },
      });
      continuousDays = yesterday?.continuousDays ?? 0;
    }

    return {
      balance: user?.points ?? 0,
      todaySigned: !!todaySignin,
      continuousDays,
      records: records.map((r) => ({
        type: r.type,
        change: r.change,
        balance: r.balance,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },

  /** 签到（防重 unique + 连续天数 + 发积分事务） */
  async signin(userId: string) {
    const today = todayCN();
    const existing = await prisma.signinRecord.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (existing) throw Errors.badRequest('今日已签到');

    const yesterday = await prisma.signinRecord.findUnique({
      where: { userId_date: { userId, date: yesterdayCN() } },
    });
    const continuousDays = (yesterday?.continuousDays ?? 0) + 1;
    const bonus = continuousDays % 7 === 0 ? CONTINUOUS_7D_BONUS : 0;
    const pointsAwarded = BASE_SIGNIN_POINTS + bonus;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { points: true } });
      const newBalance = (user?.points ?? 0) + pointsAwarded;
      await tx.user.update({ where: { id: userId }, data: { points: newBalance } });
      await tx.signinRecord.create({
        data: { userId, date: today, continuousDays, pointsAwarded },
      });
      await tx.pointsRecord.create({
        data: { userId, change: pointsAwarded, type: 'signin', balance: newBalance },
      });
      return { newBalance, continuousDays, pointsAwarded };
    });

    return {
      ok: true,
      pointsAwarded: result.pointsAwarded,
      continuousDays: result.continuousDays,
      newBalance: result.newBalance,
      bonus: bonus > 0,
    };
  },

  /** 任务列表（静态定义 + 动态完成状态） */
  async myTasks(userId: string) {
    const todaySignin = await prisma.signinRecord.findUnique({
      where: { userId_date: { userId, date: todayCN() } },
    });
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthOrders = await prisma.order.count({
      where: { userId, createdAt: { gte: monthStart }, status: { in: ['paid', 'shipped', 'done'] } },
    });

    return {
      tasks: TASKS.map((t) => {
        let done = false;
        if (t.key === 'signin') done = !!todaySignin;
        if (t.key === 'purchase' || t.key === 'order') done = monthOrders > 0;
        return { ...t, done };
      }),
    };
  },

  /** V0.2.6 分享得积分（日限 3 次=15 分，Redis 计数防刷；前端 onShareAppMessage success 调）*/
  async awardShare(userId: string) {
    const key = `share:pt:${userId}:${todayCN()}`;
    const cnt = await redis.incr(key);
    if (cnt === 1) await redis.expire(key, 86_400);
    if (cnt > SHARE_DAILY_LIMIT) {
      return { awarded: false, todayCount: cnt, quota: SHARE_DAILY_LIMIT };
    }
    await prisma.$transaction(async (tx) => {
      await userRepo.addPoints(tx, userId, SHARE_POINTS, 'share');
    });
    return { awarded: true, todayCount: cnt, quota: SHARE_DAILY_LIMIT };
  },
};
