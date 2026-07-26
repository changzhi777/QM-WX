/**
 * jobs/device-poll-pull.job.ts 单元测试（V0.2.153 实施真实数据源）
 *
 * 关键路径：
 * - 拉最近 7 天活跃用户（有 WeRunRecord）
 * - 对每个用户拉最近 7 天有数据的日期（distinct date）
 * - 每天聚合 step/distance/calorie → upsert DeviceDailyActivity by [userId, vendor='wechat', date]
 * - 已有 record 时 update，否 create
 * - failedUserCount 由 try/catch 处理（不在 result 中体现，按用户隔离）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
    weRunRecord: {
      findMany: vi.fn(),
    },
    deviceDailyActivity: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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
  const mod = await import('../../src/jobs/device-poll-pull.job.js');
  return mod.processDevicePollPull;
}

describe('V0.2.153 device-poll-pull — WeRunRecord → DeviceDailyActivity 回流', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无活跃用户 → activeUserCount=0 + upsertedCount=0', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([]);
    const processDevicePollPull = await loadJob();
    const r = await processDevicePollPull();
    expect(r.activeUserCount).toBe(0);
    expect(r.upsertedCount).toBe(0);
    expect(r.pulledDaysCount).toBe(0);
    expect(mocks.prisma.deviceDailyActivity.create).not.toHaveBeenCalled();
    expect(mocks.prisma.deviceDailyActivity.update).not.toHaveBeenCalled();
  });

  it('1 用户 2 天 WeRunRecord（无现有 DeviceDailyActivity）→ create 2 条', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'u1' }] as never);
    mocks.prisma.weRunRecord.findMany
      .mockResolvedValueOnce([{ date: '2026-07-25' }, { date: '2026-07-24' }] as never) // distinct dates
      .mockResolvedValueOnce([{ step: 8500 }] as never) // 7-25 data
      .mockResolvedValueOnce([{ step: 6200 }] as never); // 7-24 data
    mocks.prisma.deviceDailyActivity.findFirst.mockResolvedValue(null as never); // 都无现有
    mocks.prisma.deviceDailyActivity.create.mockResolvedValue({ id: 'd-new' } as never);

    const processDevicePollPull = await loadJob();
    const r = await processDevicePollPull();

    expect(r.activeUserCount).toBe(1);
    expect(r.pulledDaysCount).toBe(2);
    expect(r.upsertedCount).toBe(2);
    expect(mocks.prisma.deviceDailyActivity.create).toHaveBeenCalledTimes(2);
    // 验证 create 数据
    const createCall1 = mocks.prisma.deviceDailyActivity.create.mock.calls[0][0];
    expect(createCall1.data).toMatchObject({
      userId: 'u1',
      vendor: 'wechat',
      date: '2026-07-25',
      step: 8500,
      source: 'api',
    });
  });

  it('1 用户 1 天 WeRunRecord（已有 DeviceDailyActivity）→ update 1 条（不 create）', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'u2' }] as never);
    mocks.prisma.weRunRecord.findMany
      .mockResolvedValueOnce([{ date: '2026-07-25' }] as never)
      .mockResolvedValueOnce([{ step: 9000 }] as never);
    mocks.prisma.deviceDailyActivity.findFirst.mockResolvedValue({ id: 'da-exist' } as never);
    mocks.prisma.deviceDailyActivity.update.mockResolvedValue({ id: 'da-exist' } as never);

    const processDevicePollPull = await loadJob();
    const r = await processDevicePollPull();

    expect(r.upsertedCount).toBe(1);
    expect(mocks.prisma.deviceDailyActivity.update).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.deviceDailyActivity.update).toHaveBeenCalledWith({
      where: { id: 'da-exist' },
      data: expect.objectContaining({ step: 9000, source: 'api' }),
    });
    expect(mocks.prisma.deviceDailyActivity.create).not.toHaveBeenCalled();
  });
});