/**
 * tests/modules/device/garmin-health.test.ts — Garmin Health API A 路线单测（V0.2.89-91）
 *
 * 覆盖：webhook 全 5 type 落库（activities/sleep/health/stress/body）+ userId 映射 + 异常隔离
 * ⚠️ Garmin push schema 字段名（*InSeconds/*InMeters/*InGrams）为推测，1B 佳明文档核实后校准
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/config/env.js', () => ({
  env: { GARMIN_CONSUMER_KEY: 'k', GARMIN_CONSUMER_SECRET: 's' },
}));

const { findFirst, rawUpsert, sleepUpsert, metricCreate, bodyCreate } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  rawUpsert: vi.fn(),
  sleepUpsert: vi.fn(),
  metricCreate: vi.fn(),
  bodyCreate: vi.fn(),
}));

vi.mock('../../../src/infra/prisma.js', () => ({
  prisma: {
    deviceBinding: { findFirst },
    rawActivity: { upsert: rawUpsert },
    garminSleep: { upsert: sleepUpsert },
    garminMetric: { create: metricCreate },
    bodyCompositionRecord: { create: bodyCreate },
  },
}));

import {
  garminHealthWebhook,
  garminHealthAccessToken,
  isGarminHealthConfigured,
} from '../../../src/modules/device/garmin-health.js';

describe('device/garmin-health (V0.2.89-91 webhook 全 5 type 落库)', () => {
  it('isGarminHealthConfigured', () => {
    expect(isGarminHealthConfigured()).toBe(true);
  });

  it('webhook 缺 type/data → received=false', async () => {
    expect(await garminHealthWebhook({})).toEqual({ ok: false, received: false });
  });

  it('webhook userId 未映射 → saved 0 不落库', async () => {
    findFirst.mockResolvedValue(null);
    const r = await garminHealthWebhook({ type: 'activities', userId: 'x', data: [{ activityId: 'a1' }] });
    expect(r).toEqual({ ok: false, received: true, count: 1, saved: 0 });
  });

  it('webhook activities → RawActivity upsert（SI 单位 + type 映射）', async () => {
    findFirst.mockResolvedValue({ userId: 'u1' });
    rawUpsert.mockResolvedValue({});
    const r = await garminHealthWebhook({
      type: 'activities', userId: 'g1',
      data: [{ activityId: 'a1', activityType: 'trail_running', startTimeInSeconds: 1700000000, durationInSeconds: 1800, distanceInMeters: 5000, averageHeartRate: 150 }],
    });
    expect(r.saved).toBe(1);
    expect(rawUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { vendor_vendorActivityId: { vendor: 'garmin', vendorActivityId: 'a1' } },
      create: expect.objectContaining({ type: 'running', durationSec: 1800, distanceMeters: 5000, avgHr: 150 }),
    }));
  });

  it('webhook sleep → GarminSleep upsert（秒映射）', async () => {
    findFirst.mockResolvedValue({ userId: 'u1' });
    sleepUpsert.mockResolvedValue({});
    const r = await garminHealthWebhook({
      type: 'sleep', userId: 'g1',
      data: [{ calendarDate: '2026-07-24', deepSleepDurationInSeconds: 3600, lightSleepDurationInSeconds: 14400, remSleepInSeconds: 1800 }],
    });
    expect(r.saved).toBe(1);
    expect(sleepUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_calendarDate: { userId: 'u1', calendarDate: new Date('2026-07-24') } },
      create: expect.objectContaining({ deepSleepSeconds: 3600, lightSleepSeconds: 14400, remSleepSeconds: 1800 }),
    }));
  });

  it('webhook health(dailies) → GarminMetric create（steps）', async () => {
    findFirst.mockResolvedValue({ userId: 'u1' });
    metricCreate.mockResolvedValue({});
    const r = await garminHealthWebhook({ type: 'health', userId: 'g1', data: [{ calendarDate: '2026-07-24', steps: 8000 }] });
    expect(r.saved).toBe(1);
    expect(metricCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metricType: 'dailies', value: 8000 }),
    }));
  });

  it('webhook stress → GarminMetric create（averageStressLevel）', async () => {
    findFirst.mockResolvedValue({ userId: 'u1' });
    metricCreate.mockResolvedValue({});
    const r = await garminHealthWebhook({ type: 'stress', userId: 'g1', data: [{ calendarDate: '2026-07-24', averageStressLevel: 35 }] });
    expect(r.saved).toBe(1);
    expect(metricCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metricType: 'stress', value: 35 }),
    }));
  });

  it('webhook body_composition → BodyComposition create（g→kg）', async () => {
    findFirst.mockResolvedValue({ userId: 'u1' });
    bodyCreate.mockResolvedValue({});
    const r = await garminHealthWebhook({
      type: 'body_composition', userId: 'g1',
      data: [{ weightInGrams: 70000, bodyFatPercentage: 18.5, muscleMassInGrams: 30000, measurementTimeInSeconds: 1700000000 }],
    });
    expect(r.saved).toBe(1);
    expect(bodyCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ weight: 70, bodyFat: 18.5, muscle: 30, source: 'garmin_oauth' }),
    }));
  });

  it('webhook 单条异常不阻塞整体', async () => {
    findFirst.mockResolvedValue({ userId: 'u1' });
    rawUpsert.mockRejectedValueOnce(new Error('db'));
    const r = await garminHealthWebhook({ type: 'activities', userId: 'g1', data: [{ activityId: 'fail' }, { activityId: 'ok' }] });
    expect(r.saved).toBe(1);
  });

  it('accessToken fetch 失败 → null 兜底', async () => {
    expect(await garminHealthAccessToken('t', 's', 'v')).toBeNull();
  });
});
