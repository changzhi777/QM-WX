/**
 * favorite module 单测（V0.1.29，社交向 — Content/Product 收藏）
 *
 * 覆盖：list（批量关联避免 N+1）/ add（upsert 幂等）/ remove / isFavorited（批量）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockErrors } from '../../helpers/mockErrors.js';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    favorite: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    content: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
  },
}));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { prisma } from 'src/infra/prisma.js';
import { favoriteService } from 'src/modules/favorite/favorite.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => vi.clearAllMocks());

describe('favoriteService.list (V0.1.29)', () => {
  it('返收藏列表 + 批量关联 Content 详情（避免 N+1）', async () => {
    mockedPrisma.favorite.findMany.mockResolvedValue([
      {
        id: 'f1',
        userId: 'u1',
        targetType: 'content',
        targetId: 'c1',
        createdAt: new Date('2026-07-01T00:00:00Z'),
      },
    ] as never);
    mockedPrisma.content.findMany.mockResolvedValue([
      {
        id: 'c1',
        title: '长沙马拉松',
        cover: null,
        summary: '秋季盛典',
        type: 'marathon',
        location: '长沙',
        date: '2026-10-01',
      },
    ] as never);
    mockedPrisma.product.findMany.mockResolvedValue([] as never);

    const r = await favoriteService.list('u1', { targetType: 'content' });

    expect(r.favorites).toHaveLength(1);
    expect(r.favorites[0].detail).toMatchObject({ title: '长沙马拉松', type: 'marathon' });
  });

  it('目标已删除 → detail=null（前端据此提示）', async () => {
    mockedPrisma.favorite.findMany.mockResolvedValue([
      {
        id: 'f1',
        userId: 'u1',
        targetType: 'product',
        targetId: 'p1',
        createdAt: new Date(),
      },
    ] as never);
    mockedPrisma.product.findMany.mockResolvedValue([] as never); // 商品已删
    mockedPrisma.content.findMany.mockResolvedValue([] as never);

    const r = await favoriteService.list('u1', { targetType: 'product' });
    expect(r.favorites[0].detail).toBeNull();
  });

  it('无 targetType → 返全部（content + product）', async () => {
    mockedPrisma.favorite.findMany.mockResolvedValue([] as never);
    mockedPrisma.content.findMany.mockResolvedValue([] as never);
    mockedPrisma.product.findMany.mockResolvedValue([] as never);

    const r = await favoriteService.list('u1', {});
    expect(r.favorites).toHaveLength(0);
    // 验证 findMany 调了（无过滤）
    expect(mockedPrisma.favorite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });
});

describe('favoriteService.add (V0.1.29)', () => {
  it('upsert 幂等收藏（重复不报错）', async () => {
    mockedPrisma.favorite.upsert.mockResolvedValue({} as never);

    const r = await favoriteService.add('u1', { targetType: 'content', targetId: 'c1' });

    expect(mockedPrisma.favorite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_targetType_targetId: { userId: 'u1', targetType: 'content', targetId: 'c1' },
        },
        create: { userId: 'u1', targetType: 'content', targetId: 'c1' },
        update: {},
      }),
    );
    expect(r).toEqual({ ok: true });
  });
});

describe('favoriteService.remove (V0.1.29)', () => {
  it('deleteMany 取消收藏（不存在也返 ok）', async () => {
    mockedPrisma.favorite.deleteMany.mockResolvedValue({ count: 0 } as never);

    const r = await favoriteService.remove('u1', { targetType: 'product', targetId: 'p1' });

    expect(mockedPrisma.favorite.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', targetType: 'product', targetId: 'p1' },
      }),
    );
    expect(r).toEqual({ ok: true });
  });
});

describe('favoriteService.isFavorited (V0.1.29)', () => {
  it('批量检查红心状态（已收藏/未收藏混合）', async () => {
    mockedPrisma.favorite.findMany.mockResolvedValue([
      { targetType: 'content', targetId: 'c1' },
    ] as never);

    const r = await favoriteService.isFavorited('u1', {
      items: [
        { targetType: 'content', targetId: 'c1' },
        { targetType: 'product', targetId: 'p1' },
      ],
    });

    expect(r.results).toHaveLength(2);
    expect(r.results[0].favorited).toBe(true); // c1 已收藏
    expect(r.results[1].favorited).toBe(false); // p1 未收藏
  });
});
