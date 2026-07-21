/**
 * user.repository 单测（V0.2.55 补：funcs 50%→高）
 *
 * userRepo 6 方法：findByOpenid/findById/upsertByOpenid/updateProfile（简单 CRUD）
 *                + addPoints（change>0 赚取类累 totalPointsEarned / change<0 updateMany 防双花）
 *                + extendMember（memberExpireAt max(now,expire)+days / capDays 邀请封顶）
 * mock prisma（user/pointsRecord）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  pointsRecord: { create: vi.fn() },
}));

vi.mock('src/infra/prisma.js', () => ({ prisma: mockPrisma }));

import { userRepo } from '../../../src/modules/user/user.repository.js';

beforeEach(() => vi.clearAllMocks());

describe('userRepo · findByOpenid / findById', () => {
  it('findByOpenid → findUnique by openid', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', openid: 'o1' });
    const res = await userRepo.findByOpenid('o1');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { openid: 'o1' } });
    expect(res?.id).toBe('u1');
  });

  it('findById → findUnique by id', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    await userRepo.findById('u1');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });
});

describe('userRepo · upsertByOpenid', () => {
  it('create + update 含 nickname/avatarUrl/unionid', async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: 'u1' });
    await userRepo.upsertByOpenid('o1', { nickname: 'A', avatarUrl: 'url', unionid: 'un' });
    expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { openid: 'o1' },
        create: expect.objectContaining({ openid: 'o1', nickname: 'A', avatarUrl: 'url', unionid: 'un' }),
        update: expect.objectContaining({ nickname: 'A', avatarUrl: 'url', unionid: 'un' }),
      }),
    );
  });
});

describe('userRepo · updateProfile', () => {
  it('字段白名单 update', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 'u1' });
    await userRepo.updateProfile('u1', { nickname: 'B' });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { nickname: 'B' } });
  });
});

describe('userRepo · addPoints', () => {
  it('change>0 赚取类（checkin）→ inc points + totalPointsEarned + 写流水', async () => {
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ points: 150 });
    await userRepo.addPoints(mockPrisma, 'u1', 50, 'checkin');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: { points: { increment: 50 }, totalPointsEarned: { increment: 50 } },
      }),
    );
    expect(mockPrisma.pointsRecord.create).toHaveBeenCalledWith({
      data: { userId: 'u1', change: 50, type: 'checkin', refId: undefined, balance: 150 },
    });
  });

  it('change>0 非赚取类（admin_adjust）→ inc points 不累 totalPointsEarned', async () => {
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ points: 200 });
    await userRepo.addPoints(mockPrisma, 'u1', 50, 'admin_adjust');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { points: { increment: 50 } } }), // 无 totalPointsEarned
    );
  });

  it('change<0 → updateMany 防双花（where points>=-change）+ count>0 正常', async () => {
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ points: 50 });
    await userRepo.addPoints(mockPrisma, 'u1', -50, 'order_deduct');
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1', points: { gte: 50 } },
        data: { points: { increment: -50 } },
      }),
    );
  });

  it('change<0 余额不足（count=0）→ throw 积分不足', async () => {
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(userRepo.addPoints(mockPrisma, 'u1', -100, 'order_deduct')).rejects.toThrow(/积分不足/);
  });
});

describe('userRepo · extendMember', () => {
  it('无 capDays + free 会员 → memberLevel free→member + memberExpireAt = now+days', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      memberLevel: 'free',
      memberExpireAt: null,
      invitedBonusDays: 0,
    });
    mockPrisma.user.update.mockResolvedValue({});
    const res = await userRepo.extendMember(mockPrisma, 'u1', 7);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: { memberLevel: 'member', memberExpireAt: expect.any(Date) },
      }),
    );
    expect(res).toBeInstanceOf(Date);
  });

  it('capDays 超限（invitedBonusDays+days > capDays）→ throw 邀请上限', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      memberLevel: 'member',
      memberExpireAt: null,
      invitedBonusDays: 80,
    });
    await expect(userRepo.extendMember(mockPrisma, 'u1', 30, 90)).rejects.toThrow(/上限/); // 80+30 > 90
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('capDays 未超 → invitedBonusDays increment（邀请配额累加）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      memberLevel: 'member',
      memberExpireAt: null,
      invitedBonusDays: 10,
    });
    mockPrisma.user.update.mockResolvedValue({});
    await userRepo.extendMember(mockPrisma, 'u1', 7, 90); // 10+7 < 90
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitedBonusDays: { increment: 7 } }),
      }),
    );
  });
});
