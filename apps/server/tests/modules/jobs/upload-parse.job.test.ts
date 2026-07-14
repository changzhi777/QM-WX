/**
 * upload-parse.job 单测（V0.1.150）
 *
 * 覆盖状态机：pending → parsing → parsed | failed
 * - parsed 幂等
 * - 无 parser → failed
 * - 有 parser → COS 拉 buffer → 解析 → parsed
 * - 解析抛错 → failed + 重抛（BullMQ 重试）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  uploadRecord: { findUnique: vi.fn(), update: vi.fn() },
}));
const mockGetObject = vi.hoisted(() => vi.fn());
const mockGetParser = vi.hoisted(() => vi.fn());

vi.mock('src/infra/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('src/infra/cos.js', () => ({ getObject: mockGetObject }));
vi.mock('src/modules/device/device-parser.registry.js', () => ({ getParser: mockGetParser }));
vi.mock('src/common/logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { processUploadParse } from 'src/jobs/upload-parse.job.js';

beforeEach(() => vi.clearAllMocks());

describe('processUploadParse (V0.1.150)', () => {
  it('parsed 幂等（status=parsed 直接返，不重解析）', async () => {
    mockPrisma.uploadRecord.findUnique.mockResolvedValue({ id: 'r1', status: 'parsed' });
    const r = await processUploadParse({ recordId: 'r1' });
    expect(r).toEqual({ ok: true });
    expect(mockPrisma.uploadRecord.update).not.toHaveBeenCalled();
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('无 parser → status=failed', async () => {
    mockPrisma.uploadRecord.findUnique.mockResolvedValue({
      id: 'r1', status: 'pending', type: 'unknown', objectKey: 'k', userId: 'u1',
    });
    mockGetParser.mockReturnValue(undefined);
    await processUploadParse({ recordId: 'r1' });
    expect(mockPrisma.uploadRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });

  it('有 parser → pending→parsing→parsed（COS 拉 buffer + 解析）', async () => {
    const parser = vi.fn().mockResolvedValue({ summary: 'COROS 已导入' });
    mockPrisma.uploadRecord.findUnique.mockResolvedValue({
      id: 'r1', status: 'pending', type: 'coros_fit', objectKey: 'obj/1.fit', userId: 'u1', password: null,
    });
    mockGetParser.mockReturnValue(parser);
    mockGetObject.mockResolvedValue(Buffer.from('fit-bytes'));
    await processUploadParse({ recordId: 'r1' });
    expect(mockGetObject).toHaveBeenCalledWith('obj/1.fit');
    expect(parser).toHaveBeenCalledWith('u1', expect.any(Buffer), undefined);
    expect(mockPrisma.uploadRecord.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'parsed' }) }),
    );
  });

  it('解析抛错 → status=failed + 重抛（BullMQ 重试）', async () => {
    const parser = vi.fn().mockRejectedValue(new Error('fit 解析失败'));
    mockPrisma.uploadRecord.findUnique.mockResolvedValue({
      id: 'r1', status: 'parsing', type: 'coros_fit', objectKey: 'k', userId: 'u1', password: null,
    });
    mockGetParser.mockReturnValue(parser);
    mockGetObject.mockResolvedValue(Buffer.from('fit'));
    await expect(processUploadParse({ recordId: 'r1' })).rejects.toThrow('fit 解析失败');
    expect(mockPrisma.uploadRecord.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed', errorMsg: 'fit 解析失败' }) }),
    );
  });

  it('xiaomi_zip 传 password 给 parser', async () => {
    const parser = vi.fn().mockResolvedValue({ summary: '小米已导入' });
    mockPrisma.uploadRecord.findUnique.mockResolvedValue({
      id: 'r1', status: 'pending', type: 'xiaomi_zip', objectKey: 'k', userId: 'u1', password: 'secret',
    });
    mockGetParser.mockReturnValue(parser);
    mockGetObject.mockResolvedValue(Buffer.from('zip'));
    await processUploadParse({ recordId: 'r1' });
    expect(parser).toHaveBeenCalledWith('u1', expect.any(Buffer), 'secret');
  });
});
