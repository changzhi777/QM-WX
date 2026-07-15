/**
 * user module business logic
 *
 * 关键点：
 * - code2Session 由后端调（**不**信任前端传的 openid）
 * - 首登送 50 积分（POINTS_RULES_DEFAULT.signupBonus）
 * - JWT 含 openid / sub(userId)
 * - 返回 config（featureFlags / memberLevels / pointsRules）让前端首屏就拿到开关
 */
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { prisma } from '../../infra/prisma.js';
import { redis } from '../../infra/redis.js';
import { signTokens } from '../../common/helpers/sign-tokens.js';
import { userRepo } from './user.repository.js';
import { ludongService } from '../ludong/ludong.service.js';
import { code2Session } from '../../common/integrations/wx/code2session.js';
import { Errors } from '../../common/errors.js';
import { logger } from '../../common/logger.js';
import { Cache } from '../../infra/cache.js';
import { configRepo } from '../app-config/app-config.repository.js';
import { POINTS_RULES_DEFAULT } from '@qm-wx/shared';
import type { LoginInput, UpdateProfileInput, BindAppsInput } from './user.schema.js';

const SIGNUP_BONUS = POINTS_RULES_DEFAULT.signupBonus;

/** me 缓存 TTL：30s（user 信息变更频繁：积分/会员/打卡/订单，30s 平衡） */
const ME_CACHE_TTL_SEC = 30;
const meCacheKey = (userId: string) => `user:me:${userId}`;

/** ISO 自然周 key（周一~周日），用于 report 免费周限频 */
function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

/**
 * V0.2.7 成长等级门槛（按累计积分 totalPointsEarned 派生，从高到低首个命中）。
 * growthLevel 不存库（派生），避免 addPoints 后还要回写等级字段。
 */
const GROWTH_THRESHOLDS = [
  { level: 'diamond', minPoints: 5000 },
  { level: 'gold', minPoints: 2000 },
  { level: 'silver', minPoints: 500 },
  { level: 'bronze', minPoints: 100 },
] as const;
type GrowthLevel = 'free' | 'bronze' | 'silver' | 'gold' | 'diamond';

/** 按累计积分派生成长等级 */
export function deriveGrowthLevel(totalPointsEarned: number): GrowthLevel {
  for (const t of GROWTH_THRESHOLDS) {
    if (totalPointsEarned >= t.minPoints) return t.level;
  }
  return 'free';
}

/**
 * V0.2.7 积分兑换会员时长套餐（前后端单一数据源）。
 * 前端展示套餐，后端校验防任意兑换（只认白名单内的 days）。
 */
export const REDEEM_PACKAGES = [
  { days: 7, pointsCost: 100 },
  { days: 30, pointsCost: 300 },
] as const;

