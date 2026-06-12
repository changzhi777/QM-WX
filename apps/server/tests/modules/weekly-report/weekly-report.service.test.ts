/**
 * weekly-report service 单元测试
 *
 * 覆盖：
 * - currentWeek: 无群 / 传 groupId 但非成员 / 正常聚合
 * - aggregate: 群不存在 / 空 checkin / 多人打卡 / top5 + 冠军
 * - trigger: 非群主 / 群主 → 写 GroupReport
 * - myReport: 透传 currentWeek
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  groupMethods: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  groupMemberMethods: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  checkinMethods: {
    findMany: vi.fn(),
  },
  groupReportMethods: {
    upsert: vi.fn(),
  },
}));

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    group: mocks.groupMethods,
    groupMember: mocks.groupMemberMethods,
    checkin: mocks.checkinMethods,
    groupReport: mocks.groupReportMethods,
  },
}));

vi.mock('src/common/errors.js', () => ({
  Errors: {
    forbidden: (msg: string) => {
      const e = new Error(msg) as Error & { code: number; statusCode: number };
      e.code = 403;
      e.statusCode = 403;
      return e;
    },
    notFound: (msg: string) => {
      const e = new Error(msg) as Error & { code: number; statusCode: number };
      e.code = 404;
      e.statusCode = 404;
      return e;
    },
  },
}));

import { weeklyReportService } from '../../../src/modules/weekly-report/weekly-report.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('weeklyReportService.currentWeek', () => {
  it('用户不在任何群 → 返回空数组', async () => {
    mocks.groupMemberMethods.findMany.mockResolvedValue([]);
    const result = await weeklyReportService.currentWeek('u1');
    expect(result).toEqual([]);
  });

  it('传 groupId 但不是成员 → forbidden', async () => {
    mocks.groupMemberMethods.findUnique.mockResolvedValue(null);
    await expect(weeklyReportService.currentWeek('u1', 'g1')).rejects.toThrow(
      /不在该群中/,
    );
  });

  it('传 groupId 是成员 → 聚合该群', async () => {
    mocks.groupMemberMethods.findUnique.mockResolvedValue({ userId: 'u1', groupId: 'g1' });
    mocks.groupMethods.findUnique.mockResolvedValue({ id: 'g1', name: '跑群 A' });
    mocks.checkinMethods.findMany.mockResolvedValue([]);

    const result = await weeklyReportService.currentWeek('u1', 'g1');
    expect(result).toHaveLength(1);
    expect(result[0].groupId).toBe('g1');
    expect(result[0].groupName).toBe('跑群 A');
    expect(result[0].totalMembers).toBe(0);
    expect(result[0].champion).toBeNull();
  });
});

describe('weeklyReportService.aggregate', () => {
  const period = '2026-W25';
  const start = new Date('2026-06-15T00:00:00Z');
  const end = new Date('2026-06-21T23:59:59Z');

  it('群不存在 → notFound', async () => {
    mocks.groupMethods.findUnique.mockResolvedValue(null);
    await expect(weeklyReportService.aggregate('g1', period, start, end)).rejects.toThrow(
      /群不存在/,
    );
  });

  it('无 checkin → totalMembers=0 / champion=null', async () => {
    mocks.groupMethods.findUnique.mockResolvedValue({ id: 'g1', name: '空群' });
    mocks.checkinMethods.findMany.mockResolvedValue([]);

    const report = await weeklyReportService.aggregate('g1', period, start, end);
    expect(report.totalMembers).toBe(0);
    expect(report.totalCheckins).toBe(0);
    expect(report.totalDistance).toBe(0);
    expect(report.topMembers).toEqual([]);
    expect(report.champion).toBeNull();
  });

  it('3 人打卡：按 distance 排序，冠军=距离最大者', async () => {
    mocks.groupMethods.findUnique.mockResolvedValue({ id: 'g1', name: '跑群' });
    mocks.checkinMethods.findMany.mockResolvedValue([
      {
        userId: 'u1',
        distance: 3,
        points: 3,
        user: { id: 'u1', nickname: '张三', avatarUrl: 'a1' },
      },
      {
        userId: 'u2',
        distance: 5,
        points: 5,
        user: { id: 'u2', nickname: '李四', avatarUrl: 'a2' },
      },
      {
        userId: 'u1',
        distance: 2,
        points: 2,
        user: { id: 'u1', nickname: '张三', avatarUrl: 'a1' },
      },
      {
        userId: 'u3',
        distance: 10,
        points: 10,
        user: { id: 'u3', nickname: '王五', avatarUrl: null },
      },
    ]);

    const report = await weeklyReportService.aggregate('g1', period, start, end);
    expect(report.totalMembers).toBe(3);
    expect(report.topMembers[0].userId).toBe('u3');
    expect(report.topMembers[0].rank).toBe(1);
    expect(report.champion?.userId).toBe('u3');
    expect(report.champion?.nickname).toBe('王五');

    // u1 聚合：distance=5, count=2
    const u1 = report.topMembers.find((m) => m.userId === 'u1');
    expect(u1?.distance).toBe(5);
    expect(u1?.checkinCount).toBe(2);
    // u2 distance=5 count=1
    const u2 = report.topMembers.find((m) => m.userId === 'u2');
    expect(u2?.distance).toBe(5);
  });

  it('user.nickname 为空 → 显示「匿名」', async () => {
    mocks.groupMethods.findUnique.mockResolvedValue({ id: 'g1', name: '群' });
    mocks.checkinMethods.findMany.mockResolvedValue([
      {
        userId: 'u1',
        distance: 3,
        points: 3,
        user: { id: 'u1', nickname: null, avatarUrl: null },
      },
    ]);

    const report = await weeklyReportService.aggregate('g1', period, start, end);
    expect(report.topMembers[0].nickname).toBe('匿名');
  });

  it('多于 5 人：只取 top5', async () => {
    mocks.groupMethods.findUnique.mockResolvedValue({ id: 'g1', name: '群' });
    const checkins = Array.from({ length: 8 }, (_, i) => ({
      userId: `u${i}`,
      distance: i + 1,
      points: i + 1,
      user: { id: `u${i}`, nickname: `U${i}`, avatarUrl: null },
    }));
    mocks.checkinMethods.findMany.mockResolvedValue(checkins);

    const report = await weeklyReportService.aggregate('g1', period, start, end);
    expect(report.topMembers).toHaveLength(5);
    expect(report.topMembers.map((m) => m.rank)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('weeklyReportService.trigger', () => {
  it('非群成员 → forbidden', async () => {
    mocks.groupMemberMethods.findUnique.mockResolvedValue(null);
    await expect(weeklyReportService.trigger('u1', 'g1')).rejects.toThrow(/不在该群中/);
  });

  it('成员但非群主 → forbidden', async () => {
    mocks.groupMemberMethods.findUnique.mockResolvedValue({
      userId: 'u1',
      groupId: 'g1',
      role: 'member',
    });
    await expect(weeklyReportService.trigger('u1', 'g1')).rejects.toThrow(/仅群主/);
  });

  it('群主触发 → 写 GroupReport (upsert)', async () => {
    mocks.groupMemberMethods.findUnique.mockResolvedValue({
      userId: 'u1',
      groupId: 'g1',
      role: 'owner',
    });
    mocks.groupMethods.findUnique.mockResolvedValue({ id: 'g1', name: '群' });
    mocks.checkinMethods.findMany.mockResolvedValue([]);
    mocks.groupReportMethods.upsert.mockResolvedValue({ id: 'r1' });

    const result = await weeklyReportService.trigger('u1', 'g1');
    expect(result.reportId).toBe('r1');
    expect(mocks.groupReportMethods.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId_period: { groupId: 'g1', period: expect.any(String) } },
        create: expect.objectContaining({ groupId: 'g1' }),
        update: expect.objectContaining({ summary: expect.anything() }),
      }),
    );
  });
});

describe('weeklyReportService.myReport', () => {
  it('透传 currentWeek', async () => {
    mocks.groupMemberMethods.findMany.mockResolvedValue([]);
    const result = await weeklyReportService.myReport('u1');
    expect(result.reports).toEqual([]);
  });
});
