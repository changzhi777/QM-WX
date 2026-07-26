/**
 * jobs/device-poll-cleanup.job.ts 单元测试
 *
 * 关键路径（V0.2.151 — 替代 V0.2.146-150 Mosquitto debug 5 次失败）：
 * - deleteMany where createdAt < now - 90 days
 * - 0 records 时不 log（避免 noise）
 * - > 0 records 时 log 包含 cutoff + deletedCount + retentionDays
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    deviceDailyActivity: {
      deleteMany: vi.fn(),
    },
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/logger.js', () => ({ logger: mocks.logger }));

async function loadJob() {
  const mod = await import('../../src/jobs/device-poll-cleanup.job.js');
  return mod.processDevicePollCleanup;
}

describe('V0.2.151 device-poll-cleanup — 删除 > 90 天 DeviceDailyActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('0 条记录 → 不 log（避免 noise），返 deletedCount=0 + 90 天前 cutoff', async () => {
    mocks.prisma.deviceDailyActivity.deleteMany.mockResolvedValue({ count: 0 });
    const processDevicePollCleanup = await loadJob();
    const r = await processDevicePollCleanup();
    expect(r.deletedCount).toBe(0);
    expect(r.cutoff).toBeInstanceOf(Date);
    // cutoff 应是 90 天前（误差 < 1s）
    const expected = Date.now() - 90 * 86_400_000;
    expect(Math.abs(r.cutoff.getTime() - expected)).toBeLessThan(1000);
    expect(mocks.logger.info).not.toHaveBeenCalled();
  });

  it('> 0 条记录 → log info 含 cutoff + deletedCount + retentionDays + 返 {deletedCount, cutoff}', async () => {
    mocks.prisma.deviceDailyActivity.deleteMany.mockResolvedValue({ count: 42 });
    const processDevicePollCleanup = await loadJob();
    const r = await processDevicePollCleanup();
    expect(r.deletedCount).toBe(42);
    expect(r.cutoff).toBeInstanceOf(Date);
    expect(mocks.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        cutoff: r.cutoff.toISOString(),
        deletedCount: 42,
        retentionDays: 90,
      }),
      'device-poll cleanup deleted old DeviceDailyActivity',
    );
  });
});