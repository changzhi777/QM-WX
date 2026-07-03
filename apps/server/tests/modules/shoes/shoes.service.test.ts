/**
 * shoes module 单测（V0.1.26，跑者向 — 跑鞋里程管理）
 *
 * 覆盖：list（含 healthRatio）/ add / retire（active→retired + 已退役 + 不存在）/ myStats
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockErrors } from '../../helpers/mockErrors.js';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    shoe: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { prisma } from 'src/infra/prisma.js';
import { shoesService } from 'src/modules/shoes/shoes.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('shoesService.list (V0.1.26)', () => {
  it('返跑鞋列表 + healthRatio（currentKm/thresholdKm*100）', async () => {
    mockedPrisma.shoe.findMany.mockResolvedValue([
      {
        id: 's1', brand: 'Nike', model: 'Vaporfly', nickname: '战靴',
        currentKm: 600, thresholdKm: 800, status: 'active',
        purchasedAt: null, note: null, createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 's2', brand: '必迈', model: '路征', nickname: null,
        currentKm: 900, thresholdKm: 800, status: 'active',
        purchasedAt: null, note: null, createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    ] as never);

    const r = await shoesService.list('u1');

    expect(r.shoes).toHaveLength(2);
    expect(r.shoes[0].healthRatio).toBe(75); // 600/800*100
    expect(r.shoes[1].healthRatio).toBe(113); // 900/800*100（超阈值）
    expect(r.shoes[0].nickname).toBe('战靴');
  });

  it('thresholdKm=0 防除零 → healthRatio=0', async () => {
    mockedPrisma.shoe.findMany.mockResolvedValue([
      { id: 's1', brand: 'A', model: 'B', nickname: null, currentKm: 100, thresholdKm: 0, status: 'active', purchasedAt: null, note: null, createdAt: new Date() },
    ] as never);
    const r = await shoesService.list('u1');
    expect(r.shoes[0].healthRatio).toBe(0);
  });
});

describe('shoesService.add (V0.1.26)', () => {
  it('创建跑鞋（含默认 thresholdKm=800）', async () => {
    mockedPrisma.shoe.create.mockResolvedValue({
      id: 's1', brand: 'Nike', model: 'Vaporfly',
    } as never);

    const r = await shoesService.add('u1', {
      brand: 'Nike',
      model: 'Vaporfly',
      thresholdKm: 800,
    });

    expect(mockedPrisma.shoe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          brand: 'Nike',
          model: 'Vaporfly',
          thresholdKm: 800,
        }),
      }),
    );
    expect(r.id).toBe('s1');
  });
});

describe('shoesService.retire (V0.1.26)', () => {
  it('active → retired（update status）', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue({ id: 's1', status: 'active' } as never);
    mockedPrisma.shoe.update.mockResolvedValue({} as never);

    const r = await shoesService.retire('u1', 's1');

    expect(mockedPrisma.shoe.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'retired' },
    });
    expect(r).toEqual({ ok: true });
  });

  it('已退役 → 抛错（badRequest）', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue({ id: 's1', status: 'retired' } as never);
    await expect(shoesService.retire('u1', 's1')).rejects.toThrow();
  });

  it('不存在 → 抛错（notFound）', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue(null);
    await expect(shoesService.retire('u1', 's1')).rejects.toThrow();
  });
});

describe('shoesService.myStats (V0.1.26)', () => {
  it('统计：总数/active/retired/总里程/即将退役数（healthRatio≥70%）', async () => {
    mockedPrisma.shoe.findMany.mockResolvedValue([
      { currentKm: 600, thresholdKm: 800, status: 'active' }, // 75% → 即将退役
      { currentKm: 300, thresholdKm: 800, status: 'active' }, // 37% → 健康
      { currentKm: 1000, thresholdKm: 800, status: 'retired' },
    ] as never);

    const r = await shoesService.myStats('u1');

    expect(r.total).toBe(3);
    expect(r.activeCount).toBe(2);
    expect(r.retiredCount).toBe(1);
    expect(r.totalKm).toBe(1900); // 600+300+1000
    expect(r.retiringSoonCount).toBe(1); // 仅 600/800=75%
  });
});
