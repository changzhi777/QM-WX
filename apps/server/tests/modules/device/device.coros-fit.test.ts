/**
 * importCorosFit 单测（V0.1.129）
 *
 * mock fit-file-parser parseAsync + prisma.rawActivity.upsert
 * 覆盖：正常解析 → RawActivity vendor=coros / 无 session / 解析失败
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fitMock = vi.hoisted(() => ({ parseAsync: vi.fn() }));
vi.mock('fit-file-parser', () => ({
  default: class MockFitParser {
    parseAsync = fitMock.parseAsync;
  },
}));

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    rawActivity: { upsert: vi.fn() },
  },
}));
vi.mock('src/infra/redis.js', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), scan: vi.fn() },
}));
vi.mock('src/config/env.js', () => ({
  env: { WX_APPID: 'test', WX_NOTIFY_URL: 'http://localhost', NODE_ENV: 'test' },
}));

import { prisma } from 'src/infra/prisma.js';
import { deviceService } from 'src/modules/device/device.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deviceService.importCorosFit (V0.1.129)', () => {
  it('正常解析 → upsert RawActivity vendor=coros + sport running→run', async () => {
    const startTime = new Date('2026-07-10T08:00:00Z');
    fitMock.parseAsync.mockResolvedValue({
      sessions: [
        {
          start_time: startTime,
          total_timer_time: 3600,
          total_distance: 10000,
          avg_heart_rate: 150,
          max_heart_rate: 175,
          avg_cadence: 180,
          sport: 'running',
        },
      ],
    });
    mockedPrisma.rawActivity.upsert.mockResolvedValue({
      id: 'raw1',
      type: 'run',
      startTime,
      durationSec: 3600,
      distanceMeters: 10000,
      status: 'pending',
    } as never);

    const r = await deviceService.importCorosFit('u1', Buffer.from('fake-fit'));

    expect(r.id).toBe('raw1');
    expect(r.type).toBe('run');
    expect(r.durationSec).toBe(3600);
    expect(r.distanceMeters).toBe(10000);
    expect(mockedPrisma.rawActivity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vendor_vendorActivityId: { vendor: 'coros', vendorActivityId: startTime.toISOString() },
        },
        create: expect.objectContaining({
          vendor: 'coros',
          type: 'run',
          avgHr: 150,
          maxHr: 175,
          distanceMeters: 10000,
          durationSec: 3600,
        }),
      }),
    );
  });

  it('FIT 无 session → 抛 badRequest', async () => {
    fitMock.parseAsync.mockResolvedValue({ sessions: [] });
    await expect(deviceService.importCorosFit('u1', Buffer.from('x'))).rejects.toThrow();
  });

  it('解析抛错 → 抛 badRequest', async () => {
    fitMock.parseAsync.mockRejectedValue(new Error('parse error'));
    await expect(deviceService.importCorosFit('u1', Buffer.from('x'))).rejects.toThrow();
  });
});