export const userService = {
  /**
   * 登录
   *
   * 1. code → openid
   * 2. upsert user（首登建档 + 送注册积分 + 写积分流水）
   * 3. 签 access + refresh JWT
   * 4. 加载 config
   * 5. 返回
   */
  async login(
    app: FastifyInstance,
    input: LoginInput,
  ): Promise<{
    user: Awaited<ReturnType<typeof toUserOutput>>;
    accessToken: string;
    refreshToken: string;
    config: {
      featureFlags: Record<string, boolean>;
      memberLevels: Record<string, unknown>;
      pointsRules: Record<string, number>;
    };
  }> {
    // 1. code → openid
    const { openid, unionid } = await code2Session(input.code);

    // 2. upsert + 积分
    const isNew = !(await userRepo.findByOpenid(openid));
    const user = await userRepo.upsertByOpenid(openid, {
      nickname: input.nickname,
      avatarUrl: input.avatarUrl,
      unionid,
    });

    // 同步用户到律动(LUDONG_SYNC_ENABLED 时入 outbox;非事务,失败仅告警不阻塞 login)
    try {
      await ludongService.enqueueInTx(prisma, 'user.upsert', {
        userId: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
      });
    } catch (err) {
      logger.warn(
        { userId: user.id, err: err instanceof Error ? err.message : String(err) },
        'ludong user.upsert enqueue failed',
      );
    }

    if (isNew) {
      // 首登：事务写流水 + 加积分
      await prisma.$transaction(async (tx) => {
        await userRepo.addPoints(tx, user.id, SIGNUP_BONUS, 'signup_bonus');
      });
      // 重新读一次拿最新 points
      const refreshed = await userRepo.findById(user.id);
      if (refreshed) Object.assign(user, refreshed);
    }

    // 3. 签 JWT
    const { accessToken, refreshToken } = await signTokens(app, user);

    // 4. 加载 config
    const config = await configRepo.getLoginConfig();

    return {
      user: toUserOutput(user),
      accessToken,
      refreshToken,
      config,
    };
  },

  /** 更新资料（字段白名单，V0.1.8 增 me 缓存失效） */
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const profile = input.profile ?? {};
    const updated = await userRepo.updateProfile(userId, {
      ...(input.nickname !== undefined && { nickname: input.nickname }),
      ...(input.avatarFileID !== undefined && { avatarUrl: input.avatarFileID }),
      // V0.1.40 profile 扩展字段（之前完全忽略，现已修）
      ...(profile.gender !== undefined && { gender: profile.gender }),
      ...(profile.birthday !== undefined && { birthday: profile.birthday }),
      ...(profile.region !== undefined && { region: profile.region }),
      ...(profile.height !== undefined && { height: profile.height }),
      ...(profile.weight !== undefined && { weight: profile.weight }),
      ...(profile.name !== undefined && { nickname: profile.name }),
      ...(profile.phone !== undefined && { phone: profile.phone }),
    });
    await Cache.del(meCacheKey(userId));
    return toUserOutput(updated);
  },

  /**
   * 拿当前 user（me 端点用，V0.1.8 增 Cache.wrap）
   *
   * 缓存策略：Cache.wrap + 30s TTL
   * - 命中：~0.5ms（小程序启动查 me，热路径）
   * - 未命中：1 DB + 写回缓存
   * - 写失效：updateProfile 后 del key（其他写点：打卡/订单/会员变更 由 30s TTL 兜底）
   * - cache fail-open：Redis 挂掉时静默降级直查 DB
   */
  async getById(userId: string) {
    return Cache.wrap(meCacheKey(userId), ME_CACHE_TTL_SEC, async () => {
      const user = await userRepo.findById(userId);
      if (!user) throw Errors.notFound('user not found');
      return toUserOutput(user);
    });
  },

  /**
   * 绑定第三方运动 APP（Phase 1.1 实现）
   *
   * 当前 schema 无 boundApps 字段、逻辑未实现。先前的占位实现会"静默成功"
   * 但什么都不写，易让调用方误以为已绑定。改为显式 501，避免误用。
   */
  /**
   * 绑定多方式认证（V0.1.129，phone/email/password）
   *
   * 用户先微信登录，再绑手机号/邮箱/密码，之后可用绑定方式登录（同一 User）。
   * 防重：phone/email 全局唯一，已被其他账号绑则拒绝。
   */
  async bindApps(userId: string, input: BindAppsInput) {
    const data: { phone?: string; email?: string; passwordHash?: string; username?: string } = {};
    if (input.phone !== undefined) {
      const exist = await prisma.user.findUnique({ where: { phone: input.phone } });
      if (exist && exist.id !== userId) throw Errors.badRequest('手机号已被其他账号绑定');
      data.phone = input.phone;
    }
    if (input.email !== undefined) {
      const exist = await prisma.user.findUnique({ where: { email: input.email } });
      if (exist && exist.id !== userId) throw Errors.badRequest('邮箱已被其他账号绑定');
      data.email = input.email;
    }
    if (input.password !== undefined) {
      data.passwordHash = await bcrypt.hash(input.password, 10);
    }
    if (input.username !== undefined) {
      const exist = await prisma.user.findUnique({ where: { username: input.username } });
      if (exist && exist.id !== userId) throw Errors.badRequest('用户名已被占用');
      data.username = input.username;
    }
    if (Object.keys(data).length === 0) {
      throw Errors.badRequest('至少提供一个绑定字段（phone/email/password）');
    }

    const updated = await prisma.user.update({ where: { id: userId }, data });
    await Cache.del(meCacheKey(userId));
    return toUserOutput(updated);
  },

  /** V0.1.43 完成新用户激活向导（标记 onboardingDone = true，失效 me 缓存）*/
  async completeOnboarding(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { onboardingDone: true },
    });
    await Cache.del(meCacheKey(userId));
    return { ok: true };
  },

  /** V0.1.44 重新激活（onboardingDone = false，前端重走向导填资料/授权微信运动等）*/
  async resetOnboarding(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { onboardingDone: false },
    });
    await Cache.del(meCacheKey(userId));
    return { ok: true };
  },

  /** V0.2.6 邀请裂变：绑定邀请人（新用户注册时调），双方奖励（邀请人+7天+50分，被邀+3天+20分）*/
  async bindInviter(userId: string, inviterCode: string) {
    const inviter = await prisma.user.findUnique({ where: { inviteCode: inviterCode } });
    if (!inviter) throw Errors.badRequest('邀请码无效');
    if (inviter.id === userId) throw Errors.badRequest('不能邀请自己');
    // 防重：Team.inviteeId @unique（一人仅一个上线）
    const exist = await prisma.team.findUnique({ where: { inviteeId: userId } });
    if (exist) throw Errors.badRequest('已绑定邀请人');
    await prisma.$transaction(async (tx) => {
      await tx.team.create({ data: { inviterId: inviter.id, inviteeId: userId, level: 1 } });
      await userRepo.extendMember(tx, inviter.id, 7, 90); // 邀请人 +7 天（V0.2.7 封顶 90 天）
      await userRepo.addPoints(tx, inviter.id, 50, 'invite', userId);
      await userRepo.extendMember(tx, userId, 3); // 被邀人 +3 天体验
      await userRepo.addPoints(tx, userId, 20, 'invited', inviter.id);
    });
    await Cache.del(meCacheKey(userId));
    await Cache.del(meCacheKey(inviter.id));
    return { ok: true, inviterId: inviter.id };
  },

  /** V0.2.6 report 免费周限频：会员不限，免费每周 1 次全文（ISO 自然周）*/
  async checkReportQuota(userId: string) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { memberExpireAt: true },
    });
    const isMember = !!u?.memberExpireAt && u.memberExpireAt > new Date();
    if (isMember) return { canView: true, weeklyUsed: 0, quota: -1 }; // 会员不限
    const key = `report:vw:${userId}:${isoWeekKey()}`;
    const used = await redis.incr(key);
    if (used === 1) await redis.expire(key, 7 * 86_400);
    return { canView: used <= 1, weeklyUsed: used, quota: 1 };
  },

  /** V0.2.7 积分兑换会员时长（飞轮消费出口：扣积分 + 续期，套餐校验防任意兑换）*/
  async redeemMember(userId: string, days: number) {
    const pkg = REDEEM_PACKAGES.find((p) => p.days === days);
    if (!pkg) throw Errors.badRequest('兑换套餐无效');
    await prisma.$transaction(async (tx) => {
      // 扣积分（addPoints 负数走 updateMany 条件防双花，余额不足抛"积分不足"）
      await userRepo.addPoints(tx, userId, -pkg.pointsCost, 'redeem_member');
      await userRepo.extendMember(tx, userId, pkg.days);
    });
    await Cache.del(meCacheKey(userId));
    return { ok: true, days: pkg.days, pointsCost: pkg.pointsCost };
  },
};

