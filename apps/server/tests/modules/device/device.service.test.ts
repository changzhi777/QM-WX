/**
 * device service 单测（V2 stub 深化）
 *
 * 覆盖：
 * - listBindings 真查 DB：返 DeviceBinding[] 形状
 * - startOAuth 生成 mock authUrl（state 含 userId + vendor + nonce + exp）
 * - startOAuth 厂商端点映射（huawei / garmin / mock fallback）
 * - syncWeRun 返 synced 数（不做 DB 写入）
 * - unbind / submitHeartRate 仍 notImplemented
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaMock } from '../../helpers/mockPrisma.js';
import { mockErrors } from '../../helpers/mockErrors.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({ models: ['deviceBinding'], txModels: [] });
});

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));
vi.mock('src/config/env.js', () => ({
  env: {
    WX_APPID: 'wx-test-appid',
    WX_NOTIFY_URL: 'https://api.example.com/api/wxpay',
  },
}));

import { deviceService } from '../../../src/modules/device/device.service.js';

beforeEach(() => {
  vi.clearAllMocks();
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

describe('deviceService stub actions (仍 notImplemented)', () => {
  it('unbind → notImplemented', async () => {
    await expect(deviceService.unbind('u1', 'huawei')).rejects.toThrow(/unbind/);
  });

  it('submitHeartRate → notImplemented', async () => {
    await expect(deviceService.submitHeartRate('u1', [])).rejects.toThrow(/submitHeartRate/);
  });
});

describe('deviceService.syncWeRun (MVP 简化：返 synced 数)', () => {
  it('返 ok + synced = stepList.length', async () => {
    const result = await deviceService.syncWeRun('u1', {
      stepList: [
        { date: '2026-06-01', steps: 8000 },
        { date: '2026-06-02', steps: 10000 },
      ],
    });
    expect(result).toEqual({ ok: true, synced: 2 });
  });
});
