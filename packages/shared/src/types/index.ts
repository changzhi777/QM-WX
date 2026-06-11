/**
 * 共享类型入口
 *
 * 类型尽量从 Zod schema 推导（z.infer），避免重复定义。
 * 当前阶段先放一些基础类型，详细 schema 在 Phase 1+ 陆续补充。
 */

import type { MemberLevel } from '../constants/member-levels.js';

export interface User {
  id: string;
  openid: string;
  nickname: string | null;
  avatarUrl: string | null;
  phone: string | null;
  memberLevel: MemberLevel;
  memberExpireAt: string | null; // ISO 8601
  points: number;
  certified: boolean;
  stats: {
    totalDistance: number;
    totalCheckins: number;
    totalPoints: number;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * API 统一返回结构（前后端共用）
 *
 * 用统一接口（不取判别联合）的原因：联合在调用方需要
 * `if (code === 0) { return data }` 收窄后才能访问 data，
 * 但代码中常常忘记收窄 + 写 throw 会用到 msg，类型噪音大。
 * 统一接口可省去收窄，code===0 业务上视为成功。
 */
export interface ApiSuccess<T> {
  code: 0;
  data: T;
  msg?: never;
}

export interface ApiError {
  code: number; // 4xx / 5xx
  data?: never;
  msg: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** 模块级 action 路由统一 body 形状 */
export interface ActionRequest<T = unknown> {
  action: string;
  payload: T;
}

// ===== 周报 =====

/** 单成员周报条目 */
export interface WeeklyReportMember {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  distance: number;
  checkinCount: number;
  points: number;
  rank: number;
}

/** 单群周报 */
export interface WeeklyReport {
  groupId: string;
  groupName: string;
  period: string; // YYYY-WW
  startDate: string; // 周一 YYYY-MM-DD
  endDate: string; // 周日 YYYY-MM-DD
  totalDistance: number;
  totalCheckins: number;
  totalMembers: number;
  topMembers: WeeklyReportMember[]; // top 5
  champion: WeeklyReportMember | null;
  generatedAt: string; // ISO
}
