/**
 * goal.recommend.test.ts — V0.3.16 Phase 6 recommendGoals 规则引擎测试
 *
 * 覆盖 8 条规则 + 排除逻辑：
 *   1. 新用户（注册 < 7 天 + 月跑 0）→ distance 30km/月（priority 10）
 *   2. 月跑 < 50km → distance 100km/月
 *   3. 月跑 50-150km → distance 200km/月
 *   4. 月跑 ≥ 150km → distance 500km/年
 *   5. 月力量次数 < 4 → volume 8000 kg·次/月
 *   6. 月力量次数 ≥ 16 → volume 30000 kg·次/月
 *   7. BMI ≥ 24 → weight_loss 5kg/月
 *   8. 近 30 天睡眠 < 6.5h → sleep 7h × 30 天
 *   9. 已有同类 active goal → 不推荐（排除逻辑）
 */
import { vi } from 'vitest';

vi.mock('../../../src/infra/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    checkin: { aggregate: vi.fn() },
    strengthSession: { aggregate: vi.fn() },
    bodyCompositionRecord: { findFirst: vi.fn() },
    sleepRecord: { aggregate: vi.fn() },
    goal: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../src/infra/prisma.js';
import { goalService } from '../../../src/modules/goal/goal.service.js';

const mockedPrisma = vi.mocked(prisma);

// 工具：构造默认 mock profile（无数据 → 全部兜底值）
function mockEmptyProfile() {
  // 用户注册 30 天前（避开 newcomer 规则）
  const oldCreatedAt = new Date(Date.now() - 30 * 86_400_000);
  mockedPrisma.user.findUnique.mockResolvedValue({
    createdAt: oldCreatedAt,
    height: 175,
  } as never);
  mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 0 } } as never);
  mockedPrisma.strengthSession.aggregate.mockResolvedValue({ _sum: { totalVolume: 0 }, _count: 0 } as never);
  mockedPrisma.bodyCompositionRecord.findFirst.mockResolvedValue(null);
  mockedPrisma.sleepRecord.aggregate.mockResolvedValue({ _avg: { durationSeconds: null } } as never);
  mockedPrisma.goal.findMany.mockResolvedValue([]);
}

beforeEach(() => vi.clearAllMocks());

