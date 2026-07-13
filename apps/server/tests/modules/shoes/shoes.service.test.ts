/**
 * shoes module 单测（V0.1.26 跑者向 + V0.1.133 增强）
 *
 * V0.1.26：list（含 healthRatio）/ add / retire / myStats
 * V0.1.133：getDetail / getMileageHistory（含 garmin cm→km 单位分流 + 周/月分桶）/ updateThreshold
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockErrors } from '../../helpers/mockErrors.js';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    shoe: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    checkin: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
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

// ============================================================
// V0.1.133 跑鞋增强：详情 / 历史里程曲线 / 阈值更新
// ============================================================

describe('shoesService.getDetail (V0.1.133)', () => {
  it('返详情 + 累计打卡数 + 最新打卡 + 购买天数', async () => {
    const purchased = new Date('2026-01-01T00:00:00Z');
    mockedPrisma.shoe.findFirst.mockResolvedValue({
      id: 's1', brand: 'Nike', model: 'Vaporfly', nickname: '战靴',
      currentKm: 600, thresholdKm: 800, status: 'active',
      purchasedAt: purchased, note: '主力',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-07-01T00:00:00Z'),
    } as never);
    mockedPrisma.checkin.count.mockResolvedValue(42);
    mockedPrisma.checkin.findFirst.mockResolvedValue({
      createdAt: new Date('2026-07-10T00:00:00Z'),
    } as never);

    const r = await shoesService.getDetail('u1', 's1');

    expect(r.id).toBe('s1');
    expect(r.healthRatio).toBe(75); // 600/800*100
    expect(r.totalCheckins).toBe(42);
    expect(r.latestCheckinAt).toBe('2026-07-10T00:00:00.000Z');
    expect(r.daysSincePurchase).toBeGreaterThan(180);
  });

  it('不属于自己的鞋 → notFound', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue(null);
    await expect(shoesService.getDetail('u1', 's99')).rejects.toThrow();
  });
});

describe('shoesService.getMileageHistory (V0.1.133)', () => {
  it('garmin cm 数据 → 单位分流 /100000 转 km', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue({ id: 's1' } as never);
    // 3 条 garmin 数据（同 ISO 周 W28 + 同月 2026-07）：5000cm + 8000cm + 10000cm
    // (cm→km: 0.05 + 0.08 + 0.10 = 0.23km)
    mockedPrisma.checkin.findMany.mockResolvedValue([
      { distance: 5000, createdAt: new Date('2026-07-06T10:00:00Z'), dataSource: 'garmin' }, // Mon
      { distance: 8000, createdAt: new Date('2026-07-08T10:00:00Z'), dataSource: 'garmin' }, // Wed
      { distance: 10000, createdAt: new Date('2026-07-10T10:00:00Z'), dataSource: 'garmin' }, // Fri
    ] as never);

    const r = await shoesService.getMileageHistory('u1', 's1');

    expect(r.totalCheckins).toBe(3);
    expect(r.totalKm).toBeCloseTo(0.2, 1); // 0.23 → 0.2 (round 1 位小数)
    expect(r.weekly).toHaveLength(1); // 同 ISO 周 (W28)
    expect(r.monthly).toHaveLength(1); // 同月 (2026-07)
    expect(r.weekly[0].distanceKm).toBeCloseTo(0.2, 1);
  });

  it('sport.checkin km 数据 → 直通（不除）', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue({ id: 's1' } as never);
    // 2 条 sport 数据：5km + 8km（km 单位直通）
    mockedPrisma.checkin.findMany.mockResolvedValue([
      { distance: 5, createdAt: new Date('2026-07-01T10:00:00Z'), dataSource: 'sport' },
      { distance: 8, createdAt: new Date('2026-07-15T10:00:00Z'), dataSource: 'sport' },
    ] as never);

    const r = await shoesService.getMileageHistory('u1', 's1');

    expect(r.totalKm).toBe(13); // 5+8 直通
    expect(r.totalCheckins).toBe(2);
  });

  it('周+月双粒度分桶（跨周/跨月）', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue({ id: 's1' } as never);
    // 跨 3 周 + 2 月
    mockedPrisma.checkin.findMany.mockResolvedValue([
      { distance: 5, createdAt: new Date('2026-06-28T10:00:00Z'), dataSource: 'sport' },  // 2026-W27 2026-06
      { distance: 3, createdAt: new Date('2026-07-05T10:00:00Z'), dataSource: 'sport' },  // 2026-W28 2026-07
      { distance: 7, createdAt: new Date('2026-07-12T10:00:00Z'), dataSource: 'sport' },  // 2026-W29 2026-07
      { distance: 10, createdAt: new Date('2026-07-25T10:00:00Z'), dataSource: 'sport' }, // 2026-W30 2026-07
    ] as never);

    const r = await shoesService.getMileageHistory('u1', 's1');

    expect(r.weekly).toHaveLength(4); // 4 个不同的周
    expect(r.monthly).toHaveLength(2); // 2 个不同的月
    expect(r.monthly[0].period).toBe('2026-06');
    expect(r.monthly[0].distanceKm).toBe(5);
    expect(r.monthly[1].period).toBe('2026-07');
    expect(r.monthly[1].distanceKm).toBe(20); // 3+7+10
    expect(r.totalKm).toBe(25);
  });

  it('空数据 → 双数组空 + totalCheckins=0', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue({ id: 's1' } as never);
    mockedPrisma.checkin.findMany.mockResolvedValue([]);

    const r = await shoesService.getMileageHistory('u1', 's1');

    expect(r.weekly).toEqual([]);
    expect(r.monthly).toEqual([]);
    expect(r.totalCheckins).toBe(0);
    expect(r.totalKm).toBe(0);
  });

  it('不属于自己的鞋 → notFound', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue(null);
    await expect(shoesService.getMileageHistory('u1', 's99')).rejects.toThrow();
  });
});

describe('shoesService.updateThreshold (V0.1.133)', () => {
  it('更新阈值（仅 thresholdKm 字段）', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue({ id: 's1' } as never);
    mockedPrisma.shoe.update.mockResolvedValue({} as never);

    const r = await shoesService.updateThreshold('u1', { id: 's1', thresholdKm: 1000 });

    expect(mockedPrisma.shoe.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { thresholdKm: 1000 },
    });
    expect(r).toEqual({ id: 's1', thresholdKm: 1000 });
  });

  it('不存在 → notFound', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue(null);
    await expect(shoesService.updateThreshold('u1', { id: 's99', thresholdKm: 800 })).rejects.toThrow();
  });
});

// ============================================================
// V0.1.137 compareShoes
// ============================================================

describe('shoesService.compareShoes (V0.1.137)', () => {
  it('正常返 2 双汇总（含 checkinCount + healthRatio）', async () => {
    mockedPrisma.shoe.findMany.mockResolvedValue([
      { id: 's1', brand: 'Nike', model: 'Vaporfly', nickname: '战靴一号', status: 'active', currentKm: 600, thresholdKm: 800, purchasedAt: new Date('2026-01-01') },
      { id: 's2', brand: '必迈', model: '路征', nickname: null, status: 'active', currentKm: 300, thresholdKm: 800, purchasedAt: new Date('2026-05-01') },
    ] as never);
    mockedPrisma.checkin.groupBy.mockResolvedValue([
      { shoeId: 's1', _count: { _all: 50 } },
      { shoeId: 's2', _count: { _all: 30 } },
    ] as never);

    const r = await shoesService.compareShoes('u1', ['s1', 's2']);
    expect(r.shoes).toHaveLength(2);
    expect(r.shoes[0].checkinCount).toBe(50);
    expect(r.shoes[0].healthRatio).toBe(75);
    expect(r.shoes[1].daysSincePurchase).toBeGreaterThan(0);
  });

  it('ids 数量 != 2 → badRequest', async () => {
    await expect(shoesService.compareShoes('u1', ['s1'])).rejects.toThrow();
  });

  it('鞋不属 user → notFound', async () => {
    mockedPrisma.shoe.findMany.mockResolvedValue([{ id: 's1' }] as never);
    await expect(shoesService.compareShoes('u1', ['s1', 's99'])).rejects.toThrow();
  });
});
