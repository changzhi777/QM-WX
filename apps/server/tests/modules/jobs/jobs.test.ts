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
    rawActivity: { findFirst: vi.fn(), update: vi.fn() },
    checkin: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('src/common/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('src/modules/wxpay/wxpay.service.js', () => ({ fetchPlatformCerts: vi.fn() }));
vi.mock('src/modules/ludong/ludong.service.js', () => ({ ludongService: { flushOutbox: vi.fn() } }));
vi.mock('src/modules/user/user.repository.js', () => ({ userRepo: { addPoints: vi.fn() } }));
vi.mock('src/infra/cache.js', () => ({ Cache: { delByPattern: vi.fn() } }));
vi.mock('src/jobs/queue.js', () => ({ weeklyReportQueue: { add: vi.fn() } }));

import { prisma } from 'src/infra/prisma.js';
import { fetchPlatformCerts } from 'src/modules/wxpay/wxpay.service.js';
import { ludongService } from 'src/modules/ludong/ludong.service.js';
import { Cache } from 'src/infra/cache.js';
import { weeklyReportQueue } from 'src/jobs/queue.js';
import { processRefreshPlatformCerts } from 'src/jobs/refresh-certs.job.js';
import { processCloseOrder } from 'src/jobs/close-order.job.js';
import { processLudongSync } from 'src/jobs/ludong-sync.job.js';
import { processGarminImport } from 'src/jobs/garmin-import.job.js';
import { runWeeklyReportScheduler } from 'src/jobs/scheduler.js';

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

// ===== V0.1.111 GAP-3.4 garmin-import =====

describe('processGarminImport', () => {
  it('activity not_found → results 含 reason=not_found', async () => {
    mockedPrisma.rawActivity.findFirst.mockResolvedValue(null);
    const r = await processGarminImport({ userId: 'u1', activityIds: ['a1'] });
    expect(r.ok).toBe(0);
    expect(r.fail).toBe(1);
    expect(r.results[0].reason).toBe('not_found');
  });

  it('already_imported → skip + reason', async () => {
    mockedPrisma.rawActivity.findFirst.mockResolvedValue({
      id: 'a1', userId: 'u1', type: 'running',
      distanceMeters: 5000, durationSec: 1800, startTime: new Date('2026-07-10'),
      status: 'imported',
    } as never);
    const r = await processGarminImport({ userId: 'u1', activityIds: ['a1'] });
    expect(r.results[0].reason).toBe('already_imported');
  });

  it('invalid_data (distKm=0) → 标 ignored + reason', async () => {
    mockedPrisma.rawActivity.findFirst.mockResolvedValue({
      id: 'a1', userId: 'u1', type: 'running',
      distanceMeters: 0, durationSec: 1800, startTime: new Date('2026-07-10'),
      status: 'pending',
    } as never);
    mockedPrisma.rawActivity.update.mockResolvedValue({} as never);
    const r = await processGarminImport({ userId: 'u1', activityIds: ['a1'] });
    expect(r.results[0].reason).toBe('invalid_data');
    expect(mockedPrisma.rawActivity.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { status: 'ignored' },
    });
  });

  it('正常导入 → 事务内 create Checkin + update RawActivity + 清缓存', async () => {
    const txMock = { checkin: { create: vi.fn() }, rawActivity: { update: vi.fn() } };
    mockedPrisma.rawActivity.findFirst.mockResolvedValue({
      id: 'a1', userId: 'u1', type: 'running',
      distanceMeters: 5000, durationSec: 1800, startTime: new Date('2026-07-10'),
      avgHr: 150, cadence: 80, status: 'pending',
    } as never);
    mockedPrisma.$transaction.mockImplementation(async (cb) => cb(txMock as never));
    txMock.checkin.create.mockResolvedValue({ id: 'c1' } as never);

    const r = await processGarminImport({ userId: 'u1', activityIds: ['a1'] });
    expect(r.ok).toBe(1);
    expect(r.results[0].ok).toBe(true);
    expect(txMock.checkin.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', distance: 5, dataSource: 'garmin', garminActivityId: 'a1' }),
    });
    expect(txMock.rawActivity.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: expect.objectContaining({ status: 'imported', importCheckinId: 'c1' }),
    });
    // 缓存清理
    expect(Cache.delByPattern).toHaveBeenCalledWith('ranking:*');
    expect(Cache.delByPattern).toHaveBeenCalledWith('stats:*');
    expect(Cache.delByPattern).toHaveBeenCalledWith('sport:groupRanking:*');
  });

  it('事务抛错 → fail + reason=error message', async () => {
    mockedPrisma.rawActivity.findFirst.mockResolvedValue({
      id: 'a1', userId: 'u1', type: 'running',
      distanceMeters: 5000, durationSec: 1800, startTime: new Date('2026-07-10'),
      status: 'pending',
    } as never);
    mockedPrisma.$transaction.mockImplementation(async () => {
      throw new Error('unique constraint violation');
    });

    const r = await processGarminImport({ userId: 'u1', activityIds: ['a1'] });
    expect(r.ok).toBe(0);
    expect(r.fail).toBe(1);
    expect(r.results[0].reason).toBe('unique constraint violation');
  });
});

// ===== V0.1.111 GAP-3.4 scheduler =====

describe('runWeeklyReportScheduler', () => {
  it('dev 模式 (prod=false) → 跳过不入队', async () => {
    await runWeeklyReportScheduler(false);
    expect(weeklyReportQueue.add).not.toHaveBeenCalled();
  });

  it('prod 模式 + 时间不符 → 跳过不入队', async () => {
    // 假设当前是周三 15:00（不是周日 20:00）
    vi.setSystemTime(new Date('2026-07-08T07:00:00Z')); // UTC 周三 7:00 = 北京周三 15:00
    await runWeeklyReportScheduler(true);
    expect(weeklyReportQueue.add).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('prod 模式 + 周日 20:00 (CN) → 入队 + 去重', async () => {
    // UTC 周日 12:01 = 北京周日 20:01 → 分钟 < 2 ✓
    vi.setSystemTime(new Date('2026-07-12T12:01:00Z'));
    (weeklyReportQueue.add as ReturnType<typeof vi.fn>).mockResolvedValue({} as never);

    await runWeeklyReportScheduler(true);
    expect(weeklyReportQueue.add).toHaveBeenCalledWith(
      'generate-all',
      { period: 'current' },
      expect.objectContaining({ jobId: expect.stringContaining('auto-2026-07-12-weekly-report') }),
    );

    // 同一天再调 → 跳过（去重）
    (weeklyReportQueue.add as ReturnType<typeof vi.fn>).mockClear();
    await runWeeklyReportScheduler(true);
    expect(weeklyReportQueue.add).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
