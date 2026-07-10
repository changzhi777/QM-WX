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
import { randomUUID } from 'node:crypto';
import { prisma } from '../../infra/prisma.js';
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
    const accessToken = await app.jwt.sign(
      { sub: user.id, id: user.id, openid: user.openid },
      { expiresIn: '2h' },
    );
    const refreshToken = await app.jwt.sign(
      { sub: user.id, id: user.id, openid: user.openid, kind: 'refresh', jti: randomUUID() },
      { expiresIn: '30d' },
    );

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
  async bindApps(_userId: string, _input: BindAppsInput): Promise<never> {
    throw Errors.notImplemented('绑定运动 APP 功能开发中（Phase 1.1）');
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
};

/** Prisma row → API output（含 ISO 时间） */
function toUserOutput(u: {
  id: string;
  openid: string;
  nickname: string | null;
  avatarUrl: string | null;
  phone: string | null;
  memberLevel: string;
  memberExpireAt: Date | null;
  points: number;
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
    memberLevel: u.memberLevel as 'free' | 'monthly' | 'quarterly' | 'yearly',
    memberExpireAt: u.memberExpireAt?.toISOString() ?? null,
    points: u.points,
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
