/**
 * ludong service STUB 冒烟测试
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

import { ludongService } from '../../../src/modules/ludong/ludong.service.js';

describe('ludongService (STUB)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listOutbox：返回空 list', async () => {
    const result = await ludongService.listOutbox({ page: 1, pageSize: 20 } as never);
    expect(result).toEqual({ list: [], total: 0 });
  });

  it('flushOutbox：返回 flushed=0, dead=0（占位）', async () => {
    const result = await ludongService.flushOutbox();
    expect(result).toEqual({ flushed: 0, dead: 0 });
  });

  it('bindAccount：抛 notImplemented', async () => {
    await expect(
      ludongService.bindAccount('u1', { phone: '13800000000' } as never),
    ).rejects.toMatchObject({ code: 501 });
  });

  it('bindingStatus：返回未绑定', async () => {
    const result = await ludongService.bindingStatus('u1');
    expect(result).toEqual({ bound: false, ludongUserId: null, boundAt: null });
  });

  it('enqueueInTx：返回占位 eventId', async () => {
    const result = await ludongService.enqueueInTx({}, 'user.upsert', { openid: 'o1' });
    expect(result).toEqual({ eventId: 'placeholder' });
  });
});
