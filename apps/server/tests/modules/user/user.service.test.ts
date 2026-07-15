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
    updateMany: vi.fn(),
  };
  const pointsRecordMethods = { create: vi.fn() };
  const teamMethods = { findUnique: vi.fn(), create: vi.fn() };
  const txMock = {
    user: userMethods,
    pointsRecord: pointsRecordMethods,
    team: teamMethods,
  };
  return {
    prisma: {
      user: userMethods,
      pointsRecord: pointsRecordMethods,
      team: teamMethods,
      appConfig: { findMany: vi.fn(), findUnique: vi.fn() },
      $transaction: vi.fn((fn) => fn(txMock)),
      _tx: txMock,
    },
  };
});

vi.mock('src/common/integrations/wx/code2session.js', () => ({ code2Session: vi.fn() }));

// V0.1.8: Mock Redis — Cache.wrap / Cache.del 需要
const _redisMockState = vi.hoisted(() => ({
  cacheStore: new Map<string, string>(),
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), scan: vi.fn(), incr: vi.fn(), expire: vi.fn() },
}));

vi.mock('src/infra/redis.js', () => ({ redis: _redisMockState.redis }));

function setupMockRedis() {
  const { cacheStore, redis } = _redisMockState;
  redis.get.mockImplementation(async (k: string) => cacheStore.get(k) ?? null);
  redis.set.mockImplementation(async (k: string, v: string) => {
    cacheStore.set(k, v);
    return 'OK';
  });
  redis.del.mockImplementation(async (k: string) => {
    const had = cacheStore.has(k);
    cacheStore.delete(k);
    return had ? 1 : 0;
  });
  redis.scan.mockImplementation(async () => ['0', []] as [string, string[]]);
  // V0.2.6 incr/expire（限频计数，用 cacheStore 存数字字符串）
  redis.incr.mockImplementation(async (k: string) => {
    const n = Number(cacheStore.get(k) ?? '0') + 1;
    cacheStore.set(k, String(n));
    return n;
  });
  redis.expire.mockImplementation(async () => 1);
}

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
  _redisMockState.cacheStore.clear();
  setupMockRedis();
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

