/**
 * jobs/queue.ts 单元测试
 *
 * 关键路径：
 * - 模块导入时 new Queue('weekly-report', ...) 被调
 * - startWorkers() → new Worker() 启动
 * - enqueueWeeklyReport() → weeklyReportQueue.add(...)
 * - stopWorkers() / stopJobs() → 清理
 * - startJobs() 幂等（重复调用不重复启 workers）
 *
 * bullmq 是 named export，vi.mocked 拿不到 spy 句柄 → 用闭包变量维护计数。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockQueue {
  add: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  name: string;
  _opts: unknown;
}

interface MockWorker {
  on: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  _name: string;
  _opts: unknown;
}

const state = vi.hoisted(() => ({
  queueCtorCalls: 0,
  workerCtorCalls: 0,
  queues: [] as MockQueue[],
  workers: [] as MockWorker[],
}));

vi.mock('bullmq', () => ({
  Queue: class {
    add = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
    on = vi.fn();
    name: string;
    _opts: unknown;
    constructor(name: string, opts: unknown) {
      this.name = name;
      this._opts = opts;
      state.queueCtorCalls++;
      state.queues.push({ add: this.add, close: this.close, on: this.on, name, _opts: opts });
    }
  },
  Worker: class {
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
    _name: string;
    _opts: unknown;
    constructor(name: string, _processor: unknown, opts: unknown) {
      this._name = name;
      this._opts = opts;
      state.workerCtorCalls++;
      state.workers.push({ on: this.on, close: this.close, _name: name, _opts: opts });
    }
  },
}));

vi.mock('src/infra/redis.js', () => ({
  redis: { setex: vi.fn() },
}));

vi.mock('src/config/env.js', () => ({
  env: { NODE_ENV: 'test' },
}));

vi.mock('src/jobs/weekly-report.job.js', () => ({
  processWeeklyReport: vi.fn(),
}));

vi.mock('src/common/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  weeklyReportQueue,
  enqueueWeeklyReport,
  startJobs,
  stopJobs,
} from '../../src/jobs/queue.js';

beforeEach(() => {
  // 注意：state 里的计数是"自模块导入以来"的累计值，不能 reset。
  // 因为 Queue 是在 import 时构造的（在 beforeEach 之前）。
  // 各测试用"快照 + 差值"来验证。
  vi.clearAllMocks();
});

// 拿 startJobs 调用前/后的 worker 计数差
function getWorkerDelta(action: () => void | Promise<void>) {
  const before = state.workerCtorCalls;
  return Promise.resolve(action()).then(() => state.workerCtorCalls - before);
}

describe('模块导入副作用', () => {
  it('import 后已构造 4 个 Queue（weekly-report + close-order + refresh-certs + garmin-import, prefix=qmwx, 默认 jobOptions）', () => {
    expect(state.queueCtorCalls).toBe(4);
    const opts = state.queues[0]._opts as Record<string, unknown>;
    expect(opts).toMatchObject({
      prefix: 'qmwx',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    });
    expect(opts.connection).toBeDefined();
  });

  it('导出 weeklyReportQueue 单例', () => {
    expect(weeklyReportQueue).toBeDefined();
    expect(state.queues).toHaveLength(4);
    expect(state.queues[0].name).toBe('weekly-report');
    expect(state.queues[1].name).toBe('close-order');
    expect(state.queues[2].name).toBe('refresh-certs');
    expect(state.queues[3].name).toBe('garmin-import');
  });
});

describe('enqueueWeeklyReport', () => {
  it('默认 data={} → add("generate", {}, jobId 带 5min 时间窗)', async () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const window = Math.floor(fixedNow / 300_000);

    await enqueueWeeklyReport();

    expect(weeklyReportQueue.add).toHaveBeenCalledWith(
      'generate',
      {},
      { jobId: `all-current-${window}` },
    );
  });

  it('传 groupId + period → jobId 包含两者', async () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const window = Math.floor(fixedNow / 300_000);

    await enqueueWeeklyReport({ groupId: 'g1', period: '2026-W25' });

    expect(weeklyReportQueue.add).toHaveBeenCalledWith(
      'generate',
      { groupId: 'g1', period: '2026-W25' },
      { jobId: `g1-2026-W25-${window}` },
    );
  });
});

describe('startJobs / stopJobs 生命周期', () => {
  // 每个测试都从"未启动 + 干净 mock 状态"开始
  // 规避 module-level `started` 标志 + 避免 beforeEach 的 stopJobs 污染 mock 计数
  beforeEach(async () => {
    await stopJobs();
    vi.clearAllMocks();
  });

  it('startJobs() 第一次：启 4 个 worker（weekly-report=2 + close-order=4 + refresh-certs=1 + garmin-import=2）', async () => {
    const before = state.workerCtorCalls;
    await startJobs();
    expect(state.workerCtorCalls - before).toBe(4);

    // close-order worker concurrency=4（按名字定位，避免依赖启动顺序）
    const closeOrderWorker = state.workers.find((w) => w._name === 'close-order');
    expect((closeOrderWorker?._opts as Record<string, unknown>)).toMatchObject({
      prefix: 'qmwx',
      concurrency: 4,
    });
  });

  it('startJobs() 重复调用：幂等（worker 不重复启）', async () => {
    const before = state.workerCtorCalls;
    await startJobs();
    await startJobs();
    await startJobs();
    expect(state.workerCtorCalls - before).toBe(4);
  });

  it('stopJobs() 后 startJobs() 可再次启 worker', async () => {
    const before = state.workerCtorCalls;
    await startJobs();
    await stopJobs();
    await startJobs();
    expect(state.workerCtorCalls - before).toBe(8);
  });

  it('stopJobs() 关 worker + queue', async () => {
    const beforeWorkers = state.workerCtorCalls;
    await startJobs();
    const w = state.workers[beforeWorkers]; // 刚启的那个
    const queueClose = weeklyReportQueue.close;
    expect(w.close).not.toHaveBeenCalled();
    expect(queueClose).not.toHaveBeenCalled();
    await stopJobs();
    expect(w.close).toHaveBeenCalled();
    expect(queueClose).toHaveBeenCalled();
  });

  it('worker on("completed") / on("failed") 注册', async () => {
    const beforeWorkers = state.workerCtorCalls;
    await startJobs();
    const w = state.workers[beforeWorkers];
    expect(w.on).toHaveBeenCalledWith('completed', expect.any(Function));
    expect(w.on).toHaveBeenCalledWith('failed', expect.any(Function));
  });
});
