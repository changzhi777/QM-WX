/**
 * upload-record.service 单测（V0.1.150）
 *
 * 覆盖：
 * - createUploadRecord：有 parser 入队 / 无 parser status=parsed 不入队
 * - myUploads：分页 + total
 * - getUpload：鉴权（非本人 null）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  uploadRecord: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
}));
const mockEnqueue = vi.hoisted(() => vi.fn());
const mockGetParser = vi.hoisted(() => vi.fn());

vi.mock('src/infra/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('src/jobs/queue.js', () => ({ enqueueUploadParse: mockEnqueue }));
vi.mock('src/modules/device/device-parser.registry.js', () => ({ getParser: mockGetParser }));

import { createUploadRecord, myUploads, getUpload } from 'src/modules/upload/upload-record.service.js';

beforeEach(() => vi.clearAllMocks());

describe('createUploadRecord (V0.1.150)', () => {
  it('有 parser 的 type（xiaomi_zip）→ status=pending + 入队', async () => {
    mockGetParser.mockReturnValue(() => Promise.resolve({ summary: 'ok' }));
    mockPrisma.uploadRecord.create.mockResolvedValue({ id: 'r1', status: 'pending' });
    const r = await createUploadRecord('u1', {
      type: 'xiaomi_zip', cosUrl: 'https://x/k', objectKey: 'k', mime: 'application/zip', size: 100, password: 'p',
    });
    expect(mockPrisma.uploadRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'pending', password: 'p' }) }),
    );
    expect(mockEnqueue).toHaveBeenCalledWith('r1');
    expect(r.id).toBe('r1');
  });

  it('无 parser 的 type（avatar）→ status=parsed + 不入队', async () => {
    mockGetParser.mockReturnValue(undefined);
    mockPrisma.uploadRecord.create.mockResolvedValue({ id: 'r2', status: 'parsed' });
    await createUploadRecord('u1', { type: 'avatar', cosUrl: 'u', objectKey: 'k', mime: 'image/jpeg', size: 10 });
    expect(mockPrisma.uploadRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'parsed' }) }),
    );
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe('myUploads', () => {
  it('分页返列表 + total', async () => {
    mockPrisma.uploadRecord.findMany.mockResolvedValue([{ id: 'r1' }]);
    mockPrisma.uploadRecord.count.mockResolvedValue(1);
    const r = await myUploads('u1', 1, 20);
    expect(r).toEqual({ items: [{ id: 'r1' }], total: 1, page: 1, pageSize: 20 });
  });
});

describe('getUpload', () => {
  it('非本人返 null（鉴权）', async () => {
    mockPrisma.uploadRecord.findUnique.mockResolvedValue({ id: 'r1', userId: 'other' });
    const r = await getUpload('r1', 'u1');
    expect(r).toBeNull();
  });

  it('本人返 record', async () => {
    mockPrisma.uploadRecord.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1' });
    const r = await getUpload('r1', 'u1');
    expect(r?.id).toBe('r1');
  });
});