// ===== V0.1.8 增：userService.getById（me）带缓存 =====
describe('userService.getById（me，V0.1.8 带缓存）', () => {
  const USER_ID = 'u1';
  const baseUser = {
    id: USER_ID,
    openid: 'oABC',
    nickname: '智',
    avatarUrl: 'https://example.com/a.jpg',
    phone: null,
    memberLevel: 'free',
    memberExpireAt: null,
    points: 100,
    certified: false,
    stats: { totalDistance: 0, totalCheckins: 0, totalPoints: 100 },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('首次 miss → 调 userRepo + 回填缓存', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(baseUser as never);

    const result = await userService.getById(USER_ID);

    expect(result.id).toBe(USER_ID);
    expect(result.points).toBe(100);
    expect(mockedPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    // 缓存已回填
    const cached = _redisMockState.cacheStore.get('qmwx:cache:user:me:u1');
    expect(cached).toBeDefined();
    expect(JSON.parse(cached!)).toMatchObject({ id: USER_ID, points: 100 });
  });

  it('二次同 user：命中缓存 → 不再调 userRepo', async () => {
    // 预热缓存
    _redisMockState.cacheStore.set(
      'qmwx:cache:user:me:u1',
      JSON.stringify({ id: USER_ID, nickname: '缓存昵称', points: 999, stats: {} }),
    );

    const result = await userService.getById(USER_ID);

    expect(result.nickname).toBe('缓存昵称');
    expect(result.points).toBe(999);
    // 命中：findUnique 一次都没调
    expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('不同 userId → 不同 cache key（不串扰）', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(baseUser as never);

    await userService.getById('u1');
    await userService.getById('u2');

    expect(_redisMockState.cacheStore.has('qmwx:cache:user:me:u1')).toBe(true);
    expect(_redisMockState.cacheStore.has('qmwx:cache:user:me:u2')).toBe(true);
  });

  it('user 不存在 → 抛 notFound（不缓存）', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    await expect(userService.getById('ghost')).rejects.toThrow('user not found');
    // 异常不应回填缓存（Cache.wrap 在 loader 抛错时 propagate）
    expect(_redisMockState.cacheStore.has('qmwx:cache:user:me:ghost')).toBe(false);
  });
});

describe('userService.updateProfile（V0.1.8 增 me 缓存失效）', () => {
  const USER_ID = 'u1';

  it('更新资料 → 删 user:me:{userId} 缓存', async () => {
    // 预热 me 缓存
    _redisMockState.cacheStore.set(
      'qmwx:cache:user:me:u1',
      JSON.stringify({ id: USER_ID, nickname: '旧昵称' }),
    );
    // mock updateProfile 成功
    mockedPrisma.user.update.mockResolvedValue({
      id: USER_ID,
      openid: 'oABC',
      nickname: '新昵称',
      avatarUrl: null,
      phone: null,
      memberLevel: 'free',
      memberExpireAt: null,
      points: 100,
      certified: false,
      stats: { totalDistance: 0, totalCheckins: 0, totalPoints: 100 },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as never);

    const result = await userService.updateProfile(USER_ID, { nickname: '新昵称' });

    expect(result.nickname).toBe('新昵称');
    // 缓存已被精准失效
    expect(_redisMockState.cacheStore.has('qmwx:cache:user:me:u1')).toBe(false);
  });

  it('更新资料失败（user 不存在）→ 缓存不动', async () => {
    // 预热 me 缓存
    _redisMockState.cacheStore.set(
      'qmwx:cache:user:me:u1',
      JSON.stringify({ id: USER_ID, nickname: '旧昵称' }),
    );
    // mock updateProfile 抛错（user 不存在）
    mockedPrisma.user.update.mockRejectedValue(new Error('Record to update not found') as never);

    await expect(
      userService.updateProfile(USER_ID, { nickname: 'X' }),
    ).rejects.toThrow();

    // 缓存未动（DB 失败 → 不该失效缓存）
    expect(_redisMockState.cacheStore.has('qmwx:cache:user:me:u1')).toBe(true);
  });
});

// ===== V0.1.43 onboarding 状态管理 =====
describe('userService.completeOnboarding（V0.1.43 onboardingDone=true）', () => {
  it('标记完成 → update + me 缓存失效', async () => {
    // 预热 me 缓存
    _redisMockState.cacheStore.set(
      'qmwx:cache:user:me:u1',
      JSON.stringify({ id: 'u1', onboardingDone: false }),
    );
    mockedPrisma.user.update.mockResolvedValue({} as never);

    const result = await userService.completeOnboarding('u1');
    expect(result).toEqual({ ok: true });
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { onboardingDone: true },
    });
    // 缓存被精准失效
    expect(_redisMockState.cacheStore.has('qmwx:cache:user:me:u1')).toBe(false);
  });
});

describe('userService.resetOnboarding（V0.1.43 onboardingDone=false 重走）', () => {
  it('重置 → update + me 缓存失效', async () => {
    _redisMockState.cacheStore.set(
      'qmwx:cache:user:me:u1',
      JSON.stringify({ id: 'u1', onboardingDone: true }),
    );
    mockedPrisma.user.update.mockResolvedValue({} as never);

    const result = await userService.resetOnboarding('u1');
    expect(result).toEqual({ ok: true });
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { onboardingDone: false },
    });
    expect(_redisMockState.cacheStore.has('qmwx:cache:user:me:u1')).toBe(false);
  });
});

