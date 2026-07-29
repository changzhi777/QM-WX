/**
 * admin service — 后台管理业务逻辑
 *
 * 从 admin.routes.ts 抽离（P1-1）。仿 wallet 范式：纯业务（prisma + 缓存失效），
 * 不含鉴权（routes 负责 isAdmin）/ 不含 schema parse（routes 负责）。
 * 新增 4 个管理 action（P1-2：listUsers / listContents / listProducts / stats）。
 */
import { prisma } from '../../infra/prisma.js';
import { getMpAccessToken } from '../../infra/wx-token.js';
import { refundService } from '../mall/refund.service.js';
import { invalidateProductsCache, invalidateProductDetail } from '../mall/mall.service.js';
import { invalidateContentsCache, invalidateContentDetail } from '../content/content.service.js';
import { invalidateFeatureFlagsCache } from '../../common/middleware/feature-gate.js';
import { publishFeatureFlagsUpdated } from '../../infra/realtime.js';
import { Errors } from '../../common/errors.js';
import { walletRepo } from '../wallet/wallet.repo.js';
import { userRepo } from '../user/user.repository.js';
import { Cache } from '../../infra/cache.js';
import { toCsvHeader, toCsvRow, UTF8_BOM } from '../../common/csv.js';
import { assertTransition, type OrderStatus } from '../../domain/order-state.js';
import { enqueueUploadParse } from '../../jobs/queue.js';
import { foodService } from '../food/food.service.js';
import { booheeService } from '../boohee/boohee.service.js';
import type { z } from 'zod';
import { NutritionBalanceInputSchema } from './admin.schema.js';
import bcrypt from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import type {
  UpsertContentInput,
  UpsertProductInput,
  SetConfigInput,
  ListOrdersInput,
  UpdateOrderStatusInput,
  RefundOrderInput,
  ListUsersInput,
  ListContentsInput,
  ListProductsInput,
  BanUserInput,
  UnbanUserInput,
  ListAuditLogsInput,
  StatsByTimeRangeInput,
  ExportOrdersInput,
  ExportUsersInput,
  UpsertGroupBuyInput,
  ListGroupBuysInput,
  UpsertTrainingPlanInput,
  ListTrainingPlansInput,
  AdminSubmitRaceResultInput,
} from './admin.schema.js';

// ===== admin 白名单缓存（TTL 兜底：多实例部署本进程 invalidate 不通知其它实例）=====
let _adminCache: string[] | null = null;
let _adminCacheAt = 0;
const ADMIN_CACHE_TTL_MS = 60_000;

export async function isAdmin(openid: string): Promise<boolean> {
  const now = Date.now();
  if (!_adminCache || now - _adminCacheAt > ADMIN_CACHE_TTL_MS) {
    const row = await prisma.appConfig.findUnique({ where: { id: 'admin_whitelist' } });
    _adminCache = (row?.value as { openids?: string[] } | undefined)?.openids ?? [];
    _adminCacheAt = now;
  }
  return _adminCache.includes(openid);
}

/** setConfig 改 admin_whitelist 时主动失效；下次 isAdmin 重读 DB */
export function invalidateAdminCache(): void {
  _adminCache = null;
  _adminCacheAt = 0;
}

// ===== V0.2.8 RBAC 3 角色 + admin 专属登录 =====

/** super-admin 独占 action（账号管理 + 全局配置 + 登录日志）*/
const SUPER_ONLY_ACTIONS = [
  'listAdmins', 'createAdmin', 'updateAdmin', 'disableAdmin', 'setConfig', 'adminLoginLogs',
  'submitMpAudit', 'uploadMpMedia', 'getMpCategory', // V0.2.65 小程序代码提审（高风险发布，super-admin 独占）
];
/** operator 可用 action（只读 list/stats/export + 轻操作）*/
const OPERATOR_ACTIONS = [
  'listUsers', 'listContents', 'listProducts', 'listOrders', 'listReviews',
  'listWithdrawals', 'listGroupBuys', 'listTrainingPlans', 'listUploads',
  'listInviteStats', 'listEnrollmentsByContent', 'listAuditLogs',
  'stats', 'statsByTimeRange', 'exportOrders', 'exportUsers', 'exportSettlement',
  'banUser', 'unbanUser', 'confirmPickup', 'addReviewReply', 'retryParse', 'submitRaceResult',
  'listInterpret',
];

/** 权限检查：super-admin 全部 / admin 除 SUPER_ONLY / operator 仅 OPERATOR_ACTIONS */
export function checkPermission(role: string, action: string): boolean {
  if (role === 'super-admin') return true;
  if (role === 'admin') return !SUPER_ONLY_ACTIONS.includes(action);
  if (role === 'operator') return OPERATOR_ACTIONS.includes(action);
  return false;
}

/**
 * admin 账号密码登录（V0.2.8，替白名单 openid 体系）。
 * bcrypt verify → 签 admin JWT（kind:admin/sub:adminId/role）+ 写 AdminLoginLog（成功/失败）。
 */
export async function adminLogin(
  app: FastifyInstance,
  username: string,
  password: string,
  meta: { ip?: string; ua?: string } = {},
) {
  const admin = await prisma.admin.findUnique({ where: { username } });
  const ok = !!admin && !admin.disabled && (await bcrypt.compare(password, admin.passwordHash));
  if (admin) {
    await prisma.adminLoginLog.create({
      data: { adminId: admin.id, ip: meta.ip, ua: meta.ua, ok },
    });
  }
  if (!ok) throw Errors.unauthorized();
  await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });
  const accessToken = app.jwt.sign({
    kind: 'admin',
    sub: admin.id,
    id: admin.id,
    openid: `admin:${admin.username}`,
  });
  return {
    accessToken,
    admin: {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      nickname: admin.nickname,
    },
  };
}

/** Decimal → 字符串（避免 JSON 序列化 Decimal 变对象）*/
function dec(v: { toString(): string } | null | undefined): string | null {
  return v == null ? null : v.toString();
}

// ===== 内容 / 商品 =====
export async function upsertContent(input: UpsertContentInput) {
  const data = {
    type: input.type, title: input.title, cover: input.cover, summary: input.summary,
    detail: input.detail as never, price: input.price as never, fee: input.fee as never,
    date: input.date, validRange: input.validRange as never, location: input.location,
    tags: input.tags ?? [], actionType: input.actionType, status: input.status, sort: input.sort,
  };
  const content = input.id
    ? await prisma.content.update({ where: { id: input.id }, data })
    : await prisma.content.create({ data });
  await invalidateContentsCache();
  if (input.id) await invalidateContentDetail(input.id);
  return { id: content.id };
}

export async function upsertProduct(input: UpsertProductInput) {
  const data = {
    name: input.name, category: input.category, brand: input.brand,
    price: input.price as never, originalPrice: input.originalPrice as never,
    memberDiscount: input.memberDiscount, images: input.images, description: input.description,
    stock: input.stock, status: input.status, sort: input.sort,
  };
  const product = input.id
    ? await prisma.product.update({ where: { id: input.id }, data })
    : await prisma.product.create({ data });
  await invalidateProductsCache();
  if (input.id) await invalidateProductDetail(input.id);
  return { id: product.id };
}

// ===== 配置 =====
export async function setConfig(input: SetConfigInput, actorOpenid: string, ip?: string) {
  await prisma.appConfig.upsert({
    where: { id: input.id },
    create: { id: input.id, value: input.value as never },
    update: { value: input.value as never },
  });
  if (input.id === 'feature_flags') {
    invalidateFeatureFlagsCache();
    // V0.3.34 A8：发布 Redis pub/sub 通知所有 worker 实例清 cache
    void publishFeatureFlagsUpdated();
  }
  // admin_whitelist 通过 setConfig 修改时也要清 admin 缓存
  // @ts-expect-error narrowing for future expansion（当前 schema id enum 不含 admin_whitelist）
  if (input.id === 'admin_whitelist') invalidateAdminCache();
  // V0.1.18：审计留痕
  await recordAudit('admin.setConfig', input.id, { id: input.id, value: input.value }, actorOpenid, ip);
  return { ok: true };
}

export async function listAdmins() {
  const list = await prisma.admin.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      nickname: true,
      lastLoginAt: true,
      disabled: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return { list };
}

