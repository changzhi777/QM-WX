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
  strengthSet: { findFirst: vi.fn(), create: vi.fn() },
  exercise: { findMany: vi.fn() },
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
  it('category + search 过滤 + 排序', async () => {
    mockPrisma.exercise.findMany.mockResolvedValue([
      { id: 'e1', name: '深蹲', category: '腿' },
    ]);

    await listExercises({ category: '腿', search: '深' });

    expect(mockPrisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { category: '腿', name: { contains: '深' } },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
    );
  });
});
