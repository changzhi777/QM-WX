/**
 * device.service 数据处理单测（2026-07-01 佳明跑者中心）
 *
 * 覆盖 4 方法（与 device.garmin.test.ts 查询分开）：
 * - myPending / myProcessed：列表 + sportType 映射 + 分页
 * - ignoreActivity：pending→ignored / imported 拒绝 / not found
 * - importToCheckin：BullMQ 入队 + 返 jobId（不直接导入）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    rawActivity: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('src/jobs/queue.js', () => ({
  enqueueGarminImport: vi.fn(),
}));

const _redisMockState = vi.hoisted(() => ({
  cacheStore: new Map<string, string>(),
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), scan: vi.fn() },
}));
vi.mock('src/infra/redis.js', () => ({ redis: _redisMockState.redis }));
vi.mock('src/config/env.js', () => ({
  env: { WX_APPID: 'test', WX_NOTIFY_URL: 'http://localhost', NODE_ENV: 'test' },
}));

function setupMockRedis() {
  const { cacheStore, redis } = _redisMockState;
  redis.get.mockImplementation(async (k: string) => cacheStore.get(k) ?? null);
  redis.set.mockImplementation(async (k: string, v: string) => {
    cacheStore.set(k, v);
    return 'OK';
  });
  redis.del.mockImplementation(async (k: string) => {
    const had = cacheStore.has(k);
    cacheStore.delete(k);
    return had ? 1 : 0;
  });
}

import { prisma } from 'src/infra/prisma.js';
import { enqueueGarminImport } from 'src/jobs/queue.js';
import { deviceService } from 'src/modules/device/device.service.js';

const mockedPrisma = vi.mocked(prisma);
const mockedEnqueue = vi.mocked(enqueueGarminImport);

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.cacheStore.clear();
  setupMockRedis();
});

describe('deviceService.myPending', () => {
  it('返回 pending 列表 + sportType 映射 + 分页', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValue([
      {
        id: 'a1', type: 'running', startTime: new Date('2026-07-01T00:00:00Z'),
        durationSec: 1800, distanceMeters: 5000, avgHr: 150,
      },
    ] as never);
    mockedPrisma.rawActivity.count.mockResolvedValue(1 as never);

    const r = await deviceService.myPending('u1', { page: 1, pageSize: 20 });

    expect(r.total).toBe(1);
    expect(r.page).toBe(1);
    expect(r.hasMore).toBe(false);
    expect(r.list[0]).toMatchObject({ id: 'a1', sportType: 'run', distanceMeters: 5000 });
    expect(r.list[0].startTime).toBe('2026-07-01T00:00:00.000Z');
  });

  it('查询走 status=pending 过滤', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValue([] as never);
    mockedPrisma.rawActivity.count.mockResolvedValue(0 as never);

    await deviceService.myPending('u1', { page: 1, pageSize: 20 });

    const arg = mockedPrisma.rawActivity.findMany.mock.calls[0][0] as { where: { status: string; vendor: string } };
    expect(arg.where.status).toBe('pending');
    expect(arg.where.vendor).toBe('garmin');
  });
});

describe('deviceService.myProcessed', () => {
  it('返回 imported/ignored 列表 + status 字段', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValue([
      {
        id: 'a1', type: 'running', startTime: new Date('2026-06-01T00:00:00Z'),
        durationSec: 1800, distanceMeters: 5000, status: 'imported',
        importCheckinId: 'c1', importedAt: new Date('2026-06-02T00:00:00Z'),
      },
    ] as never);
    mockedPrisma.rawActivity.count.mockResolvedValue(1 as never);

    const r = await deviceService.myProcessed('u1', { page: 1, pageSize: 20 });

    expect(r.list[0]).toMatchObject({ id: 'a1', status: 'imported', importCheckinId: 'c1' });
    expect(r.list[0].importedAt).toBe('2026-06-02T00:00:00.000Z');
  });
});

describe('deviceService.ignoreActivity', () => {
  it('pending → ignored 成功', async () => {
    mockedPrisma.rawActivity.findFirst.mockResolvedValue({ id: 'a1', status: 'pending' } as never);
    mockedPrisma.rawActivity.update.mockResolvedValue({} as never);

    const r = await deviceService.ignoreActivity('u1', { activityId: 'a1' });

    expect(r.ok).toBe(true);
    expect(mockedPrisma.rawActivity.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, data: { status: 'ignored' } }),
    );
  });

  it('imported 不可忽略（抛错）', async () => {
    mockedPrisma.rawActivity.findFirst.mockResolvedValue({ id: 'a1', status: 'imported' } as never);

    await expect(deviceService.ignoreActivity('u1', { activityId: 'a1' })).rejects.toThrow();
    expect(mockedPrisma.rawActivity.update).not.toHaveBeenCalled();
  });

  it('活动不存在（抛错）', async () => {
    mockedPrisma.rawActivity.findFirst.mockResolvedValue(null as never);

    await expect(deviceService.ignoreActivity('u1', { activityId: 'x' })).rejects.toThrow();
  });
});

describe('deviceService.importToCheckin', () => {
  it('入队 + 返 jobId + queued 数（不直接导入）', async () => {
    mockedEnqueue.mockResolvedValue({ id: 'job-abc' } as never);

    const r = await deviceService.importToCheckin('u1', { activityIds: ['a1', 'a2'] });

    expect(r.jobId).toBe('job-abc');
    expect(r.queued).toBe(2);
    expect(mockedEnqueue).toHaveBeenCalledWith({ userId: 'u1', activityIds: ['a1', 'a2'] });
    // 关键：service 不再直接写 Checkin（worker 才写）
    expect(mockedPrisma.rawActivity.findFirst).not.toHaveBeenCalled();
  });
});
