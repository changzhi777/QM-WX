/**
 * family module 单测（V0.1.34，pic 2776 家庭方向）
 *
 * 覆盖：createFamily（含 conflict）/ joinFamily（含 notFound）/ myFamily（有/无家庭）
 *      / leaveFamily（member/owner）/ familyRanking（排序）/ inviteInfo
 *
 * vi.hoisted 包裹 createPrismaMock（避免 hoisting 引用错，范式同 feed/follow）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockErrors } from '../../helpers/mockErrors.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['family', 'familyMember', 'checkin'],
    txModels: ['family', 'familyMember'], // createFamily 用 $transaction
  });
});
vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { familyService } from 'src/modules/family/family.service.js';

beforeEach(() => vi.clearAllMocks());

describe('familyService.createFamily (V0.1.34)', () => {
  it('正常创建（owner 自动加入 + 8 位邀请码）', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue(null); // 无家庭
    mocks.tx.family.create.mockResolvedValue({
      id: 'f1',
      name: '我们家',
      inviteCode: 'ABC12345',
    } as never);
    mocks.tx.familyMember.create.mockResolvedValue({} as never);

    const r = await familyService.createFamily('u1', { name: '我们家' });

    expect(r.id).toBe('f1');
    expect(r.name).toBe('我们家');
    expect(r.inviteCode).toHaveLength(8);
    // 事务内创建 owner 成员
    expect(mocks.tx.familyMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ familyId: 'f1', userId: 'u1', role: 'owner' }),
      }),
    );
  });

  it('已有家庭 → conflict（不创建）', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue({
      id: 'm1',
      familyId: 'f0',
    } as never);
    await expect(familyService.createFamily('u1', { name: 'x' })).rejects.toThrow();
    expect(mocks.tx.family.create).not.toHaveBeenCalled();
  });
});

describe('familyService.joinFamily (V0.1.34)', () => {
  it('正常加入（role=member）', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue(null);
    mocks.prisma.family.findUnique.mockResolvedValue({
      id: 'f1',
      name: '我们家',
    } as never);
    mocks.prisma.familyMember.create.mockResolvedValue({} as never);

    const r = await familyService.joinFamily('u1', { inviteCode: 'ABC12345' });

    expect(r.id).toBe('f1');
    expect(mocks.prisma.familyMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ familyId: 'f1', userId: 'u1', role: 'member' }),
      }),
    );
  });

  it('邀请码无效 → notFound', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue(null);
    mocks.prisma.family.findUnique.mockResolvedValue(null);
    await expect(
      familyService.joinFamily('u1', { inviteCode: 'BADCODE' }),
    ).rejects.toThrow();
  });
});

describe('familyService.myFamily (V0.1.34)', () => {
  it('无家庭 → family:null', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue(null);
    const r = await familyService.myFamily('u1');
    expect(r.family).toBeNull();
  });

  it('有家庭 → 返家庭卡 + 成员跑量', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue({
      family: {
        id: 'f1',
        name: '我们家',
        inviteCode: 'ABC12345',
        ownerId: 'u1',
        createdAt: new Date('2026-07-04T00:00:00Z'),
        members: [
          {
            userId: 'u1',
            role: 'owner',
            joinedAt: new Date(),
            user: { id: 'u1', nickname: '我', avatarUrl: null },
          },
          {
            userId: 'u2',
            role: 'member',
            joinedAt: new Date(),
            user: { id: 'u2', nickname: '家人', avatarUrl: null },
          },
        ],
      },
    } as never);
    mocks.prisma.checkin.groupBy.mockResolvedValue([
      { userId: 'u1', _sum: { distance: 15.5 } },
      { userId: 'u2', _sum: { distance: 15.5 } },
    ] as never);

    const r = await familyService.myFamily('u1');

    expect(r.family).not.toBeNull();
    expect(r.family!.name).toBe('我们家');
    expect(r.family!.memberCount).toBe(2);
    expect(r.family!.isOwner).toBe(true);
    expect(r.family!.members).toHaveLength(2);
    expect(r.family!.members[0].monthDistance).toBe(15.5);
  });
});

describe('familyService.leaveFamily (V0.1.34)', () => {
  it('member 离开 → delete', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue({
      id: 'm1',
      role: 'member',
    } as never);
    mocks.prisma.familyMember.delete.mockResolvedValue({} as never);

    const r = await familyService.leaveFamily('u1');

    expect(r.ok).toBe(true);
    expect(mocks.prisma.familyMember.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });

  it('owner 不可离开 → badRequest（不 delete）', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue({
      id: 'm1',
      role: 'owner',
    } as never);
    await expect(familyService.leaveFamily('u1')).rejects.toThrow();
    expect(mocks.prisma.familyMember.delete).not.toHaveBeenCalled();
  });
});

describe('familyService.familyRanking (V0.1.34)', () => {
  it('成员跑量榜（按距离降序，groupBy 1 次查询）', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue({ familyId: 'f1' } as never);
    mocks.prisma.familyMember.findMany.mockResolvedValue([
      { userId: 'u1', user: { id: 'u1', nickname: 'A', avatarUrl: null } },
      { userId: 'u2', user: { id: 'u2', nickname: 'B', avatarUrl: null } },
    ] as never);
    // V0.1.34 优化：groupBy 1 次返成员跑量（替代 N 次 aggregate）
    mocks.prisma.checkin.groupBy.mockResolvedValue([
      { userId: 'u1', _sum: { distance: 10 } },
      { userId: 'u2', _sum: { distance: 20 } },
    ] as never);

    const r = await familyService.familyRanking('u1', { period: 'month' });

    expect(r.ranking).toHaveLength(2);
    expect(r.ranking[0].userId).toBe('u2'); // 20km 第一
    expect(r.ranking[0].distance).toBe(20);
    expect(r.ranking[1].userId).toBe('u1'); // 10km 第二
    // groupBy 应被调用 1 次（非 N 次 aggregate）
    expect(mocks.prisma.checkin.groupBy).toHaveBeenCalledTimes(1);
  });
});

describe('familyService.inviteInfo (V0.1.34)', () => {
  it('返邀请码', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue({
      family: { name: '我们家', inviteCode: 'ABC12345' },
    } as never);
    const r = await familyService.inviteInfo('u1');
    expect(r.name).toBe('我们家');
    expect(r.inviteCode).toBe('ABC12345');
  });
});

describe('familyService.transferOwner (V0.1.39)', () => {
  it('owner 转让 → 事务内 3 update（旧 owner member + 新 owner owner + family.ownerId）', async () => {
    mocks.prisma.familyMember.findUnique
      .mockResolvedValueOnce({ familyId: 'f1', role: 'owner' } as never) // 当前 owner
      .mockResolvedValueOnce({ userId: 'u2', familyId: 'f1' } as never); // newOwner 同家庭
    mocks.tx.familyMember.update.mockResolvedValue({} as never);
    mocks.tx.family.update.mockResolvedValue({} as never);

    const r = await familyService.transferOwner('u1', { newOwnerId: 'u2' });

    expect(r.ok).toBe(true);
    expect(mocks.tx.familyMember.update).toHaveBeenCalledTimes(2); // 旧 owner + 新 owner
    expect(mocks.tx.family.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'f1' }, data: { ownerId: 'u2' } }),
    );
  });

  it('非 owner → forbidden', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue({
      familyId: 'f1',
      role: 'member',
    } as never);
    await expect(familyService.transferOwner('u1', { newOwnerId: 'u2' })).rejects.toThrow();
  });
});

describe('familyService.dissolveFamily (V0.1.39)', () => {
  it('owner 解散 → delete Family（级联成员/目标）', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue({
      familyId: 'f1',
      role: 'owner',
    } as never);
    mocks.prisma.family.delete.mockResolvedValue({} as never);

    const r = await familyService.dissolveFamily('u1');

    expect(r.ok).toBe(true);
    expect(mocks.prisma.family.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
  });

  it('非 owner → forbidden', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue({
      familyId: 'f1',
      role: 'member',
    } as never);
    await expect(familyService.dissolveFamily('u1')).rejects.toThrow();
  });
});

describe('familyService.familyAchievements (V0.1.39 家庭成就)', () => {
  it('返全家累计跑量 + 里程碑 achieved/progress', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue({ familyId: 'f1' } as never);
    mocks.prisma.familyMember.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
    ] as never);
    mocks.prisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 600 } } as never);

    const r = await familyService.familyAchievements('u1');

    expect(r.totalDistance).toBe(600);
    expect(r.achievements).toHaveLength(5); // 100/500/1000/2000/5000
    expect(r.achievements[0]).toEqual({ km: 100, achieved: true, progress: 100 }); // 600>=100
    expect(r.achievements[1]).toEqual({ km: 500, achieved: true, progress: 100 }); // 600>=500
    expect(r.achievements[2].achieved).toBe(false); // 600<1000
    expect(r.achievements[2].progress).toBe(60); // 600/1000*100
  });

  it('未加入家庭 → 空 achievements', async () => {
    mocks.prisma.familyMember.findUnique.mockResolvedValue(null);
    const r = await familyService.familyAchievements('u1');
    expect(r.achievements).toEqual([]);
    expect(r.totalDistance).toBe(0);
  });
});