// ===== V0.2.6 邀请裂变 =====
describe('userService.bindInviter（V0.2.6 邀请绑定）', () => {
  it('正常绑定：落 Team + 双方奖励 + 失效双方 me 缓存', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'inv1',
      inviteCode: 'CODE1',
      memberLevel: 'free',
      memberExpireAt: null,
    } as never);
    mockedPrisma.team.findUnique.mockResolvedValue(null as never); // 未绑
    mockedPrisma.user.findUniqueOrThrow.mockResolvedValue({ points: 50 } as never);

    const result = await userService.bindInviter('u1', 'CODE1');

    expect(result).toEqual({ ok: true, inviterId: 'inv1' });
    expect(mockedPrisma.team.create).toHaveBeenCalledWith({
      data: { inviterId: 'inv1', inviteeId: 'u1', level: 1 },
    });
    // 双方 me 缓存失效
    expect(_redisMockState.cacheStore.has('qmwx:cache:user:me:u1')).toBe(false);
  });

  it('防自邀：inviterCode 是自己 → badRequest', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', inviteCode: 'CODE1' } as never);

    await expect(userService.bindInviter('u1', 'CODE1')).rejects.toThrow('不能邀请自己');
    expect(mockedPrisma.team.create).not.toHaveBeenCalled();
  });

  it('已绑定：Team 存在 → badRequest', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'inv1', inviteCode: 'CODE1' } as never);
    mockedPrisma.team.findUnique.mockResolvedValue({ id: 't1', inviteeId: 'u1' } as never);

    await expect(userService.bindInviter('u1', 'CODE1')).rejects.toThrow('已绑定邀请人');
  });

  it('邀请码无效：inviter 不存在 → badRequest', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null as never);

    await expect(userService.bindInviter('u1', 'NOPE')).rejects.toThrow('邀请码无效');
  });
});

describe('userService.checkReportQuota（V0.2.6 report 免费周限频）', () => {
  it('会员：memberExpireAt 有效 → canView true，不调 incr', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      memberExpireAt: new Date(Date.now() + 86400_000),
    } as never);

    const result = await userService.checkReportQuota('u1');

    expect(result.canView).toBe(true);
    expect(result.quota).toBe(-1); // 会员不限
    expect(_redisMockState.redis.incr).not.toHaveBeenCalled();
  });

  it('免费首次：incr=1 → canView true', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ memberExpireAt: null } as never);

    const result = await userService.checkReportQuota('u1');

    expect(result.canView).toBe(true);
    expect(result.weeklyUsed).toBe(1);
    expect(result.quota).toBe(1);
  });

  it('免费二次：incr=2 → canView false（本周已用完）', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ memberExpireAt: null } as never);
    // 预置本周已用 1 次（checkReportQuota 直接 redis.incr，key 无 qmwx:cache 前缀）
    _redisMockState.cacheStore.set(`report:vw:u1:${isoWeekKeyForTest()}`, '1');

    const result = await userService.checkReportQuota('u1');

    expect(result.canView).toBe(false);
    expect(result.weeklyUsed).toBe(2);
  });
});

/** 测试用 ISO 周 key（与 service 内 isoWeekKey 一致算法）*/
function isoWeekKeyForTest(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

describe('userService.redeemMember（V0.2.7 积分兑换会员时长）', () => {
  it('套餐无效（days=15）→ badRequest', async () => {
    await expect(userService.redeemMember('u1', 15)).rejects.toThrow('兑换套餐无效');
  });

  it('正常兑换 7 天：扣 100 分（updateMany 条件防双花）+ 续期', async () => {
    mockedPrisma.user.updateMany.mockResolvedValue({ count: 1 } as never);
    mockedPrisma.user.findUnique.mockResolvedValue({
      memberLevel: 'free',
      memberExpireAt: null,
    } as never);
    mockedPrisma.user.findUniqueOrThrow.mockResolvedValue({ points: 0 } as never);

    const result = await userService.redeemMember('u1', 7);

    expect(result).toEqual({ ok: true, days: 7, pointsCost: 100 });
    expect(mockedPrisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { points: { increment: -100 } } }),
    );
  });

  it('积分不足：updateMany count=0 → 抛"积分不足"', async () => {
    mockedPrisma.user.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(userService.redeemMember('u1', 30)).rejects.toThrow('积分不足');
  });
});
