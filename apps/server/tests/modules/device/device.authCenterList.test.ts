/**
 * device.authCenterList.test.ts — V0.3.20 优化 3 单元测试
 *
 * 覆盖：
 *   1. happy path：返 3 品牌完整状态（configured + bound + lastSyncAt + recentCount）
 *   2. 无绑定：bound=false lastSyncAt=null recentCount=0
 *   3. recentCount 上限 5（实际 8 也返 5）
 */
import { vi } from 'vitest';

vi.mock('../../../src/config/env.js', () => ({
  env: {
    GARMIN_CONSUMER_KEY: 'garmin-key',
    GARMIN_CONSUMER_SECRET: 'garmin-secret',
    HUAWEI_APP_ID: 'huawei-id',
    HUAWEI_APP_SECRET: 'huawei-secret',
    TERRA_DEV_ID: 'terra-dev',
    TERRA_API_KEY: 'terra-key',
    TERRA_WEBHOOK_SECRET: 'terra-secret',
  },
}));

vi.mock('../../../src/infra/prisma.js', () => ({
  prisma: {
    deviceBinding: { findMany: vi.fn() },
    rawActivity: { count: vi.fn() },
  },
}));

import { prisma } from '../../../src/infra/prisma.js';
import { deviceService } from '../../../src/modules/device/device.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => vi.clearAllMocks());

describe('deviceService.authCenterList V0.3.20 优化 3', () => {
  it('happy path：返 3 品牌完整状态', async () => {
    mockedPrisma.deviceBinding.findMany.mockResolvedValueOnce([
      { vendor: 'garmin_oauth', lastSyncAt: new Date('2026-07-20T08:00:00Z') },
      { vendor: 'coros', lastSyncAt: new Date('2026-07-21T08:00:00Z') },
    ] as never);
    mockedPrisma.rawActivity.count
      .mockResolvedValueOnce(3)   // garmin
      .mockResolvedValueOnce(0)   // huawei
      .mockResolvedValueOnce(2);  // coros

    const r = await deviceService.authCenterList('u1');
    expect(r.brands).toHaveLength(3);
    expect(r.brands[0]).toEqual({
      key: 'garmin',
      vendorOAuthKey: 'garmin_oauth',
      configured: true,
      bound: true,
      lastSyncAt: '2026-07-20T08:00:00.000Z',
      recentCount: 3,
    });
    expect(r.brands[1].key).toBe('huawei');
    expect(r.brands[1].bound).toBe(false);
    expect(r.brands[1].recentCount).toBe(0);
    expect(r.brands[2].key).toBe('coros');
    expect(r.brands[2].bound).toBe(true);
    expect(r.brands[2].recentCount).toBe(2);
  });

  it('无绑定：bound=false lastSyncAt=null recentCount=0', async () => {
    mockedPrisma.deviceBinding.findMany.mockResolvedValueOnce([] as never);
    mockedPrisma.rawActivity.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const r = await deviceService.authCenterList('u2');
    expect(r.brands.every((b) => !b.bound && b.lastSyncAt === null && b.recentCount === 0)).toBe(true);
  });

  it('recentCount 上限 5（实际 8 也返 5）', async () => {
    mockedPrisma.deviceBinding.findMany.mockResolvedValueOnce([{ vendor: 'garmin_oauth', lastSyncAt: null }] as never);
    mockedPrisma.rawActivity.count
      .mockResolvedValueOnce(8)   // garmin: 实际 8 → 返 5
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const r = await deviceService.authCenterList('u3');
    expect(r.brands[0].recentCount).toBe(5);
  });
});