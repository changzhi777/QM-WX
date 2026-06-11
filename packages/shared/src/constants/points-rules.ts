/**
 * 积分规则（镜像服务端 app_config.points_rules）
 *
 * 服务端为唯一权威；前端 constants 仅展示用。实际计算 / 校验以后端 service 为准。
 */

export const POINTS_RULES_DEFAULT = {
  perKm: 1,             // 1 km = 1 积分
  dailyMaxKm: 50,        // 单日计分距离上限
  dailyMaxCheckins: 1,   // 单日计分次数上限
  signupBonus: 50,       // 注册奖励
  memberMonthlyGift: 100, // 会员月赠积分
} as const;
