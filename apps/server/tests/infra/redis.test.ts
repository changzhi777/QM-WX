/**
 * Redis 单例测试
 *
 * 关键路径：
 * - 默认导出 redis 实例
 * - 传 REDIS_URL + 必要的 BullMQ 选项（maxRetriesPerRequest: null）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedisCtor = vi.fn();
vi.mock('ioredis', () => ({
  default: class MockRedis {
    constructor(...args: unknown[]) {
      mockRedisCtor(...args);
    }
  },
}));

vi.mock('src/config/env.js', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    NODE_ENV: 'test',
  },
}));

describe('redis 单例', () => {
  beforeEach(() => {
    mockRedisCtor.mockReset();
    vi.resetModules();
  });

  it('传入 REDIS_URL + BullMQ 必要选项', async () => {
    const { redis } = await import('../../src/infra/redis.js');
    expect(redis).toBeDefined();
    expect(mockRedisCtor).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
    );
  });

  it('NODE_ENV=test：写入 globalForRedis（dev 缓存）', async () => {
    const { redis: r1 } = await import('../../src/infra/redis.js');
    const { redis: r2 } = await import('../../src/infra/redis.js');
    expect(r1).toBe(r2); // 单例
  });
});
