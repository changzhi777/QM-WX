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
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** feature-gate 组件 props */
export interface FeatureFlagsConfig {
  wallet: boolean;
  payment: boolean;
  membershipPurchase: boolean;
  smartAgent: boolean;
  bindApp: boolean;
}
