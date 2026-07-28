/**
 * device.recentActivityByVendor.test.ts — V0.3.20 设备授权中心 UI 单元测试
 *
 * 覆盖：
 *   1. happy path：返标准化 activities[]
 *   2. limit 默认 5（参数省略）
 *   3. 未知 vendor 返空数组（prisma.findMany 返 []）
 *   4. 距离 km 单位换算（distanceMeters / 1000 + round）
 */
import { vi } from 'vitest';

vi.mock('../../../src/infra/prisma.js', () => ({
  prisma: {
    rawActivity: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../src/infra/prisma.js';
import { deviceService } from '../../../src/modules/device/device.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => vi.clearAllMocks());

describe('deviceService.recentActivityByVendor V0.3.20', () => {
  it('happy path：返标准化 activities[]（距离 m→km）', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValueOnce([
      {
        vendor: 'garmin',
        vendorActivityId: 'g-001',
        type: 'running',
        startTime: new Date('2026-07-20T08:00:00Z'),
        distanceMeters: 5000, // 5km
        durationSec: 1800,
        avgHr: 145,
        status: 'pending',
      },
    ] as never);

    const r = await deviceService.recentActivityByVendor('u1', { vendor: 'garmin', limit: 5 });
    expect(r.activities).toHaveLength(1);
    expect(r.activities[0]).toEqual({
      vendor: 'garmin',
      vendorActivityId: 'g-001',
      type: 'running',
      startTime: '2026-07-20T08:00:00.000Z',
      distanceKm: 5,
      durationSec: 1800,
      avgHr: 145,
      status: 'pending',
    });
  });

  it('limit 默认 5（参数省略）', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValueOnce([] as never);

    await deviceService.recentActivityByVendor('u1', { vendor: 'garmin' });

    expect(mockedPrisma.rawActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it('未知 vendor 返空数组', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValueOnce([] as never);

    const r = await deviceService.recentActivityByVendor('u1', { vendor: 'unknown_vendor', limit: 5 });
    expect(r.activities).toEqual([]);
  });

  it('距离字段 null → distanceKm null（小米等无 distance 的数据）', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValueOnce([
      {
        vendor: 'xiaomi',
        vendorActivityId: 'x-001',
        type: 'sleep',
        startTime: new Date('2026-07-20T00:00:00Z'),
        distanceMeters: null,
        durationSec: 28800,
        avgHr: null,
        status: 'pending',
      },
    ] as never);

    const r = await deviceService.recentActivityByVendor('u1', { vendor: 'xiaomi', limit: 5 });
    expect(r.activities[0].distanceKm).toBeNull();
  });
});