/**
 * distribution module service — 分销中心（V0.1.24，方案 1 全持久化）
 *
 * 数据来源：DistributionOrder（推广订单）+ Team（邀请关系）+ CommissionLog（佣金流水）
 * 等级规则（常量）：V1≥100元或3人(10%) / V2≥500或10人(15%) / V3≥2000或50人(20%)
 * 佣金：直推按等级 rate，间推减半；订单支付完成时结算入钱包
 * 参考：pic/2762 分销中心
 *
 * 关键导出（供 mall.createOrder / wxpay.notify 集成复用）：
 * - computeLevel(totalCommission, teamCount)  按累计算应得等级
 * - levelRate(level)                          等级对应直推佣金率
 * - ensureInviteCode(userId, current)         首次访问生成 6 位邀请码
 */
import { prisma } from '../../infra/prisma.js';
import type { Prisma } from '@prisma/client';
import { walletRepo } from '../wallet/wallet.repo.js';
import { Errors } from '../../common/errors.js';
import type { PageInput, TeamInput, WithdrawalRequestInput } from './distribution.schema.js';

// 等级规则（从高到低，取满足的最高级）
export const LEVEL_RULES = [
  { level: 'V3', minCommission: 2000, minTeam: 50, rate: 0.2, title: '王牌分销' },
  { level: 'V2', minCommission: 500, minTeam: 10, rate: 0.15, title: '金牌分销' },
  { level: 'V1', minCommission: 100, minTeam: 3, rate: 0.1, title: '银牌分销' },
  { level: 'V0', minCommission: 0, minTeam: 0, rate: 0, title: '普通用户' },
] as const;

/** 按累计佣金 OR 团队人数计算应得等级（取满足的最高级） */
export function computeLevel(totalCommission: number, teamCount: number): string {
  for (const rule of LEVEL_RULES) {
    if (totalCommission >= rule.minCommission || teamCount >= rule.minTeam) {
      return rule.level;
    }
  }
  return 'V0';
}

/**
 * 间推佣金比例（V0.1.105 GAP-6）
 *
 * 间推佣金 = 直推佣金 × INDIRECT_COMMISSION_RATE
 * 默认 50%（V2 直推 15% → 间推 7.5%）
 * MVP 硬编码常量；后续可改为 AppConfig.indirectCommissionRate 配置化
 */
export const INDIRECT_COMMISSION_RATE = 0.5;

/** 等级对应的直推佣金率（间推减半） */
export function levelRate(level: string): number {
  return LEVEL_RULES.find((r) => r.level === level)?.rate ?? 0;
}

/**
 * 确保用户有 inviteCode（无则生成 6 位大写字母数字，查重落库）
 * 并发安全：唯一冲突时重试，兜底用 userId 末 6 位
 */
export async function ensureInviteCode(userId: string, current?: string | null): Promise<string> {
  if (current) return current;
  for (let i = 0; i < 5; i++) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    // updateMany + inviteCode:null 条件防并发覆盖（count=0 说明被并发写入）
    const r = await prisma.user.updateMany({
      where: { id: userId, inviteCode: null },
      data: { inviteCode: code },
    });
    if (r.count > 0) return code;
    const fresh = await prisma.user.findUnique({
      where: { id: userId },
      select: { inviteCode: true },
    });
    if (fresh?.inviteCode) return fresh.inviteCode;
  }
  // 兜底：userId cuid 末 5 位大写（cuid 无碰撞）
  const fallback = `U${userId.slice(-5).toUpperCase()}`;
  await prisma.user.updateMany({
    where: { id: userId, inviteCode: null },
    data: { inviteCode: fallback },
  });
  return fallback;
}

/** 本月范围（东八区，用于「本月佣金/销售」统计） */
function monthRangeCN(): { start: Date; end: Date } {
  const cnOffset = 8 * 3600 * 1000;
  const cn = new Date(Date.now() + cnOffset);
  const year = cn.getUTCFullYear();
  const month = cn.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1) - cnOffset),
    end: new Date(Date.UTC(year, month + 1, 1) - cnOffset),
  };
}

