/**
 * tests/modules/device/garmin-health.test.ts — Garmin Health API A 路线单测（V0.2.89）
 *
 * 覆盖：isGarminHealthConfigured + webhook 解析骨架 + accessToken fetch 失败兜底
 * ⚠️ OAuth 1.0a request_token/access_token 真测需 GARMIN_CONSUMER_KEY + 佳明端点（待凭证切流）
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/config/env.js', () => ({
  env: {
    GARMIN_CONSUMER_KEY: 'test-consumer-key',
    GARMIN_CONSUMER_SECRET: 'test-consumer-secret',
  },
}));

import {
  garminHealthWebhook,
  garminHealthAccessToken,
  isGarminHealthConfigured,
} from '../../../src/modules/device/garmin-health.js';

describe('device/garmin-health (V0.2.89 A 路线 OAuth 1.0a)', () => {
  it('isGarminHealthConfigured：key/secret 齐返 true', () => {
    expect(isGarminHealthConfigured()).toBe(true);
  });

  it('webhook：合法 activities payload 返 received + count', async () => {
    const result = await garminHealthWebhook({
      type: 'activities',
      userId: 'garmin-user-1',
      data: [{ activityId: 'a1' }, { activityId: 'a2' }],
    });
    expect(result).toEqual({ ok: true, received: true, count: 2 });
  });

  it('webhook：缺 type 或 data 非数组 → received=false', async () => {
    expect(await garminHealthWebhook({})).toEqual({ ok: false, received: false });
    expect(await garminHealthWebhook({ type: 'activities', data: 'not-array' as unknown })).toEqual({
      ok: false,
      received: false,
    });
  });

  it('webhook：5 种 type 都接收（activities/health/sleep/stress/body_composition）', async () => {
    const types = ['activities', 'health', 'sleep', 'stress', 'body_composition'] as const;
    for (const type of types) {
      const r = await garminHealthWebhook({ type, data: [{}] });
      expect(r.received).toBe(true);
    }
  });

  it('accessToken：fetch 失败/端点未确认 → catch 返 null（兜底，不抛）', async () => {
    // 无真凭证/端点未确认 → fetch 到 connect.garmin.com 失败 → catch 返 null
    const result = await garminHealthAccessToken('request-token', 'request-secret', 'verifier');
    expect(result).toBeNull();
  });
});
