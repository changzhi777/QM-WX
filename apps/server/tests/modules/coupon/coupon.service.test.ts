/**
 * coupon.service 单测（V0.1.23 MVP）
 * - receive：模板不存在/已领过抛错 + 首次创建实例
 * - templates：返回模板 + received 标记
 * - myCoupons：先标过期再查
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    coupon: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  },
}));

import { prisma } from 'src/infra/prisma.js';
import { couponService } from 'src/modules/coupon/coupon.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => vi.clearAllMocks());

describe('couponService.receive', () => {
  it('模板不存在抛错', async () => {
    await expect(couponService.receive('u1', 'nonexistent')).rejects.toThrow();
  });

  it('已领过抛错', async () => {
    mockedPrisma.coupon.findFirst.mockResolvedValue({ id: 'c1' } as never);
    await expect(couponService.receive('u1', 'newuser-10')).rejects.toThrow('已领取');
  });

  it('首次领取创建实例', async () => {
    mockedPrisma.coupon.findFirst.mockResolvedValue(null as never);
    mockedPrisma.coupon.create.mockResolvedValue({ id: 'c1', expireAt: new Date('2026-08-01') } as never);
    const r = await couponService.receive('u1', 'newuser-10');
    expect(r.id).toBe('c1');
    expect(mockedPrisma.coupon.create).toHaveBeenCalled();
  });
});

describe('couponService.templates', () => {
  it('返回模板 + received 标记', async () => {
    mockedPrisma.coupon.findMany.mockResolvedValue([{ title: '新人 10 元券' }] as never);
    const r = await couponService.templates('u1');
    expect(r.templates.length).toBeGreaterThan(0);
    const newuser = r.templates.find((t) => t.templateId === 'newuser-10');
    expect(newuser?.received).toBe(true);
    const full100 = r.templates.find((t) => t.templateId === 'full100-20');
    expect(full100?.received).toBe(false);
  });
});

describe('couponService.myCoupons', () => {
  it('先标过期再查（updateMany 调用）', async () => {
    mockedPrisma.coupon.updateMany.mockResolvedValue({ count: 0 } as never);
    mockedPrisma.coupon.findMany.mockResolvedValue([] as never);
    const r = await couponService.myCoupons('u1', 'unused');
    expect(r.count).toBe(0);
    expect(mockedPrisma.coupon.updateMany).toHaveBeenCalled();
  });
});

// V0.2.23 funcs% 加固：补 availableCount（原 80% 缺口）
describe('couponService.availableCount', () => {
  it('先 markExpired 再 count unused', async () => {
    mockedPrisma.coupon.updateMany.mockResolvedValue({ count: 0 } as never);
    mockedPrisma.coupon.count.mockResolvedValue(2 as never);
    const r = await couponService.availableCount('u1');
    expect(r).toBe(2);
    expect(mockedPrisma.coupon.updateMany).toHaveBeenCalled();
    expect(mockedPrisma.coupon.count).toHaveBeenCalledWith({ where: { userId: 'u1', status: 'unused' } });
  });
});
