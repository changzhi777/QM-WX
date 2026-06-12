/**
 * jobs/weekly-report.job.ts 单元测试
 *
 * 覆盖 processWeeklyReport：
 * - 指定 groupId：单群写 GroupReport
 * - 全量：扫所有群，统计 ok/fail
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  groupMethods: { findMany: vi.fn() },
  groupReportMethods: { upsert: vi.fn() },
}));

const mockAggregate = vi.fn();

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    group: mocks.groupMethods,
    groupReport: mocks.groupReportMethods,
  },
}));

vi.mock('src/modules/weekly-report/weekly-report.service.js', () => ({
  weeklyReportService: {
    aggregate: (...args: unknown[]) => mockAggregate(...args),
  },
}));

vi.mock('src/common/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { processWeeklyReport } from '../../src/jobs/weekly-report.job.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processWeeklyReport', () => {
  it('指定 groupId：单群聚合 + upsert GroupReport', async () => {
    mockAggregate.mockResolvedValue({ groupId: 'g1', totalMembers: 3 });
    mocks.groupReportMethods.upsert.mockResolvedValue({ id: 'r1' });

    const result = await processWeeklyReport({ groupId: 'g1' });

    expect(result.ok).toBe(true);
    expect(mockAggregate).toHaveBeenCalledWith(
      'g1',
      expect.stringMatching(/^\d{4}-W\d{2}$/),
      expect.any(Date),
      expect.any(Date),
    );
    expect(mocks.groupReportMethods.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId_period: { groupId: 'g1', period: expect.any(String) } },
        create: expect.objectContaining({ groupId: 'g1' }),
        update: expect.objectContaining({ summary: expect.anything() }),
      }),
    );
  });

  it('指定 groupId + period：使用传入的 period', async () => {
    mockAggregate.mockResolvedValue({ groupId: 'g1' });
    mocks.groupReportMethods.upsert.mockResolvedValue({ id: 'r2' });

    await processWeeklyReport({ groupId: 'g1', period: '2026-W01' });

    expect(mocks.groupReportMethods.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId_period: { groupId: 'g1', period: '2026-W01' } },
      }),
    );
  });

  it('全量：扫所有群，统计 ok/fail', async () => {
    mocks.groupMethods.findMany.mockResolvedValue([
      { id: 'g1', ownerId: 'o1' },
      { id: 'g2', ownerId: 'o2' },
      { id: 'g3', ownerId: 'o3' },
    ]);
    mockAggregate
      .mockResolvedValueOnce({ groupId: 'g1', totalMembers: 1 })
      .mockRejectedValueOnce(new Error('db error'))
      .mockResolvedValueOnce({ groupId: 'g3', totalMembers: 5 });
    mocks.groupReportMethods.upsert.mockResolvedValue({ id: 'r' });

    const result = await processWeeklyReport({});

    expect(result.total).toBe(3);
    expect(result.ok).toBe(2);
    expect(result.fail).toBe(1);
    expect(mocks.groupReportMethods.upsert).toHaveBeenCalledTimes(2);
  });

  it('全量：所有群都失败', async () => {
    mocks.groupMethods.findMany.mockResolvedValue([
      { id: 'g1', ownerId: 'o1' },
      { id: 'g2', ownerId: 'o2' },
    ]);
    mockAggregate.mockRejectedValue(new Error('all fail'));

    const result = await processWeeklyReport({});

    expect(result.total).toBe(2);
    expect(result.ok).toBe(0);
    expect(result.fail).toBe(2);
  });
});
