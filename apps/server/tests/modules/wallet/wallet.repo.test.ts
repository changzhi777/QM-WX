/**
 * wallet repo 单元测试
 *
 * 覆盖：
 * - ensureWallet（事务外）：已存在 / 不存在 → create
 * - ensureWalletInTx（事务内）：已存在 / 不存在 → create
 *
 * 沿用 createPrismaMock 工厂 — tx 共享同一组 wallet mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaMock } from '../../helpers/mockPrisma.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['wallet'],
    txModels: ['wallet'],
  });
});

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));

import { walletRepo } from '../../../src/modules/wallet/wallet.repo.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation((fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
});

describe('walletRepo.ensureWallet（事务外）', () => {
  it('已存在 → 直接返回，不创建', async () => {
    mocks.prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1' });
    const result = await walletRepo.ensureWallet('u1');
    expect(result).toEqual({ id: 'w1', userId: 'u1' });
    expect(mocks.prisma.wallet.create).not.toHaveBeenCalled();
    expect(mocks.prisma.wallet.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('不存在 → 创建空钱包', async () => {
    mocks.prisma.wallet.findUnique.mockResolvedValue(null);
    mocks.prisma.wallet.create.mockResolvedValue({ id: 'w2', userId: 'u1', balance: 0, status: 'active' });
    const result = await walletRepo.ensureWallet('u1');
    expect(mocks.prisma.wallet.create).toHaveBeenCalledWith({
      data: { userId: 'u1', balance: 0, status: 'active' },
    });
    expect(result).toEqual({ id: 'w2', userId: 'u1', balance: 0, status: 'active' });
  });
});

describe('walletRepo.ensureWalletInTx（事务内）', () => {
  it('已存在 → 直接返回（不调顶层 prisma）', async () => {
    mocks.tx.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1' });
    const result = await walletRepo.ensureWalletInTx(mocks.tx as never, 'u1');
    expect(result).toEqual({ id: 'w1', userId: 'u1' });
    expect(mocks.tx.wallet.create).not.toHaveBeenCalled();
    // 关键：不应走顶层 prisma
    expect(mocks.prisma.wallet.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.wallet.create).not.toHaveBeenCalled();
  });

  it('不存在 → 在 tx 内创建', async () => {
    mocks.tx.wallet.findUnique.mockResolvedValue(null);
    mocks.tx.wallet.create.mockResolvedValue({ id: 'w3', userId: 'u2', balance: 0, status: 'active' });
    const result = await walletRepo.ensureWalletInTx(mocks.tx as never, 'u2');
    expect(mocks.tx.wallet.create).toHaveBeenCalledWith({
      data: { userId: 'u2', balance: 0, status: 'active' },
    });
    expect(result).toEqual({ id: 'w3', userId: 'u2', balance: 0, status: 'active' });
    // 仍不应走顶层 prisma
    expect(mocks.prisma.wallet.findUnique).not.toHaveBeenCalled();
  });
});
