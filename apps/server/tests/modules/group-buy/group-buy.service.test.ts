/**
 * group-buy module 单测（V0.1.37，2764 电商团购 — 简化 MVP）
 *
 * 覆盖：list（含 isJoined）/ join（参与 + 达目标 reached + notify 循环 + conflict/badRequest）/ myJoined
 *
 * vi.hoisted 包裹 createPrismaMock；mock notify（隔离 + 断言集成）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockErrors } from '../../helpers/mockErrors.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['groupBuy', 'groupBuyMember'],
    txModels: ['groupBuy', 'groupBuyMember'], // join 用 $transaction
  });
});
vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));
vi.mock('src/modules/notification/notification.service.js', () => ({ notify: vi.fn() }));

import { groupBuyService } from 'src/modules/group-buy/group-buy.service.js';
import { notify } from 'src/modules/notification/notification.service.js';

beforeEach(() => vi.clearAllMocks());

describe('groupBuyService.list (V0.1.37)', () => {
  it('返 active 团购 + isJoined=false（未参与）+ Decimal 序列化', async () => {
    mocks.prisma.groupBuy.findMany.mockResolvedValue([
      {
        id: 'g1',
        groupPrice: '99.00' as never, // Decimal mock（toString 调用返自身）
        targetCount: 10,
        currentCount: 3,
        status: 'active',
        endDate: null,
        createdAt: new Date(),
        product: { id: 'p1', name: '跑鞋', price: '199.00' as never, images: ['x.jpg'], status: 'on' },
        members: [], // 未参与
      },
    ] as never);
    mocks.prisma.groupBuy.count.mockResolvedValue(1 as never);

    const r = await groupBuyService.list('u1', { page: 1, pageSize: 20 });

    expect(r.list).toHaveLength(1);
    expect(r.list[0].groupPrice).toBe('99.00');
    expect(r.list[0].product.price).toBe('199.00');
    expect(r.list[0].isJoined).toBe(false);
    expect(r.hasMore).toBe(false);
  });
});

describe('groupBuyService.join (V0.1.37)', () => {
  it('参与 → currentCount+1（事务内 create + update），未成团不 notify', async () => {
    mocks.prisma.groupBuy.findUnique
      .mockResolvedValueOnce({ id: 'g1', status: 'active' } as never) // 初始查
      .mockResolvedValueOnce({ status: 'active', product: { name: '跑鞋' } } as never); // fresh（未成团）
    mocks.prisma.groupBuyMember.findUnique.mockResolvedValue(null); // 未参与
    mocks.tx.groupBuyMember.create.mockResolvedValue({} as never);
    mocks.tx.groupBuy.update.mockResolvedValue({
      currentCount: 4,
      targetCount: 10,
      status: 'active',
    } as never);

    const r = await groupBuyService.join('u1', { id: 'g1' });

    expect(r.joined).toBe(true);
    expect(mocks.tx.groupBuyMember.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { groupBuyId: 'g1', userId: 'u1' } }),
    );
    expect(notify).not.toHaveBeenCalled(); // 未成团
  });

  it('达目标 → status=reached + notify 所有成员（循环）', async () => {
    mocks.prisma.groupBuy.findUnique
      .mockResolvedValueOnce({ id: 'g1', status: 'active' } as never)
      .mockResolvedValueOnce({ status: 'reached', product: { name: '跑鞋' } } as never); // fresh 成团
    mocks.prisma.groupBuyMember.findUnique.mockResolvedValue(null);
    mocks.tx.groupBuyMember.create.mockResolvedValue({} as never);
    mocks.tx.groupBuy.update
      .mockResolvedValueOnce({ currentCount: 10, targetCount: 10, status: 'active' } as never) // increment
      .mockResolvedValue({} as never); // status=reached
    mocks.prisma.groupBuyMember.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
    ] as never);

    await groupBuyService.join('u1', { id: 'g1' });

    // notify 2 次（u1 + u2，循环）
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'system',
        targetType: 'groupBuy',
        content: expect.stringContaining('已成团'),
      }),
    );
  });

  it('已参与 → conflict', async () => {
    mocks.prisma.groupBuy.findUnique.mockResolvedValue({ id: 'g1', status: 'active' } as never);
    mocks.prisma.groupBuyMember.findUnique.mockResolvedValue({ id: 'm1' } as never);
    await expect(groupBuyService.join('u1', { id: 'g1' })).rejects.toThrow();
  });

  it('已成团 → badRequest', async () => {
    mocks.prisma.groupBuy.findUnique.mockResolvedValue({ id: 'g1', status: 'reached' } as never);
    await expect(groupBuyService.join('u1', { id: 'g1' })).rejects.toThrow();
  });
});

describe('groupBuyService.detail (V0.1.37)', () => {
  it('返团购详情 + isJoined=true', async () => {
    mocks.prisma.groupBuy.findUnique.mockResolvedValue({
      id: 'g1',
      groupPrice: '99.00' as never,
      targetCount: 10,
      currentCount: 5,
      status: 'active',
      endDate: null,
      createdAt: new Date('2026-07-07T00:00:00Z'),
      product: { id: 'p1', name: '跑鞋', price: '199.00' as never, images: ['x.jpg'], description: 'desc', status: 'on' },
      members: [{ id: 'm1' }],
    } as never);

    const r = await groupBuyService.detail('u1', { id: 'g1' });

    expect(r.product.name).toBe('跑鞋');
    expect(r.isJoined).toBe(true);
    expect(r.groupPrice).toBe('99.00');
  });

  it('团购不存在 → notFound', async () => {
    mocks.prisma.groupBuy.findUnique.mockResolvedValue(null);
    await expect(groupBuyService.detail('u1', { id: 'gX' })).rejects.toThrow();
  });
});

describe('groupBuyService.myJoined (V0.1.37)', () => {
  it('返我参与的团购', async () => {
    mocks.prisma.groupBuyMember.findMany.mockResolvedValue([
      {
        joinedAt: new Date(),
        groupBuy: {
          id: 'g1',
          groupPrice: '99.00' as never,
          targetCount: 10,
          currentCount: 5,
          status: 'active',
          endDate: null,
          product: { id: 'p1', name: '跑鞋', price: '199.00' as never, images: [], status: 'on' },
        },
      },
    ] as never);
    mocks.prisma.groupBuyMember.count.mockResolvedValue(1 as never);

    const r = await groupBuyService.myJoined('u1', { page: 1, pageSize: 20 });

    expect(r.list).toHaveLength(1);
    expect(r.list[0].product.name).toBe('跑鞋');
  });
});
