/**
 * 功能开关 key（镜像服务端 app_config.feature_flags 文档）
 *
 * 服务端为唯一权威；小程序端通过登录接口下发的 config 读取，仅用于 UI 隐藏。
 */

export const FEATURE_FLAGS = [
  'wallet',
  'payment',
  'membershipPurchase',
  'smartAgent',
  'bindApp',
  // V0.3.6 产品收敛（2026-07-26 清单）：17 页隐藏对应的入口 flag
  'diet',      // 饮食日记（pages/diet）+ 今日页饮食摘要卡
  'shoes',     // 我的跑鞋（pages/shoes）+ mine 页入口
  'runner',    // 跑者数据（pages/runner）+ mine 页"我的解读报告"入口
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** feature-gate 组件 props */
export interface FeatureFlagsConfig {
  wallet: boolean;
  payment: boolean;
  membershipPurchase: boolean;
  smartAgent: boolean;
  bindApp: boolean;
  /** V0.3.6 产品收敛：以下 flag 默认 false，远程开启时对应入口显示 */
  diet: boolean;
  shoes: boolean;
  runner: boolean;
}
