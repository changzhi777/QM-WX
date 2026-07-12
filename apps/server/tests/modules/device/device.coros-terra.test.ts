/**
 * Terra COROS 聚合单测（V0.1.130）
 *
 * 覆盖：parseTerraActivity（payload 解析）/ verifyTerraSignature（HMAC 验签）/
 *      generateTerraAuthUrl / terraWebhook service（验签 + 落库）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('src/config/env.js', () => ({
  env: {
    WX_APPID: 'test',
    WX_NOTIFY_URL: 'http://localhost',
    NODE_ENV: 'test',
    TERRA_DEV_ID: 'dev-123',
    TERRA_API_KEY: 'key-123',
    TERRA_WEBHOOK_SECRET: 'test-secret',
  },
}));
vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    corosRawEvent: { create: vi.fn(), findFirst: vi.fn() },
    rawActivity: { upsert: vi.fn() },
  },
}));
vi.mock('src/infra/redis.js', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), scan: vi.fn() },
}));

import { prisma } from 'src/infra/prisma.js';
import {
  parseTerraActivity,
  verifyTerraSignature,
  generateTerraAuthUrl,
} from 'src/modules/device/terra-client.js';
import { deviceService } from 'src/modules/device/device.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => vi.clearAllMocks());

describe('terra-client (V0.1.130)', () => {
  it('parseTerraActivity 正常 → 提取 start/duration/distance/hr/type', () => {
    const payload = {
      metadata: { start_time: '2026-07-10T08:00:00Z', sport: 'running' },
      active_durations_data: { active_durations_data: { duration: 3600 } },
      distance_data: { distance_data: { distance_metadata: { value: 10000 } } },
      heart_rate_data: { heart_rate_data: { summary: { avg_hr: 150, max_hr: 175 } } },
    };
    const r = parseTerraActivity(payload);
    expect(r).not.toBeNull();
    expect(r!.durationSec).toBe(3600);
    expect(r!.distanceMeters).toBe(10000);
    expect(r!.avgHr).toBe(150);
    expect(r!.maxHr).toBe(175);
    expect(r!.type).toBe('running');
  });

  it('parseTerraActivity 缺 metadata.start_time → null', () => {
    expect(parseTerraActivity({})).toBeNull();
  });

  it('verifyTerraSignature 正确签名 → true', () => {
    const body = '{"test":1}';
    const sig = createHmac('sha256', 'test-secret').update(body).digest('hex');
    expect(verifyTerraSignature(body, sig)).toBe(true);
  });

  it('verifyTerraSignature 错误签名 → false', () => {
    expect(verifyTerraSignature('{"test":1}', 'wrong-sig')).toBe(false);
  });

  it('generateTerraAuthUrl 含 devId + reference + coros', () => {
    const url = generateTerraAuthUrl('user-1');
    expect(url).toContain('dev-123');
    expect(url).toContain('user-1');
    expect(url).toContain('coros');
  });
});

describe('deviceService.terraWebhook (V0.1.130)', () => {
  it('验签失败 → 抛 unauthorized', async () => {
    await expect(deviceService.terraWebhook('{"x":1}', 'bad-sig')).rejects.toThrow();
  });

  it('验签成功 + 无 reference → saved:false（忽略）', async () => {
    const body = JSON.stringify({ user_id: 'terra-1', type: 'activity' });
    const sig = createHmac('sha256', 'test-secret').update(body).digest('hex');
    const r = await deviceService.terraWebhook(body, sig);
    expect(r.saved).toBe(false);
    expect(mockedPrisma.corosRawEvent.create).not.toHaveBeenCalled();
  });

  it('验签成功 + activity + reference → 落库 RawActivity + CorosRawEvent', async () => {
    const payload = {
      user_id: 'terra-1',
      type: 'activity',
      reference: 'u1',
      data: {
        metadata: { start_time: '2026-07-10T08:00:00Z', sport: 'running' },
        active_durations_data: { active_durations_data: { duration: 3600 } },
        distance_data: { distance_data: { distance_metadata: { value: 10000 } } },
      },
    };
    const body = JSON.stringify(payload);
    const sig = createHmac('sha256', 'test-secret').update(body).digest('hex');
    mockedPrisma.rawActivity.upsert.mockResolvedValue({ id: 'raw1' } as never);
    mockedPrisma.corosRawEvent.create.mockResolvedValue({ id: 'evt1' } as never);

    const r = await deviceService.terraWebhook(body, sig);
    expect(r.saved).toBe(true);
    expect(mockedPrisma.rawActivity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vendor_vendorActivityId: { vendor: 'coros', vendorActivityId: '2026-07-10T08:00:00.000Z' } },
        create: expect.objectContaining({ userId: 'u1', vendor: 'coros', distanceMeters: 10000 }),
      }),
    );
    expect(mockedPrisma.corosRawEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', terraUserId: 'terra-1', type: 'activity', processed: true }),
      }),
    );
  });
});
