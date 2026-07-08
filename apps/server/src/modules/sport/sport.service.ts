/**
 * sport module business logic
 *
 * 关键防作弊点（来自 01 审查 P1-1/P1-2 + 02 §5.3）：
 * - distance 服务端校验 [0.5, 50]
 * - 传 points 字段直接忽略
 * - 同日同 user 限 1 次计分（看 checkins.date）
 * - 积分 = floor(distance × perKm)
 * - 写流水 + inc user.points/stats
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { sportRepo } from './sport.repository.js';
import { ludongService } from '../ludong/ludong.service.js';
import { userRepo } from '../user/user.repository.js';
import { configRepo } from '../app-config/app-config.repository.js';
import { assertNotBanned } from '../admin/admin.service.js';
import { Cache } from '../../infra/cache.js';
import { POINTS_RULES_DEFAULT, type MemberLevel } from '@qm-wx/shared';
import type {
  CheckinInput,
  CreateGroupInput,
  GroupRankingOutput,
  JoinGroupInput,
  MyStatsOutput,
  QuitGroupInput,
  GroupDetailQuery,
  GroupMembersQuery,
  AnnounceGroupInput,
} from './sport.schema.js';
import { CheckinInputSchema } from './sport.schema.js';
import { incrementShoeKm } from '../shoes/shoes.service.js';

/** sport.today 缓存 TTL：60s（打卡后 60s 内可能仍看到旧态，可接受） */
const TODAY_CACHE_TTL_SEC = 60;
const todayCacheKey = (userId: string, date: string) => `sport:today:${userId}:${date}`;

/** myStats 缓存 TTL：60s（个人统计随打卡变化，60s 容忍延迟） */
const MY_STATS_CACHE_TTL_SEC = 60;
const myStatsCacheKey = (userId: string, period: string) => `sport:myStats:${userId}:${period}`;

/** groupRanking 缓存 TTL：60s（群榜单随群成员打卡变化，60s 容忍延迟） */
const GROUP_RANKING_CACHE_TTL_SEC = 60;
const groupRankingCacheKey = (groupId: string, period: string) => `sport:groupRanking:${groupId}:${period}`;

// ===== 时区辅助：取"今天"用东八区 =====
function todayCN(): string {
  const now = new Date();
  const cn = new Date(now.getTime() + 8 * 3600 * 1000);
  return cn.toISOString().slice(0, 10);
}

function periodSince(period: 'week' | 'month' | 'year' | 'all'): Date {
  if (period === 'all') return new Date(0);
  const now = new Date();
  const d = new Date(now);
  if (period === 'week') d.setDate(d.getDate() - 7);
  if (period === 'month') d.setMonth(d.getMonth() - 1);
  if (period === 'year') d.setFullYear(d.getFullYear() - 1);
  return d;
}

