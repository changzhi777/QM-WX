/**
 * ludong service 单测（V0.1.43 cdb5a3c 集成后：outbox 投递 + enqueueInTx）
 *
 * 覆盖：
 * - listOutbox：返 syncOutbox 分页（mock prisma）
 * - flushOutbox：LUDONG_SYNC_ENABLED=false → 跳过返 0
 * - enqueueInTx：LUDONG_SYNC_ENABLED=false → 不写返空 eventId
 * - bindAccount：notImplemented
 * - bindingStatus：未绑定 stub
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    syncOutbox: { findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  },
}));
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
vi.mock('src/common/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('src/config/env.js', () => ({
  env: {
    LUDONG_SYNC_ENABLED: false,
    LUDONG_BASE_URL: 'http://localhost',
    LUDONG_WEBHOOK_SECRET: 'test-secret',
  },
}));

import { prisma } from 'src/infra/prisma.js';
import { ludongService } from '../../../src/modules/ludong/ludong.service.js';

const mockedPrisma = vi.mocked(prisma);

describe('ludongService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listOutbox：返 syncOutbox 分页', async () => {
    mockedPrisma.syncOutbox.findMany.mockResolvedValue([{ id: 'o1', status: 'pending' }]);
    mockedPrisma.syncOutbox.count.mockResolvedValue(1);
    const r = await ludongService.listOutbox({ page: 1, pageSize: 20 } as never);
    expect(r.list).toHaveLength(1);
    expect(r.total).toBe(1);
  });

  it('flushOutbox：LUDONG_SYNC_ENABLED=false → 跳过返全 0', async () => {
    const r = await ludongService.flushOutbox();
    expect(r).toEqual({ flushed: 0, dead: 0, failed: 0 });
  });

  it('enqueueInTx：LUDONG_SYNC_ENABLED=false → 不写返空 eventId', async () => {
    const r = await ludongService.enqueueInTx({}, 'user.upsert', { openid: 'o1' });
    expect(r).toEqual({ eventId: '' });
  });

  it('bindAccount：抛 notImplemented', async () => {
    await expect(
      ludongService.bindAccount('u1', { phone: '13800000000' } as never),
    ).rejects.toMatchObject({ code: 501 });
  });

  it('bindingStatus：返回未绑定', async () => {
    const r = await ludongService.bindingStatus('u1');
    expect(r).toEqual({ bound: false, ludongUserId: null, boundAt: null });
  });
});