// ===== 订单 =====
export async function listOrders(input: ListOrdersInput) {
  const where = { ...(input.status ? { status: input.status } : {}) };
  const [list, total] = await Promise.all([
    prisma.order.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize, take: input.pageSize,
      include: { items: true, user: { select: { id: true, nickname: true, phone: true } } },
    }),
    prisma.order.count({ where }),
  ]);
  return {
    list: list.map((o) => ({
      ...o,
      totalAmount: o.totalAmount.toString(),
      payAmount: o.payAmount.toString(),
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
    total, page: input.page, pageSize: input.pageSize,
  };
}

export async function updateOrderStatus(input: UpdateOrderStatusInput) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw Errors.notFound('订单不存在');
  // 状态机白名单：禁止裸跳（涉及退款的目标态须走 refundOrder）
  assertTransition(order.status as OrderStatus, input.status as OrderStatus);
  const updated = await prisma.order.update({
    where: { id: input.orderId }, data: { status: input.status },
  });
  return { id: updated.id, status: updated.status, updatedAt: updated.updatedAt.toISOString() };
}

export async function refundOrder(input: RefundOrderInput, refundedBy: string, ip?: string) {
  const result = await refundService.refundOrder({
    orderId: input.orderId, amountFen: input.amountFen, reason: input.reason, refundedBy,
  });
  // V0.1.18：审计留痕
  await recordAudit(
    'admin.refundOrder',
    input.orderId,
    { orderId: input.orderId, amountFen: input.amountFen, reason: input.reason },
    refundedBy,
    ip,
  );
  return result;
}

// ===== V0.3.34 sprint A3：admin.orders 批量操作 =====

export interface BatchOrderResult {
  success: Array<{ orderId: string; refundedFen?: number }>;
  failed: Array<{ orderId: string; error: string }>;
  totalSuccess: number;
  totalFailed: number;
}

/**
 * 批量更新订单状态（V0.3.34 A3）
 * - 每个订单独立处理（部分失败不影响其他）
 * - 返 success/failed 列表 + 总计
 */
export async function batchUpdateOrderStatus(
  orderIds: string[],
  status: 'pending_pay' | 'paid' | 'shipped' | 'done' | 'cancelled',
): Promise<BatchOrderResult> {
  const results = await Promise.allSettled(
    orderIds.map(async (orderId) => {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) throw Errors.notFound('订单不存在');
      assertTransition(order.status as OrderStatus, status as OrderStatus);
      await prisma.order.update({ where: { id: orderId }, data: { status } });
      return { orderId };
    }),
  );
  return results.reduce<BatchOrderResult>(
    (acc, r, i) => {
      if (r.status === 'fulfilled') {
        acc.success.push({ orderId: orderIds[i] });
        acc.totalSuccess++;
      } else {
        acc.failed.push({ orderId: orderIds[i], error: r.reason?.message ?? '未知错误' });
        acc.totalFailed++;
      }
      return acc;
    },
    { success: [], failed: [], totalSuccess: 0, totalFailed: 0 },
  );
}

/**
 * 批量退款（V0.3.34 A3）
 * - 每个订单独立处理（部分失败不影响其他）
 * - 单笔退款失败不影响其他单
 */
export async function batchRefundOrder(
  orderIds: string[],
  amountFen: number | undefined,
  reason: string | undefined,
  actorOpenid: string,
  ip?: string,
): Promise<BatchOrderResult> {
  const results = await Promise.allSettled(
    orderIds.map((orderId) => refundOrder({ orderId, amountFen, reason }, actorOpenid, ip)),
  );
  return results.reduce<BatchOrderResult>(
    (acc, r, i) => {
      if (r.status === 'fulfilled') {
        const v = r.value as { refundYuan: number };
        acc.success.push({ orderId: orderIds[i], refundedFen: Math.round(v.refundYuan * 100) });
        acc.totalSuccess++;
      } else {
        acc.failed.push({ orderId: orderIds[i], error: r.reason?.message ?? '未知错误' });
        acc.totalFailed++;
      }
      return acc;
    },
    { success: [], failed: [], totalSuccess: 0, totalFailed: 0 },
  );
}

// ===== V0.3.34 sprint A2：admin.users 详情页（5 维聚合查询）=====

export interface UserDetailData {
  user: {
    id: string;
    openid: string;
    nickname: string | null;
    phone: string | null;
    points: number;
    isBanned: boolean;
    bannedReason: string | null;
    memberExpireAt: string | null;
    createdAt: string;
  };
  // 训练数据（30 天聚合）
  training: {
    checkinCount30d: number;
    distanceKm30d: number;
    strengthSessions30d: number;
  };
  // 订单数据
  orders: {
    total: number;
    paid: number;
    totalRevenueFen: number;
  };
  // 积分流水（最近 10 条）
  points: {
    current: number;
    recentTransactions: Array<{
      id: string;
      change: number;
      type: string;
      reason: string | null;
      createdAt: string;
    }>;
  };
  // 审计记录（最近 10 条 — 涉及该用户的 admin 操作）
  auditLogs: Array<{
    id: string;
    action: string;
    target: string;
    createdAt: string;
  }>;
}

