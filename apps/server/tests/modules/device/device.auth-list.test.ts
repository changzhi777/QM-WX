/**
 * device.service V0.1.144 单测 — authList（数据授权管理）
 * 原型图"我的"tab：设备绑定 + 各数据源授权标志
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    deviceBinding: { findMany: vi.fn() },
  },
}));
vi.mock('src/config/env.js', () => ({ env: { NODE_ENV: 'test' } }));

import { prisma } from 'src/infra/prisma.js';
import { deviceService } from 'src/modules/device/device.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => vi.clearAllMocks());

describe('deviceService.authList (V0.1.144)', () => {
  it('返设备绑定列表 + 各数据源授权标志', async () => {
    mockedPrisma.deviceBinding.findMany.mockResolvedValue([
      { vendor: 'garmin', accessTokenEnc: '佳明手表', status: 'active', lastSyncAt: null },
      { vendor: 'werun', accessTokenEnc: null, status: 'active', lastSyncAt: null },
    ] as never);

    const r = await deviceService.authList('u1');

    expect(r.bindings.length).toBe(2);
    expect(r.bindings[0].deviceName).toBe('佳明手表');
    expect(r.garminAuthorized).toBe(true);
    expect(r.weRunAuthorized).toBe(true);
    expect(r.xiaomiAuthorized).toBe(false);
    expect(r.corosAuthorized).toBe(false);
    expect(r.bleAuthorized).toBe(false);
  });

  it('无绑定 → 全 false', async () => {
    mockedPrisma.deviceBinding.findMany.mockResolvedValue([] as never);

    const r = await deviceService.authList('u1');

    expect(r.bindings.length).toBe(0);
    expect(r.garminAuthorized).toBe(false);
    expect(r.weRunAuthorized).toBe(false);
  });
});
