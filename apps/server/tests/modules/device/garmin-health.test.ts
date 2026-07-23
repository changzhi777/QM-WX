/**
 * tests/modules/device/garmin-health.test.ts — Garmin Health API A 路线单测（V0.2.89/90）
 *
 * 覆盖：isGarminHealthConfigured + webhook activities→RawActivity 落库 + userId 映射 + 其他 type TODO + accessToken 兜底
 * ⚠️ OAuth 1.0a request_token/access_token 真测需 GARMIN_CONSUMER_KEY + 佳明端点（待凭证切流）
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/config/env.js', () => ({
  env: {
    GARMIN_CONSUMER_KEY: 'test-consumer-key',
    GARMIN_CONSUMER_SECRET: 'test-consumer-secret',
  },
}));

const { findFirst, upsert } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock('../../../src/infra/prisma.js', () => ({
  prisma: {
    deviceBinding: { findFirst },
    rawActivity: { upsert },
  },
}));

import {
  garminHealthWebhook,
  garminHealthAccessToken,
  isGarminHealthConfigured,
} from '../../../src/modules/device/garmin-health.js';

describe('device/garmin-health (V0.2.89/90 A 路线 OAuth 1.0a + webhook 落库)', () => {
  it('isGarminHealthConfigured：key/secret 齐返 true', () => {
    expect(isGarminHealthConfigured()).toBe(true);
  });

  it('webhook：缺 type/data → received=false', async () => {
    expect(await garminHealthWebhook({})).toEqual({ ok: false, received: false });
    expect(
      await garminHealthWebhook({ type: 'activities', data: 'not-array' as unknown }),
    ).toEqual({ ok: false, received: false });
  });

  it('webhook：userId 未映射（findFirst null）→ received + saved 0，不落库', async () => {
    findFirst.mockResolvedValue(null);
    const result = await garminHealthWebhook({
      type: 'activities',
      userId: 'garmin-unbound',
      data: [{ activityId: 'a1' }],
    });
    expect(result).toEqual({ ok: false, received: true, count: 1, saved: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('webhook：userId 映射 + activities → RawActivity upsert（SI 单位映射）', async () => {
    findFirst.mockResolvedValue({ userId: 'qm-user-1' });
    upsert.mockResolvedValue({});
    const result = await garminHealthWebhook({
      type: 'activities',
      userId: 'garmin-user-1',
      data: [
        {
          activityId: 'act-100',
          activityType: 'trail_running',
          startTimeInSeconds: 1700000000,
          durationInSeconds: 1800,
          distanceInMeters: 5000,
          averageHeartRate: 150,
          maxHeartRate: 175,
        },
      ],
    });
    expect(result.saved).toBe(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vendor_vendorActivityId: { vendor: 'garmin', vendorActivityId: 'act-100' } },
        create: expect.objectContaining({
          userId: 'qm-user-1',
          vendor: 'garmin',
          vendorActivityId: 'act-100',
          type: 'running', // trail_running → running
          durationSec: 1800,
          distanceMeters: 5000,
          avgHr: 150,
          maxHr: 175,
          status: 'pending',
        }),
      }),
    );
  });

  it('webhook：sleep/health/stress/body_composition 接收但 TODO 不落库（saved 0）', async () => {
    findFirst.mockResolvedValue({ userId: 'u1' });
    for (const type of ['sleep', 'health', 'stress', 'body_composition'] as const) {
      const r = await garminHealthWebhook({ type, userId: 'g1', data: [{}] });
      expect(r.received).toBe(true);
      expect(r.saved).toBe(0); // 待佳明 push schema 文档
    }
  });

  it('webhook：单条异常不阻塞整体（continue）', async () => {
    findFirst.mockResolvedValue({ userId: 'u1' });
    upsert.mockRejectedValueOnce(new Error('db err'));
    const result = await garminHealthWebhook({
      type: 'activities',
      userId: 'g1',
      data: [{ activityId: 'fail' }, { activityId: 'ok' }],
    });
    expect(result.received).toBe(true);
    expect(result.saved).toBe(1); // 第 1 条失败跳过，第 2 条成功
  });

  it('accessToken：fetch 失败/端点未确认 → catch 返 null（兜底，不抛）', async () => {
    const result = await garminHealthAccessToken('request-token', 'request-secret', 'verifier');
    expect(result).toBeNull();
  });
});
