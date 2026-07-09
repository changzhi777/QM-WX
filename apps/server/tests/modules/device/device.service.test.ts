/**
 * device service 单测（V2 stub 深化）
 *
 * 覆盖：
 * - listBindings 真查 DB：返 DeviceBinding[] 形状
 * - startOAuth 生成 mock authUrl（state 含 userId + vendor + nonce + exp）
 * - startOAuth 厂商端点映射（huawei / garmin / mock fallback）
 * - syncWeRun 返 synced 数（不做 DB 写入）
 * - unbind / submitHeartRate 已实现（V0.1.25，见 device.bindings.test.ts）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaMock } from '../../helpers/mockPrisma.js';
import { mockErrors } from '../../helpers/mockErrors.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({ models: ['deviceBinding', 'weRunRecord', 'user', 'heartRateRecord', 'spO2Record', 'sleepRecord'], txModels: [] });
});

// Mock Redis（Cache.wrap + syncWeRun session_key 都走 redis）
const _redisMockState = vi.hoisted(() => ({
  store: new Map<string, string>(),
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn(), scan: vi.fn() },
}));
vi.mock('src/infra/redis.js', () => ({ redis: _redisMockState.redis }));

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));
vi.mock('src/config/env.js', () => ({
  env: {
    WX_APPID: 'wx-test-appid',
    WX_NOTIFY_URL: 'https://api.example.com/api/wxpay',
    NODE_ENV: 'test',
  },
}));

import { deviceService } from '../../../src/modules/device/device.service.js';

function setupMockRedis() {
  const { store, redis } = _redisMockState;
  redis.get.mockImplementation(async (k: string) => store.get(k) ?? null);
  redis.set.mockImplementation(async (k: string, v: string) => { store.set(k, v); return 'OK'; });
  redis.setex.mockImplementation(async (k: string, _s: number, v: string) => { store.set(k, v); return 'OK'; });
  redis.del.mockImplementation(async (k: string) => { const h = store.has(k); store.delete(k); return h ? 1 : 0; });
  redis.scan.mockImplementation(async () => ['0', []] as [string, string[]]);
}

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.store.clear();
  setupMockRedis();
});

describe('deviceService.listBindings (V2 stub 深化)', () => {
  it('已绑定 2 个设备：返 DeviceBinding[] 形状', async () => {
    mocks.prisma.deviceBinding.findMany.mockResolvedValue([
      {
        id: 'd1',
        vendor: 'huawei',
        lastSyncAt: new Date('2026-06-01T00:00:00Z'),
        status: 'active',
        createdAt: new Date('2026-05-01T00:00:00Z'),
      },
      {
        id: 'd2',
        vendor: 'garmin',
        lastSyncAt: null,
        status: 'pending',
        createdAt: new Date('2026-05-15T00:00:00Z'),
      },
    ]);
    const result = await deviceService.listBindings('u1');
    expect(result.bindings).toHaveLength(2);
    expect(result.bindings[0]).toMatchObject({
      id: 'd1',
      vendor: 'huawei',
      status: 'active',
    });
    expect(mocks.prisma.deviceBinding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  it('未绑定：返 { bindings: [] }', async () => {
    mocks.prisma.deviceBinding.findMany.mockResolvedValue([]);
    const result = await deviceService.listBindings('u2');
    expect(result).toEqual({ bindings: [] });
  });
});

describe('deviceService.startOAuth (V2 stub 深化)', () => {
  it('生成 mock authUrl：含 state + vendor + client_id + redirect_uri', async () => {
    const result = await deviceService.startOAuth('u1', { vendor: 'mock' });
    expect(result.authUrl).toMatch(/^https:\/\/oauth\.example\.com\/authorize\?/);
    const url = new URL(result.authUrl);
    expect(url.searchParams.get('client_id')).toBe('wx-test-appid');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(result.expiresIn).toBe(300);
  });

  it('state 可被 base64url 解码且含 userId + vendor + nonce + exp', async () => {
    const result = await deviceService.startOAuth('u1', { vendor: 'huawei' });
    const stateParam = new URL(result.authUrl).searchParams.get('state')!;
    const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf8'));
    expect(decoded).toMatchObject({
      userId: 'u1',
      vendor: 'huawei',
    });
    expect(decoded.nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(typeof decoded.exp).toBe('number');
    expect(decoded.exp).toBeGreaterThan(Date.now());
    expect(decoded.exp).toBeLessThan(Date.now() + 6 * 60 * 1000); // <6 分钟
  });

  it('vendor=huawei → 走华为 OAuth 端点', async () => {
    const result = await deviceService.startOAuth('u1', { vendor: 'huawei' });
    expect(result.authUrl).toMatch(/^https:\/\/oauth-login\.cloud\.huawei\.com\//);
  });

  it('vendor=garmin → 走佳明 Connect OAuth 端点', async () => {
    const result = await deviceService.startOAuth('u1', { vendor: 'garmin' });
    expect(result.authUrl).toMatch(/^https:\/\/connect\.garmin\.com\//);
  });

  it('vendor=mock → 走沙箱 fallback（oauth.example.com）', async () => {
    const result = await deviceService.startOAuth('u1', { vendor: 'mock' });
    expect(result.authUrl).toMatch(/oauth\.example\.com/);
  });
});

// unbind / submitHeartRate 已实现（V0.1.25）— 测试见 device.bindings.test.ts

describe('deviceService.syncWeRun (V0.1.43 encryptedData 解密)', () => {
  it('session_key 过期（Redis 无）→ badRequest', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ openid: 'o-test' });
    await expect(
      deviceService.syncWeRun('u1', { encryptedData: 'fake', iv: 'fake' }),
    ).rejects.toThrow('session_key 已过期');
  });

  it('解密失败（假 session_key + 假 encryptedData）→ badRequest', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ openid: 'o-test' });
    _redisMockState.store.set('wx:session:o-test', 'fake-session-key-base64==');
    await expect(
      deviceService.syncWeRun('u1', { encryptedData: 'fake-data', iv: 'fake-iv' }),
    ).rejects.toThrow('微信运动数据解密失败');
  });
});

describe('deviceService.myWeRun (V0.1.43)', () => {
  it('返步数列表 + km 估算 + 汇总', async () => {
    mocks.prisma.weRunRecord.findMany.mockResolvedValue([
      { date: '2026-07-01', step: 10000 },
      { date: '2026-07-02', step: 20000 },
    ]);
    const r = await deviceService.myWeRun('u1', { startDate: '2026-07-01', endDate: '2026-07-02' });
    expect(r.records).toHaveLength(2);
    expect(r.totalSteps).toBe(30000);
    expect(r.totalKm).toBe(21); // 30000 × 0.0007 = 21
    expect(r.days).toBe(2);
  });

  it('Cache 命中：第二次不查 DB', async () => {
    mocks.prisma.weRunRecord.findMany.mockResolvedValue([]);
    await deviceService.myWeRun('u1', { startDate: '2026-07-03', endDate: '2026-07-04' });
    await deviceService.myWeRun('u1', { startDate: '2026-07-03', endDate: '2026-07-04' });
    expect(mocks.prisma.weRunRecord.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('deviceService.submitHeartRate (V0.1.43 持久化)', () => {
  it('写 Redis + createMany 落 HeartRateRecord', async () => {
    const r = await deviceService.submitHeartRate('u1', {
      samples: [
        { hr: 72, ts: 1000 },
        { hr: 75, ts: 2000 },
      ],
    });
    expect(r.latest).toBe(75);
    expect(r.count).toBe(2);
    expect(mocks.prisma.heartRateRecord.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'u1', value: 72, timestamp: new Date(1000), source: 'ble' },
        { userId: 'u1', value: 75, timestamp: new Date(2000), source: 'ble' },
      ],
    });
  });
});

describe('deviceService.submitSpO2 (V0.1.43)', () => {
  it('落 SpO2Record + 返 value/timestamp', async () => {
    mocks.prisma.spO2Record.create.mockResolvedValue({
      id: 's1',
      value: 98,
      timestamp: new Date(1000),
    });
    const r = await deviceService.submitSpO2('u1', { value: 98 });
    expect(r.ok).toBe(true);
    expect(r.value).toBe(98);
    expect(mocks.prisma.spO2Record.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', value: 98 }),
    });
  });
});

describe('deviceService.myHealthHistory (V0.1.43)', () => {
  it('type=hr 查 HeartRateRecord 分页', async () => {
    mocks.prisma.heartRateRecord.findMany.mockResolvedValue([
      { id: 'h1', value: 72, timestamp: new Date(1000) },
    ]);
    mocks.prisma.heartRateRecord.count.mockResolvedValue(1);
    const r = await deviceService.myHealthHistory('u1', { type: 'hr', page: 1, pageSize: 50 });
    expect(r.type).toBe('hr');
    expect(r.list).toHaveLength(1);
    expect(r.list[0]).toMatchObject({ value: 72 });
    expect(mocks.prisma.heartRateRecord.findMany).toHaveBeenCalled();
  });

  it('type=spo2 查 SpO2Record', async () => {
    mocks.prisma.spO2Record.findMany.mockResolvedValue([
      { id: 's1', value: 98, timestamp: new Date(1000) },
    ]);
    mocks.prisma.spO2Record.count.mockResolvedValue(1);
    const r = await deviceService.myHealthHistory('u1', { type: 'spo2', page: 1, pageSize: 50 });
    expect(r.type).toBe('spo2');
    expect(r.list).toHaveLength(1);
    expect(mocks.prisma.spO2Record.findMany).toHaveBeenCalled();
    expect(mocks.prisma.spO2Record.count).toHaveBeenCalled();
  });
});

describe('deviceService.importXiaomiZip (V0.1.43 小米数据包导入)', () => {
  it('解析 CSV 入库 4 表（心率/血氧/睡眠/步数）', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require('adm-zip') as typeof import('adm-zip');
    const csv = `Uid,Sid,Tag,Key,Time,Value,UpdateTime
187987205,default,daily_report,heart_rate,1779494400,"{""latest_hr"":{""bpm"":72,""time"":1779494460}}",1779586594
187987205,default,daily_report,spo2,1779667200,"{""latest_spo2"":{""spo2"":98,""time"":1779752580}}",1783329226
187987205,default,daily_report,sleep,1779580800,"{""total_duration"":303,""sleep_deep_duration"":70,""sleep_light_duration"":203,""sleep_awake_duration"":0,""sleep_score"":62,""segment_details"":[{""bedtime"":1779556320,""wake_up_time"":1779572700}]}",1779614426
187987205,default,daily_report,steps,1682812800,"{""steps"":3268,""calories"":131,""distance"":1917}",1686280569`;
    const zip = new AdmZip();
    zip.addFile('20260709_MiFitness_hlth_center_aggregated_fitness_data.csv', Buffer.from(csv));
    const buffer = zip.toBuffer();

    mocks.prisma.heartRateRecord.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.spO2Record.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.sleepRecord.upsert.mockResolvedValue({});
    mocks.prisma.weRunRecord.upsert.mockResolvedValue({});

    const r = await deviceService.importXiaomiZip('u1', buffer);
    expect(r.hr).toBe(1);
    expect(r.spo2).toBe(1);
    expect(r.sleep).toBe(1);
    expect(r.steps).toBe(1);
    expect(mocks.prisma.heartRateRecord.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 'u1', value: 72, source: 'xiaomi' })],
    });
    expect(mocks.prisma.sleepRecord.upsert).toHaveBeenCalled();
    expect(mocks.prisma.weRunRecord.upsert).toHaveBeenCalled();
  });

  it('ZIP 无 aggregated CSV → badRequest', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require('adm-zip') as typeof import('adm-zip');
    const zip = new AdmZip();
    zip.addFile('other.csv', Buffer.from('a,b\n1,2'));
    await expect(deviceService.importXiaomiZip('u1', zip.toBuffer())).rejects.toThrow(
      '未找到',
    );
  });
});
