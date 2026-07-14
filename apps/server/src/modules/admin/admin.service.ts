/**
 * admin service — 后台管理业务逻辑
 *
 * 从 admin.routes.ts 抽离（P1-1）。仿 wallet 范式：纯业务（prisma + 缓存失效），
 * 不含鉴权（routes 负责 isAdmin）/ 不含 schema parse（routes 负责）。
 * 新增 4 个管理 action（P1-2：listUsers / listContents / listProducts / stats）。
 */
import { prisma } from '../../infra/prisma.js';
import { refundService } from '../mall/refund.service.js';
import { invalidateProductsCache, invalidateProductDetail } from '../mall/mall.service.js';
import { invalidateContentsCache, invalidateContentDetail } from '../content/content.service.js';
import { invalidateFeatureFlagsCache } from '../../common/middleware/feature-gate.js';
import { Errors } from '../../common/errors.js';
import { walletRepo } from '../wallet/wallet.repo.js';
import { toCsvHeader, toCsvRow, UTF8_BOM } from '../../common/csv.js';
import { assertTransition, type OrderStatus } from '../../domain/order-state.js';
import { enqueueUploadParse } from '../../jobs/queue.js';
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
  if (input.id === 'feature_flags') invalidateFeatureFlagsCache();
  // admin_whitelist 通过 setConfig 修改时也要清 admin 缓存
  // @ts-expect-error narrowing for future expansion（当前 schema id enum 不含 admin_whitelist）
  if (input.id === 'admin_whitelist') invalidateAdminCache();
  // V0.1.18：审计留痕
  await recordAudit('admin.setConfig', input.id, { id: input.id, value: input.value }, actorOpenid, ip);
  return { ok: true };
}

export async function listAdmins() {
  const row = await prisma.appConfig.findUnique({ where: { id: 'admin_whitelist' } });
  return { openids: (row?.value as { openids?: string[] } | undefined)?.openids ?? [] };
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
