/**
 * app-config module — 远程配置 / 功能开关
 *
 * 当前唯一职责：登录接口下发的 config 子集。
 * 写入由 admin module 负责（Phase 3 实现）。
 */
import { prisma } from '../../infra/prisma.js';
import { POINTS_RULES_DEFAULT, FEATURE_FLAGS, type FeatureFlag } from '@qm-wx/shared';

const DEFAULT_FEATURE_FLAGS: Record<FeatureFlag, boolean> = {
  wallet: false,
  payment: false,
  membershipPurchase: false,
  smartAgent: false,
  bindApp: false,
};

const DEFAULT_MEMBER_LEVELS = {
  free: { maxGroups: 2, discount: 1 },
  monthly: { price: 29.9, maxGroups: 5, discount: 0.9, monthlyGiftPoints: 100 },
  quarterly: { price: 79.9, maxGroups: 8, discount: 0.85, monthlyGiftPoints: 100 },
  yearly: { price: 299, maxGroups: 15, discount: 0.8, monthlyGiftPoints: 100 },
} as const;

export const configRepo = {
  /**
   * 登录后下发的 config 子集
   * - featureFlags：5 个 boolean
   * - memberLevels：等级 → 权益
   * - pointsRules：积分规则
   *
   * DB 缺记录时返回默认值（fail-soft）。
   */
  async getLoginConfig() {
    const rows = await prisma.appConfig.findMany({
      where: { id: { in: ['feature_flags', 'member_levels', 'points_rules'] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.id, r.value]));

    const dbFlags = (map['feature_flags'] as Record<string, boolean> | undefined) ?? {};
    const featureFlags = Object.fromEntries(
      FEATURE_FLAGS.map((k) => [k, dbFlags[k] ?? DEFAULT_FEATURE_FLAGS[k]]),
    ) as Record<FeatureFlag, boolean>;

    return {
      featureFlags,
      memberLevels: (map['member_levels'] as Record<string, unknown> | undefined) ??
        DEFAULT_MEMBER_LEVELS,
      pointsRules: (map['points_rules'] as Record<string, number> | undefined) ??
        POINTS_RULES_DEFAULT,
    };
  },

  /** 功能开关（中间件用，单独查） */
  async getFeatureFlags(): Promise<Record<FeatureFlag, boolean>> {
    const row = await prisma.appConfig.findUnique({ where: { id: 'feature_flags' } });
    const dbFlags = (row?.value as Record<string, boolean> | undefined) ?? {};
    return Object.fromEntries(
      FEATURE_FLAGS.map((k) => [k, dbFlags[k] ?? DEFAULT_FEATURE_FLAGS[k]]),
    ) as Record<FeatureFlag, boolean>;
  },
};