export const distributionService = {
  /** 顶部汇总：本月佣金 + 销售金额 + 订单数 + 等级 + inviteCode（参考 2762 红卡） */
  async mySummary(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { inviteCode: true, distributorLevel: true },
    });
    const inviteCode = await ensureInviteCode(userId, user?.inviteCode);

    const { start, end } = monthRangeCN();

    // 本月佣金（settle 入账 - clawback 冲红）
    const monthComm = await prisma.commissionLog.aggregate({
      _sum: { amount: true },
      where: { userId, createdAt: { gte: start, lt: end }, type: { in: ['settle', 'clawback'] } },
    });
    // 本月销售金额（本月推广订单实付，排除已取消）
    const monthSales = await prisma.distributionOrder.aggregate({
      _sum: { orderAmount: true },
      where: { userId, createdAt: { gte: start, lt: end }, status: { in: ['pending', 'settled'] } },
    });
    const orderCount = await prisma.distributionOrder.count({ where: { userId } });

    return {
      inviteCode,
      level: user?.distributorLevel ?? 'V0',
      monthCommission: Number(monthComm._sum.amount ?? 0).toFixed(2),
      monthSales: Number(monthSales._sum.orderAmount ?? 0).toFixed(2),
      orderCount,
    };
  },

  /** 分销订单列表（含订单状态 + 商品名） */
  async myOrders(userId: string, input: PageInput) {
    const where = { userId };
    const [list, total] = await Promise.all([
      prisma.distributionOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          order: {
            select: { status: true, items: { select: { name: true, qty: true } } },
          },
        },
      }),
      prisma.distributionOrder.count({ where }),
    ]);
    return {
      list: list.map((d) => ({
        id: d.id,
        orderId: d.orderId,
        orderAmount: Number(d.orderAmount),
        commissionAmount: Number(d.commissionAmount),
        commissionRate: Number(d.commissionRate),
        status: d.status,
        settledAt: d.settledAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        orderStatus: d.order.status,
        items: d.order.items,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  },

  /** 我的团队（直推/间推分组 + 计数） */
  async myTeam(userId: string, input: TeamInput) {
    const where = {
      inviterId: userId,
      ...(input.level ? { level: input.level } : {}),
    };
    const [list, total, directCount, indirectCount] = await Promise.all([
      prisma.team.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          invitee: { select: { nickname: true, avatarUrl: true, distributorLevel: true } },
        },
      }),
      prisma.team.count({ where }),
      prisma.team.count({ where: { inviterId: userId, level: 1 } }),
      prisma.team.count({ where: { inviterId: userId, level: 2 } }),
    ]);
    return {
      list: list.map((t) => ({
        id: t.id,
        level: t.level,
        joinedAt: t.joinedAt.toISOString(),
        nickname: t.invitee.nickname ?? '跑友',
        avatarUrl: t.invitee.avatarUrl,
        inviteeLevel: t.invitee.distributorLevel,
      })),
      directCount,
      indirectCount,
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  },

  /** 佣金记录流水 */
  async myCommissionLogs(userId: string, input: PageInput) {
    const where = { userId };
    const [list, total] = await Promise.all([
      prisma.commissionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.commissionLog.count({ where }),
    ]);
    return {
      list: list.map((c) => ({
        id: c.id,
        amount: Number(c.amount),
        type: c.type,
        balanceAfter: Number(c.balanceAfter),
        note: c.note,
        createdAt: c.createdAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  },

  /** 当前等级 + 升级进度（距下一级差多少佣金/人数） */
  async myLevel(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { distributorLevel: true },
    });
    const current = user?.distributorLevel ?? 'V0';

    const agg = await prisma.commissionLog.aggregate({
      _sum: { amount: true },
      where: { userId, type: { in: ['settle', 'clawback'] } },
    });
    const totalCommission = Number(agg._sum.amount ?? 0);
    const teamCount = await prisma.team.count({ where: { inviterId: userId, level: 1 } });

    const currentIdx = LEVEL_RULES.findIndex((r) => r.level === current);
    const currentRule = LEVEL_RULES[currentIdx] ?? LEVEL_RULES[LEVEL_RULES.length - 1];
    // 下一级（数组里更高一级 = idx 更小）
    const nextRule = currentIdx > 0 ? LEVEL_RULES[currentIdx - 1] : null;

    return {
      current,
      title: currentRule.title,
      rate: currentRule.rate,
      totalCommission: totalCommission.toFixed(2),
      teamCount,
      next: nextRule
        ? {
            level: nextRule.level,
            title: nextRule.title,
            needCommission: Math.max(0, nextRule.minCommission - totalCommission).toFixed(2),
            needTeam: Math.max(0, nextRule.minTeam - teamCount),
          }
        : null,
    };
  },

  /** 邀请码 + 邀请路径 + 分销说明（静态） */
  async inviteInfo(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { inviteCode: true },
    });
    const inviteCode = await ensureInviteCode(userId, user?.inviteCode);
    return {
      inviteCode,
      // 小程序内邀请新用户：首页带 inviteCode 参数（首页 onLaunch 落库 Team 关系）
      invitePath: `/pages/index/index?inviteCode=${inviteCode}`,
      shareTitle: '一起来青沐跑步，赚取健康与佣金！',
      rules: [
        '分享商品或邀请链接给好友，好友下单后你即可获得佣金。',
        '直推佣金：按当前等级 V1=10% / V2=15% / V3=20%。',
        '间推佣金：直推×50%（V0.1.105 已上线）。',
        '佣金在订单支付完成后实时入账至钱包余额，可提现。',
        '累计佣金或团队人数达标自动升级等级。',
      ],
    };
  },

  /**
   * 提现申请（V0.1.105 GAP-6）
   *
   * pending 状态不扣余额（避免「申请→消费佣金→退款时余额不足」竞态）
   * 审核通过后 admin.approveWithdrawal 事务内扣减
   */
  async requestWithdrawal(userId: string, input: WithdrawalRequestInput) {
    // 校验：最低 10 元（schema 已校验最低，这里兜底）
    if (input.amount < 10) throw Errors.badRequest('最低提现金额 10 元');

    // 校验余额
    const wallet = await walletRepo.ensureWallet(userId);
    if (Number(wallet.balance) < input.amount) {
      throw Errors.badRequest('余额不足');
    }

    // 校验：同用户已有 pending 申请 → 拒绝（避免重复申请）
    const pending = await prisma.withdrawalRequest.findFirst({
      where: { userId, status: 'pending' },
    });
    if (pending) throw Errors.conflict('已有待审核申请');

    const req = await prisma.withdrawalRequest.create({
      data: { userId, amount: input.amount, status: 'pending' },
    });

    return {
      id: req.id,
      amount: Number(req.amount),
      status: req.status,
      createdAt: req.createdAt.toISOString(),
    };
  },

  /** 我的提现记录（分页） */
  async myWithdrawals(userId: string, input: PageInput) {
    const [list, total] = await Promise.all([
      prisma.withdrawalRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.withdrawalRequest.count({ where: { userId } }),
    ]);
    return {
      list: list.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        status: r.status,
        reason: r.reason,
        processedAt: r.processedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      hasMore: input.page * input.pageSize < total,
    };
  },
};

