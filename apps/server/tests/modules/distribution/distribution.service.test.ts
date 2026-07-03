/**
 * distribution.service 单测（V0.1.24 分销中心）
 * - computeLevel / levelRate：等级规则纯函数
 * - ensureInviteCode：有 current 直返 / 无则 updateMany 生成
 * - mySummary / myLevel：聚合查询
 * - settleCommission：pending 0 佣金直标 settled / 有佣金入账 / 非 pending 跳过
 * - clawbackCommission：pending 取消 / settled 冲红 / cancelled 跳过
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    distributionOrder: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    team: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    commissionLog: { aggregate: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
}));
vi.mock('src/modules/wallet/wallet.repo.js', () => ({
  walletRepo: { ensureWalletInTx: vi.fn().mockResolvedValue({ id: 'w1' }) },
}));

import { prisma } from 'src/infra/prisma.js';
import { walletRepo } from 'src/modules/wallet/wallet.repo.js';
import {
  computeLevel,
  levelRate,
  ensureInviteCode,
  distributionService,
  settleCommission,
  clawbackCommission,
} from 'src/modules/distribution/distribution.service.js';

const mockedPrisma = vi.mocked(prisma);
const mockedWalletRepo = vi.mocked(walletRepo);

beforeEach(() => vi.clearAllMocks());

describe('computeLevel / levelRate（纯函数）', () => {
  it('0 佣金 0 人 → V0', () => {
    expect(computeLevel(0, 0)).toBe('V0');
  });
  it('100 佣金 → V1（佣金线）', () => {
    expect(computeLevel(100, 0)).toBe('V1');
  });
  it('0 佣金 3 人 → V1（人数线）', () => {
    expect(computeLevel(0, 3)).toBe('V1');
  });
  it('500 佣金 10 人 → V2', () => {
    expect(computeLevel(500, 10)).toBe('V2');
  });
  it('2000 佣金 → V3', () => {
    expect(computeLevel(2000, 0)).toBe('V3');
  });
  it('levelRate V0/V1/V2/V3', () => {
    expect(levelRate('V0')).toBe(0);
    expect(levelRate('V1')).toBe(0.1);
    expect(levelRate('V2')).toBe(0.15);
    expect(levelRate('V3')).toBe(0.2);
  });
});

describe('ensureInviteCode', () => {
  it('current 有值直接返回', async () => {
    const code = await ensureInviteCode('u1', 'ABC123');
    expect(code).toBe('ABC123');
    expect(mockedPrisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('current 为空 → updateMany 生成（count>0）', async () => {
    mockedPrisma.user.updateMany.mockResolvedValue({ count: 1 } as never);
    const code = await ensureInviteCode('u1', null);
    expect(code).toHaveLength(6);
    expect(mockedPrisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', inviteCode: null },
      data: { inviteCode: code },
    });
  });
});

describe('distributionService.mySummary', () => {
  it('聚合本月佣金 + 销售 + 订单数 + 生成 inviteCode', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ inviteCode: 'XYZ789', distributorLevel: 'V1' } as never);
    mockedPrisma.commissionLog.aggregate.mockResolvedValue({ _sum: { amount: 88.5 } } as never);
    mockedPrisma.distributionOrder.aggregate.mockResolvedValue({ _sum: { orderAmount: 1000 } } as never);
    mockedPrisma.distributionOrder.count.mockResolvedValue(5 as never);

    const r = await distributionService.mySummary('u1');
    expect(r.monthCommission).toBe('88.50');
    expect(r.monthSales).toBe('1000.00');
    expect(r.orderCount).toBe(5);
    expect(r.inviteCode).toBe('XYZ789');
    expect(r.level).toBe('V1');
  });
});

describe('distributionService.myLevel', () => {
  it('当前 V1 + 有下一级 V2 进度', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ distributorLevel: 'V1' } as never);
    mockedPrisma.commissionLog.aggregate.mockResolvedValue({ _sum: { amount: 200 } } as never);
    mockedPrisma.team.count.mockResolvedValue(2 as never);

    const r = await distributionService.myLevel('u1');
    expect(r.current).toBe('V1');
    expect(r.next?.level).toBe('V2');
    expect(r.next?.needCommission).toBe('300.00'); // 500-200
    expect(r.next?.needTeam).toBe(8); // 10-2
  });
});

// ===== 集成函数 settleCommission / clawbackCommission =====

/** 构造 tx mock（Prisma.TransactionClient 子集） */
function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    distributionOrder: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    wallet: { update: vi.fn().mockResolvedValue({}) },
    walletTransaction: { create: vi.fn().mockResolvedValue({}) },
    commissionLog: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    team: { count: vi.fn().mockResolvedValue(0) },
    user: { update: vi.fn().mockResolvedValue({}) },
    ...overrides,
  } as unknown as import('@prisma/client').Prisma.TransactionClient;
}

describe('settleCommission', () => {
  it('无 DistrOrder → 安全返回', async () => {
    const tx = makeTx({ distributionOrder: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    await settleCommission(tx, 'o1');
    // 不抛错即通过
  });

  it('pending + 0 佣金 → 直标 settled（不碰钱包）', async () => {
    const tx = makeTx({
      distributionOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: 'd1', userId: 'u1', commissionAmount: 0, status: 'pending' }),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    await settleCommission(tx, 'o1');
    expect(mockedWalletRepo.ensureWalletInTx).not.toHaveBeenCalled();
  });

  it('pending + 有佣金 → 钱包入账 + CommissionLog + 等级重算', async () => {
    const tx = makeTx({
      distributionOrder: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'd1', userId: 'u1', commissionAmount: 10, status: 'pending',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    mockedWalletRepo.ensureWalletInTx.mockResolvedValue({ id: 'w1' } as never);

    await settleCommission(tx, 'o1');
    expect(mockedWalletRepo.ensureWalletInTx).toHaveBeenCalledWith(tx, 'u1');
    expect((tx.wallet.update as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect((tx.walletTransaction.create as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect((tx.commissionLog.create as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect((tx.user.update as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it('已 settled → 幂等跳过', async () => {
    const tx = makeTx({
      distributionOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: 'd1', status: 'settled', commissionAmount: 10, userId: 'u1' }),
        update: vi.fn(),
      },
    });
    await settleCommission(tx, 'o1');
    expect((tx.wallet.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

describe('clawbackCommission', () => {
  it('pending → 直 cancelled', async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = makeTx({
      distributionOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: 'd1', status: 'pending', userId: 'u1', commissionAmount: 10 }),
        update,
      },
    });
    await clawbackCommission(tx, 'o1');
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { status: 'cancelled' } });
    expect((tx.wallet.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('settled → 冲红（钱包扣减 + 负 log）', async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = makeTx({
      distributionOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: 'd1', status: 'settled', userId: 'u1', commissionAmount: 10 }),
        update,
      },
    });
    mockedWalletRepo.ensureWalletInTx.mockResolvedValue({ id: 'w1' } as never);

    await clawbackCommission(tx, 'o1');
    expect((tx.wallet.update as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    const logArgs = (tx.commissionLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(logArgs.data.amount).toBe(-10);
    expect(logArgs.data.type).toBe('clawback');
  });

  it('已 cancelled → 幂等跳过', async () => {
    const update = vi.fn();
    const tx = makeTx({
      distributionOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: 'd1', status: 'cancelled', userId: 'u1', commissionAmount: 10 }),
        update,
      },
    });
    await clawbackCommission(tx, 'o1');
    expect(update).not.toHaveBeenCalled();
  });
});
