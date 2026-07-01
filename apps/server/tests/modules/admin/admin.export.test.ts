/**
 * admin 报表 + 导出 单元测试（V0.1.19）
 *
 * 覆盖：
 * - statsByTimeRange 时序聚合（按 day/week/month）+ 空区间 + 非法日期
 * - exportOrders CSV 输出格式 + 状态筛选
 * - exportUsers CSV 输出格式 + 关键词 / isBanned 筛选
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  order: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  $queryRawUnsafe: vi.fn(),
}));

vi.mock('src/infra/prisma.js', () => ({ prisma: mockPrisma }));

import {
  statsByTimeRange,
  exportOrders,
  exportUsers,
} from '../../../src/modules/admin/admin.service.js';
import { UTF8_BOM } from '../../../src/common/csv.js';

describe('admin.service · statsByTimeRange', () => {
  beforeEach(() => vi.clearAllMocks());

  it('day 粒度 → date_trunc day + 双路聚合（order + user）', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        { bucket: new Date('2026-06-01T00:00:00Z'), revenue: '100.50', cnt: 5n },
        { bucket: new Date('2026-06-02T00:00:00Z'), revenue: '200.00', cnt: 3n },
      ])
      .mockResolvedValueOnce([
        { bucket: new Date('2026-06-01T00:00:00Z'), cnt: 2n },
        { bucket: new Date('2026-06-03T00:00:00Z'), cnt: 1n },
      ]);

    const res = await statsByTimeRange({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      granularity: 'day',
    });

    expect(res.granularity).toBe('day');
    expect(res.series).toHaveLength(3); // 6-01, 6-02, 6-03
    expect(res.series[0]).toMatchObject({
      bucket: '2026-06-01T00:00:00.000Z',
      revenue: '100.50',
      orderCount: 5,
      userCount: 2,
    });
    expect(res.series[2]).toMatchObject({
      bucket: '2026-06-03T00:00:00.000Z',
      revenue: '0', // 用户行无 order
      orderCount: 0,
      userCount: 1,
    });
  });

  it('非法日期 → 400', async () => {
    await expect(
      statsByTimeRange({ startDate: 'not-a-date', endDate: '2026-06-30', granularity: 'day' }),
    ).rejects.toMatchObject({ code: 400 });
  });

  it('空区间 → 空 series（不报错）', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await statsByTimeRange({
      startDate: '2030-01-01',
      endDate: '2030-01-02',
      granularity: 'week',
    });
    expect(res.series).toEqual([]);
  });
});

describe('admin.service · exportOrders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('带 status 筛选 + CSV 输出 BOM + 表头 + 行', async () => {
    mockPrisma.order.findMany.mockResolvedValue([
      {
        id: 'o-1',
        user: { openid: 'o-x', nickname: 'Alice', phone: '13800000000' },
        status: 'paid',
        totalAmount: { toString: () => '100.00' },
        payAmount: { toString: () => '80.00' },
        pointsUsed: 200,
        payChannel: 'wxpay',
        items: [{ id: 'i-1' }, { id: 'i-2' }],
        createdAt: new Date('2026-06-15T08:00:00Z'),
        paidAt: new Date('2026-06-15T08:05:00Z'),
      },
    ]);

    const csv = await exportOrders({ status: 'paid' });

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain('订单ID,用户openid');
    expect(csv).toContain('o-1,o-x,Alice,13800000000,paid,100.00,80.00,200,wxpay,2');
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'paid' }, take: 100_000 }),
    );
  });

  it('日期范围筛选', async () => {
    mockPrisma.order.findMany.mockResolvedValue([]);

    await exportOrders({
      startDate: '2026-06-01T00:00:00Z',
      endDate: '2026-06-30T23:59:59Z',
    });

    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            gte: new Date('2026-06-01T00:00:00Z'),
            lte: new Date('2026-06-30T23:59:59Z'),
          },
        },
      }),
    );
  });
});

describe('admin.service · exportUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('关键词 + isBanned 筛选 + CSV 输出', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'u-1',
        openid: 'o-user-1',
        nickname: '小明',
        phone: '13900000000',
        memberLevel: 'monthly',
        points: 100,
        isBanned: true,
        bannedAt: new Date('2026-06-10T05:00:00Z'),
        bannedReason: 'spam',
        createdAt: new Date('2026-05-01T03:00:00Z'),
      },
    ]);

    const csv = await exportUsers({ keyword: '小', isBanned: true });

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain('用户ID,openid,昵称');
    // 昵称"小明"无转义字符，正常输出
    expect(csv).toContain('u-1,o-user-1,小明,13900000000,monthly,100,是,');
    expect(csv).toContain(',spam,'); // 封禁原因
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ nickname: { contains: '小' } }, { phone: { contains: '小' } }], isBanned: true },
        take: 100_000,
      }),
    );
  });

  it('无筛选 → where 为空对象', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    await exportUsers({});
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 100_000 }),
    );
  });
});