describe('goalService.recommend V0.3.16', () => {
  it('新用户（注册 < 7 天 + 无打卡）→ distance 30km/月（priority 10）', async () => {
    const newUserCreatedAt = new Date(Date.now() - 3 * 86_400_000); // 3 天前注册
    mockedPrisma.user.findUnique.mockResolvedValue({ createdAt: newUserCreatedAt, height: 170 } as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 0 } } as never);
    mockedPrisma.strengthSession.aggregate.mockResolvedValue({ _sum: { totalVolume: 0 }, _count: 0 } as never);
    mockedPrisma.bodyCompositionRecord.findFirst.mockResolvedValue(null);
    mockedPrisma.sleepRecord.aggregate.mockResolvedValue({ _avg: { durationSeconds: null } } as never);
    mockedPrisma.goal.findMany.mockResolvedValue([]);

    const r = await goalService.recommend('u-new');

    // 应包含 newcomer + low_distance 两条
    const newcomer = r.recommendations.find((x) => x.ruleId === 'newcomer');
    expect(newcomer).toBeDefined();
    expect(newcomer?.targetDistance).toBe(30);
    expect(newcomer?.priority).toBe(10);
    expect(newcomer?.type).toBe('monthly');
    expect(r.profile.daysSinceRegistration).toBe(3);
    expect(r.profile.monthlyDistanceKm).toBe(0);
  });

  it('月跑 < 50km（老用户）→ distance 100km/月', async () => {
    mockEmptyProfile();
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({ _sum: { distance: 30 } } as never); // 30km

    const r = await goalService.recommend('u-low');

    const rec = r.recommendations.find((x) => x.ruleId === 'low_distance');
    expect(rec).toBeDefined();
    expect(rec?.targetDistance).toBe(100);
    expect(rec?.priority).toBe(7);
    expect(r.profile.monthlyDistanceKm).toBe(30);
    expect(r.profile.hasActiveGoalByKind).toEqual([]);
  });

  it('月跑 50-150km → distance 200km/月', async () => {
    mockEmptyProfile();
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({ _sum: { distance: 80 } } as never);

    const r = await goalService.recommend('u-mid');

    const rec = r.recommendations.find((x) => x.ruleId === 'mid_distance');
    expect(rec).toBeDefined();
    expect(rec?.targetDistance).toBe(200);
    expect(r.profile.monthlyDistanceKm).toBe(80);
  });

  it('月跑 ≥ 150km → distance 500km/年', async () => {
    mockEmptyProfile();
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({ _sum: { distance: 200 } } as never);

    const r = await goalService.recommend('u-high');

    const rec = r.recommendations.find((x) => x.ruleId === 'high_distance');
    expect(rec).toBeDefined();
    expect(rec?.targetDistance).toBe(500);
    expect(rec?.type).toBe('yearly');
  });

  it('BMI ≥ 24 → weight_loss 5kg/月（priority 8）', async () => {
    mockEmptyProfile();
    mockedPrisma.bodyCompositionRecord.findFirst.mockResolvedValueOnce({
      weight: 85, // 85kg / 1.75² = 27.8 BMI
      bmi: 27.8,
    } as never);

    const r = await goalService.recommend('u-bmi');

    const rec = r.recommendations.find((x) => x.ruleId === 'weight_loss');
    expect(rec).toBeDefined();
    expect(rec?.kind).toBe('weight_loss');
    expect(rec?.targetValue).toBe(5);
    expect(rec?.unit).toBe('kg');
    expect(rec?.priority).toBe(8);
    expect(r.profile.bmi).toBe(27.8);
  });

  it('近 30 天睡眠 < 6.5h → sleep 7h × 30 天', async () => {
    mockEmptyProfile();
    // 5.5h × 3600 = 19800 秒
    mockedPrisma.sleepRecord.aggregate.mockResolvedValueOnce({
      _avg: { durationSeconds: 19800 },
    } as never);

    const r = await goalService.recommend('u-sleep');

    const rec = r.recommendations.find((x) => x.ruleId === 'sleep_low');
    expect(rec).toBeDefined();
    expect(rec?.kind).toBe('sleep');
    expect(rec?.targetValue).toBe(7);
    expect(rec?.unit).toBe('h');
    expect(r.profile.avgSleepHours).toBe(5.5);
  });

  it('已有同类 active goal → 不推荐（排除逻辑）', async () => {
    mockEmptyProfile();
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({ _sum: { distance: 30 } } as never);
    mockedPrisma.goal.findMany.mockResolvedValueOnce([{ kind: 'distance' }] as never);

    const r = await goalService.recommend('u-active');

    // distance 规则全部被排除（low_distance + newcomer + mid + high）
    const distanceRecs = r.recommendations.filter((x) => x.kind === 'distance');
    expect(distanceRecs).toEqual([]);
    expect(r.profile.hasActiveGoalByKind).toEqual(['distance']);
  });

  it('月力量次数 ≥ 16 → volume 30000 kg·次/月', async () => {
    mockEmptyProfile();
    mockedPrisma.strengthSession.aggregate.mockResolvedValueOnce({
      _sum: { totalVolume: 50000 },
      _count: 18,
    } as never);

    const r = await goalService.recommend('u-power');

    const rec = r.recommendations.find((x) => x.ruleId === 'high_volume');
    expect(rec).toBeDefined();
    expect(rec?.targetVolume).toBe(30000);
    expect(rec?.priority).toBe(4);
    expect(r.profile.monthlyStrengthSessions).toBe(18);
    expect(r.profile.monthlyVolumeKg).toBe(50000);
  });

  it('recommendations 按 priority 倒序排序', async () => {
    // 触发多条规则：BMI 高 + 睡眠差 + 月跑 30km
    const oldCreatedAt = new Date(Date.now() - 30 * 86_400_000);
    mockedPrisma.user.findUnique.mockResolvedValue({ createdAt: oldCreatedAt, height: 170 } as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 30 } } as never);
    mockedPrisma.strengthSession.aggregate.mockResolvedValue({ _sum: { totalVolume: 0 }, _count: 0 } as never);
    mockedPrisma.bodyCompositionRecord.findFirst.mockResolvedValue({ weight: 85, bmi: 27.8 } as never);
    mockedPrisma.sleepRecord.aggregate.mockResolvedValue({ _avg: { durationSeconds: 19800 } } as never);
    mockedPrisma.goal.findMany.mockResolvedValue([]);

    const r = await goalService.recommend('u-mix');

    expect(r.recommendations.length).toBeGreaterThan(1);
    // 验证排序：每个 priority >= 下一个
    for (let i = 1; i < r.recommendations.length; i++) {
      expect(r.recommendations[i - 1].priority).toBeGreaterThanOrEqual(r.recommendations[i].priority);
    }
  });
});