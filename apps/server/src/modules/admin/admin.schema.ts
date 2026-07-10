/**
 * admin module schema — 后台管理入参校验
 *
 * 从 admin.routes.ts 抽离（P2-1 一致性：与其他 module 统一用独立 schema 文件）。
 * 新增 4 个 list/stats action schema（P1-2：补 qm-admin 前端数据源）。
 */
import { z } from 'zod';
import { CONTENT_TYPES } from '../content/content.schema.js';

// ===== 内容 / 商品 upsert =====
export const UpsertContentSchema = z.object({
  id: z.string().optional(),
  type: z.enum(CONTENT_TYPES),
  title: z.string().min(1).max(128),
  cover: z.string().optional(),
  summary: z.string().max(500).optional(),
  detail: z.unknown().optional(),
  price: z.number().optional(),
  fee: z.number().optional(),
  date: z.string().optional(),
  validRange: z.unknown().optional(),
  location: z.string().max(128).optional(),
  tags: z.array(z.string()).optional(),
  actionType: z.enum(['enroll', 'book', 'link', 'none']).default('none'),
  status: z.enum(['on', 'off']).default('on'),
  sort: z.number().int().default(0),
});

export const UpsertProductSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(128),
  category: z.string().min(1).max(32),
  brand: z.string().max(64).optional(),
  price: z.number().positive(),
  originalPrice: z.number().positive().optional(),
  memberDiscount: z.number().min(0).max(1).optional(),
  images: z.array(z.string()).default([]),
  description: z.string().max(2000).optional(),
  stock: z.number().int().min(0).default(0),
  status: z.enum(['on', 'off']).default('on'),
  sort: z.number().int().default(0),
});

// ===== 团购（V0.1.37 admin 管理）=====
export const UpsertGroupBuySchema = z.object({
  id: z.string().optional(), // 有则 update
  productId: z.string().min(1),
  groupPrice: z.number().positive(), // 团购价（元）
  targetCount: z.number().int().min(2).max(1000), // 成团目标人数
  endDate: z.string().datetime().optional(), // 截止时间（ISO）
});

export const ListGroupBuysSchema = z.object({
  status: z.enum(['active', 'reached']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ===== 训练计划（V0.1.41 配置化）=====
export const UpsertTrainingPlanSchema = z.object({
  id: z.string().optional(), // 有则 update
  key: z.string().min(1), // '5k' / '10k' / 'half' / 'full' / 自定义（@unique，admin CRUD 幂等）
  name: z.string().min(1),
  weeks: z.number().int().min(1).max(52),
  level: z.enum(['beginner', 'intermediate', 'challenge', 'extreme']),
  goal: z.string().min(1),
  desc: z.string().min(1),
  weeklyMileage: z.string().min(1),
  targetKm: z.number().positive(), // 计划总目标跑量 km（进度分母）
  status: z.enum(['active', 'archived']).optional(),
});

export const ListTrainingPlansSchema = z.object({
  status: z.enum(['active', 'archived']).optional(),
});

// ===== 配置 =====
export const SetConfigSchema = z.object({
  id: z.enum(['feature_flags', 'member_levels', 'points_rules']),
  value: z.record(z.unknown()),
});

// ===== 订单 =====
export const ListOrdersSchema = z.object({
  status: z.enum(['pending_pay', 'paid', 'shipped', 'done', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const UpdateOrderStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(['pending_pay', 'paid', 'shipped', 'done', 'cancelled']),
});

export const RefundOrderSchema = z.object({
  orderId: z.string().min(1),
  /** 退款金额（分）— 缺省 = order.payAmount 全额 */
  amountFen: z.number().int().positive().max(10_000_000).optional(),
  reason: z.string().max(80).optional(),
});

// ===== 新增：管理类 list / stats（P1-2）=====
export const ListUsersSchema = z.object({
  keyword: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ListContentsSchema = z.object({
  type: z.enum(CONTENT_TYPES).optional(),
  status: z.enum(['on', 'off']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ListProductsSchema = z.object({
  category: z.string().max(32).optional(),
  status: z.enum(['on', 'off']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ===== V0.1.18: 黑名单 =====
export const BanUserSchema = z.object({
  openid: z.string().min(1).max(64),
  reason: z.string().min(1).max(200),
});

export const UnbanUserSchema = z.object({
  openid: z.string().min(1).max(64),
});

// ===== V0.1.18: 审计日志查询 =====
export const ListAuditLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().max(64).optional(),
  actorOpenid: z.string().max(64).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ===== V0.1.19: 报表 + 导出 =====
export const StatsByTimeRangeSchema = z.object({
  startDate: z.string(), // YYYY-MM-DD 或 ISO
  endDate: z.string(),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});

export const ExportOrdersSchema = z.object({
  status: z.enum(['pending_pay', 'paid', 'shipped', 'done', 'cancelled']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const ExportUsersSchema = z.object({
  keyword: z.string().max(64).optional(),
  isBanned: z.coerce.boolean().optional(),
});

// ===== 推导类型（供 service 参数）=====
export type UpsertContentInput = z.infer<typeof UpsertContentSchema>;
export type UpsertProductInput = z.infer<typeof UpsertProductSchema>;
export type UpsertGroupBuyInput = z.infer<typeof UpsertGroupBuySchema>;
export type ListGroupBuysInput = z.infer<typeof ListGroupBuysSchema>;
export type UpsertTrainingPlanInput = z.infer<typeof UpsertTrainingPlanSchema>;
export type ListTrainingPlansInput = z.infer<typeof ListTrainingPlansSchema>;
export type SetConfigInput = z.infer<typeof SetConfigSchema>;
export type ListOrdersInput = z.infer<typeof ListOrdersSchema>;
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
export type RefundOrderInput = z.infer<typeof RefundOrderSchema>;
export type ListUsersInput = z.infer<typeof ListUsersSchema>;
export type ListContentsInput = z.infer<typeof ListContentsSchema>;
export type ListProductsInput = z.infer<typeof ListProductsSchema>;
export type BanUserInput = z.infer<typeof BanUserSchema>;
export type UnbanUserInput = z.infer<typeof UnbanUserSchema>;
export type ListAuditLogsInput = z.infer<typeof ListAuditLogsSchema>;
export type StatsByTimeRangeInput = z.infer<typeof StatsByTimeRangeSchema>;
export type ExportOrdersInput = z.infer<typeof ExportOrdersSchema>;
export type ExportUsersInput = z.infer<typeof ExportUsersSchema>;

// ===== V0.1.105 GAP-6 提现审核 =====
export const ListWithdrawalsSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListWithdrawalsInput = z.infer<typeof ListWithdrawalsSchema>;

export const WithdrawalIdSchema = z.object({
  id: z.string().min(1),
});
export type WithdrawalIdInput = z.infer<typeof WithdrawalIdSchema>;

export const RejectWithdrawalSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1).max(200), // 拒绝原因（必填）
});