// ===== 集成函数（供 mall.createOrder / wxpay.notify / refund 调用）=====

/**
 * 订单支付完成时结算分销佣金（wxpay notify 内事务调用）
 *
 * - 0 佣金（payAmount=0 / 积分单）：直接标 settled
 * - 有佣金：钱包入账 + WalletTransaction(commission) + CommissionLog + DistrOrder→settled + 等级重算
 * - 幂等：DistrOrder 非 pending 直接返回（重复回调安全）
 */
export async function settleCommission(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const distrOrder = await tx.distributionOrder.findUnique({ where: { orderId } });
  if (!distrOrder || distrOrder.status !== 'pending') return;

  const commission = Number(distrOrder.commissionAmount);
  if (commission <= 0) {
    await tx.distributionOrder.update({
      where: { id: distrOrder.id },
      data: { status: 'settled', settledAt: new Date() },
    });
    return;
  }

  // 钱包入账（increment 原子）
  const wallet = await walletRepo.ensureWalletInTx(tx, distrOrder.userId);
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: commission } },
  });
  await tx.walletTransaction.create({
    data: {
      userId: distrOrder.userId,
      walletId: wallet.id,
      type: 'commission',
      amount: commission,
      orderId,
      status: 'success',
    },
  });

  // 佣金流水累计快照
  const lastLog = await tx.commissionLog.findFirst({
    where: { userId: distrOrder.userId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfter: true },
  });
  const balanceAfter = Number(lastLog?.balanceAfter ?? 0) + commission;
  await tx.commissionLog.create({
    data: {
      userId: distrOrder.userId,
      orderId,
      amount: commission,
      type: 'settle',
      balanceAfter,
      note: '订单佣金结算',
    },
  });

  await tx.distributionOrder.update({
    where: { id: distrOrder.id },
    data: { status: 'settled', settledAt: new Date() },
  });

  // 等级重算（同步，单用户数据量小）
  const teamCount = await tx.team.count({ where: { inviterId: distrOrder.userId, level: 1 } });
  const newLevel = computeLevel(balanceAfter, teamCount);
  await tx.user.update({
    where: { id: distrOrder.userId },
    data: { distributorLevel: newLevel },
  });

  // V0.1.105 GAP-6：间推佣金（直推完成后追加触发）
  await settleIndirectCommission(tx, orderId);
}