/** Prisma row → API output（含 ISO 时间） */
export function toUserOutput(u: {
  id: string;
  openid: string;
  nickname: string | null;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  username: string | null;
  passwordHash: string | null;
  memberLevel: string;
  memberExpireAt: Date | null;
  points: number;
  totalPointsEarned: number;
  certified: boolean;
  gender: string | null;
  birthday: string | null;
  region: string | null;
  height: number | null;
  weight: number | null;
  stats: unknown;
  createdAt: Date;
  updatedAt: Date;
  onboardingDone: boolean;
}) {
  const rawStats = (u.stats as { totalDistance?: number; totalCheckins?: number } | null) ?? {};
  const stats = {
    totalDistance: rawStats.totalDistance ?? 0,
    totalCheckins: rawStats.totalCheckins ?? 0,
    totalPoints: u.points,
  };
  return {
    id: u.id,
    openid: u.openid,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl,
    phone: u.phone,
    email: u.email,
    username: u.username,
    hasPassword: Boolean(u.passwordHash),
    memberLevel: u.memberLevel as 'free' | 'monthly' | 'quarterly' | 'yearly',
    memberExpireAt: u.memberExpireAt?.toISOString() ?? null,
    points: u.points,
    totalPointsEarned: u.totalPointsEarned,
    growthLevel: deriveGrowthLevel(u.totalPointsEarned), // V0.2.7 派生（free/bronze/silver/gold/diamond）
    certified: u.certified,
    gender: u.gender,
    birthday: u.birthday,
    region: u.region,
    height: u.height,
    weight: u.weight,
    stats,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    onboardingDone: u.onboardingDone,
  };
}
