/**
 * 会员等级（镜像服务端 app_config.member_levels）
 *
 * 服务端为唯一权威；本文件仅供前端展示用。等级 → 权益映射以后端为准。
 */

export const MEMBER_LEVELS = ['free', 'monthly', 'quarterly', 'yearly'] as const;
export type MemberLevel = (typeof MEMBER_LEVELS)[number];

/** 等级展示文案（前端用，不参与业务） */
export const MEMBER_LEVEL_LABEL: Record<MemberLevel, string> = {
  free: '免费用户',
  monthly: '月度会员',
  quarterly: '季度会员',
  yearly: '年度会员',
};