/**
 * 间推佣金结算（V0.1.105 GAP-6）
 *
 * 2-hop 查询：distOrder.userId（直推上线）的 Team 关系 → inviterId = 间推上线（grandfather）
 * 间推佣金 = 直推佣金 × INDIRECT_COMMISSION_RATE
 * 不依赖 Team.level=2 字段（V0.1.24 mall.createOrder 创建逻辑有 @unique 冲突风险，MVP 未触发）
 *
 * - 无 Team 关系（直推上线无自己的上线）：跳过
 * - 间推金额 ≤ 0：跳过
 * - 幂等：依赖 distOrder.status（settleIndirectCommission 自己维护 settleIndirect 标记在 CommissionLog.type='settle_indirect'）
 */
export async function settleIndirectCommission(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const distrOrder = await tx.distributionOrder.findUnique({ where: { orderId } });
  if (!distrOrder) return;

  // 幂等：已发过间推佣金（CommissionLog.type='settle_indirect' 且 orderId 匹配）则跳过
  const existingIndirect = await tx.commissionLog.findFirst({
    where: { orderId, type: 'settle_indirect' },
  });
  if (existingIndirect) return;

  // 2-hop 查询：直推上线的 Team.inviterId = 间推上线
  const directRelation = await tx.team.findUnique({
    where: { inviteeId: distrOrder.userId }, // inviteeId = 上线（@unique 一人一条）
  });
  if (!directRelation) return; // 直推上线没有自己的上线 → 无间推

  const grandfatherId = directRelation.inviterId;
  if (grandfatherId === distrOrder.userId) return; // 防自环

  // 计算间推佣金 = 直推 × 50%
  const directCommission = Number(distrOrder.commissionAmount);
  const indirectAmount = Math.round(directCommission * INDIRECT_COMMISSION_RATE * 100) / 100;
  if (indirectAmount <= 0) return;

  // 钱包入账 + WalletTransaction + CommissionLog
  const wallet = await walletRepo.ensureWalletInTx(tx, grandfatherId);
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: indirectAmount } },
  });
  await tx.walletTransaction.create({
    data: {
      userId: grandfatherId,
      walletId: wallet.id,
      type: 'commission',
      amount: indirectAmount,
      orderId,
      status: 'success',
    },
  });

  // 佣金流水累计快照
  const lastLog = await tx.commissionLog.findFirst({
    where: { userId: grandfatherId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfter: true },
  });
  const balanceAfter = Number(lastLog?.balanceAfter ?? 0) + indirectAmount;
  await tx.commissionLog.create({
    data: {
      userId: grandfatherId,
      orderId,
      amount: indirectAmount,
      type: 'settle_indirect',
      balanceAfter,
      note: `间推佣金 ${(INDIRECT_COMMISSION_RATE * 100).toFixed(0)}%`,
    },
  });

  // 等级重算（间推上线）
  const teamCount = await tx.team.count({ where: { inviterId: grandfatherId, level: 1 } });
  const newLevel = computeLevel(balanceAfter, teamCount);
  await tx.user.update({
    where: { id: grandfatherId },
    data: { distributorLevel: newLevel },
  });
}

