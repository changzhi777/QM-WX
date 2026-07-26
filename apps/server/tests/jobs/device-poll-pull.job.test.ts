/**
 * jobs/device-poll-pull.job.ts 单元测试（V0.2.152 skeleton）
 *
 * 关键路径：
 * - 拉最近 7 天活跃用户（Checkin / StrengthSession / WeRunRecord 任一）
 * - 上限 1000 防滥用
 * - 当前 SKELETON：pulledUserCount=0 / failedUserCount=0（V0.3.1 拍板数据源后实施）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/logger.js', () => ({ logger: mocks.logger }));

async function loadJob() {
  const mod = await import('../../src/jobs/device-poll-pull.job.js');
  return mod.processDevicePollPull;
}

describe('V0.2.152 device-poll-pull skeleton — 拉活跃用户数据', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无活跃用户 → activeUserCount=0 + pulledUserCount=0（无副作用）', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([]);
    const processDevicePollPull = await loadJob();
    const r = await processDevicePollPull();
    expect(r.activeUserCount).toBe(0);
    expect(r.pulledUserCount).toBe(0);
    expect(r.failedUserCount).toBe(0);
    // 确认 findMany 被调用且 take 1000
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 }),
    );
  });

  it('3 个活跃用户 → activeUserCount=3（pulledUserCount=0 因 skeleton 未接数据源）', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: 'u1' }, { id: 'u2' }, { id: 'u3' },
    ] as never);
    const processDevicePollPull = await loadJob();
    const r = await processDevicePollPull();
    expect(r.activeUserCount).toBe(3);
    expect(r.pulledUserCount).toBe(0);
    expect(r.failedUserCount).toBe(0);
    expect(mocks.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ activeUserCount: 3, pulledUserCount: 0 }),
      expect.stringContaining('skeleton'),
    );
  });
});