/**
 * ranking module Zod schemas — 多维榜单（读模型）
 *
 * 参考：pic/2772 我的榜单 — 跑步榜 / 健步榜 / 各跑团子榜
 * 数据来源：Checkin（含 manual + garmin），按 sportType + period 多维聚合
 */
import { z } from 'zod';

export const RANKING_SPORT_TYPES = ['run', 'hike', 'ride', 'all'] as const;
export type RankingSportType = (typeof RANKING_SPORT_TYPES)[number];

export const RANKING_PERIODS = ['week', 'month', 'year', 'all'] as const;
export type RankingPeriod = (typeof RANKING_PERIODS)[number];

export const GroupRankingMultiInputSchema = z.object({
  groupId: z.string().min(1),
  sportType: z.enum(RANKING_SPORT_TYPES).default('all'),
  period: z.enum(RANKING_PERIODS).default('week'),
});
export type GroupRankingMultiInput = z.infer<typeof GroupRankingMultiInputSchema>;

export const RankingActionBodySchema = z.object({
  action: z.enum(['groupRankingMulti']),
  payload: z.unknown().optional(),
});
