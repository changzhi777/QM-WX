/**
 * strength service 单元测试（V0.2.42 第 36 module，训记式力量训练日志）
 *
 * 覆盖 7 action：startSession / addSet（鉴权+order递增+volume累加）/ finishSession /
 *               listSessions（分页+_count）/ sessionDetail（鉴权）/ myVolume（按日聚合）/ listExercises（过滤）
 * mock prisma（strengthSession/strengthSet/exercise）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  strengthSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  strengthSet: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() }, // V0.2.135 trend 用 findMany with include
  exercise: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() }, // V0.2.134 收藏动作
}));

vi.mock('src/infra/prisma.js', () => ({ prisma: mockPrisma }));
// V0.2.122 mock 掉 notifyStrengthDone（让 strength 测试不依赖 notification 真实 prisma）
vi.mock('src/modules/notification/notification.service.js', () => ({ notifyStrengthDone: vi.fn() }));

import {
  startSession,
  addSet,
  finishSession,
  listSessions,
  sessionDetail,
  myVolume,
  listExercises,
  getExerciseStats,
  addUserExercise,
  toggleFavoriteExercise,
  listFavoriteExercises,
  getExerciseTrend,
  suggestNextWeight,
  getSessionReport,
  getStrengthOverview,
  getCompletionScore,
} from '../../../src/modules/strength/strength.service.js';
import { notifyStrengthDone } from 'src/modules/notification/notification.service.js';

beforeEach(() => vi.clearAllMocks());

describe('strength.service · startSession', () => {
  it('创建 session + dateStr CN 今日（YYYY-MM-DD）', async () => {
    mockPrisma.strengthSession.create.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      dateStr: '2026-07-21',
    });
    const res = await startSession('u1');
    const data = mockPrisma.strengthSession.create.mock.calls[0][0].data;
    expect(data.userId).toBe('u1');
    expect(data.date).toBeInstanceOf(Date);
    expect(data.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/); // CN 今日
    expect(res.id).toBe('s1');
  });
});

describe('strength.service · addSet', () => {
  it('session 不存在 → throw', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue(null);
    await expect(
      addSet('u1', { sessionId: 'x', exerciseName: '深蹲', reps: 10, weight: 50, setIndex: 1 }),
    ).rejects.toThrow();
  });

  it('非本人 session → throw（鉴权）', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({ id: 's1', userId: 'other' });
    await expect(
      addSet('u1', { sessionId: 's1', exerciseName: '深蹲', reps: 10, weight: 50, setIndex: 1 }),
    ).rejects.toThrow();
  });

  it('happy → order 递增（lastSet.order+1）+ create set + increment volume', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
    mockPrisma.strengthSet.findFirst.mockResolvedValue({ order: 3 }); // 当前最大 order
    mockPrisma.strengthSet.create.mockResolvedValue({ id: 'set1', order: 4 });

    await addSet('u1', {
      sessionId: 's1',
      exerciseName: '深蹲',
      reps: 10,
      weight: 50,
      setIndex: 1,
      restSec: 90,
    });

    expect(mockPrisma.strengthSet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: 's1',
          order: 4, // lastSet.order(3) + 1
          exerciseName: '深蹲',
          reps: 10,
          weight: 50,
          setIndex: 1,
          restSec: 90,
        }),
      }),
    );
    // volume = reps × weight = 10 × 50 = 500，实时 increment
    expect(mockPrisma.strengthSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: { totalVolume: { increment: 500 } },
      }),
    );
  });

  it('首组（无历史 set）→ order=1', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
    mockPrisma.strengthSet.findFirst.mockResolvedValue(null); // 无历史
    mockPrisma.strengthSet.create.mockResolvedValue({ id: 'set1', order: 1 });

    await addSet('u1', { sessionId: 's1', exerciseName: '卧推', reps: 8, weight: 60, setIndex: 1 });

    expect(mockPrisma.strengthSet.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 1 }) }),
    );
    expect(mockPrisma.strengthSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { totalVolume: { increment: 480 } } }), // 8×60
    );
  });
});

describe('strength.service · finishSession', () => {
  it('session 不存在 → throw', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue(null);
    await expect(finishSession('u1', { sessionId: 'x' })).rejects.toThrow();
  });

  it('happy → update duration/notes + include sets（order asc）', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
    mockPrisma.strengthSession.update.mockResolvedValue({
      id: 's1',
      durationSec: 1800,
      notes: '累',
      sets: [{ id: 'set1' }],
    });

    const res = await finishSession('u1', { sessionId: 's1', durationSec: 1800, notes: '累' });

    expect(mockPrisma.strengthSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: { durationSec: 1800, notes: '累' },
        include: { sets: { orderBy: { order: 'asc' } } },
      }),
    );
    expect(res.durationSec).toBe(1800);
    expect(res.sets).toHaveLength(1);
  });

  it('V0.2.122 完成训练 → 顺手调 notifyStrengthDone（自触发，realtime 推送复用通道）', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
    mockPrisma.strengthSession.update.mockResolvedValue({
      id: 's1',
      totalVolume: 2400,
      sets: [{ id: 'set1' }, { id: 'set2' }, { id: 'set3' }],
    });

    await finishSession('u1', { sessionId: 's1' });

    expect(notifyStrengthDone).toHaveBeenCalledWith('u1', {
      id: 's1',
      totalVolume: 2400,
      setCount: 3,
    });
  });

  it('V0.2.122 notifyStrengthDone 抛错 → 训练保存结果仍正常返回（try/catch 静默）', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
    mockPrisma.strengthSession.update.mockResolvedValue({
      id: 's1',
      totalVolume: 100,
      sets: [{ id: 'set1' }],
    });
    vi.mocked(notifyStrengthDone).mockRejectedValueOnce(new Error('realtime down'));

    await expect(finishSession('u1', { sessionId: 's1' })).resolves.toMatchObject({ id: 's1' });
  });
});

describe('strength.service · listSessions', () => {
  it('分页 + _count sets + total', async () => {
    mockPrisma.strengthSession.findMany.mockResolvedValue([
      { id: 's1', dateStr: '2026-07-21', durationSec: 1800, totalVolume: 500, _count: { sets: 5 } },
    ]);
    mockPrisma.strengthSession.count.mockResolvedValue(1);

    const res = await listSessions('u1', { page: 1, pageSize: 20 });

    expect(res.total).toBe(1);
    expect(res.page).toBe(1);
    expect(res.list[0]._count.sets).toBe(5);
    expect(mockPrisma.strengthSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        skip: 0,
        take: 20,
        select: expect.objectContaining({ _count: { select: { sets: true } } }),
      }),
    );
  });
});

describe('strength.service · sessionDetail', () => {
  it('非本人 → throw（鉴权）', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({ id: 's1', userId: 'other' });
    await expect(sessionDetail('u1', 's1')).rejects.toThrow();
  });

  it('happy → include sets（order asc）', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      sets: [{ id: 'set1' }, { id: 'set2' }],
    });
    const res = await sessionDetail('u1', 's1');
    expect(res.sets).toHaveLength(2);
    expect(mockPrisma.strengthSession.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        include: { sets: { orderBy: { order: 'asc' } } },
      }),
    );
  });
});

describe('strength.service · myVolume', () => {
  it('按日聚合 volume/duration/count + trend + 总计', async () => {
    mockPrisma.strengthSession.findMany.mockResolvedValue([
      { dateStr: '2026-07-20', totalVolume: 500, durationSec: 600 },
      { dateStr: '2026-07-20', totalVolume: 300, durationSec: 400 },
      { dateStr: '2026-07-21', totalVolume: 800, durationSec: 900 },
    ]);

    const res = await myVolume('u1', { days: 7 });

    // 2026-07-20 聚合：volume 800 / duration 1000 / count 2
    const d20 = res.trend.find((t) => t.date === '2026-07-20');
    expect(d20).toEqual({ date: '2026-07-20', volume: 800, duration: 1000, count: 2 });
    expect(res.totalVolume).toBe(1600); // 500+300+800
    expect(res.totalSessions).toBe(3);
    expect(res.days).toBe(7);
  });
});

describe('strength.service · listExercises', () => {
  it('V0.2.132 category + search + 合并全局(userId=null) + 当前用户(userId=me) 过滤 + 排序', async () => {
    mockPrisma.exercise.findMany.mockResolvedValue([
      { id: 'e1', name: '深蹲', category: '腿', userId: null },
      { id: 'e2', name: '我的壶铃', category: '核心', userId: 'u1' },
    ]);

    await listExercises('u1', { category: '腿', search: '深' });

    expect(mockPrisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ userId: null }, { userId: 'u1' }],
          category: '腿',
          name: { contains: '深' },
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
    );
  });
});

describe('strength.service · addUserExercise (V0.2.132)', () => {
  it('用户加自定义动作（无重名）→ 落库并标 isCustom=true', async () => {
    mockPrisma.exercise.findFirst.mockResolvedValue(null as never);
    mockPrisma.exercise.create.mockResolvedValue({
      id: 'e10', name: '壶铃摇摆', category: '核心', userId: 'u1', isCustom: true,
    } as never);

    const r = await addUserExercise('u1', { name: '壶铃摇摆', category: '核心' });

    expect(r.id).toBe('e10');
    expect(r.name).toBe('壶铃摇摆');
    const data = mockPrisma.exercise.create.mock.calls[0][0].data;
    expect(data.userId).toBe('u1');
    expect(data.isCustom).toBe(true);
  });

  it('同用户重名 → 抛错', async () => {
    mockPrisma.exercise.findFirst.mockResolvedValue({ id: 'e10', name: '壶铃摇摆' } as never);
    await expect(addUserExercise('u1', { name: '壶铃摇摆', category: '核心' })).rejects.toThrow();
    expect(mockPrisma.exercise.create).not.toHaveBeenCalled();
  });
});

describe('strength.service · getExerciseStats (V0.2.126)', () => {
  it('无数据 → 空 pbs/distribution，totalExercises=0', async () => {
    mockPrisma.strengthSet.findMany.mockResolvedValue([] as never);
    const r = await getExerciseStats('u1');
    expect(r.pbs).toEqual([]);
    expect(r.distribution).toEqual([]);
    expect(r.totalExercises).toBe(0);
    expect(r.totalSets).toBe(0);
  });

  it('多动作多 set → PB 取最大 weight（并列时取 reps 多）+ distribution 按 totalVolume 降序', async () => {
    mockPrisma.strengthSet.findMany.mockResolvedValue([
      // 深蹲: 100kg×10=1000, 120kg×8=960, 120kg×5=600（PB 120×5 — 并列取 reps 多的 120×8）
      { exerciseName: '深蹲', reps: 10, weight: 100, createdAt: new Date('2026-07-20'), sessionId: 's1' },
      { exerciseName: '深蹲', reps: 8, weight: 120, createdAt: new Date('2026-07-21'), sessionId: 's1' },
      { exerciseName: '深蹲', reps: 5, weight: 120, createdAt: new Date('2026-07-22'), sessionId: 's2' },
      // 卧推: 60kg×10=600, 70kg×8=560（PB 70×8）
      { exerciseName: '卧推', reps: 10, weight: 60, createdAt: new Date('2026-07-20'), sessionId: 's1' },
      { exerciseName: '卧推', reps: 8, weight: 70, createdAt: new Date('2026-07-21'), sessionId: 's1' },
    ] as never);

    const r = await getExerciseStats('u1');

    // PB 验证
    const squatPb = r.pbs.find((p) => p.exerciseName === '深蹲');
    expect(squatPb?.maxWeight).toBe(120);
    expect(squatPb?.maxReps).toBe(8); // 并列取 reps 多的
    expect(squatPb?.setCount).toBe(3);
    const benchPb = r.pbs.find((p) => p.exerciseName === '卧推');
    expect(benchPb?.maxWeight).toBe(70);
    expect(benchPb?.maxReps).toBe(8);

    // Distribution 验证（深蹲 1000+960+600=2560 > 卧推 600+560=1160）
    expect(r.distribution[0].exerciseName).toBe('深蹲');
    expect(r.distribution[0].totalVolume).toBe(2560);
    expect(r.distribution[1].exerciseName).toBe('卧推');
    expect(r.distribution[1].totalVolume).toBe(1160);

    // percent: 深蹲 2560/(2560+1160) = 68.8%
    expect(r.distribution[0].percent).toBeCloseTo(68.8, 1);
    expect(r.totalExercises).toBe(2);
    expect(r.totalSets).toBe(5);
  });
});

describe('toggleFavoriteExercise / listFavoriteExercises (V0.2.134)', () => {
  it('无 → 加（返回 favorited=true）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ favoriteExerciseIds: [] } as never);
    mockPrisma.user.update.mockResolvedValue({} as never);
    const r = await toggleFavoriteExercise('u1', 'e1');
    expect(r).toEqual({ favorited: true, count: 1 });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { favoriteExerciseIds: ['e1'] } }),
    );
  });

  it('有 → 取消（返回 favorited=false）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ favoriteExerciseIds: ['e1', 'e2'] } as never);
    mockPrisma.user.update.mockResolvedValue({} as never);
    const r = await toggleFavoriteExercise('u1', 'e1');
    expect(r).toEqual({ favorited: false, count: 1 });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { favoriteExerciseIds: ['e2'] } }),
    );
  });

  it('listFavoriteExercises 返已存在动作的详情（自动过滤已删 ID）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ favoriteExerciseIds: ['e1', 'e-deleted'] } as never);
    mockPrisma.exercise.findMany.mockResolvedValue([
      { id: 'e1', name: '深蹲', category: '腿' },
    ] as never);
    const r = await listFavoriteExercises('u1');
    expect(r.list).toHaveLength(1);
    expect(r.list[0].id).toBe('e1');
  });

  it('listFavoriteExercises 收藏为空 → 返空 list', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ favoriteExerciseIds: [] } as never);
    const r = await listFavoriteExercises('u1');
    expect(r.list).toEqual([]);
    expect(mockPrisma.exercise.findMany).not.toHaveBeenCalled();
  });
});

describe('getExerciseTrend (V0.2.135)', () => {
  it('按 session 聚合：2 场训练同一动作 → 2 个点（maxWeight/totalVolume/avgReps 各算各的）', async () => {
    mockPrisma.strengthSet.findMany.mockResolvedValue([
      // 7/10 训练：3 组（100×8=800, 100×8=800, 105×6=630 → maxWeight=105, total=2230, avgReps=7.3）
      { sessionId: 's1', exerciseName: '深蹲', reps: 8, weight: 100, session: { createdAt: new Date('2026-07-10T10:00:00Z'), dateStr: '2026-07-10' } },
      { sessionId: 's1', exerciseName: '深蹲', reps: 8, weight: 100, session: { createdAt: new Date('2026-07-10T10:00:00Z'), dateStr: '2026-07-10' } },
      { sessionId: 's1', exerciseName: '深蹲', reps: 6, weight: 105, session: { createdAt: new Date('2026-07-10T10:00:00Z'), dateStr: '2026-07-10' } },
      // 7/17 训练：2 组（110×8=880, 110×6=660 → maxWeight=110, total=1540, avgReps=7）
      { sessionId: 's2', exerciseName: '深蹲', reps: 8, weight: 110, session: { createdAt: new Date('2026-07-17T10:00:00Z'), dateStr: '2026-07-17' } },
      { sessionId: 's2', exerciseName: '深蹲', reps: 6, weight: 110, session: { createdAt: new Date('2026-07-17T10:00:00Z'), dateStr: '2026-07-17' } },
    ] as never);

    const r = await getExerciseTrend('u1', { exerciseName: '深蹲' });

    expect(r.totalSessions).toBe(2);
    expect(r.maxWeightAllTime).toBe(110);
    expect(r.points[0]).toMatchObject({ dateStr: '2026-07-10', maxWeight: 105, setCount: 3, totalVolume: 2230, avgReps: 7.3 });
    expect(r.points[1]).toMatchObject({ dateStr: '2026-07-17', maxWeight: 110, setCount: 2, totalVolume: 1540, avgReps: 7 });
  });
});

describe('listSessions V0.2.136 exerciseName 过滤', () => {
  it('指定 exerciseName → where.sets.some 过滤', async () => {
    mockPrisma.strengthSession.findMany.mockResolvedValue([] as never);
    mockPrisma.strengthSession.count.mockResolvedValue(0 as never);
    await listSessions('u1', { exerciseName: '深蹲' });
    expect(mockPrisma.strengthSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          sets: { some: { exerciseName: '深蹲' } },
        }),
      }),
    );
  });

  it('无 exerciseName → 不过滤', async () => {
    mockPrisma.strengthSession.findMany.mockResolvedValue([] as never);
    mockPrisma.strengthSession.count.mockResolvedValue(0 as never);
    await listSessions('u1');
    expect(mockPrisma.strengthSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
      }),
    );
  });
});

describe('V0.2.141 listExercises 返 videoUrl 字段', () => {
  it('带 videoUrl 的动作正确返回（前端可展示）', async () => {
    mockPrisma.exercise.findMany.mockResolvedValue([
      { id: 'e1', name: '深蹲', category: '腿', videoUrl: 'https://example.com/squat.mp4' },
      { id: 'e2', name: '自定义动作', category: '其他', videoUrl: null },
    ] as never);
    const r = await listExercises('u1');
    expect(r).toHaveLength(2);
    expect((r[0] as { videoUrl?: string }).videoUrl).toBe('https://example.com/squat.mp4');
    expect((r[1] as { videoUrl?: string }).videoUrl).toBeNull();
  });
});

describe('suggestNextWeight (V0.2.142)', () => {
  it('无历史 → hasHistory=false + suggestedWeight=null', async () => {
    mockPrisma.strengthSet.findMany.mockResolvedValue([] as never);
    const r = await suggestNextWeight('u1', { exerciseName: '深蹲' });
    expect(r.hasHistory).toBe(false);
    expect(r.suggestedWeight).toBeNull();
  });

  it('3 场同重量 → 建议 +2.5kg（double progression）', async () => {
    mockPrisma.strengthSet.findMany.mockResolvedValue([
      // session 3（最早）: max 100
      { sessionId: 's3', exerciseName: '深蹲', reps: 8, weight: 100, session: { createdAt: new Date('2026-07-10') } },
      // session 2: max 100
      { sessionId: 's2', exerciseName: '深蹲', reps: 8, weight: 100, session: { createdAt: new Date('2026-07-17') } },
      // session 1（最新）: max 100
      { sessionId: 's1', exerciseName: '深蹲', reps: 8, weight: 100, session: { createdAt: new Date('2026-07-24') } },
    ] as never);
    const r = await suggestNextWeight('u1', { exerciseName: '深蹲' });
    expect(r.hasHistory).toBe(true);
    expect(r.suggestedWeight).toBe(102.5);
    expect(r.basis).toBe('progression');
  });

  it('3 场不同重量 → 维持 lastMax（basis=maintain）', async () => {
    mockPrisma.strengthSet.findMany.mockResolvedValue([
      // desc 顺序（生产 findMany orderBy session.createdAt desc）
      { sessionId: 's1', reps: 8, weight: 100, session: { createdAt: new Date('2026-07-24') } },
      { sessionId: 's2', reps: 8, weight: 100, session: { createdAt: new Date('2026-07-17') } },
      { sessionId: 's3', reps: 8, weight: 95, session: { createdAt: new Date('2026-07-10') } },
    ] as never);
    const r = await suggestNextWeight('u1', { exerciseName: '深蹲' });
    expect(r.suggestedWeight).toBe(100);
    expect(r.basis).toBe('maintain');
  });
});

describe('addSet V0.2.143 完结度 RPE + 备注', () => {
  it('带 rpe + note → 落库', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' } as never);
    mockPrisma.strengthSet.findFirst.mockResolvedValue(null as never);
    mockPrisma.strengthSet.create.mockResolvedValue({ id: 'set1', order: 1 } as never);
    await addSet('u1', {
      sessionId: 's1', exerciseName: '深蹲', reps: 8, weight: 100, setIndex: 1,
      rpe: 8, note: '差点力竭',
    });
    expect(mockPrisma.strengthSet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rpe: 8, note: '差点力竭' }),
      }),
    );
  });

  it('无 rpe/note → 兼容（保持 nullable）', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' } as never);
    mockPrisma.strengthSet.findFirst.mockResolvedValue(null as never);
    mockPrisma.strengthSet.create.mockResolvedValue({ id: 'set1' } as never);
    await addSet('u1', { sessionId: 's1', exerciseName: '深蹲', reps: 8, weight: 100, setIndex: 1 });
    expect(mockPrisma.strengthSet.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rpe: undefined, note: undefined }) }),
    );
  });
});

describe('getSessionReport (V0.2.144)', () => {
  it('完整训练报告：3 动作 + 5 组 + RPE 2 个 + 总容量 2000', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({
      id: 's1', userId: 'u1', dateStr: '2026-07-24', durationSec: 1800, totalVolume: 3400, notes: '状态好',
      sets: [
        { id: 'set1', order: 1, exerciseName: '深蹲', reps: 8, weight: 100, setIndex: 1, rpe: 8, note: null },
        { id: 'set2', order: 2, exerciseName: '深蹲', reps: 8, weight: 100, setIndex: 2, rpe: 9, note: '差点力竭' },
        { id: 'set3', order: 3, exerciseName: '卧推', reps: 10, weight: 60, setIndex: 1, rpe: null, note: null },
        { id: 'set4', order: 4, exerciseName: '卧推', reps: 10, weight: 60, setIndex: 2, rpe: null, note: null },
        { id: 'set5', order: 5, exerciseName: '硬拉', reps: 5, weight: 120, setIndex: 1, rpe: 9, note: '完美' },
      ],
    } as never);
    const r = await getSessionReport('u1', 's1');
    expect(r.totalSets).toBe(5);
    expect(r.totalReps).toBe(8 + 8 + 10 + 10 + 5); // 41
    expect(r.totalVolume).toBe(3400); // 800+800+600+600+600
    expect(r.avgRpe).toBeCloseTo((8 + 9 + 9) / 3, 1); // 仅 3 个 rpe
    expect(r.rpeCompletion).toBe(60); // 3/5
    expect(r.exercises).toHaveLength(3);
    expect(r.exercises[0].exerciseName).toBe('深蹲'); // volume 最大
    expect(r.rpeDist[7]).toBe(1); // RPE 8
    expect(r.rpeDist[8]).toBe(2); // RPE 9 x 2
    expect(r.notes).toBe('状态好');
  });

  it('非本人 session → throw', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({ id: 's1', userId: 'other', sets: [] } as never);
    await expect(getSessionReport('u1', 's1')).rejects.toThrow();
  });
});

describe('getStrengthOverview (V0.2.147)', () => {
  it('5 场 / 10 set / 3 动作 → 完整总览 + top 5 + 日趋势', async () => {
    mockPrisma.strengthSet.findMany.mockResolvedValue([
      { exerciseName: '深蹲', reps: 8, weight: 100, rpe: 8, sessionId: 's1', session: { dateStr: '2026-07-20', createdAt: new Date() } },
      { exerciseName: '深蹲', reps: 8, weight: 100, rpe: 9, sessionId: 's1', session: { dateStr: '2026-07-20', createdAt: new Date() } },
      { exerciseName: '卧推', reps: 10, weight: 60, rpe: 7, sessionId: 's1', session: { dateStr: '2026-07-20', createdAt: new Date() } },
      { exerciseName: '深蹲', reps: 8, weight: 100, rpe: null, sessionId: 's2', session: { dateStr: '2026-07-22', createdAt: new Date() } },
      { exerciseName: '卧推', reps: 10, weight: 60, rpe: null, sessionId: 's2', session: { dateStr: '2026-07-22', createdAt: new Date() } },
      { exerciseName: '硬拉', reps: 5, weight: 120, rpe: 9, sessionId: 's2', session: { dateStr: '2026-07-22', createdAt: new Date() } },
      { exerciseName: '深蹲', reps: 8, weight: 100, rpe: 7, sessionId: 's3', session: { dateStr: '2026-07-24', createdAt: new Date() } },
      { exerciseName: '卧推', reps: 10, weight: 60, rpe: 6, sessionId: 's3', session: { dateStr: '2026-07-24', createdAt: new Date() } },
      { exerciseName: '卧推', reps: 8, weight: 65, rpe: null, sessionId: 's3', session: { dateStr: '2026-07-24', createdAt: new Date() } },
      { exerciseName: '硬拉', reps: 5, weight: 120, rpe: null, sessionId: 's3', session: { dateStr: '2026-07-24', createdAt: new Date() } },
    ] as never);
    const r = await getStrengthOverview('u1', { days: 30 });
    expect(r.totalSessions).toBe(3);
    expect(r.totalSets).toBe(10);
    expect(r.totalReps).toBe(8 + 8 + 10 + 8 + 10 + 5 + 8 + 10 + 8 + 5);
    expect(r.avgRpe).toBeCloseTo((8 + 9 + 7 + 9 + 7 + 6) / 6, 1);
    expect(r.topExercises[0].exerciseName).toBe('深蹲'); // 容量最大
    expect(r.dailyTrend).toHaveLength(3); // 3 个不同日期
  });
});

describe('getCompletionScore (V0.2.148)', () => {
  it('无 set → score=0 + totalSets=0', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({ id: 's1', userId: 'u1', sets: [] } as never);
    const r = await getCompletionScore('u1', 's1');
    expect(r.score).toBe(0);
    expect(r.totalSets).toBe(0);
  });

  it('4 项因子 + 高 RPE 加分 → 完整评分', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({
      id: 's1', userId: 'u1', sets: [
        { exerciseName: '深蹲', reps: 8, weight: 100, rpe: 8, postHr: 130, note: '完美' },
        { exerciseName: '深蹲', reps: 8, weight: 100, rpe: 9, postHr: 140, note: '差点力竭' },
        { exerciseName: '卧推', reps: 10, weight: 60, rpe: 8, postHr: 120, note: '稳' },
        { exerciseName: '硬拉', reps: 5, weight: 120, rpe: 7, postHr: 135, note: '稳' },
      ],
    } as never);
    const r = await getCompletionScore('u1', 's1');
    expect(r.totalSets).toBe(4);
    expect(r.factors.rpeCoverage).toBe(100);
    expect(r.factors.postHrCoverage).toBe(100);
    expect(r.factors.noteCoverage).toBe(100);
    expect(r.factors.exerciseDiversity).toBe(75); // 3 unique / 4 sets
    expect(r.avgRpe).toBe(8);
    expect(r.bonus).toBe(5); // avgRpe >= 7
    // base = (100+100+100+75)/4 = 93.75 → 94 + 5 = 99
    expect(r.score).toBe(99);
  });

  it('低 RPE → 无加分', async () => {
    mockPrisma.strengthSession.findUnique.mockResolvedValue({
      id: 's1', userId: 'u1', sets: [
        { exerciseName: '深蹲', reps: 8, weight: 100, rpe: 4, postHr: 130, note: '轻松' },
        { exerciseName: '深蹲', reps: 8, weight: 100, rpe: 5, postHr: 130, note: '轻松' },
      ],
    } as never);
    const r = await getCompletionScore('u1', 's1');
    expect(r.bonus).toBe(0);
  });
});