export const sportService = {
  /**
   * 今日打卡状态（带缓存）
   *
   * 缓存策略：Cache.wrap + 60s TTL
   * - 命中：~0.5ms（避免每次进入小程序都打 DB）
   * - 未命中：1 DB + 写回缓存
   * - 写操作（checkin）成功后 del key 精准失效，不等 TTL
   * - cache fail-open：Redis 挂掉时静默降级到直查 DB（业务不阻塞）
   */
  async today(userId: string) {
    const date = todayCN();
    return Cache.wrap(todayCacheKey(userId, date), TODAY_CACHE_TTL_SEC, async () => {
      const checkin = await sportRepo.findTodayCheckin(userId, date);
      return {
        date,
        done: !!checkin,
        checkin: checkin
          ? {
              distance: checkin.distance,
              durationSec: checkin.durationSec,
              pace: checkin.pace,
              points: checkin.points,
              createdAt: checkin.createdAt.toISOString(),
            }
          : null,
      };
    });
  },

  /**
   * 打卡
   */
  async checkin(userId: string, input: CheckinInput) {
    // ⚠️ 防作弊：忽略前端传的 points
    const { points: _ignored, ...clean } = input;
    void _ignored;

    // 防御性校验：即使 route 已 parse，service 也再 parse 一次防直接调用
    CheckinInputSchema.parse(input);

    // V0.1.18：黑名单拦截
    const user = await userRepo.findById(userId);
    if (!user) throw Errors.unauthorized();
    assertNotBanned(user);

    const date = todayCN();

    // 1. 校验：今日已打卡
    const existing = await sportRepo.findTodayCheckin(userId, date);
    if (existing) {
      throw Errors.conflict('今日已打卡，请明天再来');
    }

    // 2. 校验：群上限（如果传 groupId，要确认是 member）
    if (clean.groupId) {
      const member = await sportRepo.isMember(clean.groupId, userId);
      if (!member) throw Errors.forbidden('你不在该群中');
    }

    // 3. 算积分
    const { pointsRules } = await configRepo.getLoginConfig();
    const perKm = pointsRules.perKm ?? POINTS_RULES_DEFAULT.perKm;
    const points = Math.floor(clean.distance * perKm);

    // 4. 事务：写 checkin + 写流水 + 加积分 + 加 stats + 跑鞋累计里程（V0.1.26）
    await prisma.$transaction(async (tx) => {
      await sportRepo.checkinInTx(tx, {
        userId,
        groupId: clean.groupId ?? null,
        distance: clean.distance,
        durationSec: clean.durationSec ?? null,
        pace: clean.pace ?? null,
        heartRate: clean.heartRate ?? null,
        cadence: clean.cadence ?? null,
        points,
        date,
        shoeId: clean.shoeId ?? null,
      });
      await userRepo.addPoints(tx, userId, points, 'checkin');
      // 跑鞋里程累计（V0.1.26；shoeId 为空则跳过）
      await incrementShoeKm(tx, clean.shoeId ?? null, clean.distance);
      // 同步打卡到律动(LUDONG_SYNC_ENABLED 时入 outbox,由 ludong-sync job 投递)
      await ludongService.enqueueInTx(tx, 'checkin.batch', {
        userId,
        distance: clean.distance,
        durationSec: clean.durationSec ?? null,
        pace: clean.pace ?? null,
        heartRate: clean.heartRate ?? null,
        cadence: clean.cadence ?? null,
        points,
        date,
        groupId: clean.groupId ?? null,
      });
    });

    // 5. 精准失效今日缓存（不等 TTL 过期）
    //    在事务外执行：缓存失败不阻塞业务返回值
    await Cache.del(todayCacheKey(userId, date));
    // V0.1.11：myStats 随打卡变化 → 失效该用户全 period（pattern）
    await Cache.delByPattern(`sport:myStats:${userId}:*`);
    // V0.1.11：groupRanking 若打卡带 groupId → 失效该群全 period（pattern）
    // V0.1.12：weekly-report aggregate 同样随群打卡变化 → 一并失效该群周报缓存
    if (clean.groupId) {
      await Cache.delByPattern(`sport:groupRanking:${clean.groupId}:*`);
      await Cache.delByPattern(`weeklyReport:aggregate:${clean.groupId}:*`);
    }

    return { points, todayDone: true, date };
  },

  /**
   * 我的统计（V0.1.11 增 Cache.wrap）
   *
   * 缓存策略：Cache.wrap + 60s TTL + key 含 userId/period
   * - 命中：~0.5ms（避免拉全周期 checkins + reduce）
   * - 写后失效：checkin 成功后 delByPattern('sport:myStats:{userId}:*') 抹全 period
   * - cache fail-open
   */
  async myStats(userId: string, input: MyStatsOutput) {
    return Cache.wrap(myStatsCacheKey(userId, input.period), MY_STATS_CACHE_TTL_SEC, async () => {
      const checkins = await sportRepo.findMyCheckins(userId, periodSince(input.period));
      const totalDistance = checkins.reduce((s, c) => s + c.distance, 0);
      const count = checkins.length;

      // 平均配速：从 durationSec / distance 反推
      let avgPace: number | null = null;
      const withDur = checkins.filter((c) => c.durationSec && c.distance > 0);
      if (withDur.length > 0) {
        const totalSec = withDur.reduce((s, c) => s + (c.durationSec ?? 0), 0);
        const totalKm = withDur.reduce((s, c) => s + c.distance, 0);
        avgPace = totalKm > 0 ? totalSec / totalKm : null;
      }

      return {
        totalDistance: round(totalDistance, 2),
        count,
        avgPace: avgPace ? round(avgPace, 1) : null,
        period: input.period,
      };
    });
  },

  /**
   * 我的群
   */
  async myGroups(userId: string) {
    const list = await sportRepo.myGroups(userId);
    return list.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      memberCount: m.group.memberCount,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));
  },

  /**
   * 创建群（群主 = 创建者）
   */
  async createGroup(userId: string, input: CreateGroupInput, userNickname: string) {
    // 上限校验：会员等级
    const { memberLevels } = await configRepo.getLoginConfig();
    const user = await userRepo.findById(userId);
    if (!user) throw Errors.notFound('user not found');
    const myCount = await sportRepo.countMyGroups(userId);
    const cfg = (memberLevels as Record<string, { maxGroups: number }>)[user.memberLevel as MemberLevel] ?? { maxGroups: 2 };
    if (myCount >= cfg.maxGroups) {
      throw Errors.forbidden(`你当前可加入/创建 ${cfg.maxGroups} 个群，升级会员可加更多`);
    }

    // 事务
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: { name: input.name, ownerId: userId, memberCount: 1 },
      });
      await tx.groupMember.create({
        data: { groupId: g.id, userId, nickname: userNickname, role: 'owner' },
      });
      return g;
    });

    return {
      id: group.id,
      name: group.name,
      memberCount: group.memberCount,
      role: 'owner' as const,
      joinedAt: group.createdAt.toISOString(),
    };
  },

  /**
   * 加入群（按邀请 ID）
   */
  async joinGroup(userId: string, input: JoinGroupInput, userNickname: string, avatarUrl: string | null) {
    const group = await sportRepo.findGroup(input.groupId);
    if (!group) throw Errors.notFound('群不存在');

    const isAlready = await sportRepo.isMember(input.groupId, userId);
    if (isAlready) throw Errors.conflict('你已在该群中');

    // 上限校验
    const { memberLevels } = await configRepo.getLoginConfig();
    const user = await userRepo.findById(userId);
    if (!user) throw Errors.notFound('user not found');
    const myCount = await sportRepo.countMyGroups(userId);
    const cfg = (memberLevels as Record<string, { maxGroups: number }>)[user.memberLevel as MemberLevel] ?? { maxGroups: 2 };
    if (myCount >= cfg.maxGroups) {
      throw Errors.forbidden(`你当前可加入/创建 ${cfg.maxGroups} 个群，升级会员可加更多`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.groupMember.create({
        data: { groupId: input.groupId, userId, nickname: userNickname, avatarUrl, role: 'member' },
      });
      await tx.group.update({
        where: { id: input.groupId },
        data: { memberCount: { increment: 1 } },
      });
      // opengid 绑定（仅第一次）
      if (input.opengid && !group.opengid) {
        await tx.group.update({
          where: { id: input.groupId },
          data: { opengid: input.opengid },
        });
      }
    });

    return { ok: true };
  },

  /**
   * 退出群（群主不可退）
   */
  async quitGroup(userId: string, input: QuitGroupInput) {
    const member = await sportRepo.isMember(input.groupId, userId);
    if (!member) throw Errors.notFound('你不在该群中');
    if (member.role === 'owner') throw Errors.forbidden('群主不可退出，请先转让');

    await prisma.$transaction(async (tx) => {
      await tx.groupMember.delete({
        where: { groupId_userId: { groupId: input.groupId, userId } },
      });
      await tx.group.update({
        where: { id: input.groupId },
        data: { memberCount: { decrement: 1 } },
      });
    });

    return { ok: true };
  },

  /**
   * 群榜单（V0.1.11 增 Cache.wrap）
   *
   * 缓存策略：Cache.wrap + 60s TTL + key 含 groupId/period（群维度，N 人查同榜共享）
   * - 鉴权（isMember）在 wrap 外：非成员抛 forbidden，不进缓存
   * - 命中：~0.5ms（避免拉全群全周期 checkins + 聚合排序，sport 最重查询）
   * - 写后失效：checkin 带 groupId 成功后 delByPattern('sport:groupRanking:{groupId}:*')
   * - cache fail-open
   */
  async groupRanking(userId: string, input: GroupRankingOutput) {
    // 鉴权在缓存外：非成员不缓存，直接抛 forbidden
    const member = await sportRepo.isMember(input.groupId, userId);
    if (!member) throw Errors.forbidden('你不在该群中');

    return Cache.wrap(groupRankingCacheKey(input.groupId, input.period), GROUP_RANKING_CACHE_TTL_SEC, async () => {
      const since = periodSince(input.period);
      const checkins = await sportRepo.findGroupCheckins(input.groupId, since);

      // 按 userId 聚合
      const map = new Map<
        string,
        { userId: string; nickname: string; avatarUrl: string | null; distance: number; count: number; points: number }
      >();

      for (const c of checkins) {
        const cur = map.get(c.userId) ?? {
          userId: c.userId,
          nickname: c.user.nickname ?? '匿名',
          avatarUrl: c.user.avatarUrl,
          distance: 0,
          count: 0,
          points: 0,
        };
        cur.distance += c.distance;
        cur.count += 1;
        cur.points += c.points;
        map.set(c.userId, cur);
      }

      const members = Array.from(map.values())
        .map((m) => ({
          userId: m.userId,
          nickname: m.nickname,
          avatarUrl: m.avatarUrl,
          distance: round(m.distance, 2),
          count: m.count,
          points: m.points,
          rank: 0, // 占位，sort 后重新赋值
        }))
        .sort((a, b) => b.distance - a.distance)
        .map((m, i) => ({ ...m, rank: i + 1 }))
        .slice(0, 50);

      return {
        groupId: input.groupId,
        period: input.period,
        members,
        champion: members[0] ?? null,
        totals: {
          memberCount: members.length,
          totalDistance: round(members.reduce((s, m) => s + m.distance, 0), 2),
        },
      };
    });
  },

  /**
   * 群详情（V0.1.42）：群卡 + 公告 + 汇总（总跑量/打卡总数/活跃天数）
   *
   * 汇总：全周期 Checkin aggregate（群累计数据，无 period 限制）
   */
  async groupDetail(userId: string, input: GroupDetailQuery) {
    const member = await sportRepo.isMember(input.groupId, userId);
    if (!member) throw Errors.forbidden('你不在该群中');

    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
      include: { owner: { select: { id: true, nickname: true, avatarUrl: true } } },
    });
    if (!group) throw Errors.notFound('群不存在');

    const [distAgg, countAgg, activeDaysAgg] = await Promise.all([
      prisma.checkin.aggregate({ where: { groupId: input.groupId }, _sum: { distance: true } }),
      prisma.checkin.count({ where: { groupId: input.groupId } }),
      prisma.checkin.groupBy({ by: ['date'], where: { groupId: input.groupId } }),
    ]);

    return {
      id: group.id,
      name: group.name,
      owner: group.owner,
      memberCount: group.memberCount,
      announce: group.announce,
      myRole: member.role,
      summary: {
        totalDistance: round(distAgg._sum.distance ?? 0, 2),
        totalCheckins: countAgg,
        activeDays: activeDaysAgg.length,
      },
    };
  },

  /**
   * 群成员列表（V0.1.42）：含本月跑量，按跑量降序
   *
   * 复用 familyRanking groupBy userId 范式（N+1 规避：1 次 groupBy 替代 N 次 aggregate）
   */
  async groupMembers(userId: string, input: GroupMembersQuery) {
    const member = await sportRepo.isMember(input.groupId, userId);
    if (!member) throw Errors.forbidden('你不在该群中');

    const members = await prisma.groupMember.findMany({
      where: { groupId: input.groupId },
      include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    const range = cnMonthRange();
    const memberIds = members.map((m) => m.userId);
    const grouped = await prisma.checkin.groupBy({
      by: ['userId'],
      where: { userId: { in: memberIds }, date: { gte: range.start, lt: range.end } },
      _sum: { distance: true },
    });
    const distMap = new Map(grouped.map((g) => [g.userId, g._sum.distance ?? 0]));

    return {
      members: members
        .map((m) => ({
          userId: m.userId,
          nickname: m.user.nickname ?? '匿名',
          avatarUrl: m.user.avatarUrl,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
          monthDistance: round(distMap.get(m.userId) ?? 0, 2),
        }))
        .sort((a, b) => b.monthDistance - a.monthDistance),
    };
  },

  /**
   * 发群公告（V0.1.42）：仅 owner（announce 空串/null = 清空公告）
   */
  async announceGroup(userId: string, input: AnnounceGroupInput) {
    const member = await sportRepo.isMember(input.groupId, userId);
    if (!member) throw Errors.forbidden('你不在该群中');
    if (member.role !== 'owner') throw Errors.forbidden('仅群主可发公告');

    await prisma.group.update({
      where: { id: input.groupId },
      data: { announce: input.announce?.trim() || null },
    });
    return { ok: true };
  },
};

/** CN 时区本月范围 [start, end) "YYYY-MM-DD"（复制自 family.service，KISS 不跨 module 依赖） */
function cnMonthRange(): { start: string; end: string } {
  const cn = new Date(Date.now() + 8 * 3600 * 1000);
  const y = cn.getUTCFullYear();
  const m = cn.getUTCMonth();
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const end = m + 1 > 11 ? `${y + 1}-01-01` : `${y}-${String(m + 2).padStart(2, '0')}-01`;
  return { start, end };
}

function round(n: number, p: number): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}
