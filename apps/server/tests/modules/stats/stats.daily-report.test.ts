/**
 * stats.service V0.1.144 单测 — healthScore / dailyReport / dailyReportList
 * 原型图"今日"tab 核心：健康分数（0-100）+ AI 简报生成 + 历史列表
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    dailyReport: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    weRunRecord: { findUnique: vi.fn() },
    heartRateRecord: { findFirst: vi.fn() },
    sleepRecord: { findUnique: vi.fn() },
  },
}));
vi.mock('src/infra/mqtt.js', () => ({ publishDailyReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('src/config/env.js', () => ({ env: { NODE_ENV: 'test' } }));

import { prisma } from 'src/infra/prisma.js';
import { statsService } from 'src/modules/stats/stats.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => vi.clearAllMocks());

describe('statsService.dailyReport (V0.1.144)', () => {
  it('已有今日报告 → 返缓存不重新生成', async () => {
    const existing = {
      id: 'r1', date: '2026-07-14', healthScore: 80, reportText: '今日健康分数 80 分',
      alertText: null, steps: 5000, restingHr: 70, sleepHours: 7,
    };
    mockedPrisma.dailyReport.findUnique.mockResolvedValue(existing as never);

    const r = await statsService.dailyReport('u1', {});

    expect(r).toEqual(existing);
    expect(mockedPrisma.dailyReport.create).not.toHaveBeenCalled();
  });

  it('无报告 → 聚合数据 + 算分 + 生成文本 + 存表 + MQTT 推', async () => {
    mockedPrisma.dailyReport.findUnique.mockResolvedValue(null);
    mockedPrisma.dailyReport.findMany.mockResolvedValue([] as never); // V0.2.30 avgSteps 查询：无历史
    mockedPrisma.weRunRecord.findUnique.mockResolvedValue({ step: 5000 } as never);
    mockedPrisma.heartRateRecord.findFirst.mockResolvedValue({ value: 70 } as never);
    mockedPrisma.sleepRecord.findUnique.mockResolvedValue({ durationSeconds: 25200 } as never); // 7h
    mockedPrisma.dailyReport.create.mockImplementation(async (args: any) => args.data as never);

    const r = await statsService.dailyReport('u1', {});

    expect(r.healthScore).toBeGreaterThan(0);
    expect(r.reportText).toContain('AI建议');
    expect(r.reportText).toContain('步数');
    expect(r.steps).toBe(5000);
    expect(mockedPrisma.dailyReport.create).toHaveBeenCalled();
  });

  it('睡眠不足 → 生成 alertText', async () => {
    mockedPrisma.dailyReport.findUnique.mockResolvedValue(null);
    mockedPrisma.dailyReport.findMany.mockResolvedValue([] as never); // V0.2.30 avgSteps 查询：无历史
    mockedPrisma.weRunRecord.findUnique.mockResolvedValue({ step: 3000 } as never);
    mockedPrisma.heartRateRecord.findFirst.mockResolvedValue({ value: 70 } as never);
    mockedPrisma.sleepRecord.findUnique.mockResolvedValue({ durationSeconds: 18000 } as never); // 5h
    mockedPrisma.dailyReport.create.mockImplementation(async (args: any) => args.data as never);

    const r = await statsService.dailyReport('u1', {});

    expect(r.alertText).toBeTruthy();
    expect(r.alertText).toContain('睡眠');
  });
});

describe('statsService.healthScore (V0.1.144)', () => {
  it('返今日分数 + 趋势对比（vs 昨日）', async () => {
    // today: 8000 步 + hr 70 + 7h 睡眠 → 高分
    // yesterday: 4000 步 → 较低
    mockedPrisma.weRunRecord.findUnique
      .mockResolvedValueOnce({ step: 8000 } as never)
      .mockResolvedValueOnce({ step: 4000 } as never);
    mockedPrisma.heartRateRecord.findFirst
      .mockResolvedValueOnce({ value: 70 } as never)
      .mockResolvedValueOnce({ value: 70 } as never);
    mockedPrisma.sleepRecord.findUnique
      .mockResolvedValueOnce({ durationSeconds: 25200 } as never)
      .mockResolvedValueOnce({ durationSeconds: 25200 } as never);

    const r = await statsService.healthScore('u1', {});

    expect(r.score).toBeGreaterThan(0);
    expect(r.steps).toBe(8000);
    expect(r.trend).toBeDefined();
    expect(typeof r.trend.diff).toBe('number');
  });
});

describe('statsService.dailyReportList (V0.1.144)', () => {
  it('返历史列表 + 分页 hasMore', async () => {
    mockedPrisma.dailyReport.findMany.mockResolvedValue([
      { id: 'r1', date: '2026-07-14', healthScore: 80, reportText: '...' },
    ] as never);
    mockedPrisma.dailyReport.count.mockResolvedValue(1 as never);

    const r = await statsService.dailyReportList('u1', { page: 1, pageSize: 10 });

    expect(r.list.length).toBe(1);
    expect(r.total).toBe(1);
    expect(r.hasMore).toBe(false);
  });
});