export async function getUserDetail(userId: string): Promise<UserDetailData> {
  const now = new Date();
  const last30d = new Date(now.getTime() - 30 * 86_400_000);

  // 5 类聚合并行（Promise.allSettled 失败隔离 — V0.3.4 dashboard 范式）
  const results = await Promise.allSettled([
    // 1. 用户基本信息
    prisma.user.findUnique({ where: { id: userId } }),
    // 2. 训练数据（30 天）
    prisma.checkin.count({ where: { userId, createdAt: { gte: last30d } } }),
    prisma.checkin.aggregate({
      where: { userId, createdAt: { gte: last30d } },
      _sum: { distance: true },
    }),
    prisma.strengthSession.count({ where: { userId, createdAt: { gte: last30d } } }),
    // 3. 订单数据
    prisma.order.count({ where: { userId } }),
    prisma.order.count({ where: { userId, status: 'paid' } }),
    prisma.order.aggregate({ where: { userId, status: 'paid' }, _sum: { totalAmount: true } }),
    // 4. 积分流水（最近 10 条）
    prisma.pointsRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // 5. 审计记录（最近 10 条涉及该 user）
    prisma.auditLog.findMany({
      where: { target: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  // 失败隔离：任一失败抛 notFound
  const v = <T>(i: number): T => {
    const r = results[i];
    if (r.status === 'rejected') throw Errors.notFound('用户不存在');
    return r.value as T;
  };

  const user = v<NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>>(0);
  if (!user) throw Errors.notFound('用户不存在');

  const distanceSum = v<{ _sum: { distance: unknown } }>(2);
  const distanceNum = distanceSum._sum?.distance ? Number(distanceSum._sum.distance) : 0;

  const orderAgg = v<{ _sum: { totalAmount: unknown } }>(6);
  const orderTotal = orderAgg._sum?.totalAmount ? Number(orderAgg._sum.totalAmount) : 0;
  // 元 → 分
  const orderRevenueFen = Math.round(orderTotal * 100);

  const pointsTx = v<Array<{ id: string; change: number; type: string; reason: string | null; createdAt: Date }>>(7);
  const auditList = v<Array<{ id: string; action: string; target: string; createdAt: Date }>>(8);

  return {
    user: {
      id: user.id,
      openid: user.openid,
      nickname: user.nickname,
      phone: user.phone,
      points: user.points,
      isBanned: user.isBanned,
      bannedReason: user.bannedReason,
      memberExpireAt: user.memberExpireAt ? user.memberExpireAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
    },
    training: {
      checkinCount30d: v<number>(1),
      distanceKm30d: Math.round(distanceNum * 10) / 10,
      strengthSessions30d: v<number>(3),
    },
    orders: {
      total: v<number>(4),
      paid: v<number>(5),
      totalRevenueFen: orderRevenueFen,
    },
    points: {
      current: user.points,
      recentTransactions: pointsTx.map((p) => ({
        id: p.id,
        change: p.change,
        type: p.type,
        reason: p.reason,
        createdAt: p.createdAt.toISOString(),
      })),
    },
    auditLogs: auditList.map((a) => ({
      id: a.id,
      action: a.action,
      target: a.target,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

// ===== 新增：管理类 list（P1-2，admin 视角含 off 状态）=====
export async function listUsers(input: ListUsersInput) {
  const where = input.keyword
    ? { OR: [{ nickname: { contains: input.keyword } }, { phone: { contains: input.keyword } }] }
    : {};
  const [list, total] = await Promise.all([
    prisma.user.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize, take: input.pageSize,
      select: {
        id: true, openid: true, nickname: true, phone: true,
        points: true, memberLevel: true, memberExpireAt: true, createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);
  return {
    list: list.map((u) => ({
      ...u,
      memberExpireAt: u.memberExpireAt ? u.memberExpireAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    })),
    total, page: input.page, pageSize: input.pageSize,
  };
}

export async function listContents(input: ListContentsInput) {
  const where = {
    ...(input.type ? { type: input.type } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const [list, total] = await Promise.all([
    prisma.content.findMany({
      where, orderBy: [{ sort: 'desc' }, { createdAt: 'desc' }],
      skip: (input.page - 1) * input.pageSize, take: input.pageSize,
    }),
    prisma.content.count({ where }),
  ]);
  return {
    list: list.map((c) => ({
      ...c, price: dec(c.price as never), fee: dec(c.fee as never),
      createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    })),
    total, page: input.page, pageSize: input.pageSize,
  };
}

export async function listProducts(input: ListProductsInput) {
  const where = {
    ...(input.category ? { category: input.category } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const [list, total] = await Promise.all([
    prisma.product.findMany({
      where, orderBy: [{ sort: 'desc' }, { createdAt: 'desc' }],
      skip: (input.page - 1) * input.pageSize, take: input.pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return {
    list: list.map((p) => ({
      ...p,
      price: dec(p.price as never), originalPrice: dec(p.originalPrice as never),
      memberDiscount: dec(p.memberDiscount as never),
      createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
    })),
    total, page: input.page, pageSize: input.pageSize,
  };
}

// ===== 训练计划（V0.1.41 配置化 — admin CRUD）=====
export async function upsertTrainingPlan(input: UpsertTrainingPlanInput) {
  const data = {
    key: input.key,
    name: input.name,
    weeks: input.weeks,
    level: input.level,
    goal: input.goal,
    desc: input.desc,
    weeklyMileage: input.weeklyMileage,
    targetKm: input.targetKm,
    ...(input.status ? { status: input.status } : {}),
  };
  const plan = input.id
    ? await prisma.trainingPlan.update({ where: { id: input.id }, data })
    : await prisma.trainingPlan.create({ data });
  return { id: plan.id };
}

export async function listTrainingPlans(input: ListTrainingPlansInput) {
  const where = { ...(input.status ? { status: input.status } : {}) };
  const list = await prisma.trainingPlan.findMany({
    where,
    orderBy: [{ weeks: 'asc' }, { createdAt: 'desc' }],
  });
  return {
    list: list.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  };
}

/** 概览统计（Dashboard 用） */
export async function stats() {
  const [userCount, orderCount, paidRevenueAgg, checkinCount] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.order.aggregate({
      where: { status: { in: ['paid', 'shipped', 'done'] } },
      _sum: { payAmount: true },
    }),
    prisma.checkin.count(),
  ]);
  return {
    userCount,
    orderCount,
    /** 已支付订单实付总额（元，Decimal→string）*/
    revenue: paidRevenueAgg._sum.payAmount ? paidRevenueAgg._sum.payAmount.toString() : '0',
    checkinCount,
  };
}

// ===== V0.1.18: 黑名单 =====

/** 抛 banned 错 — service 层 / middleware 复用 */
export function assertNotBanned(user: { isBanned?: boolean } | null | undefined): void {
  if (user?.isBanned) throw Errors.forbidden('账号已被封禁');
}

/** 封禁用户 */
export async function banUser(input: BanUserInput, actorOpenid: string, ip?: string) {
  const user = await prisma.user.findUnique({ where: { openid: input.openid } });
  if (!user) throw Errors.notFound('用户不存在');
  if (user.isBanned) return { ok: true, alreadyBanned: true };
  await prisma.user.update({
    where: { id: user.id },
    data: { isBanned: true, bannedAt: new Date(), bannedReason: input.reason },
  });
  await recordAudit('admin.banUser', input.openid, { reason: input.reason }, actorOpenid, ip);
  return { ok: true, alreadyBanned: false };
}

/** 解封用户 */
export async function unbanUser(input: UnbanUserInput, actorOpenid: string, ip?: string) {
  const user = await prisma.user.findUnique({ where: { openid: input.openid } });
  if (!user) throw Errors.notFound('用户不存在');
  if (!user.isBanned) return { ok: true, alreadyActive: true };
  await prisma.user.update({
    where: { id: user.id },
    data: { isBanned: false, bannedAt: null, bannedReason: null },
  });
  await recordAudit('admin.unbanUser', input.openid, {}, actorOpenid, ip);
  return { ok: true, alreadyActive: false };
}

// ===== V0.1.18: 审计日志 =====

/**
 * 审计留痕 helper — 写失败只 log，不 throw
 * 调用者：refundOrder / setConfig / banUser / unbanUser
 */
export async function recordAudit(
  action: string,
  target: string | null,
  payload: unknown,
  actorOpenid: string,
  ip?: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorOpenid,
        action,
        target: target ?? null,
        payload: (payload ?? {}) as never,
        ip: ip ?? null,
      },
    });
  } catch (err) {
    // 审计失败不能阻塞业务（admin 操作已 commit）
    // 用 console.error 触发 server.ts 的全局 error logger
    console.error('[audit] failed to write audit log:', { action, target, err });
  }
}

/** 审计日志列表（时间倒序 + 分页 + 多维筛选）*/
export async function listAuditLogs(input: ListAuditLogsInput) {
  const where: Record<string, unknown> = {};
  if (input.action) where.action = input.action;
  if (input.actorOpenid) where.actorOpenid = input.actorOpenid;
  // V0.3.34 A7：target type 过滤（action 前缀如 'admin.banUser' → 'user'）
  if (input.targetType) {
    // target 字段是 free-form string，按前缀匹配 target type
    // 例：'user:abc123' 或 'admin:xyz' 走 startsWith 过滤
    where.target = { startsWith: `${input.targetType}:` };
  }
  if (input.startDate || input.endDate) {
    where.createdAt = {
      ...(input.startDate ? { gte: new Date(input.startDate) } : {}),
      ...(input.endDate ? { lte: new Date(input.endDate) } : {}),
    };
  }
  const [list, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' }, // BigInt id 自增=时间倒序（比 createdAt 索引更紧凑）
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    list: list.map((l) => ({
      id: l.id.toString(), // BigInt → string（JSON 序列化）
      actorOpenid: l.actorOpenid,
      action: l.action,
      target: l.target,
      payload: l.payload,
      ip: l.ip,
      createdAt: l.createdAt.toISOString(),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

// ===== V0.1.19: 运营报表时序 =====

/**
 * 按 granularity 分组的时序聚合
 * - day:   date_trunc('day', paidAt)
 * - week:  date_trunc('week', paidAt)
 * - month: date_trunc('month', paidAt)
 *
 * 注：仅聚合已支付订单（status in paid/shipped/done）
 */
export async function statsByTimeRange(input: StatsByTimeRangeInput) {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw Errors.badRequest('startDate / endDate 格式错误');
  }

  // raw SQL 用 $queryRaw（Prisma groupBy 不支持 date_trunc）
  const truncUnit =
    input.granularity === 'day' ? 'day' : input.granularity === 'week' ? 'week' : 'month';

  // paid/shipped/done 订单按 paidAt 分桶聚合
  const orderRows = await prisma.$queryRawUnsafe<Array<{ bucket: Date; revenue: string; cnt: bigint }>>(
    `
    SELECT date_trunc('${truncUnit}', "paidAt") AS bucket,
           COALESCE(SUM("payAmount"), 0)::text AS revenue,
           COUNT(*)::bigint AS cnt
    FROM "Order"
    WHERE "status" IN ('paid', 'shipped', 'done')
      AND "paidAt" IS NOT NULL
      AND "paidAt" BETWEEN $1 AND $2
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
    start,
    end,
  );

  // 用户按 createdAt 分桶
  const userRows = await prisma.$queryRawUnsafe<Array<{ bucket: Date; cnt: bigint }>>(
    `
    SELECT date_trunc('${truncUnit}', "createdAt") AS bucket,
           COUNT(*)::bigint AS cnt
    FROM "User"
    WHERE "createdAt" BETWEEN $1 AND $2
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
    start,
    end,
  );

  // 合并两路时序到 bucket map
  const series = new Map<string, { bucket: string; revenue: string; orderCount: number; userCount: number }>();
  for (const r of orderRows) {
    const k = r.bucket.toISOString();
    series.set(k, {
      bucket: k,
      revenue: r.revenue,
      orderCount: Number(r.cnt),
      userCount: 0,
    });
  }
  for (const u of userRows) {
    const k = u.bucket.toISOString();
    const existing = series.get(k);
    if (existing) existing.userCount = Number(u.cnt);
    else series.set(k, { bucket: k, revenue: '0', orderCount: 0, userCount: Number(u.cnt) });
  }

  return {
    granularity: input.granularity,
    startDate: input.startDate,
    endDate: input.endDate,
    series: Array.from(series.values()).sort((a, b) => a.bucket.localeCompare(b.bucket)),
  };
}

// ===== V0.1.19: CSV 导出 =====

/** 导出订单 CSV — rows 流式构造避免大表 OOM */
export async function exportOrders(input: ExportOrdersInput): Promise<string> {
  const where: Record<string, unknown> = {};
  if (input.status) where.status = input.status;
  if (input.startDate || input.endDate) {
    where.createdAt = {
      ...(input.startDate ? { gte: new Date(input.startDate) } : {}),
      ...(input.endDate ? { lte: new Date(input.endDate) } : {}),
    };
  }

  // 限制最大导出行数防 OOM（10w 行够用；超限请用分页 API）
  const MAX_ROWS = 100_000;
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS,
    include: { user: { select: { openid: true, nickname: true, phone: true } }, items: true },
  });

  const { toCsvHeader, toCsvRow, UTF8_BOM } = await import('../../common/csv.js');
  const lines: string[] = [
    toCsvHeader([
      '订单ID', '用户openid', '用户昵称', '用户手机',
      '状态', '总金额(元)', '实付金额(元)', '使用积分',
      '支付渠道', '商品数', '创建时间', '支付时间',
    ]),
  ];
  for (const o of orders) {
    lines.push(toCsvRow([
      o.id,
      o.user.openid,
      o.user.nickname ?? '',
      o.user.phone ?? '',
      o.status,
      o.totalAmount.toString(),
      o.payAmount.toString(),
      o.pointsUsed,
      o.payChannel ?? '',
      o.items.length,
      o.createdAt.toISOString(),
      o.paidAt ? o.paidAt.toISOString() : '',
    ]));
  }
  return UTF8_BOM + lines.join('\n');
}

/** 导出用户 CSV */
export async function exportUsers(input: ExportUsersInput): Promise<string> {
  const where: Record<string, unknown> = {};
  if (input.keyword) {
    where.OR = [
      { nickname: { contains: input.keyword } },
      { phone: { contains: input.keyword } },
    ];
  }
  if (input.isBanned !== undefined) where.isBanned = input.isBanned;

  const MAX_ROWS = 100_000;
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS,
    select: {
      id: true, openid: true, nickname: true, phone: true,
      memberLevel: true, points: true, isBanned: true,
      bannedAt: true, bannedReason: true, createdAt: true,
    },
  });

  const { toCsvHeader, toCsvRow, UTF8_BOM } = await import('../../common/csv.js');
  const lines: string[] = [
    toCsvHeader([
      '用户ID', 'openid', '昵称', '手机',
      '会员等级', '积分', '是否封禁', '封禁时间', '封禁原因',
      '注册时间',
    ]),
  ];
  for (const u of users) {
    lines.push(toCsvRow([
      u.id,
      u.openid,
      u.nickname ?? '',
      u.phone ?? '',
      u.memberLevel,
      u.points,
      u.isBanned ? '是' : '否',
      u.bannedAt ? u.bannedAt.toISOString() : '',
      u.bannedReason ?? '',
      u.createdAt.toISOString(),
    ]));
  }
  return UTF8_BOM + lines.join('\n');
}

// ===== 团购管理（V0.1.37 admin）=====
/** 创建/编辑团购活动（校验商品存在 + upsert）*/
export async function upsertGroupBuy(input: UpsertGroupBuyInput) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw Errors.notFound('商品不存在');

  const data = {
    productId: input.productId,
    groupPrice: input.groupPrice as never, // number → Decimal
    targetCount: input.targetCount,
    endDate: input.endDate ? new Date(input.endDate) : null,
  };

  let gb;
  if (input.id) {
    gb = await prisma.groupBuy.update({ where: { id: input.id }, data });
  } else {
    gb = await prisma.groupBuy.create({ data: { ...data, status: 'active' } as never });
  }
  return { id: gb.id };
}

/** 团购列表（admin，含商品名 + 进度）*/
export async function listGroupBuys(input: ListGroupBuysInput) {
  const where = input.status ? { status: input.status } : {};
  const [list, total] = await Promise.all([
    prisma.groupBuy.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { product: { select: { id: true, name: true, price: true } } },
    }),
    prisma.groupBuy.count({ where }),
  ]);
  return {
    list: list.map((g) => ({
      ...g,
      groupPrice: g.groupPrice.toString(),
      product: { ...g.product, price: g.product.price.toString() },
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

// ===== V0.1.105 GAP-6 提现审核 =====

/**
 * 列出提现申请（按 status 筛选 + 分页）
 */
export async function listWithdrawals(input: { status?: 'pending' | 'approved' | 'rejected'; page: number; pageSize: number }) {
  const where = input.status ? { status: input.status } : {};
  const [list, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // pending 排前
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true, inviteCode: true } },
      },
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);
  return {
    list: list.map((r) => ({
      id: r.id,
      userId: r.userId,
      amount: Number(r.amount),
      status: r.status,
      reason: r.reason,
      processedBy: r.processedBy,
      processedAt: r.processedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      user: r.user,
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    hasMore: input.page * input.pageSize < total,
  };
}

/**
 * 审核通过提现（事务内扣余额 + 写 WalletTransaction）
 *
 * 二次校验余额（避免申请→消费佣金→退款时余额不足竞态）
 * 余额不足自动转 rejected
 * 微信企业付款 API 真对接留待 GAP-6.2（V0.1.105 仅 stub：扣余额后标 approved，admin 手动打款）
 */
export async function approveWithdrawal(id: string, adminOpenid: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.withdrawalRequest.findUnique({ where: { id } });
    if (!req) throw Errors.notFound('提现申请不存在');
    if (req.status !== 'pending') throw Errors.conflict('已处理');

    // 二次校验余额
    const wallet = await walletRepo.ensureWalletInTx(tx, req.userId);
    if (Number(wallet.balance) < Number(req.amount)) {
      // 余额不足 → 转 rejected（不动钱包）
      await tx.withdrawalRequest.update({
        where: { id },
        data: { status: 'rejected', reason: '余额不足', processedBy: adminOpenid, processedAt: new Date() },
      });
      throw Errors.badRequest('余额不足，自动转 rejected');
    }

    // 扣余额 + 写 WalletTransaction(type=withdraw)
    const amount = Number(req.amount);
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amount } },
    });
    await tx.walletTransaction.create({
      data: {
        userId: req.userId,
        walletId: wallet.id,
        type: 'withdraw',
        amount: -amount,
        status: 'success',
      },
    });
    await tx.withdrawalRequest.update({
      where: { id },
      data: { status: 'approved', processedBy: adminOpenid, processedAt: new Date() },
    });

    // TODO GAP-6.2: 调微信企业付款 API（需商户号 + APIv3 证书），此处仅落库 stub

    // 审计
    await tx.auditLog.create({
      data: {
        actorOpenid: adminOpenid,
        action: 'approveWithdrawal',
        target: id,
        payload: { userId: req.userId, amount } as never,
        ip: 'admin',
      },
    });

    return { ok: true, id, status: 'approved' };
  });
}

/**
 * 拒绝提现（不动钱包，仅标状态 + 原因）
 */
export async function rejectWithdrawal(id: string, reason: string, adminOpenid: string) {
  const req = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!req) throw Errors.notFound('提现申请不存在');
  if (req.status !== 'pending') throw Errors.conflict('已处理');

  const r = await prisma.withdrawalRequest.update({
    where: { id },
    data: { status: 'rejected', reason, processedBy: adminOpenid, processedAt: new Date() },
  });

  // 审计
  await prisma.auditLog.create({
    data: {
      actorOpenid: adminOpenid,
      action: 'rejectWithdrawal',
      target: id,
      payload: { userId: req.userId, reason, amount: Number(req.amount) } as never,
      ip: 'admin',
    },
  });

  return { ok: true, id: r.id, status: 'rejected' };
}

/**
 * V0.1.107 GAP-6 自提核销（admin 手动输入 pickupCode 核销）
 *
 * - 校验 Order.pickupCode 存在
 * - 校验未过期（pickupExpiresAt > now）
 * - 校验未核销（pickupConfirmedAt === null）
 * - 校验订单已支付（status='paid'，避免「下单→核销但未支付」竞态）
 * - update pickupConfirmedAt + pickupConfirmedBy（不动 status，业务上 status='paid' + 核销时间即完成）
 *
 * @unique pickupCode 兜底冲突（碰撞概率 < 0.1%，订单量 < 1000）
 */
export async function confirmPickup(pickupCode: string, adminOpenid: string) {
  const order = await prisma.order.findUnique({ where: { pickupCode } });
  if (!order) throw Errors.notFound('核销码无效');
  if (order.pickupConfirmedAt) throw Errors.badRequest('该订单已核销');
  if (order.pickupExpiresAt && order.pickupExpiresAt < new Date()) {
    throw Errors.badRequest('核销码已过期');
  }
  if (order.status !== 'paid') {
    throw Errors.badRequest('订单未支付，无法核销');
  }

  const r = await prisma.order.update({
    where: { id: order.id },
    data: {
      pickupConfirmedAt: new Date(),
      pickupConfirmedBy: adminOpenid,
    },
  });

  // 审计
  await prisma.auditLog.create({
    data: {
      actorOpenid: adminOpenid,
      action: 'confirmPickup',
      target: order.id,
      payload: { pickupCode, userId: order.userId } as never,
      ip: 'admin',
    },
  });

  return {
    ok: true,
    orderId: r.id,
    pickupConfirmedAt: r.pickupConfirmedAt!.toISOString(),
  };
}

/**
 * V0.1.108 GAP-6 结算单导出
 *
 * 按月份（YYYY-MM）导出分销对账单：每个分销商的本月订单数 + 本月佣金 + 累计佣金
 * 流式 toCsv（已有 common/csv.ts 工具）
 *
 * 范围：只统计 status=settled 的 DistributionOrder（已结算订单，避免 pending 噪声）
 * 字段：userId / nickname / inviteCode / distributorLevel / monthOrderCount / monthCommission / totalCommission
 */
export async function exportSettlement(input: { yearMonth: string }, adminOpenid: string) {
  // 解析 yearMonth → [start, end)
  const [y, m] = input.yearMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - 8 * 3600 * 1000); // CN 时区 1 号 0 点
  const end = new Date(Date.UTC(y, m, 1) - 8 * 3600 * 1000);

  const orders = await prisma.distributionOrder.findMany({
    where: { status: 'settled', settledAt: { gte: start, lt: end } },
    include: {
      user: { select: { id: true, nickname: true, inviteCode: true, distributorLevel: true } },
    },
  });

  // groupBy userId 汇总本月数据 + 查累计佣金（CommissionLog.type in [settle, settle_indirect]）
  const monthMap = new Map<string, { userId: string; nickname: string | null; inviteCode: string | null; distributorLevel: string; monthOrderCount: number; monthCommission: number }>();
  for (const o of orders) {
    const k = o.userId;
    const s = monthMap.get(k) ?? {
      userId: k,
      nickname: o.user.nickname,
      inviteCode: o.user.inviteCode,
      distributorLevel: o.user.distributorLevel,
      monthOrderCount: 0,
      monthCommission: 0,
    };
    s.monthOrderCount += 1;
    s.monthCommission += Number(o.commissionAmount);
    monthMap.set(k, s);
  }

  // 累计佣金：所有 CommissionLog.type in [settle, settle_indirect]
  const totalAgg = await prisma.commissionLog.groupBy({
    by: ['userId'],
    where: { type: { in: ['settle', 'settle_indirect'] } },
    _sum: { amount: true },
  });
  const totalMap = new Map(totalAgg.map((t) => [t.userId, Number(t._sum.amount ?? 0)]));

  // 合并汇总 + 按本月佣金降序
  const rows = Array.from(monthMap.values())
    .map((r) => ({ ...r, totalCommission: totalMap.get(r.userId) ?? 0 }))
    .sort((a, b) => b.monthCommission - a.monthCommission);

  // CSV 输出
  const lines: string[] = [];
  lines.push(toCsvHeader(['userId', 'nickname', 'inviteCode', 'distributorLevel', 'monthOrderCount', 'monthCommission', 'totalCommission']));
  for (const r of rows) {
    lines.push(toCsvRow([r.userId, r.nickname ?? '', r.inviteCode ?? '', r.distributorLevel, r.monthOrderCount, r.monthCommission.toFixed(2), r.totalCommission.toFixed(2)]));
  }

  // 审计
  await prisma.auditLog.create({
    data: {
      actorOpenid: adminOpenid,
      action: 'exportSettlement',
      target: input.yearMonth,
      payload: { rowCount: rows.length, totalCommission: rows.reduce((s, r) => s + r.monthCommission, 0) } as never,
      ip: 'admin',
    },
  });

  return UTF8_BOM + lines.join('\n');
}

/** 评价列表（admin 查所有评价，V0.1.122 qm-admin 评价管理用） */
export async function listReviews(input: { page: number; pageSize: number }) {
  const [list, total] = await Promise.all([
    prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true } },
        product: { select: { id: true, name: true } },
      },
    }),
    prisma.review.count(),
  ]);
  return {
    list: list.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      repliedAt: r.repliedAt?.toISOString() ?? null,
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

/** 回复评价（admin/商家，V0.1.116） */
export async function addReviewReply(input: { reviewId: string; content: string }) {
  const review = await prisma.review.findUnique({ where: { id: input.reviewId } });
  if (!review) throw Errors.notFound('评价不存在');
  await prisma.review.update({
    where: { id: input.reviewId },
    data: { replyContent: input.content, repliedAt: new Date() },
  });
  return { ok: true };
}

/**
 * V0.1.134 admin 录入赛事成绩
 *
 * 鉴权：isAdmin(openid) — 复用 admin 白名单缓存
 * 不校验 enrollment.status（让 admin 也能补录）
 * pace 后端算（finishTimeSec / content.detail.distanceKm）
 * upsert by enrollmentId（一对一可改）
 * 写 AuditLog（action='admin.submitRaceResult'）
 */
export async function submitRaceResult(
  adminOpenid: string,
  input: AdminSubmitRaceResultInput,
  ip?: string,
) {
  if (!(await isAdmin(adminOpenid))) {
    throw Errors.forbidden('需要 admin 权限');
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: input.enrollmentId },
    include: { content: true },
  });
  if (!enrollment) throw Errors.notFound('enrollment not found');
  if (enrollment.content.type !== 'marathon') {
    throw Errors.badRequest('仅赛事可录入成绩');
  }

  const detail = (enrollment.content.detail as Record<string, unknown> | null) ?? null;
  const distanceKm = typeof detail?.distanceKm === 'number' ? detail.distanceKm : null;
  if (!distanceKm || distanceKm <= 0) {
    throw Errors.badRequest('赛事未配置距离，无法计算配速');
  }
  const paceSecPerKm = Math.round(input.finishTimeSec / distanceKm);

  const result = await prisma.raceResult.upsert({
    where: { enrollmentId: input.enrollmentId },
    create: {
      enrollmentId: input.enrollmentId,
      userId: enrollment.userId,
      contentId: enrollment.contentId,
      finishTimeSec: input.finishTimeSec,
      paceSecPerKm,
      rank: input.rank ?? null,
      bibNumber: input.bibNumber ?? null,
      source: 'admin_input',
    },
    update: {
      finishTimeSec: input.finishTimeSec,
      paceSecPerKm,
      rank: input.rank ?? null,
      bibNumber: input.bibNumber ?? null,
      source: 'admin_input',
    },
  });

  await recordAudit(
    'admin.submitRaceResult',
    input.enrollmentId,
    { finishTimeSec: input.finishTimeSec, rank: input.rank ?? null },
    adminOpenid,
    ip,
  );

  return {
    id: result.id,
    enrollmentId: result.enrollmentId,
    contentId: result.contentId,
    finishTimeSec: result.finishTimeSec,
    paceSecPerKm: result.paceSecPerKm,
    rank: result.rank,
    bibNumber: result.bibNumber,
    finisherPhotoUrl: result.finisherPhotoUrl,
    source: result.source,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  };
}

/**
 * V0.1.134 admin 查某赛事的报名列表（含 user 信息）
 *
 * 用于 admin-race-result 页面：列出所有 enrollment 让 admin 录入成绩
 * 关联查 User 避免 N+1
 */
export async function listEnrollmentsByContent(adminOpenid: string, contentId: string) {
  if (!(await isAdmin(adminOpenid))) {
    throw Errors.forbidden('需要 admin 权限');
  }
  const enrollments = await prisma.enrollment.findMany({
    where: { contentId },
    orderBy: { createdAt: 'asc' },
  });
  if (enrollments.length === 0) return { enrollments: [] };

  // 批量查 User 关联（DRY N+1）
  const userIds = Array.from(new Set(enrollments.map((e) => e.userId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, nickname: true, avatarUrl: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  // 批量查 RaceResult（含 raceResult 状态）
  const results = await prisma.raceResult.findMany({
    where: { contentId },
  });
  const resultMap = new Map(results.map((r) => [r.enrollmentId, r]));

  return {
    enrollments: enrollments.map((e) => {
      const u = userMap.get(e.userId);
      const r = resultMap.get(e.id);
      return {
        id: e.id,
        userId: e.userId,
        status: e.status,
        user: {
          id: e.userId,
          nickname: u?.nickname ?? null,
          avatarUrl: u?.avatarUrl ?? null,
        },
        raceResult: r
          ? {
              id: r.id,
              enrollmentId: r.enrollmentId,
              finishTimeSec: r.finishTimeSec,
              paceSecPerKm: r.paceSecPerKm,
              rank: r.rank,
              bibNumber: r.bibNumber,
              finisherPhotoUrl: r.finisherPhotoUrl,
              source: r.source,
            }
          : null,
      };
    }),
  };
}

// ===== V0.1.150 上传记录管理（后台 COS 中转解析）=====
export async function listUploads(input: {
  userId?: string;
  type?: string;
  status?: string;
  page: number;
  pageSize: number;
}) {
  const where = {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const [list, total] = await Promise.all([
    prisma.uploadRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { user: { select: { id: true, nickname: true, phone: true } } },
    }),
    prisma.uploadRecord.count({ where }),
  ]);
  return {
    list: list.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

/** V0.2.37 interpret 解读记录列表（admin 只读，admin/operator/super-admin 可看）*/
export async function listInterpret(input: {
  userId?: string;
  type?: string;
  page: number;
  pageSize: number;
}) {
  const where = {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.type ? { type: input.type } : {}),
  };
  const [list, total] = await Promise.all([
    prisma.interpretRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { user: { select: { id: true, nickname: true } } },
    }),
    prisma.interpretRecord.count({ where }),
  ]);
  return {
    list: list.map((r) => ({
      id: r.id,
      userId: r.userId,
      nickname: r.user.nickname,
      type: r.type,
      inputKey: r.inputKey,
      result: r.result,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function retryParse(input: { id: string }) {
  const record = await prisma.uploadRecord.findUnique({ where: { id: input.id } });
  if (!record) throw Errors.notFound('上传记录不存在');
  await prisma.uploadRecord.update({
    where: { id: input.id },
    data: { status: 'pending', errorMsg: null },
  });
  await enqueueUploadParse(input.id);
  return { ok: true };
}

/** V0.2.6 手动调整积分（运营发福利/扣作弊，走 addPoints 带流水 + 审计 + 失效 me 缓存）*/
export async function adjustPoints(
  input: { userId: string; change: number; reason?: string },
  actorOpenid: string,
  ip?: string,
) {
  await prisma.$transaction(async (tx) => {
    await userRepo.addPoints(tx, input.userId, input.change, 'admin_adjust');
  });
  await recordAudit(
    'admin.adjustPoints',
    input.userId,
    { change: input.change, reason: input.reason },
    actorOpenid,
    ip,
  );
  const u = await prisma.user.findUnique({ where: { id: input.userId }, select: { points: true } });
  await Cache.del(`user:me:${input.userId}`);
  return { ok: true, userId: input.userId, points: u?.points ?? 0 };
}

/** V0.2.6 手动赠送会员时长（活动奖励/补偿，extendMember 续期 + 审计）*/
export async function grantMember(
  input: { userId: string; days: number },
  actorOpenid: string,
  ip?: string,
) {
  await prisma.$transaction(async (tx) => {
    await userRepo.extendMember(tx, input.userId, input.days);
  });
  await recordAudit('admin.grantMember', input.userId, { days: input.days }, actorOpenid, ip);
  const u = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { memberExpireAt: true },
  });
  await Cache.del(`user:me:${input.userId}`);
  return { ok: true, userId: input.userId, memberExpireAt: u?.memberExpireAt?.toISOString() ?? null };
}

/** V0.2.6 邀请统计榜（按 Team.inviterId groupBy 邀请数，关联用户信息）*/
export async function listInviteStats(input: { page: number; pageSize: number }) {
  const [rows, groups] = await Promise.all([
    prisma.team.groupBy({
      by: ['inviterId'],
      _count: { _all: true },
      orderBy: { _count: { inviterId: 'desc' } },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.team.groupBy({ by: ['inviterId'] }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.inviterId) } },
    select: { id: true, nickname: true, avatarUrl: true, inviteCode: true, distributorLevel: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  return {
    list: rows.map((r) => ({
      ...(userMap.get(r.inviterId) ?? {
        id: r.inviterId,
        nickname: null,
        avatarUrl: null,
        inviteCode: null,
        distributorLevel: 'V0',
      }),
      inviteCount: r._count._all,
    })),
    total: groups.length,
    page: input.page,
    pageSize: input.pageSize,
  };
}

// ===== V0.2.8 admin 账号管理（super-admin only，RBAC 守卫）=====

export async function createAdmin(input: {
  username: string;
  password: string;
  role: string;
  nickname?: string;
}) {
  const exists = await prisma.admin.findUnique({ where: { username: input.username } });
  if (exists) throw Errors.badRequest('用户名已存在');
  const admin = await prisma.admin.create({
    data: {
      username: input.username,
      passwordHash: await bcrypt.hash(input.password, 10),
      role: input.role,
      nickname: input.nickname,
    },
  });
  return { id: admin.id, username: admin.username, role: admin.role };
}

export async function updateAdmin(input: {
  id: string;
  password?: string;
  role?: string;
  nickname?: string;
  disabled?: boolean;
}) {
  const data: { passwordHash?: string; role?: string; nickname?: string; disabled?: boolean } = {};
  if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10);
  if (input.role) data.role = input.role;
  if (input.nickname !== undefined) data.nickname = input.nickname;
  if (input.disabled !== undefined) data.disabled = input.disabled;
  const admin = await prisma.admin.update({ where: { id: input.id }, data });
  return { id: admin.id, username: admin.username, role: admin.role };
}

export async function adminLoginLogs(input: { page?: number; pageSize?: number } = {}) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const [list, total] = await Promise.all([
    prisma.adminLoginLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { admin: { select: { username: true, nickname: true } } },
    }),
    prisma.adminLoginLog.count(),
  ]);
  return {
    list: list.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
    total,
    page,
    pageSize,
  };
}

// ===== V0.2.65 小程序代码提审 API（mp access_token + submitAudit/uploadMedia）=====

/** 上传审核素材（截图）→ media_id（供 submitAudit 的 preview_info.pic_id_list）*/
/** 查询账号已配置的服务类目（提审前确认 category_id，需 mp 后台先加类目）→ category_list */
export async function getMpCategory(): Promise<{ categoryList: unknown; errcode?: number; errmsg?: string }> {
  const token = await getMpAccessToken();
  const res = await fetch(`https://api.weixin.qq.com/wxa/get_category?access_token=${token}`);
  const data = (await res.json()) as { category_list?: unknown; errcode?: number; errmsg?: string };
  if (data.errcode && data.errcode !== 0) {
    throw Errors.badRequest(`getMpCategory 失败: errcode=${data.errcode} ${data.errmsg ?? ''}`);
  }
  return { categoryList: data.category_list, errcode: data.errcode, errmsg: data.errmsg };
}

/** 上传审核素材（截图）→ media_id（供 submitAudit 的 preview_info.pic_id_list）*/
export async function uploadMpMedia(input: {
  buffer: Buffer;
  filename?: string;
  mime?: string;
}): Promise<{ mediaId: string }> {
  const token = await getMpAccessToken();
  const form = new FormData();
  const blob = new Blob([input.buffer], { type: input.mime || 'image/png' });
  form.append('media', blob, input.filename || 'screenshot.png');
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${token}&type=image`,
    { method: 'POST', body: form },
  );
  const data = (await res.json()) as { media_id?: string; errcode?: number; errmsg?: string };
  if (!data.media_id) {
    throw Errors.badRequest(`uploadMedia 失败: errcode=${data.errcode} ${data.errmsg ?? ''}`);
  }
  return { mediaId: data.media_id };
}

/** 小程序代码提审（透传 item_list + preview_info + version_desc → mp submitAudit）*/
export async function submitMpAudit(input: {
  itemList: Array<Record<string, unknown>>;
  previewInfo?: { picIdList?: string[]; videoIdList?: string[] };
  versionDesc: string;
  feedbackInfo?: string;
  privacyInfo?: Record<string, unknown>;
}): Promise<{ auditId: number; errcode?: number; errmsg?: string }> {
  const token = await getMpAccessToken();
  const body: Record<string, unknown> = {
    item_list: input.itemList,
    version_desc: input.versionDesc,
  };
  if (input.previewInfo) {
    body.preview_info = {
      pic_id_list: input.previewInfo.picIdList,
      video_id_list: input.previewInfo.videoIdList,
    };
  }
  if (input.feedbackInfo) body.feedback_info = input.feedbackInfo;
  if (input.privacyInfo) body.privacy_info = input.privacyInfo;
  const res = await fetch(`https://api.weixin.qq.com/wxa/submit_audit?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json() as { auditid?: number; errcode?: number; errmsg?: string });
  // errcode 0 = 成功；非 0 抛（含 auditid 时仍返）
  if (data.errcode && data.errcode !== 0 && !data.auditid) {
    throw Errors.badRequest(`submitAudit 失败: errcode=${data.errcode} ${data.errmsg ?? ''}`);
  }
  return { auditId: data.auditid ?? 0, errcode: data.errcode, errmsg: data.errmsg };
}

// ===== V0.3.4 admin.dashboard 仪表盘 =====

/** admin.dashboard 6 指标聚合（1 API 拉全 — V0.2.147/2.150 范式） */
export interface AdminDashboardData {
  // 用户维度
  totalUsers: number;
  activeUsers7d: number; // 最近 7 天有 checkin/weRunRecord/strengthSession 任一
  // 订单维度
  totalOrders: number;
  totalRevenueFen: number; // CNY 分
  paidOrders: number;
  // 打卡维度
  totalCheckins: number;
  checkins30d: number;
  // 异常告警
  failedAdminLogins30d: number;
  totalInterpret: number;
  // V0.3.34 A5：30 天每日趋势（订单/用户/打卡）
  dailyTrend: Array<{
    date: string; // YYYY-MM-DD
    orders: number;
    newUsers: number;
    checkins: number;
  }>;
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const now = new Date();
  const last7d = new Date(now.getTime() - 7 * 86_400_000);
  const last30d = new Date(now.getTime() - 30 * 86_400_000);

  // 6 类聚合并行（Promise.allSettled 失败隔离 — V0.3.1 cron pull 范式）
  const results = await Promise.allSettled([
    // 1. 用户总数
    prisma.user.count(),
    // 2. 7 天活跃用户（有打卡/weRunRecord/strengthSession 任一）
    prisma.user.count({
      where: {
        OR: [
          { checkins: { some: { createdAt: { gte: last7d } } } },
          { weRunRecords: { some: { createdAt: { gte: last7d } } } },
          { strengthSessions: { some: { createdAt: { gte: last7d } } } },
        ],
      },
    }),
    // 3. 订单总数
    prisma.order.count(),
    // 4. 营收（order.totalAmount 元，Decimal → 转换为分）
    prisma.order.aggregate({ _sum: { totalAmount: true } }),
    // 5. 已支付订单数
    prisma.order.count({ where: { status: 'paid' } }),
    // 6. 打卡总数 + 30 天
    prisma.checkin.count(),
    prisma.checkin.count({ where: { createdAt: { gte: last30d } } }),
    // 7. 30 天 admin 失败 login（field = createdAt）
    prisma.adminLoginLog.count({ where: { ok: false, createdAt: { gte: last30d } } }),
    // 8. interpret 总数
    prisma.interpretRecord.count(),
    // 9. V0.3.34 A5：30 天每日订单数
    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT to_char("createdAt", 'YYYY-MM-DD') as date, COUNT(*) as count
      FROM "Order" WHERE "createdAt" >= ${last30d}
      GROUP BY date ORDER BY date ASC
    `,
    // 10. V0.3.34 A5：30 天每日新用户
    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT to_char("createdAt", 'YYYY-MM-DD') as date, COUNT(*) as count
      FROM "User" WHERE "createdAt" >= ${last30d}
      GROUP BY date ORDER BY date ASC
    `,
    // 11. V0.3.34 A5：30 天每日打卡数
    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT to_char("createdAt", 'YYYY-MM-DD') as date, COUNT(*) as count
      FROM "Checkin" WHERE "createdAt" >= ${last30d}
      GROUP BY date ORDER BY date ASC
    `,
  ]);

  // 失败隔离（任意失败返 0，dashboard 不整体崩）
  const val = <T>(i: number, fallback: T): T => {
    const r = results[i];
    return r.status === 'fulfilled' ? (r.value as T) : fallback;
  };

  // totalAmount 是 Decimal（prisma 返回 Decimal 对象），需 Number() 转换
  // 1 元 = 100 分（CNY），转分需 *100 + round
  const totalAmountVal = val<{ _sum: { totalAmount: unknown } }>(3, { _sum: { totalAmount: null } });
  const totalAmountNum = totalAmountVal._sum?.totalAmount ? Number(totalAmountVal._sum.totalAmount) : 0;

  return {
    totalUsers: val(0, 0),
    activeUsers7d: val(1, 0),
    totalOrders: val(2, 0),
    totalRevenueFen: Math.round(totalAmountNum * 100), // 元 → 分
    paidOrders: val(4, 0),
    totalCheckins: val(5, 0),
    checkins30d: val(6, 0),
    failedAdminLogins30d: val(7, 0),
    totalInterpret: val(8, 0),
    // V0.3.34 A5：30 天每日趋势（合并 3 个 queryRaw 结果）
    dailyTrend: mergeDailyTrend(
      val<Array<{ date: string; count: bigint }>>(9, []),
      val<Array<{ date: string; count: bigint }>>(10, []),
      val<Array<{ date: string; count: bigint }>>(11, []),
    ),
  };
}

// ===== V0.3.34 A5 helper：合并 3 个每日聚合查询为 dailyTrend =====
function mergeDailyTrend(
  orders: Array<{ date: string; count: bigint }>,
  users: Array<{ date: string; count: bigint }>,
  checkins: Array<{ date: string; count: bigint }>,
): Array<{ date: string; orders: number; newUsers: number; checkins: number }> {
  const map = new Map<string, { orders: number; newUsers: number; checkins: number }>();
  for (const { date, count } of orders) {
    const e = map.get(date) ?? { orders: 0, newUsers: 0, checkins: 0 };
    e.orders = Number(count);
    map.set(date, e);
  }
  for (const { date, count } of users) {
    const e = map.get(date) ?? { orders: 0, newUsers: 0, checkins: 0 };
    e.newUsers = Number(count);
    map.set(date, e);
  }
  for (const { date, count } of checkins) {
    const e = map.get(date) ?? { orders: 0, newUsers: 0, checkins: 0 };
    e.checkins = Number(count);
    map.set(date, e);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
}

// ===== V0.3.34 A6：admin.excel 导出（exceljs）=====
import ExcelJS from 'exceljs';

/**
 * 导出订单 Excel（V0.3.34 A6）
 * - 用 exceljs 生成 .xlsx 二进制
 * - 返 base64 编码 + filename
 * - 与 exportOrders（CSV）相同查询，但格式不同
 */
export async function exportOrdersExcel(input: ExportOrdersInput): Promise<{ filename: string; base64: string }> {
  const where: Record<string, unknown> = {};
  if (input.status) where.status = input.status;
  if (input.startDate || input.endDate) {
    where.createdAt = {
      ...(input.startDate ? { gte: new Date(input.startDate) } : {}),
      ...(input.endDate ? { lte: new Date(input.endDate) } : {}),
    };
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50_000, // Excel 50k 行限制
    include: { user: { select: { openid: true, nickname: true, phone: true } }, items: true },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'qm-admin';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('订单');
  sheet.columns = [
    { header: '订单ID', key: 'id', width: 25 },
    { header: '用户openid', key: 'openid', width: 30 },
    { header: '用户昵称', key: 'nickname', width: 20 },
    { header: '用户手机', key: 'phone', width: 15 },
    { header: '状态', key: 'status', width: 12 },
    { header: '总金额(元)', key: 'totalAmount', width: 12 },
    { header: '实付金额(元)', key: 'payAmount', width: 12 },
    { header: '使用积分', key: 'pointsUsed', width: 10 },
    { header: '商品数', key: 'itemCount', width: 8 },
    { header: '创建时间', key: 'createdAt', width: 20 },
    { header: '支付时间', key: 'paidAt', width: 20 },
  ];
  for (const o of orders) {
    sheet.addRow({
      id: o.id,
      openid: o.user.openid,
      nickname: o.user.nickname ?? '',
      phone: o.user.phone ?? '',
      status: o.status,
      totalAmount: dec(o.totalAmount),
      payAmount: dec(o.payAmount),
      pointsUsed: o.pointsUsed,
      itemCount: o.items.length,
      createdAt: o.createdAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? '',
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    filename: `orders-${new Date().toISOString().slice(0, 10)}.xlsx`,
    base64: Buffer.from(buffer).toString('base64'),
  };
}

// ===== V0.3.35 boohee×运动 营养×运动平衡聚合（admin 验证 boohee API 落地场景）=====
/**
 * 用户某日「运动消耗 + 饮食摄入 + 营养平衡」一次拉全。
 *
 * 设计要点：
 * - 4 段独立 try/catch（V0.3.4 dashboard 范式）：任一段失败不挂整接口
 * - boohee 优雅降级（V0.3.35 新沉淀）：失败标 booheeEnriched: false，不影响主流程
 * - Checkin 距离×60 kcal/km 估算（V0.3.35 简单系数，YAGNI 后续可接 MET 公式）
 * - boohee.search → detail 链路（V0.3.35 范式复用）
 */
const CHECKIN_KCAL_PER_KM = 60; // V0.3.35 简单估算系数

function todayCN(): string {
  return new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 工具：从 boohee detail 安全取字段（detail 字段结构固定为 {name, value, nrv}）*/
function pickNutrient(
  detail: { calories?: { value: number }; protein?: { value: number }; fat?: { value: number }; carbohydrate?: { value: number }; gi?: { value: number }; gl?: { value: number }; health_light?: number } | null | undefined,
  key: 'calories' | 'protein' | 'fat' | 'carbohydrate' | 'gi' | 'gl' | 'health_light',
): number | undefined {
  if (!detail) return undefined;
  const v = (detail as Record<string, unknown>)[key];
  if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return Number((v as { value: unknown }).value);
  }
  if (typeof v === 'number') return v;
  return undefined;
}

export async function getNutritionBalance(input: z.infer<typeof NutritionBalanceInputSchema>) {
  const date = input.date ?? todayCN();
  const { userId } = input;

  // ===== 1. 运动消耗（4 段独立 try/catch 范式）=====
  let checkinCount = 0;
  let totalDistanceKm = 0;
  let deviceCalories = 0;
  let deviceSteps = 0;
  let hasCheckin = false;
  let hasDevice = false;

  // 1a. Checkin 距离 + count
  try {
    const [count, agg] = await Promise.all([
      prisma.checkin.count({ where: { userId, date } }),
      prisma.checkin.aggregate({ where: { userId, date }, _sum: { distance: true } }),
    ]);
    checkinCount = count;
    totalDistanceKm = agg._sum.distance ? Math.round(Number(agg._sum.distance) * 10) / 10 : 0;
    hasCheckin = count > 0;
  } catch (e) {
    console.error('[nutritionBalance] checkin 聚合失败', e);
  }

  // 1b. DeviceDailyActivity（按当日 vendor 聚合 caloriesKcal + steps）
  try {
    const deviceRows = await prisma.deviceDailyActivity.findMany({
      where: { userId, date },
    });
    deviceCalories = deviceRows.reduce((s, r) => s + r.caloriesKcal, 0);
    deviceSteps = deviceRows.reduce((s, r) => s + r.step, 0);
    hasDevice = deviceRows.length > 0;
  } catch (e) {
    console.error('[nutritionBalance] device 聚合失败', e);
  }

  // 估算卡路里 = Checkin 距离×60 系数 + Device 实际消耗
  const caloriesBurned = Math.round(totalDistanceKm * CHECKIN_KCAL_PER_KM + deviceCalories);
  const steps = deviceSteps;
  const source: 'checkin' | 'device' | 'both' | 'none' = hasCheckin && hasDevice
    ? 'both'
    : hasCheckin
    ? 'checkin'
    : hasDevice
    ? 'device'
    : 'none';

  // ===== 2. 饮食摄入（food.myMeals 复用）=====
  let mealsData: { date: string; meals: Array<{ id: string; mealType: string; items: unknown; totalCalorie: number; createdAt: string }>; summary: { calorie: number; protein: number; fat: number; carb: number } } = {
    date,
    meals: [],
    summary: { calorie: 0, protein: 0, fat: 0, carb: 0 },
  };
  try {
    mealsData = await foodService.myMeals(userId, date);
  } catch (e) {
    console.error('[nutritionBalance] food.myMeals 失败', e);
  }

  // ===== 3. boohee 营养回填（每餐 items 尝试 search → detail）=====
  const enrichedMeals: Array<{
    id: string;
    mealType: string;
    items: Array<{
      name: string;
      calorie: number;
      protein?: number;
      fat?: number;
      carb?: number;
      booheeEnriched?: boolean;
      gi?: number;
      gl?: number;
      healthLight?: number;
    }>;
    totalCalorie: number;
  }> = [];
  for (const m of mealsData.meals) {
    const rawItems = m.items as Array<{ name: string; calorie: number; protein?: number; fat?: number; carb?: number; foodId?: string }>;
    const enrichedItems: typeof enrichedMeals[number]['items'] = [];
    for (const it of rawItems) {
      const baseItem = {
        name: it.name,
        calorie: it.calorie,
        protein: it.protein,
        fat: it.fat,
        carb: it.carb,
      };
      try {
        // 用菜名搜薄荷，命中第一个就调 detail
        const searchResp = await booheeService.search(it.name, { per_page: 1 });
        const first = searchResp.foods?.[0];
        if (first) {
          const detail = await booheeService.detail(first.code);
          enrichedItems.push({
            ...baseItem,
            booheeEnriched: true,
            gi: pickNutrient(detail, 'gi'),
            gl: pickNutrient(detail, 'gl'),
            healthLight: detail.health_light,
          });
          continue;
        }
      } catch (e) {
        // boohee 失败/未开通 → 标 false，不挂主流程
        console.warn(`[nutritionBalance] boohee 回填失败: ${it.name}`, (e as Error).message);
      }
      enrichedItems.push({ ...baseItem, booheeEnriched: false });
    }
    enrichedMeals.push({
      id: m.id,
      mealType: m.mealType,
      items: enrichedItems,
      totalCalorie: m.totalCalorie,
    });
  }

  // ===== 4. 净平衡计算 =====
  const netCalorie = mealsData.summary.calorie - caloriesBurned;
  let recommendation: string;
  if (netCalorie < -500) {
    recommendation = `净消耗 ${Math.abs(netCalorie)} kcal，摄入明显不足，建议补充营养（增加一份主食或坚果类加餐）。`;
  } else if (netCalorie > 500) {
    recommendation = `净摄入 +${netCalorie} kcal，摄入大于消耗，建议增加有氧运动或调整下一餐份量。`;
  } else {
    recommendation = `净 ${netCalorie >= 0 ? '+' : ''}${netCalorie} kcal，能量平衡良好，${netCalorie > 0 ? '可保持当前节奏' : '注意补充水分和电解质'}。`;
  }

  return {
    userId,
    date,
    sport: {
      checkinCount,
      totalDistanceKm,
      caloriesBurned,
      steps,
      source,
    },
    meals: enrichedMeals,
    totalIntake: {
      calorie: mealsData.summary.calorie,
      protein: mealsData.summary.protein,
      fat: mealsData.summary.fat,
      carb: mealsData.summary.carb,
    },
    netBalance: {
      calorie: netCalorie,
      recommendation,
    },
  };
}
