/**
 * jobs/scheduler.ts 单元测试
 *
 * 关键路径：
 * - !prod → 立即 return（dev 不自动跑）
 * - prod：周日 20:00 ±1min 才入队
 * - prod：已 tick 当日 → 跳过（lastTickDate 防重）
 * - prod：非周日 20:00 → 跳过
 *
 * 用 vi.resetModules() 隔离每个测试的 module-level lastTickDate 状态。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockQueueAdd = vi.fn();

vi.mock('src/jobs/queue.js', () => ({
  weeklyReportQueue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
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

// 动态 import helper（每次 resetModules 后用）
async function loadScheduler() {
  const mod = await import('../../src/jobs/scheduler.js');
  return mod.runWeeklyReportScheduler;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runWeeklyReportScheduler', () => {
  it('prod=false：直接 return，不入队', async () => {
    const run = await loadScheduler();
    await run(false);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('prod=true，非周日 20:00：return', async () => {
    // 周三 12:00 北京时间 = 周三 04:00 UTC
    vi.setSystemTime(new Date('2026-06-17T04:00:00Z'));
    const run = await loadScheduler();
    await run(true);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('prod=true，周日 20:00 北京时间（= 12:00 UTC）：入队', async () => {
    // 2026-06-21 是周日
    vi.setSystemTime(new Date('2026-06-21T12:00:00Z'));
    const run = await loadScheduler();
    await run(true);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'generate-all',
      { period: 'current' },
      { jobId: 'auto-2026-06-21-weekly-report' },
    );
  });

  it('prod=true，周日 20:01 北京时间：还在 ±1min 窗口 → 入队', async () => {
    vi.setSystemTime(new Date('2026-06-21T12:01:30Z'));
    const run = await loadScheduler();
    await run(true);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });

  it('prod=true，周日 20:02 北京时间：超出 ±1min 窗口 → 跳过', async () => {
    vi.setSystemTime(new Date('2026-06-21T12:02:30Z'));
    const run = await loadScheduler();
    await run(true);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('prod=true，同日再次调用：lastTickDate 防重 → 跳过', async () => {
    vi.setSystemTime(new Date('2026-06-21T12:00:00Z'));
    const run = await loadScheduler(); // 同一实例共享 lastTickDate
    await run(true);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);

    // 同一日第二次（不 resetModules，状态保留）
    vi.setSystemTime(new Date('2026-06-21T12:01:00Z'));
    await run(true);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1); // 没新增
  });
});
