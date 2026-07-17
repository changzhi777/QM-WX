/**
 * sport.repository 单测（V0.2.23 funcs% 加固）
 *
 * 直接测 sportRepo 8 函数（prisma mock），补 service.test.ts 间接覆盖的缺口。
 * 覆盖：findTodayCheckin / findMyCheckins / findGroupCheckins / findGroup /
 *      myGroups / isMember / countMyGroups / checkinInTx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    checkin: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    group: { findUnique: vi.fn() },
    groupMember: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from 'src/infra/prisma.js';
import { sportRepo } from '../../../src/modules/sport/sport.repository.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => vi.clearAllMocks());

describe('sportRepo', () => {
  it('findTodayCheckin → checkin.findFirst by userId+date', async () => {
    mockedPrisma.checkin.findFirst.mockResolvedValue({ id: 'c1' } as never);
    const r = await sportRepo.findTodayCheckin('u1', '2026-07-17');
    expect(r).toEqual({ id: 'c1' });
    expect(mockedPrisma.checkin.findFirst).toHaveBeenCalledWith({ where: { userId: 'u1', date: '2026-07-17' } });
  });

  it('findMyCheckins → findMany by userId + createdAt gte + orderBy desc', async () => {
    const since = new Date('2026-07-10');
    mockedPrisma.checkin.findMany.mockResolvedValue([{ id: 'c1' }] as never);
    const r = await sportRepo.findMyCheckins('u1', since);
    expect(r).toEqual([{ id: 'c1' }]);
    expect(mockedPrisma.checkin.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findGroupCheckins → findMany by groupId + createdAt gte + include user', async () => {
    const since = new Date('2026-07-10');
    mockedPrisma.checkin.findMany.mockResolvedValue([{ id: 'c1' }] as never);
    await sportRepo.findGroupCheckins('g1', since);
    expect(mockedPrisma.checkin.findMany).toHaveBeenCalledWith({
      where: { groupId: 'g1', createdAt: { gte: since } },
      include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
    });
  });

  it('findGroup → group.findUnique by id', async () => {
    mockedPrisma.group.findUnique.mockResolvedValue({ id: 'g1' } as never);
    const r = await sportRepo.findGroup('g1');
    expect(r).toEqual({ id: 'g1' });
    expect(mockedPrisma.group.findUnique).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });

  it('myGroups → groupMember.findMany + include group + orderBy joinedAt desc', async () => {
    mockedPrisma.groupMember.findMany.mockResolvedValue([{ groupId: 'g1' }] as never);
    await sportRepo.myGroups('u1');
    expect(mockedPrisma.groupMember.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      include: { group: true },
      orderBy: { joinedAt: 'desc' },
    });
  });

  it('isMember → groupMember.findUnique by groupId_userId 复合键', async () => {
    mockedPrisma.groupMember.findUnique.mockResolvedValue({ role: 'member' } as never);
    await sportRepo.isMember('g1', 'u1');
    expect(mockedPrisma.groupMember.findUnique).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: 'g1', userId: 'u1' } },
    });
  });

  it('countMyGroups → groupMember.count by userId', async () => {
    mockedPrisma.groupMember.count.mockResolvedValue(3 as never);
    const r = await sportRepo.countMyGroups('u1');
    expect(r).toBe(3);
    expect(mockedPrisma.groupMember.count).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('checkinInTx → tx.checkin.create with data', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'c1' });
    const tx = { checkin: { create } } as never;
    const data = {
      userId: 'u1', groupId: null, distance: 5, durationSec: 1800, pace: '6:00',
      heartRate: 150, cadence: 180, points: 10, date: '2026-07-17', shoeId: null,
      weatherTemp: null, humidity: null, lat: null, lon: null,
    };
    const r = await sportRepo.checkinInTx(tx, data as never);
    expect(r).toEqual({ id: 'c1' });
    expect(create).toHaveBeenCalledWith({ data });
  });
});
