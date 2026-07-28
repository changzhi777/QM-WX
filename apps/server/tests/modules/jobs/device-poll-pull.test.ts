/**
 * device-poll-pull.job.test.ts — V0.3.13 huawei vendor 单元测试
 *
 * 覆盖 fetchHuaweiData（V0.3.13 新增）：
 *   - 从 Checkin where dataSource='huawei_export' + createdAt >= since 聚合 by date
 *   - distance (km) → distanceM (m, ×1000)
 *   - durationSec → activeMin (÷60)
 *   - step / caloriesKcal / sleepMin 留 0（华为 ZIP 不含）
 */
import { vi } from 'vitest';

vi.mock('../../../src/infra/prisma.js', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    weRunRecord: { findMany: vi.fn() },
    checkin: { findMany: vi.fn() },
    deviceDailyActivity: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from '../../../src/infra/prisma.js';
import { processDevicePollPull } from '../../../src/jobs/device-poll-pull.job.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => vi.clearAllMocks());

describe('processDevicePollPull V0.3.13 huawei vendor', () => {
  it('返 4 vendors perVendorCount 结构', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([]);
    mockedPrisma.weRunRecord.findMany.mockResolvedValue([]);
    mockedPrisma.checkin.findMany.mockResolvedValue([]);

    const r = await processDevicePollPull();

    expect(Object.keys(r.perVendorCount).sort()).toEqual(['garmin', 'huawei', 'terra', 'wechat']);
    expect(r.perVendorCount.huawei).toEqual({ pulledDaysCount: 0, upsertedCount: 0, skippedDaysCount: 0 });
    expect(r.activeUserCount).toBe(0);
    expect(r.totalUpsertedCount).toBe(0);
  });

  it('huawei 聚合：2 checkin 同 date → 1 DailyData（distanceM ×1000 + activeMin ÷60）', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    mockedPrisma.weRunRecord.findMany.mockResolvedValueOnce([] as never); // wechat 空
    mockedPrisma.checkin.findMany.mockResolvedValueOnce([
      // fetchHuaweiData：2 checkin 同日 2026-07-20
      { date: '2026-07-20', distance: 5.0, durationSec: 1800 }, // 5km + 30min
      { date: '2026-07-20', distance: 3.5, durationSec: 1500 }, // 3.5km + 25min → 聚合 8.5km + 55min
    ] as never);
    mockedPrisma.deviceDailyActivity.findFirst.mockResolvedValue(null); // 不存在 → create

    const r = await processDevicePollPull();

    // huawei vendor 聚合
    expect(r.perVendorCount.huawei.pulledDaysCount).toBe(1);
    expect(r.perVendorCount.huawei.upsertedCount).toBe(1);
    expect(r.perVendorCount.huawei.skippedDaysCount).toBe(0);
    expect(r.totalUpsertedCount).toBe(1);

    // 验证 create 调用参数（distanceM = 8.5 × 1000 = 8500；activeMin = (1800+1500)/60 = 55）
    expect(mockedPrisma.deviceDailyActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        vendor: 'huawei',
        date: '2026-07-20',
        distanceM: 8500,
        activeMin: 55,
        step: 0,
        caloriesKcal: 0,
        sleepMin: 0,
        source: 'api',
      }),
    });
  });

  it('huawei 空数据：不调 create', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([{ id: 'u2' }]);
    mockedPrisma.weRunRecord.findMany.mockResolvedValueOnce([] as never); // wechat 空
    mockedPrisma.checkin.findMany.mockResolvedValueOnce([] as never); // huawei 空

    const r = await processDevicePollPull();

    expect(r.perVendorCount.huawei.pulledDaysCount).toBe(0);
    expect(r.perVendorCount.huawei.upsertedCount).toBe(0);
    expect(mockedPrisma.deviceDailyActivity.create).not.toHaveBeenCalled();
  });
});