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
    distributionOrder: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    team: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    commissionLog: { aggregate: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    wallet: { update: vi.fn() },
    walletTransaction: { create: vi.fn() },
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
    commissionLog: {
      findFirst: vi.fn().mockResolvedValue(null), // 默认无 lastLog/无间推记录 → 间推逻辑跳过
      create: vi.fn().mockResolvedValue({}),
    },
    team: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null), // 默认无 Team 关系 → 间推逻辑跳过
    },
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

// ===== V0.1.105 GAP-6 间推佣金 =====

import {
  settleIndirectCommission,
  clawbackIndirectCommission,
  INDIRECT_COMMISSION_RATE,
} from 'src/modules/distribution/distribution.service.js';

describe('settleIndirectCommission（V0.1.105 间推佣金）', () => {
  it('无 DistrOrder → 安全返回', async () => {
    const tx = makeTx({ distributionOrder: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    await settleIndirectCommission(tx, 'o1');
    expect(mockedWalletRepo.ensureWalletInTx).not.toHaveBeenCalled();
  });

  it('直推上线有 grandfather → 间推入账（直推 10 → 间推 5，50%）', async () => {
    const tx = makeTx({
      distributionOrder: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'd1', userId: 'u1', commissionAmount: 10, status: 'settled',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      team: {
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockImplementation((args: { where: { inviteeId: string } }) => {
          if (args.where.inviteeId === 'u1') return Promise.resolve({ id: 't1', inviterId: 'grandpa', inviteeId: 'u1', level: 1, joinedAt: new Date() });
          return Promise.resolve(null);
        }),
      },
    });
    mockedWalletRepo.ensureWalletInTx.mockResolvedValue({ id: 'w_grandpa' } as never);

    await settleIndirectCommission(tx, 'o1');

    // 间推钱包入账应调用 ensureWalletInTx(tx, 'grandpa')
    expect(mockedWalletRepo.ensureWalletInTx).toHaveBeenCalledWith(tx, 'grandpa');
    // 间推金额 = 10 × 0.5 = 5
    const walletUpdate = (tx.wallet.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(walletUpdate.data.balance).toEqual({ increment: 5 });
    // commissionLog 应记录 type='settle_indirect' amount=5
    const logCall = (tx.commissionLog.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(logCall.data.userId).toBe('grandpa');
    expect(Number(logCall.data.amount)).toBe(5);
    expect(logCall.data.type).toBe('settle_indirect');
  });

  it('直推上线无 Team 关系 → 跳过（无 grandfather）', async () => {
    const tx = makeTx({
      distributionOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: 'd1', userId: 'u1', commissionAmount: 10, status: 'settled' }),
        update: vi.fn(),
      },
      team: { count: vi.fn().mockResolvedValue(0), findUnique: vi.fn().mockResolvedValue(null) },
    });
    await settleIndirectCommission(tx, 'o1');
    expect(mockedWalletRepo.ensureWalletInTx).not.toHaveBeenCalled();
  });

  it('直推金额 0 → 间推金额 0 跳过', async () => {
    const tx = makeTx({
      distributionOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: 'd1', userId: 'u1', commissionAmount: 0, status: 'settled' }),
        update: vi.fn(),
      },
      team: {
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue({ id: 't1', inviterId: 'grandpa', inviteeId: 'u1', level: 1, joinedAt: new Date() }),
      },
    });
    await settleIndirectCommission(tx, 'o1');
    expect(mockedWalletRepo.ensureWalletInTx).not.toHaveBeenCalled();
  });

  it('幂等：CommissionLog type=settle_indirect 已存在 → 跳过', async () => {
    const tx = makeTx({
      distributionOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: 'd1', userId: 'u1', commissionAmount: 10, status: 'settled' }),
        update: vi.fn(),
      },
      commissionLog: {
        findFirst: vi.fn().mockImplementation((args: { where: { type?: string } }) => {
          if (args.where.type === 'settle_indirect') return Promise.resolve({ id: 'l1' });
          return Promise.resolve(null);
        }),
        create: vi.fn(),
      },
    });
    await settleIndirectCommission(tx, 'o1');
    expect(mockedWalletRepo.ensureWalletInTx).not.toHaveBeenCalled();
  });
});

describe('clawbackIndirectCommission（V0.1.105 间推冲红）', () => {
  it('无 settle_indirect 记录 → 跳过', async () => {
    const tx = makeTx({
      commissionLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });
    await clawbackIndirectCommission(tx, 'o1');
    expect(mockedWalletRepo.ensureWalletInTx).not.toHaveBeenCalled();
  });

  it('有 settle_indirect 记录 → 钱包扣减 + clawback_indirect log', async () => {
    const tx = makeTx({
      commissionLog: {
        findFirst: vi.fn().mockImplementation((args: { where: { type?: string } }) => {
          if (args.where.type === 'settle_indirect') return Promise.resolve({ id: 'l_indirect', userId: 'grandpa', amount: 5 });
          if (args.where.type === 'clawback_indirect') return Promise.resolve(null); // 未冲红
          return Promise.resolve(null);
        }),
        create: vi.fn(),
      },
    });
    mockedWalletRepo.ensureWalletInTx.mockResolvedValue({ id: 'w_grandpa' } as never);

    await clawbackIndirectCommission(tx, 'o1');

    expect(mockedWalletRepo.ensureWalletInTx).toHaveBeenCalledWith(tx, 'grandpa');
    const walletUpdate = (tx.wallet.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(walletUpdate.data.balance).toEqual({ decrement: 5 });
    const createCalls = (tx.commissionLog.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls.length).toBeGreaterThan(0);
    const lastCreate = createCalls[createCalls.length - 1][0];
    expect(Number(lastCreate.data.amount)).toBe(-5);
    expect(lastCreate.data.type).toBe('clawback_indirect');
  });

  it('幂等：clawback_indirect 已存在 → 跳过', async () => {
    const tx = makeTx({
      commissionLog: {
        findFirst: vi.fn().mockImplementation((args: { where: { type?: string } }) => {
          if (args.where.type === 'clawback_indirect') return Promise.resolve({ id: 'l_clawback' });
          return Promise.resolve(null);
        }),
        create: vi.fn(),
      },
    });
    await clawbackIndirectCommission(tx, 'o1');
    expect(mockedWalletRepo.ensureWalletInTx).not.toHaveBeenCalled();
  });
});

describe('INDIRECT_COMMISSION_RATE 常量', () => {
  it('默认 50%（0.5）', () => {
    expect(INDIRECT_COMMISSION_RATE).toBe(0.5);
  });
});
