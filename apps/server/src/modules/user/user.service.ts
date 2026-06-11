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
import { prisma } from '../../infra/prisma.js';
import { userRepo } from './user.repository.js';
import { code2Session } from '../../common/integrations/wx/code2session.js';
import { Errors } from '../../common/errors.js';
import { configRepo } from '../app-config/app-config.repository.js';
import { POINTS_RULES_DEFAULT } from '@qm-wx/shared';
import type { LoginInput, UpdateProfileInput, BindAppsInput } from './user.schema.js';

const SIGNUP_BONUS = POINTS_RULES_DEFAULT.signupBonus;

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
      { sub: user.id, id: user.id, openid: user.openid, kind: 'refresh' },
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

  /** 更新资料（字段白名单） */
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const updated = await userRepo.updateProfile(userId, {
      ...(input.nickname !== undefined && { nickname: input.nickname }),
      ...(input.avatarFileID !== undefined && { avatarUrl: input.avatarFileID }),
    });
    return toUserOutput(updated);
  },

  /** 拿当前 user（me 端点用） */
  async getById(userId: string) {
    const user = await userRepo.findById(userId);
    if (!user) throw Errors.notFound('user not found');
    return toUserOutput(user);
  },

  /** 绑定第三方运动 APP（feature flag 校验在 route 层做） */
  async bindApps(userId: string, input: BindAppsInput) {
    void input; // TODO Phase 1.1: 实现 boundApps 写入
    const user = await userRepo.findById(userId);
    if (!user) throw Errors.notFound('user not found');
    // boundApps 当前在 app_config，Phase 1.1 实现
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { /* boundApps: merged */ } as never, // schema 没该字段，TODO Phase 1.1
    });
    return toUserOutput(updated);
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
  stats: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  const stats = (u.stats as { totalDistance: number; totalCheckins: number; totalPoints: number }) ?? {
    totalDistance: 0,
    totalCheckins: 0,
    totalPoints: 0,
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
    stats,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}
