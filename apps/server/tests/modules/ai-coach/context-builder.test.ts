/**
 * ContextBuilder 单测（V0.1.139 AI 私教）
 *
 * 覆盖：全量数据聚合 → system prompt 含画像（profile/跑量/跑鞋）
 * mock prisma（user/checkin aggregate/goal/shoe/userPlanEnrollment/heartRate/sleep/weRun/bodyComp）
 * mock Cache.wrap 直接调 loader（避免 Redis）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockErrors } from '../../helpers/mockErrors.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: [
      'user',
      'checkin',
      'goal',
      'shoe',
      'userPlanEnrollment',
      'heartRateRecord',
      'sleepRecord',
      'weRunRecord',
      'bodyCompositionRecord',
      'meal', // V0.2.46 c
      'strengthSession', // V0.2.46 c
    ],
  });
});

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));
// Cache.wrap 直接调 loader（不走 Redis，便于每次重算）
vi.mock('src/infra/cache.js', () => ({
  Cache: {
    wrap: async (_k: string, _t: number, loader: () => Promise<unknown>) => loader(),
    get: async () => null,
    set: async () => undefined,
    del: async () => undefined,
    delByPattern: async () => 0,
  },
}));

import { buildSystemPrompt } from 'src/modules/ai-coach/context-builder.js';

beforeEach(() => {
  vi.clearAllMocks();
  // V0.1.140 C：recentRuns（checkin.findMany）默认空
  mocks.prisma.checkin.findMany.mockResolvedValue([] as never);
  // V0.2.46 c：今日饮食 / 近 7 天力量 默认空
  mocks.prisma.meal.findMany.mockResolvedValue([] as never);
  mocks.prisma.strengthSession.findMany.mockResolvedValue([] as never);
});

describe('buildSystemPrompt (V0.1.139 全量聚合)', () => {
  it('聚合 profile + 跑量 + 跑鞋 → prompt 含画像', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      gender: 'male',
      birthday: '1990-01-01',
      height: 175,
      weight: 70,
      region: '北京',
    } as never);
    mocks.prisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 500 }, _count: 50 } as never);
    mocks.prisma.goal.findMany.mockResolvedValue([
      { title: null, type: 'yearly', targetDistance: 1000, periodStart: new Date('2026-01-01'), periodEnd: new Date('2027-01-01') },
    ] as never);
    mocks.prisma.shoe.findMany.mockResolvedValue([
      { brand: 'Nike', model: 'Vaporfly', nickname: '战靴', currentKm: 600, thresholdKm: 800 },
    ] as never);
    mocks.prisma.userPlanEnrollment.findUnique.mockResolvedValue(null);
    mocks.prisma.heartRateRecord.findFirst.mockResolvedValue(null);
    mocks.prisma.sleepRecord.findFirst.mockResolvedValue(null);
    mocks.prisma.weRunRecord.findMany.mockResolvedValue([] as never);
    mocks.prisma.bodyCompositionRecord.findFirst.mockResolvedValue(null);

    const prompt = await buildSystemPrompt('u1');

    expect(prompt).toContain('青沐 AI 私教');
    expect(prompt).toContain('male'); // gender 原值（context-builder 不翻译）
    expect(prompt).toContain('北京');
    expect(prompt).toContain('500km'); // 年跑量
    expect(prompt).toContain('Nike');
    expect(prompt).toContain('1000km'); // 目标
    // 跑鞋健康度 600/800 = 75%
    expect(prompt).toMatch(/75%/);
  });

  it('用户不存在 → 仍返 base prompt（画像段仅含跑量 0）', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 0 }, _count: 0 } as never);
    mocks.prisma.goal.findMany.mockResolvedValue([] as never);
    mocks.prisma.shoe.findMany.mockResolvedValue([] as never);
    mocks.prisma.userPlanEnrollment.findUnique.mockResolvedValue(null);
    mocks.prisma.heartRateRecord.findFirst.mockResolvedValue(null);
    mocks.prisma.sleepRecord.findFirst.mockResolvedValue(null);
    mocks.prisma.weRunRecord.findMany.mockResolvedValue([] as never);
    mocks.prisma.bodyCompositionRecord.findFirst.mockResolvedValue(null);

    const prompt = await buildSystemPrompt('uX');
    expect(prompt).toContain('青沐 AI 私教');
    expect(prompt).toContain('0km');
  });

  it('V0.2.26 N: 最近跑步天气注入 prompt（温度+湿度+AQI）', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'u1', gender: 'male', birthday: '1990-01-01' } as never);
    mocks.prisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 0 }, _count: 0 } as never);
    mocks.prisma.goal.findMany.mockResolvedValue([] as never);
    mocks.prisma.shoe.findMany.mockResolvedValue([] as never);
    mocks.prisma.userPlanEnrollment.findUnique.mockResolvedValue(null);
    mocks.prisma.heartRateRecord.findFirst.mockResolvedValue(null);
    mocks.prisma.sleepRecord.findFirst.mockResolvedValue(null);
    mocks.prisma.weRunRecord.findMany.mockResolvedValue([] as never);
    mocks.prisma.bodyCompositionRecord.findFirst.mockResolvedValue(null);
    // N: 最近带天气打卡（1 小时前，落在 3 天「最近」窗口内，避免测试随运行日期漂移变脆弱）
    mocks.prisma.checkin.findFirst.mockResolvedValueOnce({
      weatherTemp: 32,
      humidity: 75,
      aqi: 120,
      createdAt: new Date(Date.now() - 3_600_000),
    } as never);

    const prompt = await buildSystemPrompt('u1');
    expect(prompt).toContain('最近跑步天气');
    expect(prompt).toContain('32°C');
    expect(prompt).toContain('湿度 75%');
    expect(prompt).toContain('AQI 120');
  });

  it('V0.2.28 fix: 超 3 天的天气标注「较早前」避免 AI 据过时天气误判当天训练', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'u1', gender: 'male', birthday: '1990-01-01' } as never);
    mocks.prisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 0 }, _count: 0 } as never);
    mocks.prisma.goal.findMany.mockResolvedValue([] as never);
    mocks.prisma.shoe.findMany.mockResolvedValue([] as never);
    mocks.prisma.userPlanEnrollment.findUnique.mockResolvedValue(null);
    mocks.prisma.heartRateRecord.findFirst.mockResolvedValue(null);
    mocks.prisma.sleepRecord.findFirst.mockResolvedValue(null);
    mocks.prisma.weRunRecord.findMany.mockResolvedValue([] as never);
    mocks.prisma.bodyCompositionRecord.findFirst.mockResolvedValue(null);
    // 8 天前的带天气打卡（动态相对日期，测试不随日历漂移）
    mocks.prisma.checkin.findFirst.mockResolvedValueOnce({
      weatherTemp: 35,
      humidity: 80,
      aqi: 150,
      createdAt: new Date(Date.now() - 8 * 86_400_000),
    } as never);

    const prompt = await buildSystemPrompt('u1');
    expect(prompt).toContain('较早前跑步天气');
    expect(prompt).toContain('8 天前');
    expect(prompt).toContain('可能已变化');
    // 不应以「最近跑步天气：」前缀误导 AI 这是当前天气
    expect(prompt).not.toContain('最近跑步天气：');
  });

  it('V0.2.46 c: 今日饮食 + 近 7 天力量训练注入 prompt（更深上下文）', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'u1', gender: 'male', birthday: '1990-01-01' } as never);
    mocks.prisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 0 }, _count: 0 } as never);
    mocks.prisma.goal.findMany.mockResolvedValue([] as never);
    mocks.prisma.shoe.findMany.mockResolvedValue([] as never);
    mocks.prisma.userPlanEnrollment.findUnique.mockResolvedValue(null);
    mocks.prisma.heartRateRecord.findFirst.mockResolvedValue(null);
    mocks.prisma.sleepRecord.findFirst.mockResolvedValue(null);
    mocks.prisma.weRunRecord.findMany.mockResolvedValue([] as never);
    mocks.prisma.bodyCompositionRecord.findFirst.mockResolvedValue(null);
    // 今日 2 餐：早餐 + 午餐（items 含宏量）
    mocks.prisma.meal.findMany.mockResolvedValue([
      { mealType: 'breakfast', totalCalorie: 450, items: [{ name: '鸡蛋', calorie: 80, protein: 6, fat: 5, carb: 0 }] },
      {
        mealType: 'lunch',
        totalCalorie: 650,
        items: [
          { name: '米饭', calorie: 200, protein: 4, fat: 0, carb: 44 },
          { name: '鸡胸', calorie: 200, protein: 30, fat: 4, carb: 0 },
        ],
      },
    ] as never);
    // 近 7 天 2 次力量训练
    mocks.prisma.strengthSession.findMany.mockResolvedValue([
      { dateStr: '2026-07-19', totalVolume: 2400, durationSec: 2700 },
      { dateStr: '2026-07-17', totalVolume: 1800, durationSec: 1800 },
    ] as never);

    const prompt = await buildSystemPrompt('u1');
    // 饮食：2 餐 1100 千卡 + 蛋白 40g + 脂肪 9g + 碳水 44g
    expect(prompt).toContain('今日饮食（2 餐）');
    expect(prompt).toContain('1100 千卡');
    expect(prompt).toContain('蛋白 40g');
    expect(prompt).toContain('碳水 44g');
    // 力量：2 次，总容量 4200，累计 75 分钟
    expect(prompt).toContain('近 7 天力量训练：2 次');
    expect(prompt).toContain('总容量 4200kg·次');
    expect(prompt).toContain('累计 75 分钟');
  });
});
