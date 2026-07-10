/**
 * jobs/ 单测（V0.1.110 GAP-3.3）
 *
 * 覆盖：
 * - refresh-certs: fetchPlatformCerts 返回 serials
 * - close-order: order 不存在 / 非 pending_pay 跳过 / 正常关闭 + 退积分
 * - ludong-sync: flushOutbox 返回 flushed/dead/failed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    order: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('src/common/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('src/modules/wxpay/wxpay.service.js', () => ({ fetchPlatformCerts: vi.fn() }));
vi.mock('src/modules/ludong/ludong.service.js', () => ({ ludongService: { flushOutbox: vi.fn() } }));
vi.mock('src/modules/user/user.repository.js', () => ({ userRepo: { addPoints: vi.fn() } }));

import { prisma } from 'src/infra/prisma.js';
import { fetchPlatformCerts } from 'src/modules/wxpay/wxpay.service.js';
import { ludongService } from 'src/modules/ludong/ludong.service.js';
import { processRefreshPlatformCerts } from 'src/jobs/refresh-certs.job.js';
import { processCloseOrder } from 'src/jobs/close-order.job.js';
import { processLudongSync } from 'src/jobs/ludong-sync.job.js';

const mockedPrisma = vi.mocked(prisma);
const mockedFetchPlatformCerts = vi.mocked(fetchPlatformCerts);
const mockedFlushOutbox = vi.mocked(ludongService.flushOutbox);

beforeEach(() => vi.clearAllMocks());

// ===== refresh-certs =====

describe('processRefreshPlatformCerts', () => {
  it('返 serials 列表', async () => {
    mockedFetchPlatformCerts.mockResolvedValue(['cert1', 'cert2'] as never);
    const r = await processRefreshPlatformCerts();
    expect(r.serials).toEqual(['cert1', 'cert2']);
  });

  it('空 serials', async () => {
    mockedFetchPlatformCerts.mockResolvedValue([] as never);
    const r = await processRefreshPlatformCerts();
    expect(r.serials).toEqual([]);
  });
});

// ===== close-order =====

describe('processCloseOrder', () => {
  it('order 不存在 → not_found', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue(null);
    const r = await processCloseOrder({ orderId: 'o1' });
    expect(r.closed).toBe(false);
    expect(r.reason).toBe('not_found');
  });

  it('order.status !== pending_pay → 跳过', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'u1', status: 'paid', pointsUsed: 0 } as never);
    const r = await processCloseOrder({ orderId: 'o1' });
    expect(r.closed).toBe(false);
    expect(r.reason).toBe('not_pending_pay(paid)');
  });

  it('正常关闭 + 退积分', async () => {
    const txMock = { order: { update: vi.fn() } };
    mockedPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'u1', status: 'pending_pay', pointsUsed: 50 } as never);
    mockedPrisma.$transaction.mockImplementation(async (cb) => cb(txMock as never));

    const { userRepo } = await import('src/modules/user/user.repository.js');
    (userRepo.addPoints as ReturnType<typeof vi.fn>).mockResolvedValue({} as never);

    const r = await processCloseOrder({ orderId: 'o1' });
    expect(r.closed).toBe(true);
    expect(r.reason).toBe('timeout');
    expect(userRepo.addPoints).toHaveBeenCalledWith(txMock, 'u1', 50, 'order_deduct', 'o1');
    expect(txMock.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { status: 'cancelled' },
    });
  });

  it('pointsUsed=0 不退积分', async () => {
    const txMock = { order: { update: vi.fn() } };
    mockedPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'u1', status: 'pending_pay', pointsUsed: 0 } as never);
    mockedPrisma.$transaction.mockImplementation(async (cb) => cb(txMock as never));

    const { userRepo } = await import('src/modules/user/user.repository.js');
    (userRepo.addPoints as ReturnType<typeof vi.fn>).mockResolvedValue({} as never);

    await processCloseOrder({ orderId: 'o1' });
    expect(userRepo.addPoints).not.toHaveBeenCalled();
  });
});

// ===== ludong-sync =====

describe('processLudongSync', () => {
  it('返 flushed/dead/failed', async () => {
    mockedFlushOutbox.mockResolvedValue({ flushed: 5, dead: 0, failed: 0 } as never);
    const r = await processLudongSync();
    expect(r.flushed).toBe(5);
    expect(r.dead).toBe(0);
    expect(r.failed).toBe(0);
  });
});
