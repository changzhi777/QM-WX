/**
 * user.service 单元测试
 *
 * 用 vitest + vi.mock 替换 prisma / code2Session。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== mock 必须在 import 之前 =====
vi.mock('src/infra/prisma.js', () => {
  // 事务内复用顶级 mock（让 txMock.X === prisma.X）
  const userMethods = {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  };
  const pointsRecordMethods = { create: vi.fn() };
  const txMock = {
    user: userMethods,
    pointsRecord: pointsRecordMethods,
  };
  return {
    prisma: {
      user: userMethods,
      pointsRecord: pointsRecordMethods,
      appConfig: { findMany: vi.fn(), findUnique: vi.fn() },
      $transaction: vi.fn((fn) => fn(txMock)),
      _tx: txMock,
    },
  };
});

vi.mock('src/common/integrations/wx/code2session.js', () => ({ code2Session: vi.fn() }));

import { prisma } from 'src/infra/prisma.js';
import { code2Session } from 'src/common/integrations/wx/code2session.js';
import { userService } from 'src/modules/user/user.service.js';

const mockedPrisma = vi.mocked(prisma);
const mockedCode2Session = vi.mocked(code2Session);

// 假 Fastify：只用到 jwt.sign
const fakeApp = {
  jwt: {
    sign: vi.fn(async (payload: unknown) => `fake-token-${JSON.stringify(payload)}`),
  },
} as unknown as Parameters<typeof userService.login>[0];

beforeEach(() => {
  vi.clearAllMocks();
  // 默认 feature_flags 返回 5 个 false
  mockedPrisma.appConfig.findMany.mockResolvedValue([]);
});

describe('userService.login', () => {
  it('老用户：直接 upsert + 签 token，不送积分', async () => {
    mockedCode2Session.mockResolvedValue({ openid: 'oABC', session_key: 'sk' });
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      openid: 'oABC',
      nickname: '张三',
      avatarUrl: null,
      phone: null,
      memberLevel: 'free',
      memberExpireAt: null,
      points: 100,
      certified: false,
      stats: { totalDistance: 0, totalCheckins: 0, totalPoints: 0 },
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as never);
    mockedPrisma.user.upsert.mockResolvedValue({
      id: 'u1',
      openid: 'oABC',
      nickname: '张三',
      avatarUrl: null,
      phone: null,
      memberLevel: 'free',
      memberExpireAt: null,
      points: 100,
      certified: false,
      stats: { totalDistance: 0, totalCheckins: 0, totalPoints: 0 },
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as never);

    const result = await userService.login(fakeApp, { code: 'mock-code' });

    expect(mockedCode2Session).toHaveBeenCalledWith('mock-code');
    expect(result.user.id).toBe('u1');
    expect(result.user.points).toBe(100);
    expect(result.accessToken).toContain('fake-token-');
    expect(result.refreshToken).toContain('fake-token-');
    // 老用户不送积分 → 不会调 addPoints
    expect(mockedPrisma.pointsRecord.create).not.toHaveBeenCalled();
  });

  it('新用户：首登送 50 积分 + 写流水', async () => {
    mockedCode2Session.mockResolvedValue({ openid: 'oNEW', session_key: 'sk' });
    // findUnique（isNew 判断）返回 null
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    // upsert 返回新用户
    mockedPrisma.user.upsert.mockResolvedValue({
      id: 'u2',
      openid: 'oNEW',
      nickname: '李四',
      points: 50,
      memberLevel: 'free',
      memberExpireAt: null,
      certified: false,
      stats: { totalDistance: 0, totalCheckins: 0, totalPoints: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    // 事务里 addPoints 需要的 findUniqueOrThrow
    mockedPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'u2',
      points: 0,
      stats: { totalDistance: 0, totalCheckins: 0, totalPoints: 0 },
    } as never);
    // 事务后再读一次拿最新 points
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'u2',
      openid: 'oNEW',
      nickname: '李四',
      avatarUrl: null,
      phone: null,
      memberLevel: 'free',
      memberExpireAt: null,
      points: 50,
      certified: false,
      stats: { totalDistance: 0, totalCheckins: 0, totalPoints: 50 },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await userService.login(fakeApp, { code: 'mock-code' });

    expect(result.user.points).toBe(50);
    // 写流水
    expect(mockedPrisma.pointsRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u2',
          change: 50,
          type: 'signup_bonus',
        }),
      }),
    );
  });

  it('code2Session 失败抛错', async () => {
    mockedCode2Session.mockRejectedValue(new Error('微信登录失败: invalid code'));

    await expect(userService.login(fakeApp, { code: 'bad' })).rejects.toThrow('微信登录失败');
    expect(mockedPrisma.user.upsert).not.toHaveBeenCalled();
  });
});
