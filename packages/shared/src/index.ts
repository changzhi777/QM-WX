/**
 * @qm-wx/shared — 前后端共享层
 *
 * 包含：
 * - schemas/    Zod schemas（端点级入参 / 出参）
 * - types/      从 Zod 推导的 TS 类型
 * - constants/  会员等级 / 商品分类 / 积分规则（镜像服务端）
 * - api-contracts/ 端点路径常量
 *
 * 严禁在后端或小程序里重复定义与这里重复的常量 / 类型。
 */

export * from './constants/feature-flags.js';
export * from './constants/member-levels.js';
export * from './constants/points-rules.js';
export * from './api-contracts/endpoints.js';
export * from './types/index.js';
