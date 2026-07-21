/**
 * admin service 单元测试（V0.1.18）
 *
 * 覆盖：
 * - banUser / unbanUser 边界（用户不存在、已封禁重复 ban、已解封重复 unban）
 * - recordAudit 失败只 log 不 throw
 * - listAuditLogs 时间倒序 + 分页 + 多维筛选
 * - assertNotBanned 抛 403
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  trainingPlan: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  wallet: { findUnique: vi.fn(), update: vi.fn() },
  walletTransaction: { create: vi.fn() },
  withdrawalRequest: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  order: { findUnique: vi.fn(), update: vi.fn() }, // V0.1.107 自提核销
  distributionOrder: { findMany: vi.fn() }, // V0.1.108 结算单导出
  commissionLog: { groupBy: vi.fn() }, // V0.1.108 累计佣金 groupBy
  review: { findUnique: vi.fn(), update: vi.fn() }, // V0.1.117 评价回复
  enrollment: { findUnique: vi.fn(), findMany: vi.fn() }, // V0.1.134 admin.submitRaceResult + listEnrollmentsByContent
  raceResult: { upsert: vi.fn(), findMany: vi.fn() }, // V0.1.134 admin.submitRaceResult + listEnrollmentsByContent
  appConfig: { findUnique: vi.fn() }, // V0.1.134 isAdmin 缓存
  uploadRecord: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, // V0.1.150 上传记录
  admin: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }, // V0.2.49 createAdmin/updateAdmin
  adminLoginLog: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() }, // V0.2.49 adminLoginLogs/adminLogin
  team: { groupBy: vi.fn() }, // V0.2.49 listInviteStats
  $transaction: vi.fn(), // V0.1.105 提现审核用
}));

vi.mock('src/infra/prisma.js', () => ({ prisma: mockPrisma }));
// mock middleware feature-gate.ts 引入的 appConfig.findUnique — service 内部不需要,
// 但 routes 的 isAdmin 缓存用,这里禁用它（用 invalidateAdminCache 测试中清）
vi.mock('src/common/middleware/feature-gate.js', () => ({
  invalidateFeatureFlagsCache: () => undefined,
}));

// V0.1.150 admin.retryParse 调 enqueueUploadParse（避免真连 Redis）
const mockEnqueueUploadParse = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('src/jobs/queue.js', () => ({ enqueueUploadParse: mockEnqueueUploadParse }));

import {
  banUser,
  unbanUser,
  recordAudit,
  listAuditLogs,
  assertNotBanned,
  upsertTrainingPlan,
  listTrainingPlans,
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  confirmPickup,
  exportSettlement,
  addReviewReply,
  submitRaceResult,
  listEnrollmentsByContent,
  listUploads,
  retryParse,
  adjustPoints,
  grantMember,
  listInviteStats,
  createAdmin,
  updateAdmin,
  adminLoginLogs,
} from '../../../src/modules/admin/admin.service.js';
import { BusinessError } from '../../../src/common/errors.js';
// V0.2.49 adjustPoints/grantMember 断言用（mock 版，vi.mock hoisted 生效）
import { userRepo } from '../../../src/modules/user/user.repository.js';
import { Cache } from '../../../src/infra/cache.js';

// V0.1.105 GAP-6: mock walletRepo（admin.service 引入了 ensureWalletInTx）
vi.mock('src/modules/wallet/wallet.repo.js', () => ({
  walletRepo: { ensureWalletInTx: vi.fn().mockResolvedValue({ id: 'w1', balance: 1000 }) },
}));

// V0.2.49 adjustPoints/grantMember 用 userRepo（addPoints/extendMember）+ Cache.del
vi.mock('src/modules/user/user.repository.js', () => ({
  userRepo: {
    addPoints: vi.fn().mockResolvedValue(undefined),
    extendMember: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('src/infra/cache.js', () => ({
  Cache: { del: vi.fn().mockResolvedValue(undefined), get: vi.fn(), set: vi.fn(), wrap: vi.fn() },
}));

describe('admin.service · banUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('用户不存在 → 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(banUser({ openid: 'o-x', reason: 'test' }, 'o-admin-1')).rejects.toThrow(BusinessError);
    try {
      await banUser({ openid: 'o-x', reason: 'test' }, 'o-admin-1');
    } catch (err) {
      expect((err as BusinessError).code).toBe(404);
    }
  });

  it('正常封禁 → update + audit', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-1', openid: 'o-user-1', isBanned: false, bannedAt: null, bannedReason: null,
    });
    mockPrisma.user.update.mockResolvedValue({ id: 'u-1' });
    mockPrisma.auditLog.create.mockResolvedValue({ id: 1n });

    const res = await banUser({ openid: 'o-user-1', reason: 'spam' }, 'o-admin-1', '127.0.0.1');

    expect(res).toEqual({ ok: true, alreadyBanned: false });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { isBanned: true, bannedAt: expect.any(Date), bannedReason: 'spam' },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorOpenid: 'o-admin-1',
        action: 'admin.banUser',
        target: 'o-user-1',
        payload: { reason: 'spam' },
        ip: '127.0.0.1',
      }),
    });
  });

  it('重复封禁已 banned 用户 → 幂等返回（不写 audit）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-1', openid: 'o-user-1', isBanned: true, bannedAt: new Date(), bannedReason: 'old',
    });

    const res = await banUser({ openid: 'o-user-1', reason: 'new' }, 'o-admin-1');

    expect(res).toEqual({ ok: true, alreadyBanned: true });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('admin.service · unbanUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('用户不存在 → 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(unbanUser({ openid: 'o-x' }, 'o-admin-1')).rejects.toThrow(BusinessError);
  });

  it('正常解封 → 清 banned 字段 + 写 audit', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-2', openid: 'o-user-2', isBanned: true,
    });
    mockPrisma.user.update.mockResolvedValue({ id: 'u-2' });
    mockPrisma.auditLog.create.mockResolvedValue({ id: 2n });

    const res = await unbanUser({ openid: 'o-user-2' }, 'o-admin-1');

    expect(res).toEqual({ ok: true, alreadyActive: false });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-2' },
      data: { isBanned: false, bannedAt: null, bannedReason: null },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'admin.unbanUser', target: 'o-user-2' }),
    });
  });

  it('解封未 banned 用户 → 幂等', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-2', openid: 'o-user-2', isBanned: false,
    });
    const res = await unbanUser({ openid: 'o-user-2' }, 'o-admin-1');
    expect(res).toEqual({ ok: true, alreadyActive: true });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('admin.service · recordAudit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('成功写入 audit log', async () => {
    mockPrisma.auditLog.create.mockResolvedValue({ id: 1n });
    await recordAudit('admin.test', 'target-1', { k: 'v' }, 'o-admin', '1.2.3.4');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorOpenid: 'o-admin',
        action: 'admin.test',
        target: 'target-1',
        payload: { k: 'v' },
        ip: '1.2.3.4',
      },
    });
  });

  it('DB 失败 → 只 console.error 不 throw', async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error('db down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // 不应抛
    await expect(recordAudit('admin.test', 't', {}, 'o-admin')).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[audit] failed to write audit log:',
      expect.objectContaining({ action: 'admin.test' }),
    );

    consoleSpy.mockRestore();
  });

  it('null target → 存为 null', async () => {
    mockPrisma.auditLog.create.mockResolvedValue({ id: 1n });
    await recordAudit('admin.global', null, {}, 'o-admin');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ target: null }),
    });
  });
});

describe('admin.service · listAuditLogs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('时间倒序 + 分页', async () => {
    const fakeLogs = [
      { id: 100n, actorOpenid: 'o-1', action: 'admin.banUser', target: 'o-x', payload: {}, ip: null, createdAt: new Date() },
      { id: 99n, actorOpenid: 'o-1', action: 'admin.refundOrder', target: 'o-y', payload: {}, ip: null, createdAt: new Date() },
    ];
    mockPrisma.auditLog.findMany.mockResolvedValue(fakeLogs);
    mockPrisma.auditLog.count.mockResolvedValue(2);

    const res = await listAuditLogs({ page: 1, pageSize: 20 });

    expect(res.list).toHaveLength(2);
    expect(res.list[0].id).toBe('100'); // BigInt → string
    expect(res.list[1].id).toBe('99');
    expect(res.total).toBe(2);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { id: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('action + actorOpenid + 日期范围筛选', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await listAuditLogs({
      page: 2,
      pageSize: 10,
      action: 'admin.banUser',
      actorOpenid: 'o-admin-1',
      startDate: '2026-06-01T00:00:00Z',
      endDate: '2026-06-30T23:59:59Z',
    });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        action: 'admin.banUser',
        actorOpenid: 'o-admin-1',
        createdAt: {
          gte: new Date('2026-06-01T00:00:00Z'),
          lte: new Date('2026-06-30T23:59:59Z'),
        },
      },
      orderBy: { id: 'desc' },
      skip: 10,
      take: 10,
    });
  });

  it('只传 startDate → endDate 不设上限', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await listAuditLogs({ page: 1, pageSize: 20, startDate: '2026-06-01T00:00:00Z' });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { createdAt: { gte: new Date('2026-06-01T00:00:00Z') } },
      orderBy: { id: 'desc' },
      skip: 0,
      take: 20,
    });
  });
});

describe('admin.service · assertNotBanned', () => {
  it('isBanned=true → 抛 403', () => {
    expect(() => assertNotBanned({ isBanned: true })).toThrow(BusinessError);
    try {
      assertNotBanned({ isBanned: true });
    } catch (err) {
      expect((err as BusinessError).code).toBe(403);
    }
  });

  it('isBanned=false / undefined / null → 不抛', () => {
    expect(() => assertNotBanned({ isBanned: false })).not.toThrow();
    expect(() => assertNotBanned({})).not.toThrow();
    expect(() => assertNotBanned(null)).not.toThrow();
    expect(() => assertNotBanned(undefined)).not.toThrow();
  });
});

describe('admin.service · 训练计划 CRUD (V0.1.41)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upsertTrainingPlan：无 id → create', async () => {
    mockPrisma.trainingPlan.create.mockResolvedValue({ id: 'p1' });
    const r = await upsertTrainingPlan({
      key: '5k', name: '5公里入门', weeks: 8, level: 'beginner',
      goal: '完成 5 公里', desc: '...', weeklyMileage: '8-15 km/周', targetKm: 80,
    });
    expect(r).toEqual({ id: 'p1' });
    expect(mockPrisma.trainingPlan.create).toHaveBeenCalled();
    expect(mockPrisma.trainingPlan.update).not.toHaveBeenCalled();
  });

  it('upsertTrainingPlan：有 id → update', async () => {
    mockPrisma.trainingPlan.update.mockResolvedValue({ id: 'p1' });
    const r = await upsertTrainingPlan({
      id: 'p1', key: '5k', name: '5K 入门改', weeks: 8, level: 'beginner',
      goal: 'g', desc: 'd', weeklyMileage: 'w', targetKm: 100,
    });
    expect(r).toEqual({ id: 'p1' });
    expect(mockPrisma.trainingPlan.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ name: '5K 入门改', targetKm: 100 }),
    });
    expect(mockPrisma.trainingPlan.create).not.toHaveBeenCalled();
  });

  it('listTrainingPlans：where status 过滤 + ISO 序列化', async () => {
    const ts = new Date('2026-07-01T00:00:00.000Z');
    mockPrisma.trainingPlan.findMany.mockResolvedValue([
      { id: 'p1', key: '5k', name: '5K', weeks: 8, level: 'beginner', goal: 'g', desc: 'd', weeklyMileage: 'w', targetKm: 80, status: 'active', createdAt: ts, updatedAt: ts },
    ] as never);
    const r = await listTrainingPlans({ status: 'active' });
    expect(r.list).toHaveLength(1);
    expect(r.list[0].createdAt).toBe('2026-07-01T00:00:00.000Z');
    expect(mockPrisma.trainingPlan.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      orderBy: [{ weeks: 'asc' }, { createdAt: 'desc' }],
    });
  });
});

// ===== V0.1.105 GAP-6 提现审核 =====

describe('admin.service · listWithdrawals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('按 status 过滤 + 分页含 user', async () => {
    mockPrisma.withdrawalRequest.findMany.mockResolvedValue([
      {
        id: 'wr1', userId: 'u1', amount: 100, status: 'pending',
        reason: null, processedBy: null, processedAt: null,
        createdAt: new Date('2026-07-10'),
        user: { id: 'u1', nickname: '跑友A', avatarUrl: null, inviteCode: 'ABC123' },
      },
    ] as never);
    mockPrisma.withdrawalRequest.count.mockResolvedValue(1 as never);

    const r = await listWithdrawals({ status: 'pending', page: 1, pageSize: 20 });
    expect(r.list[0].id).toBe('wr1');
    expect(r.list[0].amount).toBe(100);
    expect(r.list[0].user.nickname).toBe('跑友A');
    expect(r.total).toBe(1);
  });
});

describe('admin.service · approveWithdrawal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('提现申请不存在 → 404', async () => {
    // mock $transaction 直接调 callback，tx 传一个含 findUnique 的对象
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
      cb({ withdrawalRequest: { findUnique: mockPrisma.withdrawalRequest.findUnique, update: vi.fn() } } as never),
    );
    mockPrisma.withdrawalRequest.findUnique.mockResolvedValue(null);
    await expect(approveWithdrawal('wr1', 'admin1')).rejects.toThrow('提现申请不存在');
  });

  it('余额不足 → 自动转 rejected + 抛 400', async () => {
    const txMock = {
      withdrawalRequest: { findUnique: mockPrisma.withdrawalRequest.findUnique, update: vi.fn().mockResolvedValue({}) },
      wallet: { update: vi.fn() },
      walletTransaction: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    mockPrisma.$transaction.mockImplementation(async (cb) => cb(txMock as never));
    const { walletRepo } = await import('../../../src/modules/wallet/wallet.repo.js');
    (walletRepo.ensureWalletInTx as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'w1', balance: 50 } as never);
    mockPrisma.withdrawalRequest.findUnique.mockResolvedValue({ id: 'wr1', userId: 'u1', amount: 100, status: 'pending' } as never);

    await expect(approveWithdrawal('wr1', 'admin1')).rejects.toThrow('余额不足，自动转 rejected');
    expect(txMock.withdrawalRequest.update).toHaveBeenCalledWith({
      where: { id: 'wr1' },
      data: expect.objectContaining({ status: 'rejected', reason: '余额不足' }),
    });
  });

  it('余额足 → 扣减 + WalletTransaction + AuditLog + 标 approved', async () => {
    const txMock = {
      withdrawalRequest: { findUnique: mockPrisma.withdrawalRequest.findUnique, update: vi.fn().mockResolvedValue({}) },
      wallet: { update: vi.fn().mockResolvedValue({}) },
      walletTransaction: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    mockPrisma.$transaction.mockImplementation(async (cb) => cb(txMock as never));
    const { walletRepo } = await import('../../../src/modules/wallet/wallet.repo.js');
    (walletRepo.ensureWalletInTx as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'w1', balance: 500 } as never);
    mockPrisma.withdrawalRequest.findUnique.mockResolvedValue({ id: 'wr1', userId: 'u1', amount: 100, status: 'pending' } as never);

    const r = await approveWithdrawal('wr1', 'admin1');
    expect(r.status).toBe('approved');
    expect(txMock.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balance: { decrement: 100 } },
    });
    expect(txMock.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', type: 'withdraw', amount: -100 }),
    });
    expect(txMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'approveWithdrawal', target: 'wr1' }),
    });
  });
});

describe('admin.service · rejectWithdrawal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('标 rejected + reason + AuditLog', async () => {
    mockPrisma.withdrawalRequest.findUnique.mockResolvedValue({ id: 'wr1', userId: 'u1', amount: 100, status: 'pending' } as never);
    mockPrisma.withdrawalRequest.update.mockResolvedValue({ id: 'wr1', status: 'rejected' } as never);

    const r = await rejectWithdrawal('wr1', '信息不符', 'admin1');
    expect(r.status).toBe('rejected');
    expect(mockPrisma.withdrawalRequest.update).toHaveBeenCalledWith({
      where: { id: 'wr1' },
      data: expect.objectContaining({ status: 'rejected', reason: '信息不符', processedBy: 'admin1' }),
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'rejectWithdrawal', target: 'wr1' }),
    });
  });
});

// ===== V0.1.107 GAP-6 自提核销 =====

describe('admin.service · confirmPickup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pickupCode 无效 → 404', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    await expect(confirmPickup('INVALID1', 'admin1')).rejects.toThrow('核销码无效');
  });

  it('已核销 → 400', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'o1', userId: 'u1', status: 'paid',
      pickupCode: 'ABC123X7K', pickupConfirmedAt: new Date(), pickupExpiresAt: null,
    } as never);
    await expect(confirmPickup('ABC123X7K', 'admin1')).rejects.toThrow('已核销');
  });

  it('订单未支付 → 400', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'o1', userId: 'u1', status: 'pending_pay',
      pickupCode: 'ABC123X7K', pickupConfirmedAt: null, pickupExpiresAt: null,
    } as never);
    await expect(confirmPickup('ABC123X7K', 'admin1')).rejects.toThrow('订单未支付');
  });

  it('核销成功 → update + AuditLog', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'o1', userId: 'u1', status: 'paid',
      pickupCode: 'ABC123X7K', pickupConfirmedAt: null, pickupExpiresAt: null,
    } as never);
    mockPrisma.order.update.mockResolvedValue({
      id: 'o1', pickupConfirmedAt: new Date('2026-07-10'),
    } as never);

    const r = await confirmPickup('ABC123X7K', 'admin1');
    expect(r.orderId).toBe('o1');
    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: expect.objectContaining({ pickupConfirmedBy: 'admin1' }),
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'confirmPickup', target: 'o1' }),
    });
  });
});

// ===== V0.1.108 GAP-6 结算单导出 =====

describe('admin.service · exportSettlement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('返回 CSV 表头 + 数据行（含 BOM）', async () => {
    mockPrisma.distributionOrder.findMany.mockResolvedValue([
      {
        id: 'd1', userId: 'u1', orderId: 'o1', orderAmount: 100, commissionAmount: 15,
        commissionRate: 0.15, status: 'settled', settledAt: new Date('2026-07-15'),
        user: { id: 'u1', nickname: '跑友A', inviteCode: 'ABC123', distributorLevel: 'V2' },
      },
      {
        id: 'd2', userId: 'u2', orderId: 'o2', orderAmount: 200, commissionAmount: 20,
        commissionRate: 0.1, status: 'settled', settledAt: new Date('2026-07-20'),
        user: { id: 'u2', nickname: '跑友B', inviteCode: 'XYZ789', distributorLevel: 'V1' },
      },
    ] as never);
    mockPrisma.commissionLog.groupBy.mockResolvedValue([
      { userId: 'u1', _sum: { amount: 500 } },
      { userId: 'u2', _sum: { amount: 100 } },
    ] as never);

    const csv = await exportSettlement({ yearMonth: '2026-07' }, 'admin1');
    // BOM 开头
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    // 表头
    expect(csv).toContain('userId,nickname,inviteCode,distributorLevel,monthOrderCount,monthCommission,totalCommission');
    // 数据行
    expect(csv).toContain('u1,跑友A,ABC123,V2,1,15.00,500.00');
    expect(csv).toContain('u2,跑友B,XYZ789,V1,1,20.00,100.00');
    // AuditLog
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'exportSettlement', target: '2026-07' }),
    });
  });

  it('本月无结算订单 → 仅表头', async () => {
    mockPrisma.distributionOrder.findMany.mockResolvedValue([] as never);
    mockPrisma.commissionLog.groupBy.mockResolvedValue([] as never);

    const csv = await exportSettlement({ yearMonth: '2026-07' }, 'admin1');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('userId,nickname');
  });

  it('按 monthCommission 降序', async () => {
    mockPrisma.distributionOrder.findMany.mockResolvedValue([
      {
        id: 'd1', userId: 'u_small', orderId: 'o1', orderAmount: 50, commissionAmount: 5,
        status: 'settled', settledAt: new Date('2026-07-10'),
        user: { id: 'u_small', nickname: '小单', inviteCode: 'A1', distributorLevel: 'V0' },
      },
      {
        id: 'd2', userId: 'u_big', orderId: 'o2', orderAmount: 500, commissionAmount: 100,
        status: 'settled', settledAt: new Date('2026-07-15'),
        user: { id: 'u_big', nickname: '大单', inviteCode: 'A2', distributorLevel: 'V3' },
      },
    ] as never);
    mockPrisma.commissionLog.groupBy.mockResolvedValue([] as never);

    const csv = await exportSettlement({ yearMonth: '2026-07' }, 'admin1');
    const lines = csv.split('\n');
    const dataLines = lines.slice(1);
    // u_big 应该在前（100 > 5）
    expect(dataLines[0]).toContain('u_big');
    expect(dataLines[1]).toContain('u_small');
  });
});

// ===== V0.1.117 评价回复 =====
describe('admin.service · addReviewReply', () => {
  it('评价不存在 → notFound', async () => {
    mockPrisma.review.findUnique.mockResolvedValue(null);
    await expect(addReviewReply({ reviewId: 'r1', content: '回复' })).rejects.toThrow('评价不存在');
  });

  it('成功回复 → review.update replyContent/repliedAt', async () => {
    mockPrisma.review.findUnique.mockResolvedValue({ id: 'r1' } as never);
    mockPrisma.review.update.mockResolvedValue({} as never);
    const result = await addReviewReply({ reviewId: 'r1', content: '感谢评价' });
    expect(result).toEqual({ ok: true });
    expect(mockPrisma.review.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({ replyContent: '感谢评价', repliedAt: expect.any(Date) }),
    });
  });
});

// ============================================================
// V0.1.134 admin.submitRaceResult
// ============================================================

describe('admin.service · submitRaceResult (V0.1.134)', () => {
  beforeEach(() => {
    // 默认 admin 在白名单
    mockPrisma.appConfig.findUnique.mockResolvedValue({
      value: { openids: ['admin1'] },
    } as never);
  });

  it('正常录入（admin 鉴权 + upsert + AuditLog）', async () => {
    mockPrisma.enrollment.findUnique.mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      contentId: 'c1',
      content: { id: 'c1', type: 'marathon', detail: { distanceKm: 42 } },
    } as never);
    mockPrisma.raceResult.upsert.mockResolvedValue({
      id: 'r1',
      enrollmentId: 'e1',
      userId: 'u1',
      contentId: 'c1',
      finishTimeSec: 12600,
      paceSecPerKm: 300,
      rank: 1,
      bibNumber: 'A001',
      finisherPhotoUrl: null,
      source: 'admin_input',
      createdAt: new Date('2026-07-12T10:00:00Z'),
      updatedAt: new Date('2026-07-12T10:00:00Z'),
    } as never);

    const r = await submitRaceResult('admin1', {
      enrollmentId: 'e1',
      finishTimeSec: 12600,
      rank: 1,
      bibNumber: 'A001',
    });

    expect(r.id).toBe('r1');
    expect(r.source).toBe('admin_input');
    expect(r.rank).toBe(1);
    expect(mockPrisma.raceResult.upsert).toHaveBeenCalled();
  });

  it('非 admin 鉴权失败', async () => {
    await expect(
      submitRaceResult('not-admin', {
        enrollmentId: 'e1',
        finishTimeSec: 12600,
      }),
    ).rejects.toThrow();
  });
});

// ============================================================
// V0.1.134 admin.listEnrollmentsByContent
// ============================================================

describe('admin.service · listEnrollmentsByContent (V0.1.134)', () => {
  beforeEach(() => {
    mockPrisma.appConfig.findUnique.mockResolvedValue({
      value: { openids: ['admin1'] },
    } as never);
  });

  it('正常返（含 user + raceResult 关联）', async () => {
    mockPrisma.enrollment.findMany.mockResolvedValue([
      { id: 'e1', userId: 'u1', contentId: 'c1', status: 'confirmed' },
      { id: 'e2', userId: 'u2', contentId: 'c1', status: 'confirmed' },
    ] as never);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u1', nickname: '张三', avatarUrl: 'http://x/1.jpg' },
      { id: 'u2', nickname: '李四', avatarUrl: null },
    ] as never);
    mockPrisma.raceResult.findMany.mockResolvedValue([
      {
        id: 'r1',
        enrollmentId: 'e1',
        userId: 'u1',
        contentId: 'c1',
        finishTimeSec: 12600,
        paceSecPerKm: 300,
        rank: 1,
        bibNumber: 'A001',
        finisherPhotoUrl: null,
        source: 'admin_input',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);

    const r = await listEnrollmentsByContent('admin1', 'c1');
    expect(r.enrollments).toHaveLength(2);
    expect(r.enrollments[0].user.nickname).toBe('张三');
    expect(r.enrollments[0].raceResult?.rank).toBe(1);
    expect(r.enrollments[1].raceResult).toBeNull();
  });

  it('空数据 → enrollments: []', async () => {
    mockPrisma.enrollment.findMany.mockResolvedValue([]);
    const r = await listEnrollmentsByContent('admin1', 'c1');
    expect(r.enrollments).toEqual([]);
  });

  it('非 admin 鉴权失败', async () => {
    await expect(listEnrollmentsByContent('not-admin', 'c1')).rejects.toThrow();
  });
});

// ===== V0.1.150 上传记录管理 =====
describe('listUploads / retryParse (V0.1.150)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.uploadRecord.findMany.mockResolvedValue([
      { id: 'r1', type: 'coros_fit', createdAt: new Date(), user: { nickname: 'n' } },
    ]);
    mockPrisma.uploadRecord.count.mockResolvedValue(1);
    mockPrisma.uploadRecord.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1' });
    mockPrisma.uploadRecord.update.mockResolvedValue({});
  });

  it('listUploads 分页 + total + include user', async () => {
    const r = await listUploads({ type: 'coros_fit', page: 1, pageSize: 20 });
    expect(r.total).toBe(1);
    expect(r.list[0]).toHaveProperty('user');
  });

  it('retryParse 记录不存在 → notFound', async () => {
    mockPrisma.uploadRecord.findUnique.mockResolvedValue(null);
    await expect(retryParse({ id: 'x' })).rejects.toThrow();
  });

  it('retryParse 重置 pending + 入队', async () => {
    await retryParse({ id: 'r1' });
    expect(mockPrisma.uploadRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: { status: 'pending', errorMsg: null } }),
    );
    expect(mockEnqueueUploadParse).toHaveBeenCalledWith('r1');
  });
});

// ===== V0.2.49 补测：6 个未测函数（1196-1323 段，V0.2.6/V0.2.8 后加 action）=====

describe('admin.service · adjustPoints（V0.2.6 手动调积分）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('事务调 addPoints + recordAudit + Cache.del user:me + 返 points', async () => {
    mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
    mockPrisma.auditLog.create.mockResolvedValue({ id: 1n });
    mockPrisma.user.findUnique.mockResolvedValue({ points: 200 });

    const res = await adjustPoints({ userId: 'u1', change: 50, reason: '活动奖励' }, 'admin1', '1.2.3.4');

    expect(userRepo.addPoints).toHaveBeenCalledWith(mockPrisma, 'u1', 50, 'admin_adjust');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'admin.adjustPoints', target: 'u1', actorOpenid: 'admin1' }),
      }),
    );
    expect(Cache.del).toHaveBeenCalledWith('user:me:u1');
    expect(res).toEqual({ ok: true, userId: 'u1', points: 200 });
  });
});

describe('admin.service · grantMember（V0.2.6 赠送会员）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('事务调 extendMember + recordAudit + 返 memberExpireAt ISO', async () => {
    mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
    mockPrisma.auditLog.create.mockResolvedValue({ id: 1n });
    const expire = new Date('2026-12-31T00:00:00Z');
    mockPrisma.user.findUnique.mockResolvedValue({ memberExpireAt: expire });

    const res = await grantMember({ userId: 'u1', days: 30 }, 'admin1');

    expect(userRepo.extendMember).toHaveBeenCalledWith(mockPrisma, 'u1', 30);
    expect(Cache.del).toHaveBeenCalledWith('user:me:u1');
    expect(res).toEqual({ ok: true, userId: 'u1', memberExpireAt: expire.toISOString() });
  });
});

describe('admin.service · listInviteStats（V0.2.6 邀请统计）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('team.groupBy 2 次（分页+总数）+ user 关联 + 分页结构', async () => {
    mockPrisma.team.groupBy
      .mockResolvedValueOnce([{ inviterId: 'u1', _count: { _all: 5, inviterId: 5 } }])
      .mockResolvedValueOnce([{ inviterId: 'u1' }, { inviterId: 'u2' }]); // 总数 = 2 个邀请人
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u1', nickname: 'A', avatarUrl: null, inviteCode: 'C1', distributorLevel: 'V1' },
    ]);

    const res = await listInviteStats({ page: 1, pageSize: 10 });

    expect(mockPrisma.team.groupBy).toHaveBeenCalledTimes(2);
    expect(res.total).toBe(2);
    expect(res.page).toBe(1);
    expect(res.list[0]).toEqual(
      expect.objectContaining({ id: 'u1', nickname: 'A', inviteCount: 5 }),
    );
  });

  it('未关联 user 的邀请人 → 兜底默认值（nickname null / distributorLevel V0）', async () => {
    mockPrisma.team.groupBy
      .mockResolvedValueOnce([{ inviterId: 'ghost', _count: { _all: 1, inviterId: 1 } }])
      .mockResolvedValueOnce([{ inviterId: 'ghost' }]);
    mockPrisma.user.findMany.mockResolvedValue([]); // 无关联用户

    const res = await listInviteStats({ page: 1, pageSize: 10 });
    expect(res.list[0]).toEqual(
      expect.objectContaining({ id: 'ghost', nickname: null, distributorLevel: 'V0', inviteCount: 1 }),
    );
  });
});

describe('admin.service · createAdmin（V0.2.8）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('用户名已存在 → badRequest', async () => {
    mockPrisma.admin.findUnique.mockResolvedValue({ id: 'a1', username: 'root' });
    await expect(createAdmin({ username: 'root', password: 'x', role: 'admin' })).rejects.toThrow(BusinessError);
    expect(mockPrisma.admin.create).not.toHaveBeenCalled();
  });

  it('happy → bcrypt + create 返 id/username/role', async () => {
    mockPrisma.admin.findUnique.mockResolvedValue(null);
    mockPrisma.admin.create.mockResolvedValue({ id: 'a2', username: 'op1', role: 'operator' });

    const res = await createAdmin({ username: 'op1', password: 'secret', role: 'operator', nickname: 'Op' });

    expect(res).toEqual({ id: 'a2', username: 'op1', role: 'operator' });
    expect(mockPrisma.admin.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: 'op1', role: 'operator', nickname: 'Op', passwordHash: expect.any(String),
        }),
      }),
    );
  });
});

describe('admin.service · updateAdmin（V0.2.8）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('多字段可选 → update data 含 role/nickname/disabled', async () => {
    mockPrisma.admin.update.mockResolvedValue({ id: 'a1', username: 'root', role: 'super-admin' });
    await updateAdmin({ id: 'a1', role: 'admin', nickname: 'Root', disabled: false });
    expect(mockPrisma.admin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({ role: 'admin', nickname: 'Root', disabled: false }),
      }),
    );
  });

  it('password → bcrypt passwordHash', async () => {
    mockPrisma.admin.update.mockResolvedValue({ id: 'a1', username: 'root', role: 'super-admin' });
    await updateAdmin({ id: 'a1', password: 'newpass' });
    expect(mockPrisma.admin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: expect.any(String) }),
      }),
    );
  });
});

describe('admin.service · adminLoginLogs（V0.2.8）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('分页 + include admin + createdAt ISO 序列化', async () => {
    const ts = new Date('2026-07-21T10:00:00Z');
    mockPrisma.adminLoginLog.findMany.mockResolvedValue([
      { id: 'l1', adminId: 'a1', ok: true, createdAt: ts, admin: { username: 'root', nickname: 'Root' } },
    ]);
    mockPrisma.adminLoginLog.count.mockResolvedValue(1);

    const res = await adminLoginLogs({ page: 1, pageSize: 20 });

    expect(res.total).toBe(1);
    expect(res.list[0].createdAt).toBe(ts.toISOString());
    expect(mockPrisma.adminLoginLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { admin: { select: { username: true, nickname: true } } },
      }),
    );
  });

  it('默认 page=1 / pageSize=20', async () => {
    mockPrisma.adminLoginLog.findMany.mockResolvedValue([]);
    mockPrisma.adminLoginLog.count.mockResolvedValue(0);
    const res = await adminLoginLogs();
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(20);
  });
});