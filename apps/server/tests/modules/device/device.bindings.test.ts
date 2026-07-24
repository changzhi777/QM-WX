/**
 * device 设备绑定单测（V0.1.25 参考图 2770；V0.1.33 +品牌 vendor + garmin BLE 优先）
 *
 * 覆盖：myBindings（含 garminBleBound）/ bindBleDevice（含 vendor 参数）/ unbind / submitHeartRate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    // V0.1.33：deviceBinding 加 findUnique（myBindings 查 garmin BLE 绑定状态）
    deviceBinding: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    rawActivity: { count: vi.fn() },
    // V0.1.43 submitHeartRate 加 createMany 落库；V0.2.115 myBindings 加 lastDataAt (HeartRateRecord 最后时间)
    heartRateRecord: { createMany: vi.fn(), findFirst: vi.fn() },
  },
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
import { deviceService } from 'src/modules/device/device.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.cacheStore.clear();
  setupMockRedis();
});

describe('deviceService.myBindings (V0.1.25 + V0.1.33)', () => {
  it('返回品牌列表 + 已绑设备 + 佳明自动检测（有 OAuth 数据，无 BLE 绑定）', async () => {
    mockedPrisma.deviceBinding.findMany.mockResolvedValue([
      {
        id: 'b1',
        vendor: 'ble',
        accessTokenEnc: '小米手环',
        vendorUserId: 'AB:CD',
        status: 'active',
        lastSyncAt: new Date('2026-07-03T00:00:00Z'),
        createdAt: new Date('2026-07-01T00:00:00Z'),
      },
    ] as never);
    mockedPrisma.rawActivity.count.mockResolvedValue(42 as never);

    const r = await deviceService.myBindings('u1');

    expect(r.brands.length).toBeGreaterThan(0);
    expect(r.bindings).toHaveLength(1);
    // ble vendor 用 accessTokenEnc 作设备名展示
    expect(r.bindings[0].deviceName).toBe('小米手环');
    expect(r.garminAutoConnected).toBe(true);
    expect(r.garminActivityCount).toBe(42);
    expect(r.garminBleBound).toBe(false); // V0.1.33：无 BLE 绑定
  });

  it('无佳明数据 → garminAutoConnected=false + garminBleBound=false', async () => {
    mockedPrisma.deviceBinding.findMany.mockResolvedValue([]);
    mockedPrisma.rawActivity.count.mockResolvedValue(0);

    const r = await deviceService.myBindings('u1');
    expect(r.garminAutoConnected).toBe(false);
    expect(r.garminBleBound).toBe(false);
  });

  it('V0.1.33 佳明 BLE 绑定优先（garminBleBound=true，OAuth 数据并存）', async () => {
    mockedPrisma.deviceBinding.findMany.mockResolvedValue([
      {
        id: 'b2',
        vendor: 'garmin',
        accessTokenEnc: 'Forerunner 245',
        vendorUserId: 'device-id',
        status: 'active',
        lastSyncAt: new Date(),
        createdAt: new Date(),
      },
    ] as never);
    mockedPrisma.rawActivity.count.mockResolvedValue(10); // OAuth 数据也有

    const r = await deviceService.myBindings('u1');

    expect(r.garminBleBound).toBe(true); // BLE 优先
    expect(r.garminAutoConnected).toBe(true); // OAuth 数据也存在
    // garmin vendor 走 accessTokenEnc 展示（与 ble 一致）
    expect(r.bindings[0].deviceName).toBe('Forerunner 245');
  });

  it('V0.1.128 coros BLE 绑定 → deviceName 走 accessTokenEnc', async () => {
    mockedPrisma.deviceBinding.findMany.mockResolvedValue([
      {
        id: 'b5',
        vendor: 'coros',
        accessTokenEnc: 'COROS PACE 3',
        vendorUserId: 'coros-device',
        status: 'active',
        lastSyncAt: new Date(),
        createdAt: new Date(),
      },
    ] as never);
    mockedPrisma.rawActivity.count.mockResolvedValue(0);

    const r = await deviceService.myBindings('u1');
    expect(r.bindings[0].deviceName).toBe('COROS PACE 3');
    expect(r.bindings[0].vendor).toBe('coros');
  });
});

describe('deviceService.bindBleDevice (V0.1.25 + V0.1.33 vendor)', () => {
  it('默认 vendor=ble → upsert by [userId, ble]（兼容旧调用）', async () => {
    mockedPrisma.deviceBinding.upsert.mockResolvedValue({
      id: 'b1',
      vendor: 'ble',
      status: 'active',
    } as never);

    const r = await deviceService.bindBleDevice('u1', {
      deviceId: 'AB:CD:EF',
      name: '心率带',
      services: ['0000180D-0000-1000-8000-00805F9B34FB'],
    });

    expect(mockedPrisma.deviceBinding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_vendor: { userId: 'u1', vendor: 'ble' } },
        create: expect.objectContaining({
          vendor: 'ble',
          vendorUserId: 'AB:CD:EF',
          accessTokenEnc: '心率带',
        }),
      }),
    );
    expect(r.deviceName).toBe('心率带');
    expect(r.vendor).toBe('ble');
  });

  it('V0.1.33 vendor=garmin → upsert by [userId, garmin]（品牌化，可同时绑多设备）', async () => {
    mockedPrisma.deviceBinding.upsert.mockResolvedValue({
      id: 'b3',
      vendor: 'garmin',
      status: 'active',
    } as never);

    await deviceService.bindBleDevice('u1', {
      deviceId: 'garmin-device',
      name: 'Forerunner 245',
      services: ['0000180D-0000-1000-8000-00805F9B34FB'],
      vendor: 'garmin',
      brandMeta: { manufacturer: 'Garmin', model: 'Forerunner 245' },
    });

    expect(mockedPrisma.deviceBinding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_vendor: { userId: 'u1', vendor: 'garmin' } },
        create: expect.objectContaining({
          vendor: 'garmin',
          accessTokenEnc: 'Forerunner 245',
        }),
      }),
    );
  });

  it('V0.1.33 vendor=xiaomi → upsert by [userId, xiaomi]', async () => {
    mockedPrisma.deviceBinding.upsert.mockResolvedValue({
      id: 'b4',
      vendor: 'xiaomi',
      status: 'active',
    } as never);

    await deviceService.bindBleDevice('u1', {
      deviceId: 'mi-band',
      name: 'Mi Band 8',
      services: ['0000180D-0000-1000-8000-00805F9B34FB'],
      vendor: 'xiaomi',
    });

    expect(mockedPrisma.deviceBinding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_vendor: { userId: 'u1', vendor: 'xiaomi' } },
        create: expect.objectContaining({ vendor: 'xiaomi' }),
      }),
    );
  });

  it('V0.1.128 vendor=coros → upsert by [userId, coros]', async () => {
    mockedPrisma.deviceBinding.upsert.mockResolvedValue({
      id: 'b5',
      vendor: 'coros',
      status: 'active',
    } as never);

    await deviceService.bindBleDevice('u1', {
      deviceId: 'coros-pace',
      name: 'COROS PACE 3',
      services: ['0000180D-0000-1000-8000-00805F9B34FB'],
      vendor: 'coros',
    });

    expect(mockedPrisma.deviceBinding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_vendor: { userId: 'u1', vendor: 'coros' } },
        create: expect.objectContaining({ vendor: 'coros', accessTokenEnc: 'COROS PACE 3' }),
      }),
    );
  });
});

describe('deviceService.unbind (V0.1.25 实现)', () => {
  it('找到绑定 → 删除 → ok', async () => {
    mockedPrisma.deviceBinding.findFirst.mockResolvedValue({
      id: 'b1',
      vendor: 'ble',
    } as never);
    mockedPrisma.deviceBinding.delete.mockResolvedValue({} as never);

    const r = await deviceService.unbind('u1', 'ble');

    expect(mockedPrisma.deviceBinding.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(r).toEqual({ ok: true });
  });

  it('绑定不存在 → 抛错（notFound）', async () => {
    mockedPrisma.deviceBinding.findFirst.mockResolvedValue(null);
    await expect(deviceService.unbind('u1', 'ble')).rejects.toThrow();
  });
});

describe('deviceService.submitHeartRate (V0.1.25 实现 → Redis)', () => {
  it('取最新采样写缓存 + 返 ok + count + latest', async () => {
    const r = await deviceService.submitHeartRate('u1', {
      samples: [
        { hr: 120, ts: 1 },
        { hr: 125, ts: 2 },
        { hr: 130, ts: 3 },
      ],
    });

    expect(r.ok).toBe(true);
    expect(r.count).toBe(3);
    expect(r.latest).toBe(130); // 最后一个采样
  });
});
