/**
 * device service STUB 冒烟测试
 *
 * Phase 6 真做时再补业务断言；现在只走通 5 个方法 + notImplemented 抛错
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/common/errors.js', () => ({
  Errors: {
    notImplemented: (msg: string) => {
      const e = new Error(msg) as Error & { code: number; statusCode: number };
      e.code = 501;
      e.statusCode = 501;
      return e;
    },
  },
}));

import { deviceService } from '../../../src/modules/device/device.service.js';

describe('deviceService (STUB)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listBindings：返回空数组（占位）', async () => {
    const result = await deviceService.listBindings('u1');
    expect(result).toEqual({ bindings: [] });
  });

  it('startOAuth：抛 notImplemented', async () => {
    await expect(
      deviceService.startOAuth('u1', { vendor: 'garmin' } as never),
    ).rejects.toMatchObject({ code: 501, statusCode: 501 });
  });

  it('unbind：抛 notImplemented', async () => {
    await expect(deviceService.unbind('u1', 'garmin')).rejects.toMatchObject({
      code: 501,
    });
  });

  it('syncWeRun：返回 { ok, synced: stepList.length }', async () => {
    const stepList = [100, 200, 300, 400];
    const result = await deviceService.syncWeRun('u1', { stepList } as never);
    expect(result).toEqual({ ok: true, synced: 4 });
  });

  it('submitHeartRate：抛 notImplemented', async () => {
    await expect(
      deviceService.submitHeartRate('u1', [{ bpm: 120 }]),
    ).rejects.toMatchObject({ code: 501 });
  });
});
