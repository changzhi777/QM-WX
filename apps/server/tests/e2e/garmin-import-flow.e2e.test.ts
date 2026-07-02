/**
 * 佳明导入榜单 e2e（真 PG/Redis）
 *
 * 覆盖（参考 close-order.e2e 模式 — 直接调 process 函数，不起 worker）：
 * ① processGarminImport：有效 pending → 写 Checkin（dataSource=garmin, sportType=run）+ RawActivity.status=imported
 * ② 无效活动（distance=0/duration=0）→ status=ignored，不写 Checkin
 * ③ 已 imported → skip（already_imported）
 * ④ enqueueGarminImport：真入 BullMQ（garminImportQueue.getJob 验证）
 *
 * 跑法：RUN_E2E=1 pnpm test -- garmin-import-flow
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/infra/prisma.js';
import { processGarminImport } from '../../src/jobs/garmin-import.job.js';
import { enqueueGarminImport, garminImportQueue } from '../../src/jobs/queue.js';

const E2E_OPENID = 'e2e-garmin-import';
const skip = !process.env.RUN_E2E;
const itE2E = skip ? it.skip : it;

describe.skipIf(skip)('佳明导入榜单 e2e（真 PG/Redis）', () => {
  let userId: string;
  let rawPendingId: string;
  let rawInvalidId: string;
  let rawImportedId: string;
  const rawIds: string[] = [];
  const checkinIds: string[] = [];

  beforeAll(async () => {
    const u = await prisma.user.upsert({
      where: { openid: E2E_OPENID },
      create: { openid: E2E_OPENID, nickname: 'e2e-garmin' },
      update: {},
    });
    userId = u.id;

    const mk = (vendorActivityId: string, opts: Partial<{ durationSec: number; distanceMeters: number; status: string; startTime: string }> = {}) =>
      prisma.rawActivity.create({
        data: {
          userId,
          vendor: 'garmin',
          vendorActivityId,
          type: 'running',
          startTime: new Date(opts.startTime ?? '2026-07-01T08:00:00Z'),
          durationSec: opts.durationSec ?? 1800,
          distanceMeters: opts.distanceMeters ?? 5000,
          avgHr: 150,
          raw: {},
          status: (opts.status ?? 'pending') as 'pending' | 'imported',
        },
      });

    const r1 = await mk('e2e-act-1');
    rawPendingId = r1.id;
    rawIds.push(r1.id);

    const r2 = await mk('e2e-act-2', { durationSec: 0, distanceMeters: 0 });
    rawInvalidId = r2.id;
    rawIds.push(r2.id);

    const r3 = await mk('e2e-act-3', { durationSec: 3600, distanceMeters: 10000, status: 'imported', startTime: '2026-07-01T10:00:00Z' });
    rawImportedId = r3.id;
    rawIds.push(r3.id);
  });

  afterAll(async () => {
    await prisma.checkin.deleteMany({ where: { id: { in: checkinIds } } }).catch(() => {});
    await prisma.checkin.deleteMany({ where: { userId, dataSource: 'garmin' } }).catch(() => {});
    await prisma.rawActivity.deleteMany({ where: { id: { in: rawIds } } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  itE2E('① 有效 pending → 写 Checkin（garmin/run/5km）+ RawActivity.status=imported', async () => {
    const r = await processGarminImport({ userId, activityIds: [rawPendingId] });
    expect(r.ok).toBe(1);

    const checkin = await prisma.checkin.findFirst({ where: { garminActivityId: rawPendingId } });
    expect(checkin).not.toBeNull();
    expect(checkin?.dataSource).toBe('garmin');
    expect(checkin?.sportType).toBe('run');
    expect(checkin?.distance).toBe(5); // 5000m → 5km
    expect(checkin?.garminActivityId).toBe(rawPendingId);
    if (checkin) checkinIds.push(checkin.id);

    const raw = await prisma.rawActivity.findUnique({ where: { id: rawPendingId } });
    expect(raw?.status).toBe('imported');
    expect(raw?.importCheckinId).toBe(checkin?.id);
    expect(raw?.importedAt).not.toBeNull();
  });

  itE2E('② 无效活动（distance=0/duration=0）→ status=ignored，不写 Checkin', async () => {
    const r = await processGarminImport({ userId, activityIds: [rawInvalidId] });
    expect(r.ok).toBe(0);
    expect(r.results[0].reason).toBe('invalid_data');

    const raw = await prisma.rawActivity.findUnique({ where: { id: rawInvalidId } });
    expect(raw?.status).toBe('ignored');

    const checkin = await prisma.checkin.findFirst({ where: { garminActivityId: rawInvalidId } });
    expect(checkin).toBeNull();
  });

  itE2E('③ 已 imported → skip（already_imported，不重复写 Checkin）', async () => {
    const r = await processGarminImport({ userId, activityIds: [rawImportedId] });
    expect(r.ok).toBe(0);
    expect(r.results[0].reason).toBe('already_imported');
    // 不产生新 Checkin
    const cnt = await prisma.checkin.count({ where: { garminActivityId: rawImportedId } });
    expect(cnt).toBe(0);
  });

  itE2E('④ enqueueGarminImport 真入 BullMQ 队列', async () => {
    const job = await enqueueGarminImport({ userId, activityIds: ['e2e-enqueue-test'] });
    expect(job.id).toBeDefined();

    const fetched = await garminImportQueue.getJob(job.id!);
    expect(fetched).not.toBeNull();
    expect(fetched?.data.userId).toBe(userId);
    expect(fetched?.data.activityIds).toContain('e2e-enqueue-test');

    await job.remove().catch(() => {});
  });

  itE2E('⑤ not found 活动 → reason=not_found', async () => {
    const r = await processGarminImport({ userId, activityIds: ['nonexistent-id'] });
    expect(r.ok).toBe(0);
    expect(r.results[0].reason).toBe('not_found');
  });
});
