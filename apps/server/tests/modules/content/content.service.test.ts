/**
 * content.service 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => {
  return {
    prisma: {
      content: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      enrollment: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    },
  };
});

import { prisma } from 'src/infra/prisma.js';
import { contentService } from 'src/modules/content/content.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('contentService.list', () => {
  it('带 type 过滤时 where 包含 type', async () => {
    mockedPrisma.content.findMany.mockResolvedValue([]);
    mockedPrisma.content.count.mockResolvedValue(0);

    const result = await contentService.list({ type: 'marathon', page: 1, pageSize: 20 });

    expect(result.total).toBe(0);
    expect(mockedPrisma.content.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'marathon', status: 'on' }),
      }),
    );
  });

  it('无 type 时 where 不含 type', async () => {
    mockedPrisma.content.findMany.mockResolvedValue([]);
    mockedPrisma.content.count.mockResolvedValue(0);

    await contentService.list({ page: 1, pageSize: 20 });

    expect(mockedPrisma.content.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'on' },
      }),
    );
  });
});

describe('contentService.detail', () => {
  it('下架内容抛 notFound', async () => {
    mockedPrisma.content.findUnique.mockResolvedValue({ status: 'off' } as never);
    await expect(contentService.detail('c1')).rejects.toThrow('内容已下架');
  });

  it('不存在抛 notFound', async () => {
    mockedPrisma.content.findUnique.mockResolvedValue(null);
    await expect(contentService.detail('c1')).rejects.toThrow('内容不存在');
  });

  it('正常返回 on 状态内容', async () => {
    const c = { id: 'c1', status: 'on', title: '马拉松', type: 'marathon' };
    mockedPrisma.content.findUnique.mockResolvedValue(c as never);
    const result = await contentService.detail('c1');
    expect(result.content).toEqual(c);
  });
});

describe('contentService.enroll', () => {
  const formData = { name: '张三', phone: '13800001111' };

  it('actionType=none 拒绝报名', async () => {
    mockedPrisma.content.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'on',
      type: 'marathon',
      actionType: 'none',
    } as never);
    await expect(
      contentService.enroll('u1', { id: 'c1', formData }),
    ).rejects.toThrow('仅展示');
  });

  it('已存在 submitted/confirmed 报名 → 拒绝重复', async () => {
    mockedPrisma.content.findUnique.mockResolvedValue({
      id: 'c1', status: 'on', type: 'marathon', actionType: 'enroll',
    } as never);
    mockedPrisma.enrollment.findFirst.mockResolvedValue({ id: 'e1', status: 'submitted' } as never);

    await expect(contentService.enroll('u1', { id: 'c1', formData })).rejects.toThrow('已提交过');
  });

  it('正常报名：写 enrollments + 返 enrollmentId', async () => {
    mockedPrisma.content.findUnique.mockResolvedValue({
      id: 'c1', status: 'on', type: 'marathon', actionType: 'enroll',
    } as never);
    mockedPrisma.enrollment.findFirst.mockResolvedValue(null);
    mockedPrisma.enrollment.create.mockResolvedValue({ id: 'e-new' } as never);

    const result = await contentService.enroll('u1', { id: 'c1', formData });
    expect(result.enrollmentId).toBe('e-new');
    expect(mockedPrisma.enrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          contentId: 'c1',
          type: 'marathon',
          formData,
          status: 'submitted',
        }),
      }),
    );
  });
});
