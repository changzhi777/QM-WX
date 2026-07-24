/**
 * notification module 单测（V0.1.31，社交向 — 消息通知）
 *
 * 覆盖：list（含 actor）/ unreadCount / markRead（鉴权 forbidden）/ markAllRead / notify（自己跳过 + 创建）
 * vi.hoisted 包裹 createPrismaMock（同 feed.service.test.ts 范式，避免 hoisting 引用错）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockErrors } from '../../helpers/mockErrors.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['notification'],
    txModels: [],
  });
});
const realtimeMocks = vi.hoisted(() => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));
vi.mock('src/infra/realtime.js', () => ({ publishToUser: realtimeMocks.publishToUser }));

import { notificationService, notify, notifyGoalAchieved } from 'src/modules/notification/notification.service.js';

beforeEach(() => vi.clearAllMocks());

describe('notificationService.list (V0.1.31)', () => {
  it('返通知列表（含 actor 头像/昵称）', async () => {
    mocks.prisma.notification.findMany.mockResolvedValue([
      {
        id: 'n1',
        type: 'like',
        targetType: 'feed',
        targetId: 'f1',
        content: null,
        isRead: false,
        createdAt: new Date('2026-07-03T00:00:00Z'),
        actor: { id: 'u2', nickname: '张三', avatarUrl: null },
      },
    ] as never);
    mocks.prisma.notification.count.mockResolvedValue(1 as never);

    const r = await notificationService.list('u1', { page: 1, pageSize: 20 });

    expect(r.list).toHaveLength(1);
    expect(r.list[0].type).toBe('like');
    expect(r.list[0].isRead).toBe(false);
    expect(r.list[0].actor.nickname).toBe('张三');
    expect(r.hasMore).toBe(false);
  });

  it('分页 hasMore 计算', async () => {
    mocks.prisma.notification.findMany.mockResolvedValue([] as never);
    mocks.prisma.notification.count.mockResolvedValue(25 as never); // 第 1 页 pageSize=20，有更多
    const r = await notificationService.list('u1', { page: 1, pageSize: 20 });
    expect(r.hasMore).toBe(true);
  });
});

describe('notificationService.unreadCount (V0.1.31)', () => {
  it('返未读数', async () => {
    mocks.prisma.notification.count.mockResolvedValue(3 as never);
    const r = await notificationService.unreadCount('u1');
    expect(r.count).toBe(3);
    expect(mocks.prisma.notification.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', isRead: false } }),
    );
  });
});

describe('notificationService.markRead (V0.1.31)', () => {
  it('标记自己的通知已读', async () => {
    mocks.prisma.notification.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'u1',
      isRead: false,
    } as never);
    mocks.prisma.notification.update.mockResolvedValue({} as never);

    const r = await notificationService.markRead('u1', { notificationId: 'n1' });
    expect(r.ok).toBe(true);
    expect(mocks.prisma.notification.update).toHaveBeenCalled();
  });

  it('操作他人通知 → forbidden（不 update）', async () => {
    mocks.prisma.notification.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'u2', // 通知归属他人
      isRead: false,
    } as never);

    await expect(notificationService.markRead('u1', { notificationId: 'n1' })).rejects.toThrow();
    expect(mocks.prisma.notification.update).not.toHaveBeenCalled();
  });
});

describe('notificationService.markAllRead (V0.1.31)', () => {
  it('全部已读 updateMany（幂等）', async () => {
    mocks.prisma.notification.updateMany.mockResolvedValue({ count: 5 } as never);

    const r = await notificationService.markAllRead('u1');

    expect(r.ok).toBe(true);
    expect(r.updated).toBe(5);
    expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', isRead: false },
        data: { isRead: true },
      }),
    );
  });
});

describe('notify (V0.1.31 集成函数 — feed 复用)', () => {
  it('自己触发自己 → 跳过（不创建）', async () => {
    await notify({
      userId: 'u1',
      actorId: 'u1', // 自己
      type: 'like',
      targetType: 'feed',
      targetId: 'f1',
    });
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
  });

  it('他人触发 → 创建通知', async () => {
    mocks.prisma.notification.create.mockResolvedValue({ id: 'n1' } as never);

    await notify({
      userId: 'u2',
      actorId: 'u1',
      type: 'comment',
      targetType: 'feed',
      targetId: 'f1',
      content: '不错',
    });

    expect(mocks.prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u2',
          actorId: 'u1',
          type: 'comment',
          content: '不错',
        }),
      }),
    );
  });
});

describe('notify V0.2.119 realtime 推送', () => {
  it('他人触发 → 写库后顺手 publishToUser 推 notification 事件', async () => {
    mocks.prisma.notification.create.mockResolvedValue({ id: 'n2' } as never);

    await notify({
      userId: 'u2',
      actorId: 'u1',
      type: 'like',
      targetType: 'feed',
      targetId: 'f9',
    });

    expect(realtimeMocks.publishToUser).toHaveBeenCalledWith('u2', 'notification', {
      type: 'like',
      targetType: 'feed',
      targetId: 'f9',
      content: null,
      actorId: 'u1',
    });
  });

  it('自己触发自己 → 不推送 realtime', async () => {
    await notify({
      userId: 'u1',
      actorId: 'u1',
      type: 'like',
      targetType: 'feed',
      targetId: 'f1',
    });
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
    expect(realtimeMocks.publishToUser).not.toHaveBeenCalled();
  });

  it('realtime 推送失败 → 不影响 DB 写入结果（静默吞错）', async () => {
    realtimeMocks.publishToUser.mockRejectedValueOnce(new Error('redis down'));
    mocks.prisma.notification.create.mockResolvedValue({ id: 'n3' } as never);

    await expect(
      notify({ userId: 'u2', actorId: 'u1', type: 'follow' }),
    ).resolves.toBeUndefined();
    expect(mocks.prisma.notification.create).toHaveBeenCalled();
  });
});

describe('notifyGoalAchieved (V0.2.121 — sport.checkin 触发)', () => {
  it('写库（type=goal_achieved, targetType=goal）+ realtime 推送（不跳过自己触发自己）', async () => {
    mocks.prisma.notification.create.mockResolvedValue({ id: 'n4' } as never);

    await notifyGoalAchieved('u1', { id: 'g1', title: '月度100km', targetDistance: 100 });

    expect(mocks.prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          actorId: 'u1', // 自己是触发者
          type: 'goal_achieved',
          targetType: 'goal',
          targetId: 'g1',
          content: expect.stringContaining('月度100km'),
        }),
      }),
    );
    expect(realtimeMocks.publishToUser).toHaveBeenCalledWith('u1', 'notification', {
      type: 'goal_achieved',
      targetType: 'goal',
      targetId: 'g1',
      content: expect.stringContaining('月度100km'),
      actorId: 'u1',
    });
  });

  it('title 为空 → content 用通用文案（不含「」）', async () => {
    mocks.prisma.notification.create.mockResolvedValue({ id: 'n5' } as never);
    await notifyGoalAchieved('u1', { id: 'g2', title: null, targetDistance: 50 });
    expect(mocks.prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.stringMatching(/目标已达成/),
        }),
      }),
    );
  });

  it('realtime 推送失败 → 不影响 DB 写入', async () => {
    realtimeMocks.publishToUser.mockRejectedValueOnce(new Error('ws down'));
    mocks.prisma.notification.create.mockResolvedValue({ id: 'n6' } as never);
    await expect(notifyGoalAchieved('u1', { id: 'g1', title: 't', targetDistance: 10 })).resolves.toBeUndefined();
    expect(mocks.prisma.notification.create).toHaveBeenCalled();
  });
});