/**
 * 订单退款时冲红分销佣金（refund 流程内事务调用）
 *
 * - pending（未结算）：直接 cancelled
 * - settled（已入账）：钱包扣减（允许负，钱已退必须如实记账）+ CommissionLog 冲红 + DistrOrder→cancelled
 * - cancelled：幂等跳过
 */
export async function clawbackCommission(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const distrOrder = await tx.distributionOrder.findUnique({ where: { orderId } });
  if (!distrOrder || distrOrder.status === 'cancelled') return;

  if (distrOrder.status === 'pending') {
    await tx.distributionOrder.update({
      where: { id: distrOrder.id },
      data: { status: 'cancelled' },
    });
    return;
  }

  const commission = Number(distrOrder.commissionAmount);
  const wallet = await walletRepo.ensureWalletInTx(tx, distrOrder.userId);
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { decrement: commission } },
  });
  await tx.walletTransaction.create({
    data: {
      userId: distrOrder.userId,
      walletId: wallet.id,
      type: 'commission_clawback',
      amount: -commission,
      orderId,
      status: 'success',
    },
  });
  const lastLog = await tx.commissionLog.findFirst({
    where: { userId: distrOrder.userId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfter: true },
  });
  const balanceAfter = Number(lastLog?.balanceAfter ?? 0) - commission;
  await tx.commissionLog.create({
    data: {
      userId: distrOrder.userId,
      orderId,
      amount: -commission,
      type: 'clawback',
      balanceAfter,
      note: '订单退款佣金冲红',
    },
  });
  await tx.distributionOrder.update({
    where: { id: distrOrder.id },
    data: { status: 'cancelled' },
  });

  // V0.1.105 GAP-6：间推佣金冲红（直推冲红完成后追加触发）
  await clawbackIndirectCommission(tx, orderId);
}

/**
 * 间推佣金冲红（V0.1.105 GAP-6）
 *
 * 退款时冲红间推佣金：找 settle_indirect 的 CommissionLog 记录 → 钱包扣减 + 负 CommissionLog
 * - 无 settle_indirect 记录：跳过（从未发过间推佣金）
 * - 已冲红（clawback_indirect 记录存在）：幂等跳过
 */
export async function clawbackIndirectCommission(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  // 找间推佣金入账记录（settle_indirect）
  const indirectLog = await tx.commissionLog.findFirst({
    where: { orderId, type: 'settle_indirect' },
  });
  if (!indirectLog) return; // 未发过间推

  // 幂等：已冲红则跳过
  const alreadyClawback = await tx.commissionLog.findFirst({
    where: { orderId, type: 'clawback_indirect' },
  });
  if (alreadyClawback) return;

  const amount = Number(indirectLog.amount);
  const grandfatherId = indirectLog.userId;

  // 钱包扣减（允许负，如实记账）
  const wallet = await walletRepo.ensureWalletInTx(tx, grandfatherId);
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { decrement: amount } },
  });
  await tx.walletTransaction.create({
    data: {
      userId: grandfatherId,
      walletId: wallet.id,
      type: 'commission_clawback',
      amount: -amount,
      orderId,
      status: 'success',
    },
  });

  // 负 CommissionLog
  const lastLog = await tx.commissionLog.findFirst({
    where: { userId: grandfatherId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfter: true },
  });
  const balanceAfter = Number(lastLog?.balanceAfter ?? 0) - amount;
  await tx.commissionLog.create({
    data: {
      userId: grandfatherId,
      orderId,
      amount: -amount,
      type: 'clawback_indirect',
      balanceAfter,
      note: '间推佣金冲红',
    },
  });
}
